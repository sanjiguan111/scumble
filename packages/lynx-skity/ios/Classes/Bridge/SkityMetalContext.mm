// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityMetalContext.h"

#import <Metal/Metal.h>

#include <memory>

#include <skity/gpu/gpu_context_mtl.h>
#include <skity/gpu/gpu_surface.hpp>
#include <skity/skity.hpp>

#include "SkityRenderer.h"         // shared/skity — cross-platform renderer
#include "render_tree_generated.h" // skityrt::GetRenderTree

@implementation SkityMetalContext {
  id<MTLDevice> _device;
  id<MTLCommandQueue> _queue;
  std::unique_ptr<skity::GPUContext> _gpuContext;
  dispatch_queue_t _renderQueue;
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
        viewportW:(uint32_t)w
        viewportH:(uint32_t)h
          density:(float)density {
  if (layer == nil || treeData.length == 0 || _gpuContext == nullptr) return;

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

    // Decode the FlatBuffer and draw. This is the shared C++ entry point that
    // Android also reaches (via JNI → AppRenderer → GLESRenderBackend).
    const auto *tree = skityrt::GetRenderTree(static_cast<const void *>(treeData.bytes));
    // w/h are the Metal drawable size in physical pixels (viewportW/viewportH).
    skityrt::SkityRenderer::Draw(tree, canvas, density, static_cast<float>(w),
                                 static_cast<float>(h));

    canvas->Flush();
    surface->Flush();

    id<MTLCommandBuffer> cmd = [_queue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
  }
}

@end
