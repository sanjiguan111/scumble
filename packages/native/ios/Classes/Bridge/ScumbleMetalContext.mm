// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "ScumbleMetalContext.h"

#import <Metal/Metal.h>

#include <atomic>
#include <memory>
#include <unordered_map>

#include <skity/gpu/gpu_context_mtl.h>
#include <skity/gpu/gpu_surface.hpp>
#include <skity/skity.hpp>

#include "ScumbleRenderer.h"        // shared/skity — cross-platform renderer
#include "retained_render_tree.h" // skityrt::RetainedRenderTree (per-layer)

@implementation ScumbleMetalContext {
  id<MTLDevice> _device;
  id<MTLCommandQueue> _queue;
  std::unique_ptr<skity::GPUContext> _gpuContext;
  dispatch_queue_t _renderQueue;
  // Per-canvas retained render trees, keyed by the CAMetalLayer pointer. The
  // context is a process-wide singleton, but each canvas (layer) owns an
  // independent tree; all access is serialized on _renderQueue (single-threaded
  // by contract), so no lock is needed.
  std::unordered_map<intptr_t, std::unique_ptr<skityrt::RetainedRenderTree>> _retainedTrees;
}

+ (instancetype)sharedInstance {
  static ScumbleMetalContext *instance;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ instance = [[ScumbleMetalContext alloc] init]; });
  return instance;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _device = MTLCreateSystemDefaultDevice();
    _queue = [_device newCommandQueue];
    _queue.label = @"Scumble GPU Queue";
    // One process-wide context: MTLContextCreate(device, queue).
    _gpuContext = skity::MTLContextCreate(_device, _queue);
    // Pool GPU resources (saveLayer FBOs, glyph atlases) across frames:
    // skity's default cache limit is 0, which purges every resource on each
    // Flush — a saveLayer-driven fade would realloc its layer texture every
    // frame otherwise. 64 MiB process-wide budget.
    if (_gpuContext != nullptr) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations" // SKITY_EXPERIMENTAL
      _gpuContext->SetResourceCacheLimit(64ull << 20);
