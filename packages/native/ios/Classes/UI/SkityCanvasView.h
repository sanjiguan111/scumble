// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// UIView backing <skity-canvas>. Its backing layer is a CAMetalLayer (rendered
/// to by skity Metal on the shared SkityMetalContext render queue). The layer
/// setup follows the same approach as the skity iOS example.
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasView : UIView

/// Forward CommandBatch bytes to the render session (Step 3b: no snapshot
/// bundle). The session posts apply + draw; an early command before the
/// CAMetalLayer is ready (layoutSubviews) is held pending by the session.
- (void)consumeCommands:(NSData *)commands;

/// Forward one flush's payload: the CommandBatch plus (optionally) the
/// ParagraphRunList laid out during measure. Applied on the render queue in
/// one block — batch first (runs reference inserted nodes) — then draw.
- (void)consumePayloadWithBatch:(nullable NSData *)batch paragraphRuns:(nullable NSData *)runs;

/// Release the render session. Called from SkityCanvasUI.detachView.
- (void)destroySession;

@end

NS_ASSUME_NONNULL_END
