// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityNodeBase.h"

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
    // paint
    LYNX_PROP_DECLARE("color", setColor:, NSNumber *),
    LYNX_PROP_DECLARE("fill", setFill:, NSNumber *),
    LYNX_PROP_DECLARE("stroke", setStroke:, NSNumber *),
    LYNX_PROP_DECLARE("strokeWidth", setStrokeWidth:, NSNumber *),
    LYNX_PROP_DECLARE("strokeCap", setStrokeCap:, NSNumber *),
    LYNX_PROP_DECLARE("strokeJoin", setStrokeJoin:, NSNumber *),
    LYNX_PROP_DECLARE("strokeMiter", setStrokeMiter:, NSNumber *),
    LYNX_PROP_DECLARE("fillRule", setFillRule:, NSNumber *),
    LYNX_PROP_DECLARE("opacity", setOpacity:, NSNumber *),
    // transform & path (base64-encoded nested FlatBuffer bytes)
    LYNX_PROP_DECLARE("transform", setTransform:, NSString *),
    LYNX_PROP_DECLARE("d", setD:, NSString *))

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
    _opacity = 1.f;
  }
  return self;
}

#pragma mark - Geometry setters

LYNX_PROP_SETTER("x", setX, NSNumber *) {
  _x = value.floatValue;
}
LYNX_PROP_SETTER("y", setY, NSNumber *) {
  _y = value.floatValue;
}
LYNX_PROP_SETTER("width", setWidth, NSNumber *) {
  _width = value.floatValue;
}
LYNX_PROP_SETTER("height", setHeight, NSNumber *) {
  _height = value.floatValue;
}
LYNX_PROP_SETTER("cx", setCx, NSNumber *) {
  _cx = value.floatValue;
}
LYNX_PROP_SETTER("cy", setCy, NSNumber *) {
  _cy = value.floatValue;
}
LYNX_PROP_SETTER("r", setR, NSNumber *) {
  _r = value.floatValue;
}
LYNX_PROP_SETTER("rx", setRx, NSNumber *) {
  _rx = value.floatValue;
}
LYNX_PROP_SETTER("ry", setRy, NSNumber *) {
  _ry = value.floatValue;
}
LYNX_PROP_SETTER("x1", setX1, NSNumber *) {
  _x1 = value.floatValue;
}
LYNX_PROP_SETTER("y1", setY1, NSNumber *) {
  _y1 = value.floatValue;
}
LYNX_PROP_SETTER("x2", setX2, NSNumber *) {
  _x2 = value.floatValue;
}
LYNX_PROP_SETTER("y2", setY2, NSNumber *) {
  _y2 = value.floatValue;
}

#pragma mark - Paint setters

LYNX_PROP_SETTER("color", setColor, NSNumber *) {
  _fillColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
}
LYNX_PROP_SETTER("fill", setFill, NSNumber *) {
  _fillColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
}
LYNX_PROP_SETTER("stroke", setStroke, NSNumber *) {
  _strokeColor = @(value.unsignedLongLongValue & 0xFFFFFFFFULL);
}
LYNX_PROP_SETTER("strokeWidth", setStrokeWidth, NSNumber *) {
  _strokeWidth = value.floatValue;
}
// Enums arrive as numbers already mapped to skityrt bytes (parsers layer).
LYNX_PROP_SETTER("strokeCap", setStrokeCap, NSNumber *) {
  _strokeCap = (uint8_t)value.intValue;
}
LYNX_PROP_SETTER("strokeJoin", setStrokeJoin, NSNumber *) {
  _strokeJoin = (uint8_t)value.intValue;
}
LYNX_PROP_SETTER("strokeMiter", setStrokeMiter, NSNumber *) {
  _strokeMiter = value.floatValue;
}
LYNX_PROP_SETTER("fillRule", setFillRule, NSNumber *) {
  _fillRule = (uint8_t)value.intValue;
}
LYNX_PROP_SETTER("opacity", setOpacity, NSNumber *) {
  _opacity = value.floatValue;
}

#pragma mark - Transform & path setters (base64 → decode → memcpy)

LYNX_PROP_SETTER("transform", setTransform, NSString *) {
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:value
                                                       options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _transformData = decoded.length > 0 ? decoded : nil;
}
LYNX_PROP_SETTER("d", setD, NSString *) {
  NSData *decoded = [[NSData alloc] initWithBase64EncodedString:value
                                                       options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _pathData = decoded.length > 0 ? decoded : nil;
}

@end
