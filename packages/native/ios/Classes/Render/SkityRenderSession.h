// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Per-canvas Metal render state, driven on the shared SkityMetalContext render
/// queue. Each SkityCanvasView owns one session. iOS counterpart of android's
/// SkityGLRenderSession: a RenderTree pushed before the surface is ready
/// (early consumeRenderBundle) is NOT lost — it's held as pending and drawn
/// once attachSurface completes.
#import <Foundation/Foundation.h>
#import <QuartzCore/CAMetalLayer.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityRenderSession : NSObject

/// Called when the backing CAMetalLayer is ready to render into.
- (void)attachSurfaceWithLayer:(CAMetalLayer *)layer;

- (void)detachSurface;

/// Push a new RenderTree. Drawn now if the surface is ready, otherwise held
/// until the next attachSurface. The canvas pixel size is read fresh from the
/// layer's drawableSize at draw time (it may still be 0 when an early bundle
/// arrives before the first layout, so it must not be cached here).
- (void)setRenderTreeData:(NSData *)data density:(float)density;

/// Release this session. The shared render queue is not torn down.
- (void)destroy;

@end

NS_ASSUME_NONNULL_END
