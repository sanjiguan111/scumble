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

/// Apply a CommandBatch to this layer's retained tree and render one frame.
/// The tree is decoded by the shared cross-platform SkityRenderer::Draw
/// (shared/skity/SkityRenderer.cc) — the same C++ entry point Android reaches
/// via JNI. Must be called on renderQueue. Step 3b: no snapshot — commands are
/// the only mutation path.
/// Allocate a process-unique, monotonically-increasing key for a canvas's
/// retained render tree. Used instead of the CAMetalLayer pointer so a recycled
/// layer address (malloc reuse) can never inherit a prior canvas's tree.
+ (NSInteger)nextTreeKey;

/// Apply a CommandBatch to this tree's retained render tree (render queue only,
/// same queue as drawLayer:). Split from draw so each batch is applied in full —
/// a single pending slot would let a later batch overwrite an earlier batch's
/// structural Insert before it was applied.
- (void)applyCommandBatch:(NSData *)commands treeKey:(NSInteger)treeKey;

- (void)drawLayer:(CAMetalLayer *)layer
          treeKey:(NSInteger)treeKey
        viewportW:(uint32_t)w
        viewportH:(uint32_t)h
          density:(float)density;

/// Drop the retained tree for `treeKey`. Dispatched onto renderQueue so the
/// erase serializes with any in-flight drawLayer: (both touch the map). Safe to
/// call again on dealloc — idempotent (erase on a missing key is a no-op).
- (void)purgeRetainedTreeForKey:(NSInteger)treeKey;

@end

NS_ASSUME_NONNULL_END
