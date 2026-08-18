// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Base ShadowNode for every skity element (canvas + shapes + group). Collects
/// numeric render props — geometry, paint colors, stroke style, opacity — plus
/// the JS-built nested FlatBuffer bytes for path/transform, so the container
/// node (SkityCanvasShadowNode) can serialize them directly into the skityrt
/// FlatBuffer render tree without any string parsing on the native side.
///
/// Variable-length fields (path d, transform) and enum props arrive already
/// resolved by @lynx-skity/parsers in JS: bytes for path/transform, numbers for
/// enums. iOS counterpart of android/.../node/SkityNodeBase.kt. Shape / group
/// nodes are virtual (isVirtual = YES); the canvas node overrides to NO.
#import <Foundation/Foundation.h>
#import <Lynx/LynxShadowNode.h>

@class SkityCanvasShadowNode;

NS_ASSUME_NONNULL_BEGIN

// PaintField bitmask (mirrors skityrt::PaintField in command_batch.fbs). Obj-C
// compatible (no C++) so SkityNodeBase.m setters OR bits directly.
enum SkityPaintField {
  kSkityPaintFieldNone = 0,
  kSkityPaintFieldFill = 1,
  kSkityPaintFieldStroke = 2,
  kSkityPaintFieldStrokeWidth = 4,
  kSkityPaintFieldStrokeCap = 8,
  kSkityPaintFieldStrokeJoin = 16,
  kSkityPaintFieldStrokeMiter = 32,
  kSkityPaintFieldFillRule = 64,
  kSkityPaintFieldOpacity = 128,
  kSkityPaintFieldFillGradient = 256,
  kSkityPaintFieldStrokeGradient = 512,
  kSkityPaintFieldStrokeDash = 1024,
  kSkityPaintFieldBlendMode = 2048,
  kSkityPaintFieldFillImageShader = 4096,
  kSkityPaintFieldStrokeImageShader = 8192,
};

// GeometryField bitmask (mirrors skityrt::GeometryField in command_batch.fbs).
// Obj-C compatible (no C++) so SkityNodeBase.m setters OR bits directly.
enum SkityGeometryField {
  kSkityGeomNone = 0,
  kSkityGeomX = 1,
  kSkityGeomY = 2,
  kSkityGeomWidth = 4,
  kSkityGeomHeight = 8,
  kSkityGeomCX = 16,
  kSkityGeomCY = 32,
  kSkityGeomR = 64,
  kSkityGeomRX = 128,
  kSkityGeomRY = 256,
  kSkityGeomX1 = 512,
  kSkityGeomY1 = 1024,
  kSkityGeomX2 = 2048,
  kSkityGeomY2 = 4096,
  kSkityGeomPathStart = 8192,
  kSkityGeomPathEnd = 16384,
  kSkityGeomPoints = 32768,
};

// Paint filter slot bitmask (which of the six *FilterData slots is dirty).
enum SkityPaintFilterField {
  kSkityFilterFillColor = 1,
  kSkityFilterStrokeColor = 2,
  kSkityFilterFillImage = 4,
  kSkityFilterStrokeImage = 8,
  kSkityFilterFillMask = 16,
  kSkityFilterStrokeMask = 32,
};

@interface SkityNodeBase : LynxShadowNode

/// The skity tag name (e.g. "rect", "circle", "canvas", "g"). Subclasses must
/// override. Must match render_tree.fbs tag_name consumed by SkityRenderer.
@property(nonatomic, readonly) NSString *skityTagName;

// ---- geometry (logical px within the canvas viewport) ----
@property(nonatomic, assign) float x;
@property(nonatomic, assign) float y;
@property(nonatomic, assign) float width;
@property(nonatomic, assign) float height;
@property(nonatomic, assign) float cx;
@property(nonatomic, assign) float cy;
@property(nonatomic, assign) float r;
@property(nonatomic, assign) float rx;
@property(nonatomic, assign) float ry;
@property(nonatomic, assign) float x1;
@property(nonatomic, assign) float y1;
@property(nonatomic, assign) float x2;
@property(nonatomic, assign) float y2;
@property(nonatomic, assign) float pathStart;
@property(nonatomic, assign) float pathEnd;

/// Polyline/polygon vertices [x0,y0,x1,y1,...] as raw little-endian float32
/// bytes (nil/empty = none) — decoded at command-build time into a [float]
/// vector, mirroring strokeDashData.
@property(nonatomic, strong, nullable) NSData *pointsData;

// ---- paint (ARGB 0xAARRGGBB; nil = inactive) ----
@property(nonatomic, strong, nullable) NSNumber *fillColor;
@property(nonatomic, strong, nullable) NSNumber *strokeColor;
@property(nonatomic, assign) float strokeWidth;
@property(nonatomic, assign) uint8_t strokeCap;
@property(nonatomic, assign) uint8_t strokeJoin;
@property(nonatomic, assign) float strokeMiter;
/// Stroke dash pattern ([on, off, ...] px) as raw little-endian float32 bytes
/// (nil/empty = solid) + the phase offset into the pattern.
@property(nonatomic, strong, nullable) NSData *strokeDashData;
@property(nonatomic, assign) float strokeDashOffset;
@property(nonatomic, assign) uint8_t fillRule;
/// Blend mode byte (skityrt::BlendMode == skity::BlendMode order); applies to
/// both the fill and stroke paints. 3 = SRC_OVER (default).
@property(nonatomic, assign) uint8_t blendMode;
@property(nonatomic, assign) float opacity;

