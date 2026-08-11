// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasShadowNode.h"

#import "SkityRenderBundle.h"
#import <Lynx/LynxComponentRegistry.h>
#import <Lynx/LynxCustomMeasureDelegate.h>
#import <Lynx/LynxPropsProcessor.h>
#import <Lynx/LynxShadowNode.h>
#import <UIKit/UIScreen.h>

#include "command_batch_generated.h"
#include "flatbuffers/flatbuffers.h"
#include "render_tree_common_generated.h"
#include "render_tree_generated.h"
#include "render_tree_style_generated.h"

using namespace skityrt;
using namespace flatbuffers;

// Phase 2 Step 2 structural op (enqueued by SkityNodeBase hooks, drained in
// measure into the CommandBatch). parentId doubles as MoveNode's new_parent_id.
namespace {
struct SkityStructuralOp {
  enum Kind { kInsert, kRemove, kMove } kind;
  int32_t nodeId;
  int32_t parentId;
  uint32_t index;
  std::string tag; // Insert only
};
} // namespace

#pragma mark - FlatBuffer serialization (built leaves → root)
// 1:1 port of SkityCanvasShadowNode.kt's buildRenderNode / buildStyle / buildPaint,
// using the C++ FlatBuffer stubs in shared/skity/generated. Path/transform arrive
// as JS-built nested FlatBuffer bytes and are memcpy'd verbatim.

static Offset<ResolvedPaint> SkityBuildPaint(flatbuffers::FlatBufferBuilder &fbb, NSNumber *color) {
  if (color == nil) {
    // type = NONE(0); color/gradient offsets 0.
    return CreateResolvedPaint(fbb, /*type*/ 0, 0, 0);
  }
  uint32_t c = (uint32_t)[color unsignedLongLongValue];
  uint32_t a = (c >> 24) & 0xffu;
  uint32_t r = (c >> 16) & 0xffu;
  uint32_t g = (c >> 8) & 0xffu;
  uint32_t b = c & 0xffu;
  auto colorOff = CreateRGBAColor(fbb, r, g, b, a);
  // type = COLOR(1); gradient offset 0.
  return CreateResolvedPaint(fbb, 1, colorOff, 0);
}

static Offset<ComputedStyle> SkityBuildStyle(flatbuffers::FlatBufferBuilder &fbb,
                                             SkityNodeBase *node) {
  auto fillOff = SkityBuildPaint(fbb, node.fillColor);
  auto strokeOff = SkityBuildPaint(fbb, node.strokeColor);
  // CSS transform arrives as JS-built TransformOpList bytes; memcpy verbatim.
  Offset<flatbuffers::Vector<uint8_t>> transformDataOff = 0;
  if (node.transformData.length > 0) {
    transformDataOff =
        fbb.CreateVector((const uint8_t *)node.transformData.bytes, node.transformData.length);
  }
  // display = INLINE(0), visibility = VISIBLE(0); dasharray/dashoffset TODO.
  return CreateComputedStyle(fbb, fillOff, strokeOff, node.strokeWidth,
                             static_cast<LineCap>(node.strokeCap),
                             static_cast<LineJoin>(node.strokeJoin),
                             /*stroke_dasharray*/ 0, /*stroke_dashoffset*/ 0.f, node.strokeMiter,
                             static_cast<FillRule>(node.fillRule), node.opacity,
                             /*display*/ Display_INLINE, /*visibility*/ Visibility_VISIBLE,
                             /*transform*/ 0, transformDataOff);
}

static Offset<RenderNode> SkityBuildRenderNode(flatbuffers::FlatBufferBuilder &fbb,
                                               SkityNodeBase *node) {
  // Children first (leaf → root).
  std::vector<Offset<RenderNode>> childOffsets;
  for (LynxShadowNode *child in node.children) {
    if ([child isKindOfClass:[SkityNodeBase class]]) {
      childOffsets.push_back(SkityBuildRenderNode(fbb, (SkityNodeBase *)child));
    }
  }
  auto childrenVec = childOffsets.empty() ? 0 : fbb.CreateVector(childOffsets);

  auto styleOff = SkityBuildStyle(fbb, node);
  // path d arrives as JS-built PathCommandList bytes; memcpy verbatim.
  Offset<flatbuffers::Vector<uint8_t>> pathDataOff = 0;
  if (node.pathData.length > 0) {
    pathDataOff = fbb.CreateVector((const uint8_t *)node.pathData.bytes, node.pathData.length);
  }
  auto tagOff = fbb.CreateString([node.skityTagName UTF8String]);

  return CreateRenderNode(fbb, node.nativeId, tagOff, styleOff, node.x, node.y, node.width,
                          node.height, node.cx, node.cy, node.r, node.rx, node.ry, node.x1, node.y1,
                          node.x2, node.y2, /*offset*/ 0.f, childrenVec, /*path_commands*/ 0,
                          pathDataOff, /*points*/ 0, GradientUnits_OBJECT_BOUNDING_BOX,
                          SpreadMethod_PAD);
}