#pragma clang diagnostic pop
    }
    _renderQueue = dispatch_queue_create("com.scumble.lynx.queue", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (dispatch_queue_t)renderQueue {
  return _renderQueue;
}

- (void)applyCommandBatch:(NSData *)commands treeKey:(NSInteger)treeKey {
  if (commands == nil || commands.length == 0) return;
  auto &slot = _retainedTrees[static_cast<intptr_t>(treeKey)];
  if (slot == nullptr) {
    slot = std::make_unique<skityrt::RetainedRenderTree>();
  }
  slot->ApplyCommandBatch(static_cast<const uint8_t *>(commands.bytes), commands.length);
}

- (void)applyParagraphRuns:(NSData *)runs treeKey:(NSInteger)treeKey {
  if (runs == nil || runs.length == 0) return;
  auto &slot = _retainedTrees[static_cast<intptr_t>(treeKey)];
  if (slot == nullptr) {
    slot = std::make_unique<skityrt::RetainedRenderTree>();
  }
  slot->ApplyParagraphRuns(static_cast<const uint8_t *>(runs.bytes), runs.length);
}

// Native animation tick (ANIMATION_DESIGN.md D4). Render queue ONLY — the
// driver dispatches there before calling; the tree is single-threaded by
// contract. Returns whether anything on this tree is still animating.
- (BOOL)tickAnimations:(uint64_t)nowNs treeKey:(NSInteger)treeKey {
  auto it = _retainedTrees.find(static_cast<intptr_t>(treeKey));
  if (it == _retainedTrees.end() || it->second == nullptr) return NO;
  return it->second->TickAnimations(nowNs) ? YES : NO;
}

// Playback control (invoke lane). The tree write happens on the render queue
// (single-thread contract); onDone crosses back from there.
- (void)controlAnimation:(NSString *)handle
                  action:(int)action
                  timeMs:(double)timeMs
                 treeKey:(NSInteger)treeKey
                  onDone:(void (^)(BOOL ok))onDone {
  NSString *h = handle;
  dispatch_async(_renderQueue, ^{
    auto it = self->_retainedTrees.find(static_cast<intptr_t>(treeKey));
    if (it == self->_retainedTrees.end() || it->second == nullptr) {
      onDone(NO);
      return;
    }
    bool ok = it->second->ControlAnimation(std::string(h.UTF8String ?: ""),
                                           static_cast<skityrt::AnimControlAction>(action), timeMs);
    onDone(ok ? YES : NO);
  });
}

// Completed-animation handles (D5). Render queue only — drained by the
// session on that queue right after the tick / seeking control.
- (NSArray<NSString *> *)takeFinishedHandles:(NSInteger)treeKey {
  auto it = _retainedTrees.find(static_cast<intptr_t>(treeKey));
  if (it == _retainedTrees.end() || it->second == nullptr) return @[];
  std::vector<std::string> handles = it->second->TakeFinishedHandles();
  NSMutableArray<NSString *> *out = [NSMutableArray arrayWithCapacity:handles.size()];
  for (const std::string &h : handles) {
    [out addObject:[NSString stringWithUTF8String:h.c_str()] ?: @""];
  }
  return out;
}

- (void)drawLayer:(CAMetalLayer *)layer
          treeKey:(NSInteger)treeKey
        viewportW:(uint32_t)w
        viewportH:(uint32_t)h
          density:(float)density {
  if (layer == nil || _gpuContext == nullptr) return;

  auto &slot = _retainedTrees[static_cast<intptr_t>(treeKey)];
  if (slot == nullptr) {
    slot = std::make_unique<skityrt::RetainedRenderTree>();
  }

  @autoreleasepool {
    id<CAMetalDrawable> drawable = [layer nextDrawable];
    if (drawable == nil) return;
    id<MTLTexture> texture = drawable.texture;
    if (texture == nil) return;

    skity::GPUSurfaceDescriptorMTL desc{};
    desc.backend = skity::GPUBackendType::kMetal;
    desc.width = static_cast<uint32_t>(texture.width);
    desc.height = static_cast<uint32_t>(texture.height);
    desc.content_scale = 1.0f;
    // 4x MSAA: the multisampled color attachment is memoryless (lives in tile
    // memory only) and is resolved on-tile into the drawable, so it costs no
    // extra VRAM on TBDR GPUs. All iOS GPUs support 4x.
    desc.sample_count = 4;
    desc.surface_type = skity::MTLSurfaceType::kTexture;
    desc.texture = texture;

    auto surface = _gpuContext->CreateSurface(&desc);
    if (surface == nullptr) return;

    auto *canvas = surface->LockCanvas();
    if (canvas == nullptr) return;

    // Draw from the retained tree (not the FlatBuffer snapshot). This is the
    // shared C++ entry point that Android also reaches (via JNI → AppRenderer).
    // w/h are the Metal drawable size in physical pixels (viewportW/viewportH).
    // The Metal context is passed so image nodes can materialize ImageStore
    // bitmaps on this backend (Image::MakeImage needs a live context).
    skityrt::ScumbleRenderer::Draw(slot.get(), canvas, density, static_cast<float>(w),
                                 static_cast<float>(h), _gpuContext.get());

    canvas->Flush();
    surface->Flush();

    id<MTLCommandBuffer> cmd = [_queue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
  }
}

+ (NSInteger)nextTreeKey {
  static std::atomic<NSInteger> s_next{1};
  return s_next.fetch_add(1, std::memory_order_relaxed);
}

- (void)purgeRetainedTreeForKey:(NSInteger)treeKey {
  // Erase on the render queue so it serializes with drawLayer: — both touch
  // _retainedTrees, and a concurrent erase (previously this ran on the UI/TASM
  // thread via detachSurface) would dangle the `slot` reference held across a
  // frame: use-after-free / corrupt frames on rapid page switches.
  dispatch_async(_renderQueue, ^{ self->_retainedTrees.erase(static_cast<intptr_t>(treeKey)); });
}

@end
