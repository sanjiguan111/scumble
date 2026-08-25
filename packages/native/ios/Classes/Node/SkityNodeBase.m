// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityNodeBase.h"
#import "SkityCanvasShadowNode.h"
#import "SkityImageLoader.h"

#import <Lynx/LynxPropsProcessor.h>

// Parse an image-shader rect prop ("x,y,w,h" — 4 comma-separated floats) into
// the 4-number array the encoder turns into the SetPaint rect vector. An
// empty/malformed string yields nil (identity — 1:1 tiling at the bitmap's
// intrinsic size).
static NSArray<NSNumber *> *SkityParseRectString(NSString *s) {
  if (s.length == 0) return nil;
  float v[4];
  if (sscanf(s.UTF8String, "%f,%f,%f,%f", &v[0], &v[1], &v[2], &v[3]) != 4) return nil;
  return @[ @(v[0]), @(v[1]), @(v[2]), @(v[3]) ];
}

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
    // Image shader slots: uri (also fires the platform load, like the image
    // node's image prop), fit/tx/ty bytes, rect as "x,y,w,h".
    LYNX_PROP_DECLARE("fillImageUri", setFillImageUri:, NSString *),
    LYNX_PROP_DECLARE("fillImageFit", setFillImageFit:, NSNumber *),
    LYNX_PROP_DECLARE("fillImageTx", setFillImageTx:, NSNumber *),
    LYNX_PROP_DECLARE("fillImageTy", setFillImageTy:, NSNumber *),
    LYNX_PROP_DECLARE("fillImageRect", setFillImageRect:, NSString *),
    LYNX_PROP_DECLARE("strokeImageUri", setStrokeImageUri:, NSString *),
    LYNX_PROP_DECLARE("strokeImageFit", setStrokeImageFit:, NSNumber *),
    LYNX_PROP_DECLARE("strokeImageTx", setStrokeImageTx:, NSNumber *),
    LYNX_PROP_DECLARE("strokeImageTy", setStrokeImageTy:, NSNumber *),
    LYNX_PROP_DECLARE("strokeImageRect", setStrokeImageRect:, NSString *),
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
    LYNX_PROP_DECLARE("clip", setClip:, NSString *),
    LYNX_PROP_DECLARE("animationData", setAnimationData:, NSString *),
    // Image node source uri (http(s) URL / data URI); an empty string clears
    // the source. Setting it also fires the platform image load.
    LYNX_PROP_DECLARE("image", setImage:, NSString *),
    // BoxFit value (command_batch.fbs order).
    LYNX_PROP_DECLARE("fit", setFit:, NSNumber *),
    // Sampling: filter/mipmap values (command_batch.fbs order) + cubic
    // resampler weights (both zero = cubic off).
    LYNX_PROP_DECLARE("filterMode", setFilterMode:, NSNumber *),
    LYNX_PROP_DECLARE("mipmapMode", setMipmapMode:, NSNumber *),
    LYNX_PROP_DECLARE("cubicB", setCubicB:, NSNumber *),
    LYNX_PROP_DECLARE("cubicC", setCubicC:, NSNumber *),
    // Paragraph node: SpanList bytes (base64) + paragraph-level style.
    LYNX_PROP_DECLARE("spans", setSpans:, NSString *),
    LYNX_PROP_DECLARE("textAlign", setTextAlign:, NSNumber *),
    LYNX_PROP_DECLARE("direction", setDirection:, NSNumber *),
    LYNX_PROP_DECLARE("lineHeight", setLineHeight:, NSNumber *),
    LYNX_PROP_DECLARE("maxLines", setMaxLines:, NSNumber *))

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
    _fillImageFit = 1; // BoxFit CONTAIN (schema default)
    _strokeImageFit = 1;
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
  _dirtyParagraph = YES; // the paragraph layout width constraint changed
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
// Image shader slots. The uri doubles as the ImageStore key AND the platform
// loader request — fire it here on the TASM thread so the load runs in
// parallel with the command batch that carries it (same trick as the image
// node's image prop). An empty string clears the slot.
LYNX_PROP_SETTER("fillImageUri", setFillImageUri, NSString *) {
  _fillImageUri = value.length > 0 ? [value copy] : nil;
  _dirtyPaintMask |= kSkityPaintFieldFillImageShader;
  [self setNeedsLayout];
  if (_fillImageUri != nil) {
    [SkityImageLoaderRegistry requestImage:_fillImageUri];
  }
}
LYNX_PROP_SETTER("fillImageFit", setFillImageFit, NSNumber *) {
  _fillImageFit = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldFillImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fillImageTx", setFillImageTx, NSNumber *) {
  _fillImageTx = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldFillImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fillImageTy", setFillImageTy, NSNumber *) {
  _fillImageTy = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldFillImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("fillImageRect", setFillImageRect, NSString *) {
  _fillImageRect = SkityParseRectString(value);
  _dirtyPaintMask |= kSkityPaintFieldFillImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeImageUri", setStrokeImageUri, NSString *) {
  _strokeImageUri = value.length > 0 ? [value copy] : nil;
  _dirtyPaintMask |= kSkityPaintFieldStrokeImageShader;
  [self setNeedsLayout];
  if (_strokeImageUri != nil) {
    [SkityImageLoaderRegistry requestImage:_strokeImageUri];
  }
}
LYNX_PROP_SETTER("strokeImageFit", setStrokeImageFit, NSNumber *) {
  _strokeImageFit = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeImageTx", setStrokeImageTx, NSNumber *) {
  _strokeImageTx = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeImageTy", setStrokeImageTy, NSNumber *) {
  _strokeImageTy = (uint8_t)value.unsignedCharValue;
  _dirtyPaintMask |= kSkityPaintFieldStrokeImageShader;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("strokeImageRect", setStrokeImageRect, NSString *) {
  _strokeImageRect = SkityParseRectString(value);
  _dirtyPaintMask |= kSkityPaintFieldStrokeImageShader;
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

LYNX_PROP_SETTER("animationData", setAnimationData, NSString *) {
  // Mirror the Android setter's null contract: Lynx fires setters with nil on
  // mount/teardown paths — no-op (an explicit clear is the empty string).
  if (value == nil) return;
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _animationData = decoded.length > 0 ? decoded : nil;
  _dirtyAnimation = YES;
  [self setNeedsLayout];
}

LYNX_PROP_SETTER("image", setImage, NSString *) {
  _imageUri = value.length > 0 ? [value copy] : nil;
  _dirtyImage = YES;
  [self setNeedsLayout];
  // Fire (or join) the platform load here on the TASM thread — the load then
  // runs in parallel with the command batch that carries this uri.
  if (_imageUri != nil) {
    [SkityImageLoaderRegistry requestImage:_imageUri];
  }
}

LYNX_PROP_SETTER("fit", setFit, NSNumber *) {
  _imageFit = (uint8_t)value.unsignedCharValue;
  _dirtyImage = YES;
  [self setNeedsLayout];
}

LYNX_PROP_SETTER("filterMode", setFilterMode, NSNumber *) {
  _imageFilterMode = (uint8_t)value.unsignedCharValue;
  _dirtyImage = YES;
  [self setNeedsLayout];
}

LYNX_PROP_SETTER("mipmapMode", setMipmapMode, NSNumber *) {
  _imageMipmapMode = (uint8_t)value.unsignedCharValue;
  _dirtyImage = YES;
  [self setNeedsLayout];
}

LYNX_PROP_SETTER("cubicB", setCubicB, NSNumber *) {
  _imageCubicB = value.floatValue;
  _dirtyImage = YES;
  [self setNeedsLayout];
}

LYNX_PROP_SETTER("cubicC", setCubicC, NSNumber *) {
  _imageCubicC = value.floatValue;
  _dirtyImage = YES;
  [self setNeedsLayout];
}
// Paragraph props — decoded SpanList bytes + paragraph style; any change
// re-triggers the measure-time layout (the canvas drains it).
LYNX_PROP_SETTER("spans", setSpans, NSString *) {
  NSData *decoded =
      [[NSData alloc] initWithBase64EncodedString:value
                                          options:NSDataBase64DecodingIgnoreUnknownCharacters];
  _paragraphSpansData = decoded.length > 0 ? decoded : nil;
  _dirtyParagraph = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("textAlign", setTextAlign, NSNumber *) {
  _paragraphAlign = (uint8_t)value.unsignedCharValue;
  _dirtyParagraph = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("direction", setDirection, NSNumber *) {
  _paragraphDirection = (uint8_t)value.unsignedCharValue;
  _dirtyParagraph = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("lineHeight", setLineHeight, NSNumber *) {
  _paragraphLineHeight = value.floatValue;
  _dirtyParagraph = YES;
  [self setNeedsLayout];
}
LYNX_PROP_SETTER("maxLines", setMaxLines, NSNumber *) {
  _paragraphMaxLines = value.intValue;
  _dirtyParagraph = YES;
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
