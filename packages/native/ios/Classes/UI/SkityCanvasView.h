// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// UIView backing <skity-canvas>. Its backing layer is a CAMetalLayer (rendered
/// to by skity Metal on the shared SkityMetalContext render queue). Mirrors
/// react-native-skity/ios/SkityView.mm's layer setup; the bundle hand-off
/// timing follows android/.../ui/SkityCanvasView.kt.
#import <UIKit/UIKit.h>

@class SkityRenderBundle;

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasView : UIView

/// Store the latest RenderTree and forward it to the render session. The
/// session keeps it pending until the CAMetalLayer is ready (layoutSubviews).
- (void)consumeRenderBundle:(nullable SkityRenderBundle *)bundle;

/// Release the render session. Called from SkityCanvasUI.detachView.
- (void)destroySession;

@end

NS_ASSUME_NONNULL_END
