// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Container ShadowNode for <skity-canvas>. Implements LynxCustomMeasureDelegate
/// so Lynx keeps calling measure each layout pass — but measure no longer
/// serializes a snapshot: it only drains dirty props into a CommandBatch and
/// exposes it via getExtraBundle. The render thread's retained tree is the
/// single source of truth (Step 3b retired the snapshot channel).
/// markDirty/setNeedsLayout is kept as the flush trigger (Lynx 4.0.1 exposes no
/// ShadowNode frame callback; mirrors lynx-native-svg).
///
/// iOS counterpart of android/.../node/SkityCanvasShadowNode.kt.
#import "SkityNodeBase.h"
#import <Lynx/LynxCustomMeasureDelegate.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityCanvasShadowNode : SkityNodeBase <LynxCustomMeasureDelegate>

/// Pending CommandBatch bytes (the only extra-bundle payload now — snapshot
/// retired). Drained in measure, consumed by getExtraBundle.
@property(nonatomic, strong, nullable) NSData *pendingCommandBatch;

/// Pending ParagraphRunList bytes (paragraph_runs.fbs) — the glyph runs laid
/// out by <skity-paragraph> children during measure. Delivered in the same
/// extra-bundle flush as the batch, applied after it on the render queue.
@property(nonatomic, strong, nullable) NSData *pendingParagraphRuns;

// Phase 2 Step 2: structural command queue (called by SkityNodeBase hooks).
- (int32_t)takeNextNodeId;
- (void)enqueueStructuralInsert:(int32_t)nodeId
                       parentId:(int32_t)parentId
                          index:(uint32_t)index
                            tag:(NSString *)tag;
- (void)enqueueStructuralRemove:(int32_t)nodeId;

@end

NS_ASSUME_NONNULL_END
