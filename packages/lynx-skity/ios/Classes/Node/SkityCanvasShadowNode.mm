// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasShadowNode.h"

#import "SkityRenderBundle.h"
#import <Lynx/LynxComponentRegistry.h>
#import <Lynx/LynxCustomMeasureDelegate.h>
#import <Lynx/LynxShadowNode.h>
#import <UIKit/UIScreen.h>

#include "flatbuffers/flatbuffers.h"
#include "render_tree_common_generated.h"
#include "render_tree_generated.h"
#include "render_tree_style_generated.h"

using namespace skityrt;
using namespace flatbuffers;

#pragma mark - FlatBuffer serialization (built leaves → root)
// 1:1 port of SkityCanvasShadowNode.kt's buildRenderNode / buildStyle / buildPaint
// / buildTransformVec / buildPathCommands, using the C++ FlatBuffer stubs in
// shared/skity/generated instead of the Java flatbuffers runtime.

static Offset<ResolvedPaint> SkityBuildPaint(flatbuffers::FlatBufferBuilder &fbb,
                                              NSNumber *color) {
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

static Offset<flatbuffers::Vector<Offset<TransformOp>>> SkityBuildTransformVec(
    flatbuffers::FlatBufferBuilder &fbb, NSArray<SkityTransformOp *> *ops) {
  if (ops.count == 0) return 0;
  std::vector<Offset<TransformOp>> offsets;
  offsets.reserve(ops.count);
  for (SkityTransformOp *op in ops) {
    std::vector<float> args;
    args.reserve(op.args.count);
    for (NSNumber *n in op.args) args.push_back(n.floatValue);
    auto argsOff = fbb.CreateVector(args);
    offsets.push_back(
        CreateTransformOp(fbb, static_cast<TransformType>(op.type), argsOff));
  }
  return fbb.CreateVector(offsets);
}

static Offset<flatbuffers::Vector<Offset<PathCommand>>> SkityBuildPathCommands(
    flatbuffers::FlatBufferBuilder &fbb, NSArray<SkityPathCommand *> *cmds) {
  if (cmds.count == 0) return 0;
  std::vector<Offset<PathCommand>> offsets;
  offsets.reserve(cmds.count);
  for (SkityPathCommand *cmd in cmds) {
    std::vector<float> args;
    args.reserve(cmd.args.count);
    for (NSNumber *n in cmd.args) args.push_back(n.floatValue);
    auto argsOff = fbb.CreateVector(args);
    offsets.push_back(
        CreatePathCommand(fbb, static_cast<PathCommandType>(cmd.type), argsOff));
  }
  return fbb.CreateVector(offsets);
}

static Offset<ComputedStyle> SkityBuildStyle(flatbuffers::FlatBufferBuilder &fbb,
                                             SkityNodeBase *node) {
  auto fillOff = SkityBuildPaint(fbb, node.fillColor);
  auto strokeOff = SkityBuildPaint(fbb, node.strokeColor);
  auto transformVec = SkityBuildTransformVec(fbb, node.transformOps);
  // display = INLINE(0), visibility = VISIBLE(0); dasharray/dashoffset TODO.
  return CreateComputedStyle(
      fbb, fillOff, strokeOff, node.strokeWidth,
      static_cast<LineCap>(node.strokeCap),
      static_cast<LineJoin>(node.strokeJoin),
      /*stroke_dasharray*/ 0, /*stroke_dashoffset*/ 0.f, node.strokeMiter,
      static_cast<FillRule>(node.fillRule), node.opacity,
      /*display*/ Display_INLINE, /*visibility*/ Visibility_VISIBLE,
      transformVec);
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
  auto childrenVec =
      childOffsets.empty() ? 0 : fbb.CreateVector(childOffsets);

  auto styleOff = SkityBuildStyle(fbb, node);
  auto pathVec = SkityBuildPathCommands(fbb, node.pathCommands);

  Offset<flatbuffers::Vector<float>> pointsVec = 0;
  if (node.points.count > 0) {
    std::vector<float> pts;
    pts.reserve(node.points.count);
    for (NSNumber *n in node.points) pts.push_back(n.floatValue);
    pointsVec = fbb.CreateVector(pts);
  }

  auto tagOff = fbb.CreateString([node.skityTagName UTF8String]);

  return CreateRenderNode(
      fbb, /*id*/ 0, tagOff, styleOff, node.x, node.y, node.width, node.height,
      node.cx, node.cy, node.r, node.rx, node.ry, node.x1, node.y1, node.x2,
      node.y2, /*offset*/ 0.f, childrenVec, pathVec, pointsVec,
      GradientUnits_OBJECT_BOUNDING_BOX, SpreadMethod_PAD);
}

#pragma mark -

@implementation SkityCanvasShadowNode

#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-canvas")
#else
LYNX_REGISTER_SHADOW_NODE("skity-canvas")
#endif

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
  }
  return self;
}

#pragma mark - LynxCustomMeasureDelegate

- (MeasureResult)measureWithMeasureParam:(MeasureParam *)param
                          MeasureContext:(MeasureContext *)context {
  float density = [UIScreen mainScreen].scale;

  // Layout is driven by Lynx (style width/height). Resolve a concrete size from
  // the measure param; only fall back to the width/height props when the parent
  // left it unspecified. Mirrors SkityCanvasShadowNode.kt:measure.
  float w;
  if (param.widthMode == LynxMeasureModeDefinite ||
      param.widthMode == LynxMeasureModeAtMost) {
    w = param.width;
  } else {
    w = (self.width > 0.f) ? self.width * density : param.width;
  }

  float h;
  if (param.heightMode == LynxMeasureModeDefinite ||
      param.heightMode == LynxMeasureModeAtMost) {
    h = param.height;
  } else {
    h = (self.height > 0.f) ? self.height * density : param.height;
  }

  if (w > 0.f && h > 0.f) {
    flatbuffers::FlatBufferBuilder fbb(1024);
    auto rootOff = SkityBuildRenderNode(fbb, self);
    auto treeOff = CreateRenderTree(fbb, rootOff);
    fbb.Finish(treeOff);

    NSData *data = [NSData dataWithBytes:fbb.GetBufferPointer()
                                   length:fbb.GetSize()];
    self.renderBundle =
        [[SkityRenderBundle alloc] initWithData:data
                                       viewport:CGSizeMake(w, h)
                                         density:density];
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