#pragma mark - CommandBatch (Step 1b paint/path/transform + Step 2 structural)

// Drain pending structural ops into the CommandBatch (Insert → Move → Remove).
static void SkityDrainStructural(flatbuffers::FlatBufferBuilder &fbb,
                                 std::vector<SkityStructuralOp> &pending,
                                 std::vector<flatbuffers::Offset<void>> &offsets,
                                 std::vector<uint8_t> &types) {
  if (pending.empty()) return;
  for (const auto &op : pending) if (op.kind == SkityStructuralOp::kInsert) {
    auto tagOff = fbb.CreateString(op.tag);
    auto off = skityrt::CreateInsertNode(fbb, op.nodeId, op.parentId, op.index, tagOff);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_InsertNode);
  }
  for (const auto &op : pending) if (op.kind == SkityStructuralOp::kMove) {
    auto off = skityrt::CreateMoveNode(fbb, op.nodeId, op.parentId, op.index);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_MoveNode);
  }
  for (const auto &op : pending) if (op.kind == SkityStructuralOp::kRemove) {
    auto off = skityrt::CreateRemoveNode(fbb, op.nodeId);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_RemoveNode);
  }
  pending.clear();
}

// Drain dirty paint/path/transform across the shadow tree into a CommandBatch
// FlatBuffer. Clears the dirty flags. Built on the TASM thread in measure() and
// piggybacked on the render bundle to the render thread alongside the snapshot.
static void SkityCollectCommands(flatbuffers::FlatBufferBuilder &fbb, SkityNodeBase *node,
                                 std::vector<flatbuffers::Offset<void>> &offsets,
                                 std::vector<uint8_t> &types) {
  if (node.dirtyPaintMask != 0) {
    auto off = skityrt::CreateSetPaint(
        fbb, node.nativeId, static_cast<skityrt::PaintField>(node.dirtyPaintMask),
        static_cast<uint32_t>(node.fillColor.unsignedIntValue),
        static_cast<uint32_t>(node.strokeColor.unsignedIntValue),
        node.strokeWidth, static_cast<skityrt::LineCap>(node.strokeCap),
        static_cast<skityrt::LineJoin>(node.strokeJoin), node.strokeMiter,
        static_cast<skityrt::FillRule>(node.fillRule), node.opacity);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_SetPaint);
    node.dirtyPaintMask = 0;
  }
  if (node.dirtyPath) {
    flatbuffers::Offset<flatbuffers::Vector<uint8_t>> dataOff = 0;
    if (node.pathData.length > 0) {
      dataOff = fbb.CreateVector((const uint8_t *)node.pathData.bytes, node.pathData.length);
    }
    auto off = skityrt::CreateSetPathData(fbb, node.nativeId, dataOff);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_SetPathData);
    node.dirtyPath = NO;
  }
  if (node.dirtyTransform) {
    flatbuffers::Offset<flatbuffers::Vector<uint8_t>> dataOff = 0;
    if (node.transformData.length > 0) {
      dataOff = fbb.CreateVector((const uint8_t *)node.transformData.bytes, node.transformData.length);
    }
    auto off = skityrt::CreateSetTransform(fbb, node.nativeId, dataOff);
    offsets.push_back(off.Union());
    types.push_back(skityrt::Command_SetTransform);
    node.dirtyTransform = NO;
  }
  for (LynxShadowNode *child in node.children) {
    if ([child isKindOfClass:[SkityNodeBase class]]) {
      SkityCollectCommands(fbb, (SkityNodeBase *)child, offsets, types);
    }
  }
}

