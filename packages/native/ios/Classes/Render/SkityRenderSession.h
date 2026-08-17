// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Per-canvas Metal render state, driven on the shared SkityMetalContext render
/// queue. Each SkityCanvasView owns one session. iOS counterpart of android's
/// SkityGLRenderSession. A CommandBatch pushed before the surface is ready is
/// NOT lost — it's held as pending and applied once attachSurface completes.
#import <Foundation/Foundation.h>
#import <QuartzCore/CAMetalLayer.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityRenderSession : NSObject

/// Called when the backing CAMetalLayer is ready to render into.
- (void)attachSurfaceWithLayer:(CAMetalLayer *)layer;

- (void)detachSurface;

/// Push a CommandBatch. Applied + drawn now if the surface is ready, otherwise
/// held until the next attachSurface. Step 3b: commands are the only payload
/// (snapshot retired). The canvas pixel size is read fresh from the layer's
/// drawableSize at draw time.
- (void)applyCommands:(NSData *)commands;

/// Draw now if the surface is ready. Render-queue only — callers already on
/// SkityMetalContext.renderQueue (e.g. the ImageStore write path in
/// SkityImageLoader.mm) invoke this directly; others go through postDraw.
- (void)drawIfReady;

/// Release this session. The shared render queue is not torn down.
- (void)destroy;

@end

NS_ASSUME_NONNULL_END
