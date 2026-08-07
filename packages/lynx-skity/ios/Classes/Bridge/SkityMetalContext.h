// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Process-wide shared Metal context for skity: a single MTLDevice +
/// MTLCommandQueue + skity GPUContext (created via skity::MTLContextCreate),
/// plus a serial dispatch queue that serializes all GPU work. All skity canvases
/// share this. iOS counterpart of android's SharedGLContext + SkityRenderThread.
///
/// All C++ (skity / FlatBuffer) is kept inside the .mm; this header is pure
/// Obj-C so it can be included from .m files.
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityMetalContext : NSObject

+ (instancetype)sharedInstance;

/// Shared MTLDevice backing the skity GPUContext. SkityCanvasView assigns this
/// to its CAMetalLayer so nextDrawable shares the same device.
@property(nonatomic, readonly) id<MTLDevice> device;

/// Serial queue all skity GPU work is dispatched onto. Metal command encoding,
/// like EGL/Vulkan queues, must stay on one thread.
@property(nonatomic, readonly) dispatch_queue_t renderQueue;

/// Render one frame of a skityrt::RenderTree FlatBuffer into `layer`. The
/// RenderTree is decoded by the shared cross-platform SkityRenderer::Draw
/// (shared/skity/SkityRenderer.cc) — the same C++ entry point Android reaches
/// via JNI. Must be called on renderQueue.
- (void)drawLayer:(CAMetalLayer *)layer
         treeData:(NSData *)treeData
        viewportW:(uint32_t)w
        viewportH:(uint32_t)h
          density:(float)density;

@end

NS_ASSUME_NONNULL_END
