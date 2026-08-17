// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityNodeBase.h"
#import "SkityCanvasShadowNode.h"

#import <Lynx/LynxPropsProcessor.h>

@implementation SkityNodeBase

// Declares the prop→setter map for this class. Subclasses (SkityRectShadowNode
// …) inherit both the declarations and the setters below, mirroring how
// android SkityNodeBase.kt exposes all @LynxProp setters to its subclasses.
// Variable-length fields (transform/d) arrive as NSData* (nested FlatBuffer
// bytes built by @lynx-skity/parsers); enums arrive as numbers already mapped
// to skityrt bytes — the native side does no string parsing.
LYNX_PROPS_GROUP_DECLARE(
    // geometry
    LYNX_PROP_DECLARE("x", setX:, NSNumber *), LYNX_PROP_DECLARE("y", setY:, NSNumber *),
    LYNX_PROP_DECLARE("width", setWidth:, NSNumber *),
    LYNX_PROP_DECLARE("height", setHeight:, NSNumber *),
    LYNX_PROP_DECLARE("cx", setCx:, NSNumber *), LYNX_PROP_DECLARE("cy", setCy:, NSNumber *),
    LYNX_PROP_DECLARE("r", setR:, NSNumber *), LYNX_PROP_DECLARE("rx", setRx:, NSNumber *),
    LYNX_PROP_DECLARE("ry", setRy:, NSNumber *), LYNX_PROP_DECLARE("x1", setX1:, NSNumber *),
    LYNX_PROP_DECLARE("y1", setY1:, NSNumber *), LYNX_PROP_DECLARE("x2", setX2:, NSNumber *),
    LYNX_PROP_DECLARE("y2", setY2:, NSNumber *),
    LYNX_PROP_DECLARE("pathStart", setPathStart:, NSNumber *),
    LYNX_PROP_DECLARE("pathEnd", setPathEnd:, NSNumber *),
    // Polyline/polygon vertices arrive base64-encoded little-endian float32
    // bytes (same string channel as strokeDash — Lynx props marshal no float
    // arrays). An empty payload clears the vertices.
    LYNX_PROP_DECLARE("points", setPoints:, NSString *),
    // paint
    LYNX_PROP_DECLARE("color", setColor:, NSNumber *),
    LYNX_PROP_DECLARE("fill", setFill:, NSNumber *),
    LYNX_PROP_DECLARE("stroke", setStroke:, NSNumber *),
    LYNX_PROP_DECLARE("strokeWidth", setStrokeWidth:, NSNumber *),
    LYNX_PROP_DECLARE("strokeCap", setStrokeCap:, NSNumber *),
    LYNX_PROP_DECLARE("strokeJoin", setStrokeJoin:, NSNumber *),
    LYNX_PROP_DECLARE("strokeMiter", setStrokeMiter:, NSNumber *),
    // Dash intervals arrive base64-encoded little-endian float32 bytes (same
    // string channel as d/transform/gradients — Lynx props marshal no float
    // arrays). An empty payload clears dashes (solid stroke).
    LYNX_PROP_DECLARE("strokeDash", setStrokeDash:, NSString *),
    LYNX_PROP_DECLARE("strokeDashOffset", setStrokeDashOffset:, NSNumber *),
    LYNX_PROP_DECLARE("fillRule", setFillRule:, NSNumber *),
    LYNX_PROP_DECLARE("blendMode", setBlendMode:, NSNumber *),
    LYNX_PROP_DECLARE("opacity", setOpacity:, NSNumber *),
    // transform & path & gradient (base64-encoded nested FlatBuffer bytes)
    LYNX_PROP_DECLARE("transform", setTransform:, NSString *),
    LYNX_PROP_DECLARE("d", setD:, NSString *),
    // Path boolean-op description (base64-encoded JS-built PathOpList bytes;
    // an empty payload clears the op — the node falls back to its plain d).
    LYNX_PROP_DECLARE("op", setOp:, NSString *),
    LYNX_PROP_DECLARE("fillGradient", setFillGradient:, NSString *),
    LYNX_PROP_DECLARE("strokeGradient", setStrokeGradient:, NSString *),
    // Paint filter slots (base64-encoded JS-built Filter bytes). An empty
    // payload clears the slot.
    LYNX_PROP_DECLARE("fillColorFilter", setFillColorFilter:, NSString *),
    LYNX_PROP_DECLARE("strokeColorFilter", setStrokeColorFilter:, NSString *),
    LYNX_PROP_DECLARE("fillImageFilter", setFillImageFilter:, NSString *),
    LYNX_PROP_DECLARE("strokeImageFilter", setStrokeImageFilter:, NSString *),
    LYNX_PROP_DECLARE("fillMaskFilter", setFillMaskFilter:, NSString *),
    LYNX_PROP_DECLARE("strokeMaskFilter", setStrokeMaskFilter:, NSString *),
    // Group clip sequence: base64-encoded JS-built ClipList bytes. An empty
    // payload clears the clip.
    LYNX_PROP_DECLARE("clip", setClip:, NSString *))

