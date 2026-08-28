// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// LynxUI for <scumble-canvas>. Receives the serialized RenderTree bundle from
/// the ShadowNode (ScumbleCanvasShadowNode) via Lynx's extra-data channel
/// (getExtraBundle → onReceiveUIOperation:) and forwards it to the
/// ScumbleCanvasView for skity Metal rendering.
///
/// iOS counterpart of android/.../ui/ScumbleCanvasUI.kt.
#import <Lynx/LynxUI.h>

#import "ScumbleCanvasView.h"

NS_ASSUME_NONNULL_BEGIN

@interface ScumbleCanvasUI : LynxUI <ScumbleCanvasView *>
@end

NS_ASSUME_NONNULL_END
