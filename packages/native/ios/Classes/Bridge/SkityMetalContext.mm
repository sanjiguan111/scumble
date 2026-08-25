// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityMetalContext.h"

#import <Metal/Metal.h>

#include <atomic>
#include <memory>
#include <unordered_map>

#include <skity/gpu/gpu_context_mtl.h>
#include <skity/gpu/gpu_surface.hpp>
#include <skity/skity.hpp>

#include "SkityRenderer.h"        // shared/skity — cross-platform renderer
#include "retained_render_tree.h" // skityrt::RetainedRenderTree (per-layer)

@implementation SkityMetalContext {
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
  static SkityMetalContext *instance;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ instance = [[SkityMetalContext alloc] init]; });
  return instance;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _device = MTLCreateSystemDefaultDevice();
    _queue = [_device newCommandQueue];
    _queue.label = @"Skity GPU Queue";
    // One process-wide context: MTLContextCreate(device, queue).
    _gpuContext = skity::MTLContextCreate(_device, _queue);
    _renderQueue = dispatch_queue_create("com.skity.lynx.queue", DISPATCH_QUEUE_SERIAL);
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
    desc.sample_count = 1;
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
    skityrt::SkityRenderer::Draw(slot.get(), canvas, density, static_cast<float>(w),
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