#pragma mark -

@interface SkityCanvasShadowNode ()
// Canvas logical viewport (SVG viewBox). When width/height > 0, child geometry
// authored in these logical pixels is scaled by the renderer to fit the canvas.
@property(nonatomic, assign) float viewportX;
@property(nonatomic, assign) float viewportY;
@property(nonatomic, assign) float viewportWidth;
@property(nonatomic, assign) float viewportHeight;
// Monotonic node-id allocator for the retained render tree (Phase 2). Starts at
// 1; assigned lazily in measureWithMeasureParam: via assignNativeIdsRecursive:.
@property(nonatomic, assign) int32_t nextNodeId;
// Phase 2 Step 1b: monotonic CommandBatch version (debug counter for now).
@property(nonatomic, assign) uint32_t nextCommandVersion;
@end

@implementation SkityCanvasShadowNode {
  std::vector<SkityStructuralOp> _pendingStructural;
  BOOL _canvasInserted;
}

#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-canvas")
#else
LYNX_REGISTER_SHADOW_NODE("skity-canvas")
#endif

// Canvas-only props (inherited geometry/paint/transform/d props come from
// SkityNodeBase's group). preserveAspectRatio is fixed at X_MID/MEET for now.
LYNX_PROPS_GROUP_DECLARE(LYNX_PROP_DECLARE("viewportX", setViewportX:, NSNumber *),
                         LYNX_PROP_DECLARE("viewportY", setViewportY:, NSNumber *),
                         LYNX_PROP_DECLARE("viewportWidth", setViewportWidth:, NSNumber *),
                         LYNX_PROP_DECLARE("viewportHeight", setViewportHeight:, NSNumber *))

- (NSString *)skityTagName {
  return @"canvas";
}

- (BOOL)isVirtual {
  return NO;
}

- (instancetype)initWithSign:(NSInteger)sign tagName:(NSString *)tagName {
  self = [super initWithSign:sign tagName:tagName];
  if (self) {
    self.customMeasureDelegate = self;
    _nextNodeId = 1;
  }
  return self;
}

#pragma mark - Phase 2 Step 2: structural command queue

- (int32_t)takeNextNodeId {
  int32_t id = self.nextNodeId;
  self.nextNodeId = id + 1;
  return id;
}

- (void)enqueueStructuralInsert:(int32_t)nodeId
                       parentId:(int32_t)parentId
                          index:(uint32_t)index
                             tag:(NSString *)tag {
  // Move merge: a pending Remove for nodeId in this batch => convert to Move.
  for (auto &op : _pendingStructural) {
    if (op.kind == SkityStructuralOp::kRemove && op.nodeId == nodeId) {
      op.kind = SkityStructuralOp::kMove;
      op.parentId = parentId;
      op.index = index;
      return;
    }
  }
  SkityStructuralOp op;
  op.kind = SkityStructuralOp::kInsert;
  op.nodeId = nodeId;
  op.parentId = parentId;
  op.index = index;
  op.tag = std::string([tag UTF8String] ?: "");
  _pendingStructural.push_back(op);
}

- (void)enqueueStructuralRemove:(int32_t)nodeId {
  SkityStructuralOp op;
  op.kind = SkityStructuralOp::kRemove;
  op.nodeId = nodeId;
  _pendingStructural.push_back(op);
}

- (NSData *)buildCommandBatch:(uint32_t)version {
  flatbuffers::FlatBufferBuilder fbb(256);
  std::vector<flatbuffers::Offset<void>> offsets;
  std::vector<uint8_t> types;
  SkityDrainStructural(fbb, _pendingStructural, offsets, types);
  SkityCollectCommands(fbb, self, offsets, types);
  if (offsets.empty()) return nil;
  auto typesVec = fbb.CreateVector<uint8_t>(types);
  auto cmdsVec = fbb.CreateVector<flatbuffers::Offset<void>>(offsets);
  auto batch = skityrt::CreateCommandBatch(fbb, version, typesVec, cmdsVec);
  fbb.Finish(batch);
  return [NSData dataWithBytes:fbb.GetBufferPointer() length:fbb.GetSize()];
}

#pragma mark - Viewport setters

