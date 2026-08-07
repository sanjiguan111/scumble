// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Container ShadowNode for <skity-canvas>. Implements LynxCustomMeasureDelegate:
/// during measure it walks the child SkityNodeBase tree and serializes it
/// directly into a skityrt::RenderTree FlatBuffer (built leaf→root), wraps it
/// in a SkityRenderBundle, and exposes it via getExtraBundle — which Lynx hands
/// to SkityCanvasUI.onReceiveUIOperation:.
///
/// iOS counterpart of android/.../node/SkityCanvasShadowNode.kt. skity has no
/// DOMBuilder (unlike lynx-native-svg), so resolution happens in the
/// ShadowNodes (SkityPropParser) and this node emits the final RenderTree
/// directly.
#import "SkityNodeBase.h"
#import <Lynx/LynxCustomMeasureDelegate.h>

@class SkityRenderBundle;

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasShadowNode : SkityNodeBase <LynxCustomMeasureDelegate>

/// Latest render bundle, consumed (and cleared) by getExtraBundle.
@property(nonatomic, strong, nullable) SkityRenderBundle *renderBundle;

@end

NS_ASSUME_NONNULL_END
