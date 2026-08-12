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
/// DOMBuilder (unlike lynx-native-svg), so all string parsing happens in
/// front-end JS (@lynx-skity/parsers); this node ferries scalars + memcpy's
/// nested FlatBuffer bytes and emits the final RenderTree directly.
#import "SkityNodeBase.h"
#import <Lynx/LynxCustomMeasureDelegate.h>

@class SkityRenderBundle;

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasShadowNode : SkityNodeBase <LynxCustomMeasureDelegate>

/// Latest render bundle, consumed (and cleared) by getExtraBundle.
@property(nonatomic, strong, nullable) SkityRenderBundle *renderBundle;

// Phase 2 Step 2: structural command queue (called by SkityNodeBase hooks).
- (int32_t)takeNextNodeId;
- (void)enqueueStructuralInsert:(int32_t)nodeId
                       parentId:(int32_t)parentId
                          index:(uint32_t)index
                            tag:(NSString *)tag;
- (void)enqueueStructuralRemove:(int32_t)nodeId;

@end

NS_ASSUME_NONNULL_END
