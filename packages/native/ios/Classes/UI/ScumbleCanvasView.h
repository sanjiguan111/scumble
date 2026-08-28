// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// UIView backing <scumble-canvas>. Its backing layer is a CAMetalLayer (rendered
/// to by skity Metal on the shared ScumbleMetalContext render queue). The layer
/// setup follows the same approach as the skity iOS example.
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ScumbleCanvasView : UIView

/// Forward CommandBatch bytes to the render session (Step 3b: no snapshot
/// bundle). The session posts apply + draw; an early command before the
/// CAMetalLayer is ready (layoutSubviews) is held pending by the session.
- (void)consumeCommands:(NSData *)commands;

/// Forward one flush's payload: the CommandBatch plus (optionally) the
/// ParagraphRunList laid out during measure. Applied on the render queue in
/// one block — batch first (runs reference inserted nodes) — then draw.
- (void)consumePayloadWithBatch:(nullable NSData *)batch paragraphRuns:(nullable NSData *)runs;

/// Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D2): forwards
/// to the session, which posts onto the render queue. `onDone` fires there.
- (void)controlAnimation:(NSString *)handle
                  action:(int)action
                  timeMs:(double)timeMs
                  onDone:(void (^)(BOOL ok))onDone;

/// Finish-event dispatcher (D5), installed by ScumbleCanvasUI: invoked on the
/// MAIN queue with the completed animation's handle. Emits
/// `scumbleAnimationFinish` through the Lynx event emitter.
@property(nonatomic, copy, nullable) void (^animationFinishDispatcher)(NSString *handle);

/// Release the render session. Called from ScumbleCanvasUI.detachView.
- (void)destroySession;

@end

NS_ASSUME_NONNULL_END