- (NSString *)skityTagName {
  return @"";
}

- (BOOL)isVirtual {
  return YES;
}

- (instancetype)initWithSign:(NSInteger)sign tagName:(NSString *)tagName {
  self = [super initWithSign:sign tagName:tagName];
  if (self) {
    _strokeWidth = 1.f;
    _strokeMiter = 4.f;
    _blendMode = 3; // SRC_OVER
    _opacity = 1.f;
  }
  return self;
}

// Every setter calls setNeedsLayout so a prop change forces a layout pass → the
// canvas's measure() re-serializes the tree → repaint. Pure-style props
// (fill/stroke/opacity/d/transform) don't change layout on their own, so
// without this they'd update the field but never reach the render bundle.
// setNeedsLayout coalesces (next vsync), so a batch of prop updates triggers a
// single measure. Android mirrors this with markDirty() per setter.
// Phase 2 Step 1b: paint/path/transform setters also set a dirty flag drained
// into a CommandBatch in measure(). Step 3a: geometry setters do too.
#pragma mark - Geometry setters

LYNX_PROP_SETTER("x", setX, NSNumber *) {
  _x = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomX;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("y", setY, NSNumber *) {
  _y = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomY;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("width", setWidth, NSNumber *) {
  _width = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomWidth;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("height", setHeight, NSNumber *) {
  _height = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomHeight;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("cx", setCx, NSNumber *) {
  _cx = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomCX;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("cy", setCy, NSNumber *) {
  _cy = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomCY;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("r", setR, NSNumber *) {
  _r = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomR;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("rx", setRx, NSNumber *) {
  _rx = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomRX;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("ry", setRy, NSNumber *) {
  _ry = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomRY;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("x1", setX1, NSNumber *) {
  _x1 = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomX1;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("y1", setY1, NSNumber *) {
  _y1 = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomY1;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("x2", setX2, NSNumber *) {
  _x2 = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomX2;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("y2", setY2, NSNumber *) {
  _y2 = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomY2;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("pathStart", setPathStart, NSNumber *) {
  _pathStart = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomPathStart;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("pathEnd", setPathEnd, NSNumber *) {
  _pathEnd = value.floatValue;
  _dirtyGeometryMask |= kSkityGeomPathEnd;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("points", setPoints, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _pointsData = decoded.length >= 4 ? decoded : nil;
  _dirtyGeometryMask |= kSkityGeomPoints;
  [self setNeedsLayout];
}

#pragma mark - Paint setters (dirty → command channel)

LYNX_PROP_SETTER("color", setColor, NSNumber *) {
  _fillColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
  _dirtyPaintMask |= kSkityPaintFieldFill;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fill", setFill, NSNumber *) {
  _fillColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
  _dirtyPaintMask |= kSkityPaintFieldFill;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("stroke", setStroke, NSNumber *) {
  _strokeColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
  _dirtyPaintMask |= kSkityPaintFieldStroke;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeWidth", setStrokeWidth, NSNumber *) {
  _strokeWidth = value.floatValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeWidth;
  [self setNeedsLayout];
}
// Enums arrive as numbers already mapped to skityrt bytes (parsers layer).
LYNX_PROP_SETTER("strokeCap", setStrokeCap, NSNumber *) {
  _strokeCap = (uint8_t)value.intValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeCap;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeJoin", setStrokeJoin, NSNumber *) {
  _strokeJoin = (uint8_t)value.intValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeJoin;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeMiter", setStrokeMiter, NSNumber *) {
  _strokeMiter = value.floatValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeMiter;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeDash", setStrokeDash, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _strokeDashData = decoded.length >= 4 ? decoded : nil;
  _dirtyPaintMask |= kSkityPaintFieldStrokeDash;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeDashOffset", setStrokeDashOffset, NSNumber *) {
  _strokeDashOffset = value.floatValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeDash;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fillRule", setFillRule, NSNumber *) {
  _fillRule = (uint8_t)value.intValue;
  _dirtyPaintMask |= kSkityPaintFieldFillRule;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("blendMode", setBlendMode, NSNumber *) {
  _blendMode = (uint8_t)value.intValue;
  _dirtyPaintMask |= kSkityPaintFieldBlendMode;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("opacity", setOpacity, NSNumber *) {
  _opacity = value.floatValue;
  _dirtyPaintMask |= kSkityPaintFieldOpacity;
  [self setNeedsLayout];
}

#pragma mark - Transform & path setters (base64 → decode → memcpy)

LYNX_PROP_SETTER("transform", setTransform, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _transformData = decoded.length > 0 ? decoded : nil;
  _dirtyTransform = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("d", setD, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _pathData = decoded.length > 0 ? decoded : nil;
  _dirtyPath = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("op", setOp, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _opData = decoded.length > 0 ? decoded : nil;
  _dirtyPathOp = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fillGradient", setFillGradient, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _fillGradientData = decoded.length > 0 ? decoded : nil;
  _dirtyPaintMask |= kSkityPaintFieldFillGradient;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeGradient", setStrokeGradient, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _strokeGradientData = decoded.length > 0 ? decoded : nil;
  _dirtyPaintMask |= kSkityPaintFieldStrokeGradient;
  [self setNeedsLayout];
}
// Paint filter slots — one dirty bit per (paint × filter kind) slot.
#define SKITY_FILTER_SETTER(prop, fn, field, ivar)                                                 \
  LYNX_PROP_SETTER(prop, fn, NSString *) {                                                         \
    NSData *decoded =                                                                              \
        [[NSData alloc] initWithBase64EncodedString:value                                          \
                                            options:NSDataBase64DecodingIgnoreUnknownCharacters];  \
    ivar = decoded.length > 0 ? decoded : nil;                                                     \
    _dirtyFilterMask |= kSkityFilter##field;                                                       \
    [self setNeedsLayout];                                                                         \
  }
SKITY_FILTER_SETTER("fillColorFilter", setFillColorFilter, FillColor, _fillColorFilterData)
SKITY_FILTER_SETTER("strokeColorFilter", setStrokeColorFilter, StrokeColor, _strokeColorFilterData)
SKITY_FILTER_SETTER("fillImageFilter", setFillImageFilter, FillImage, _fillImageFilterData)
SKITY_FILTER_SETTER("strokeImageFilter", setStrokeImageFilter, StrokeImage, _strokeImageFilterData)
SKITY_FILTER_SETTER("fillMaskFilter", setFillMaskFilter, FillMask, _fillMaskFilterData)
SKITY_FILTER_SETTER("strokeMaskFilter", setStrokeMaskFilter, StrokeMask, _strokeMaskFilterData)
LYNX_PROP_SETTER("clip", setClip, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _clipData = decoded.length > 0 ? decoded : nil;
  _dirtyClip = YES;
  [self setNeedsLayout];
}

#pragma mark - Phase 2 Step 2: structural hooks

- (SkityCanvasShadowNode *)findCanvasOwner {
  LynxShadowNode *n = self;
  while (n != nil) {
    if ([n isKindOfClass:[SkityCanvasShadowNode class]]) {
      return (SkityCanvasShadowNode *)n;
    }
    n = [n parent];
  }
  return nil;
}

- (int32_t)ensureNativeId {
  if (_nativeId != 0) return _nativeId;
  SkityCanvasShadowNode *canvas = [self findCanvasOwner];
  if (canvas == nil) return 0;
  _nativeId = [canvas takeNextNodeId];
  return _nativeId;
}

- (void)didAddSubComponent:(LynxShadowNode *)subComponent {
  [super didAddSubComponent:subComponent];
  if (![subComponent isKindOfClass:[SkityNodeBase class]]) return;
  SkityNodeBase *child = (SkityNodeBase *)subComponent;
  SkityCanvasShadowNode *canvas = [self findCanvasOwner];
  if (canvas == nil) return;
  int32_t childId = [child ensureNativeId];
  int32_t parentId = [self ensureNativeId];
  if (childId == 0 || parentId == 0) return;
  NSUInteger idx = [[self children] indexOfObject:child];
  if (idx == NSNotFound) return;
  [canvas enqueueStructuralInsert:childId
                         parentId:parentId
                            index:(uint32_t)idx
                              tag:child.skityTagName];
}

- (void)willRemoveComponent:(LynxShadowNode *)subComponent {
  [super willRemoveComponent:subComponent];
  if (![subComponent isKindOfClass:[SkityNodeBase class]]) return;
  SkityNodeBase *child = (SkityNodeBase *)subComponent;
  if (child.nativeId == 0) return;
  SkityCanvasShadowNode *canvas = [self findCanvasOwner];
  if (canvas == nil) return;
  [canvas enqueueStructuralRemove:child.nativeId];
}

@end
