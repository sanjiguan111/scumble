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

/// Push one flush's payload: CommandBatch + (optional) ParagraphRunList. Both
/// are applied in a single render-queue block — batch first, then the glyph
/// runs (they reference nodes the batch inserts) — then drawn.
- (void)applyPayloadWithBatch:(nullable NSData *)batch paragraphRuns:(nullable NSData *)runs;

/// Draw now if the surface is ready. Render-queue only — callers already on
/// SkityMetalContext.renderQueue (e.g. the ImageStore write path in
/// SkityImageLoader.mm) invoke this directly; others go through postDraw.
- (void)drawIfReady;

/// Native animation tick — render-queue only (SkityAnimationDriver dispatches
/// there before calling). Redraws this frame when live; reports liveness so
/// the driver can stop when every canvas goes idle.
- (BOOL)tickAnimations:(uint64_t)nowNs;

/// Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D2). Posts onto
/// the render queue; `onDone` fires there (NO for unknown/stale handles).
/// `action` is the AnimControlAction enum value (0=play 1=pause 2=seek
/// 3=cancel); `timeMs` is only read by seek.
- (void)controlAnimation:(NSString *)handle
                  action:(int)action
                  timeMs:(double)timeMs
                  onDone:(void (^)(BOOL ok))onDone;

/// Finish-event sink (D5): fires on the MAIN queue whenever a tracked
/// animation completes; SkityCanvasView installs it and forwards to the
/// dispatcher SkityCanvasUI set (which emits `skityAnimationFinish`).
/// nil = nobody listening (the drain is a no-op then).
@property(nonatomic, copy, nullable) void (^onAnimationFinish)(NSString *handle);

/// Release this session. The shared render queue is not torn down.
- (void)destroy;

@end

NS_ASSUME_NONNULL_END
