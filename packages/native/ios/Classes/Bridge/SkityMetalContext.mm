// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityMetalContext.h"

#import <Metal/Metal.h>

#include <memory>
#include <unordered_map>

#include <skity/gpu/gpu_context_mtl.h>
#include <skity/gpu/gpu_surface.hpp>
#include <skity/skity.hpp>

#include "SkityRenderer.h"         // shared/skity — cross-platform renderer
#include "render_tree_generated.h" // skityrt::GetRenderTree
#include "retained_render_tree.h"  // skityrt::RetainedRenderTree (per-layer)

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
    // react-native-skity PlatformContext.mm: MTLContextCreate(device, queue).
    _gpuContext = skity::MTLContextCreate(_device, _queue);
    _renderQueue = dispatch_queue_create("com.skity.lynx.queue", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (dispatch_queue_t)renderQueue {
  return _renderQueue;
}

- (void)drawLayer:(CAMetalLayer *)layer
         treeData:(NSData *)treeData
         commands:(NSData *)commands
        viewportW:(uint32_t)w
        viewportH:(uint32_t)h
          density:(float)density {
  if (layer == nil || treeData.length == 0 || _gpuContext == nullptr) return;

  // Reconcile the snapshot into this layer's retained tree (id-aware in-place
  // update). Single-threaded on the render queue; the tree persists across
  // frames so Step 1b's incremental CommandBatch can mutate it directly.
  intptr_t key = reinterpret_cast<intptr_t>(layer);
  auto &slot = _retainedTrees[key];
  if (slot == nullptr) {
    slot = std::make_unique<skityrt::RetainedRenderTree>();
  }
  const auto *fb = skityrt::GetRenderTree(static_cast<const void *>(treeData.bytes));
  // Phase 2 Step 2: apply commands BEFORE syncing fields — Insert creates nodes
  // so Sync can then populate their fields. (Step 1b was Sync→Apply; Step 2
  // topology-by-command requires Apply→Sync.)
  if (commands != nil && commands.length > 0) {
    slot->ApplyCommandBatch(static_cast<const uint8_t *>(commands.bytes), commands.length);
  }
  slot->SyncFromSnapshot(fb);

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
    skityrt::SkityRenderer::Draw(slot.get(), canvas, density, static_cast<float>(w),
                                 static_cast<float>(h));

    canvas->Flush();
    surface->Flush();

    id<MTLCommandBuffer> cmd = [_queue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
  }
}

- (void)purgeRetainedTreeForLayer:(CAMetalLayer *)layer {
  if (layer == nil) return;
  _retainedTrees.erase(reinterpret_cast<intptr_t>(layer));
}

@end