// setNeedsLayout on every setter so a prop change forces a layout pass →
// measure re-serializes the tree → repaint. Mirrors SkityNodeBase.m.
LYNX_PROP_SETTER("viewportX", setViewportX, NSNumber *) {
  _viewportX = value.floatValue;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("viewportY", setViewportY, NSNumber *) {
  _viewportY = value.floatValue;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("viewportWidth", setViewportWidth, NSNumber *) {
  _viewportWidth = value.floatValue;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("viewportHeight", setViewportHeight, NSNumber *) {
  _viewportHeight = value.floatValue;
  [self setNeedsLayout];
}

#pragma mark - LynxCustomMeasureDelegate

- (MeasureResult)measureWithMeasureParam:(MeasureParam *)param
                          MeasureContext:(MeasureContext *)context {
  // Phase 2 Step 2: the canvas has no skity parent so didAddSubComponent: never
  // fires for it — synthesize its root InsertNode once (retained tree's root).
  if (!_canvasInserted) {
    int32_t cid = [self ensureNativeId];
    if (cid != 0) {
      SkityStructuralOp op;
      op.kind = SkityStructuralOp::kInsert;
      op.nodeId = cid;
      op.parentId = -1;
      op.index = 0;
      op.tag = std::string([self.skityTagName UTF8String] ?: "");
      _pendingStructural.insert(_pendingStructural.begin(), op);
      _canvasInserted = YES;
    }
  }
  // Drain structural + paint/path/transform commands into a CommandBatch.
  uint32_t version = self.nextCommandVersion;
  NSData *commandBatch = [self buildCommandBatch:version];
  if (commandBatch != nil) self.nextCommandVersion = version + 1;
  float density = [UIScreen mainScreen].scale;

  // Layout is driven by Lynx (style width/height). Resolve a concrete size from
  // the measure param; only fall back to the width/height props when the parent
  // left it unspecified. Mirrors SkityCanvasShadowNode.kt:measure.
  float w;
  if (param.widthMode == LynxMeasureModeDefinite || param.widthMode == LynxMeasureModeAtMost) {
    w = param.width;
  } else {
    w = (self.width > 0.f) ? self.width * density : param.width;
  }

  float h;
  if (param.heightMode == LynxMeasureModeDefinite || param.heightMode == LynxMeasureModeAtMost) {
    h = param.height;
  } else {
    h = (self.height > 0.f) ? self.height * density : param.height;
  }

  if (w > 0.f && h > 0.f) {
    flatbuffers::FlatBufferBuilder fbb(1024);
    auto rootOff = SkityBuildRenderNode(fbb, self);

    // Viewport offsets must be built before the RenderTree builder starts.
    bool hasViewport = (self.viewportWidth > 0.f && self.viewportHeight > 0.f);
    Offset<ViewBox> vpOff = 0;
    Offset<PreserveAspectRatio> paOff = 0;
    if (hasViewport) {
      vpOff = CreateViewBox(fbb, self.viewportX, self.viewportY, self.viewportWidth,
                            self.viewportHeight);
      paOff = CreatePreserveAspectRatio(fbb); // defaults: X_MID / MEET
    }
    RenderTreeBuilder builder(fbb);
    builder.add_root(rootOff);
    if (hasViewport) {
      builder.add_viewport(vpOff);
      builder.add_preserve_aspect(paOff);
    }
    // density intentionally omitted — the renderer's Draw() density arg is the
    // single source of truth (avoids double-applying).
    auto treeOff = builder.Finish();
    fbb.Finish(treeOff);

    NSData *data = [NSData dataWithBytes:fbb.GetBufferPointer() length:fbb.GetSize()];
    self.renderBundle = [[SkityRenderBundle alloc] initWithData:data
                                                       viewport:CGSizeMake(w, h)
                                                        density:density
                                                commandBatchData:commandBatch];
  }

  MeasureResult result;
  result.size = CGSizeMake(w, h);
  result.baseline = 0;
  return result;
}

- (void)alignWithAlignParam:(AlignParam *)param AlignContext:(AlignContext *)context {
  // no-op — layout is handled by Lynx
}

#pragma mark - Extra Bundle

- (id)getExtraBundle {
  SkityRenderBundle *bundle = self.renderBundle;
  self.renderBundle = nil;
  return bundle;
}

@end