// ---- transform & path & gradient (JS-built nested FlatBuffer bytes; nil = none) ----
@property(nonatomic, strong, nullable) NSData *transformData;
@property(nonatomic, strong, nullable) NSData *pathData;
/// Path boolean-op description (JS-built PathOpList bytes; nil = none).
/// Mutually exclusive with pathData in practice; non-empty wins at draw time.
@property(nonatomic, strong, nullable) NSData *opData;
@property(nonatomic, strong, nullable) NSData *fillGradientData;
@property(nonatomic, strong, nullable) NSData *strokeGradientData;
/// Image shader slots (an image as the paint's texture). The uri doubles as
/// the ImageStore key AND the platform loader request (the setter fires it,
/// like skity-image's image prop); nil/empty = no image shader. fit is a
/// BoxFit byte, tx/ty are TileMode bytes (command_batch.fbs value order);
/// rect is 4 floats (x, y, w, h; nil = identity — 1:1 tiling at the bitmap's
/// intrinsic size).
@property(nonatomic, copy, nullable) NSString *fillImageUri;
@property(nonatomic, assign) uint8_t fillImageFit;
@property(nonatomic, assign) uint8_t fillImageTx;
@property(nonatomic, assign) uint8_t fillImageTy;
@property(nonatomic, strong, nullable) NSArray<NSNumber *> *fillImageRect;
@property(nonatomic, copy, nullable) NSString *strokeImageUri;
@property(nonatomic, assign) uint8_t strokeImageFit;
@property(nonatomic, assign) uint8_t strokeImageTx;
@property(nonatomic, assign) uint8_t strokeImageTy;
@property(nonatomic, strong, nullable) NSArray<NSNumber *> *strokeImageRect;
/// Paint filter slots (JS-built Filter bytes; nil = none): fill/stroke ×
/// color/image/mask. Drained into SetPaintFilter commands.
@property(nonatomic, strong, nullable) NSData *fillColorFilterData;
@property(nonatomic, strong, nullable) NSData *strokeColorFilterData;
@property(nonatomic, strong, nullable) NSData *fillImageFilterData;
@property(nonatomic, strong, nullable) NSData *strokeImageFilterData;
@property(nonatomic, strong, nullable) NSData *fillMaskFilterData;
@property(nonatomic, strong, nullable) NSData *strokeMaskFilterData;
/// Group clip sequence (JS-built ClipList bytes; nil = no clip).
@property(nonatomic, strong, nullable) NSData *clipData;
/// Image node source: the uri doubles as the ImageStore key and the platform
/// loader request. Empty/nil = no source (node draws nothing).
@property(nonatomic, copy, nullable) NSString *imageUri;
/// BoxFit (command_batch.fbs value order); default CONTAIN = 1.
@property(nonatomic, assign) uint8_t imageFit;
/// Sampling (command_batch.fbs value order == skity); defaults reproduce the
/// pre-sampling hardcoded behavior (LINEAR / NONE / cubic off).
@property(nonatomic, assign) uint8_t imageFilterMode;
@property(nonatomic, assign) uint8_t imageMipmapMode;
@property(nonatomic, assign) float imageCubicB;
@property(nonatomic, assign) float imageCubicC;

// Phase 2: stable node id assigned by the canvas node for the retained tree.
// 0 = not yet assigned; assigned lazily (1, 2, …) in measure() before the
// snapshot is serialized. Never reused.
@property(nonatomic, assign) int32_t nativeId;

// Phase 2: dirty flags for the incremental command channel. Paint accumulates
// as a SkityPaintField bitmask; geometry as a SkityGeometryField bitmask
// (Step 3a); path/transform are booleans. The canvas ShadowNode drains these
// into a CommandBatch in measure() and clears.
@property(nonatomic, assign) uint32_t dirtyPaintMask;
@property(nonatomic, assign) uint32_t dirtyGeometryMask;
@property(nonatomic, assign) BOOL dirtyPath;
@property(nonatomic, assign) BOOL dirtyPathOp;
@property(nonatomic, assign) uint32_t dirtyFilterMask;
@property(nonatomic, assign) BOOL dirtyTransform;
@property(nonatomic, assign) BOOL dirtyClip;
@property(nonatomic, assign) BOOL dirtyImage;

// Phase 2 Step 2: structural hooks. Lynx has no "move" primitive — a move is a
// remove + insert, which the canvas merges into a MoveNode (same id, same batch).
- (nullable SkityCanvasShadowNode *)findCanvasOwner;
- (int32_t)ensureNativeId; // 0 if not yet under a canvas

@end

NS_ASSUME_NONNULL_END
