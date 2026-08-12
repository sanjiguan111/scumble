// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// UIView backing <skity-canvas>. Its backing layer is a CAMetalLayer (rendered
/// to by skity Metal on the shared SkityMetalContext render queue). Mirrors
/// react-native-skity/ios/SkityView.mm's layer setup.
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasView : UIView

/// Forward CommandBatch bytes to the render session (Step 3b: no snapshot
/// bundle). The session posts apply + draw; an early command before the
/// CAMetalLayer is ready (layoutSubviews) is held pending by the session.
- (void)consumeCommands:(NSData *)commands;

/// Release the render session. Called from SkityCanvasUI.detachView.
- (void)destroySession;

@end

NS_ASSUME_NONNULL_END
