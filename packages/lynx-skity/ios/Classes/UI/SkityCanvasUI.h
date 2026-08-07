// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// LynxUI for <skity-canvas>. Receives the serialized RenderTree bundle from
/// the ShadowNode (SkityCanvasShadowNode) via Lynx's extra-data channel
/// (getExtraBundle → onReceiveUIOperation:) and forwards it to the
/// SkityCanvasView for skity Metal rendering.
///
/// iOS counterpart of android/.../ui/SkityCanvasUI.kt.
#import <Lynx/LynxUI.h>

#import "SkityCanvasView.h"

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasUI : LynxUI <SkityCanvasView *>
@end

NS_ASSUME_NONNULL_END
