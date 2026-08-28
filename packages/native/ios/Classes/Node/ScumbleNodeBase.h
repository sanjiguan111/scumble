// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Base ShadowNode for every skity element (canvas + shapes + group). Collects
/// numeric render props — geometry, paint colors, stroke style, opacity — plus
/// the JS-built nested FlatBuffer bytes for path/transform, so the container
/// node (ScumbleCanvasShadowNode) can serialize them directly into the skityrt
/// FlatBuffer render tree without any string parsing on the native side.
///
/// Variable-length fields (path d, transform) and enum props arrive already
/// resolved by @scumble/graphics in JS: bytes for path/transform, numbers for
/// enums. iOS counterpart of android/.../node/ScumbleNodeBase.kt. Shape / group
/// nodes are virtual (isVirtual = YES); the canvas node overrides to NO.
#import <Foundation/Foundation.h>
#import <Lynx/LynxShadowNode.h>

@class ScumbleCanvasShadowNode;

NS_ASSUME_NONNULL_BEGIN

// PaintField bitmask (mirrors skityrt::PaintField in command_batch.fbs). Obj-C
// compatible (no C++) so ScumbleNodeBase.m setters OR bits directly.
enum ScumblePaintField {
  kScumblePaintFieldNone = 0,
  kScumblePaintFieldFill = 1,
  kScumblePaintFieldStroke = 2,
  kScumblePaintFieldStrokeWidth = 4,
  kScumblePaintFieldStrokeCap = 8,
  kScumblePaintFieldStrokeJoin = 16,
  kScumblePaintFieldStrokeMiter = 32,
  kScumblePaintFieldFillRule = 64,
  kScumblePaintFieldOpacity = 128,
  kScumblePaintFieldFillGradient = 256,
  kScumblePaintFieldStrokeGradient = 512,
  kScumblePaintFieldStrokeDash = 1024,
  kScumblePaintFieldBlendMode = 2048,
  kScumblePaintFieldFillImageShader = 4096,
  kScumblePaintFieldStrokeImageShader = 8192,
};

// GeometryField bitmask (mirrors skityrt::GeometryField in command_batch.fbs).
// Obj-C compatible (no C++) so ScumbleNodeBase.m setters OR bits directly.
enum ScumbleGeometryField {
  kScumbleGeomNone = 0,
  kScumbleGeomX = 1,
  kScumbleGeomY = 2,
  kScumbleGeomWidth = 4,
  kScumbleGeomHeight = 8,
  kScumbleGeomCX = 16,
  kScumbleGeomCY = 32,
  kScumbleGeomR = 64,
  kScumbleGeomRX = 128,
  kScumbleGeomRY = 256,
  kScumbleGeomX1 = 512,
  kScumbleGeomY1 = 1024,
  kScumbleGeomX2 = 2048,
  kScumbleGeomY2 = 4096,
  kScumbleGeomPathStart = 8192,
  kScumbleGeomPathEnd = 16384,
  kScumbleGeomPoints = 32768,
};

// Paint filter slot bitmask (which of the six *FilterData slots is dirty).
enum ScumblePaintFilterField {
  kScumbleFilterFillColor = 1,
  kScumbleFilterStrokeColor = 2,
  kScumbleFilterFillImage = 4,
  kScumbleFilterStrokeImage = 8,
  kScumbleFilterFillMask = 16,
  kScumbleFilterStrokeMask = 32,
};

@interface ScumbleNodeBase : LynxShadowNode

/// The skity tag name (e.g. "rect", "circle", "canvas", "g"). Subclasses must
/// override. Must match render_tree.fbs tag_name consumed by ScumbleRenderer.
@property(nonatomic, readonly) NSString *scumbleTagName;

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
/// like scumble-image's image prop); nil/empty = no image shader. fit is a
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
/// Native animation tracks (JS-built AnimationList bytes; nil/empty = clear
/// all animations on the node). The render thread interpolates per vsync —
/// the TASM side only forwards the description (ANIMATION_DESIGN.md).
@property(nonatomic, strong, nullable) NSData *animationData;
/// JS-minted playback-control address riding the SAME SetAnimation command
/// (ANIMATION_CONTROL_DESIGN.md D1). Stored, never dirties on its own — it
/// only matters when animationData changes.
@property(nonatomic, copy, nullable) NSString *animationHandle;
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
/// Paragraph node input (paragraph_runs.fbs SpanList bytes; nil = none) and
/// paragraph-level style. Layout happens on the TASM thread inside the canvas
/// measure pass; the glyph runs ride the extra bundle's runs key.
@property(nonatomic, strong, nullable) NSData *paragraphSpansData;
@property(nonatomic, assign) uint8_t paragraphAlign;     // 0=left 1=center 2=right
@property(nonatomic, assign) uint8_t paragraphDirection; // 0=ltr 1=rtl 2=auto (first-strong)
@property(nonatomic, assign) float paragraphLineHeight;  // multiplier; 0 = 1
@property(nonatomic, assign) int32_t paragraphMaxLines;  // 0 = unlimited
@property(nonatomic, assign) BOOL dirtyParagraph;

// Phase 2: stable node id assigned by the canvas node for the retained tree.
// 0 = not yet assigned; assigned lazily (1, 2, …) in measure() before the
// snapshot is serialized. Never reused.
@property(nonatomic, assign) int32_t nativeId;

// Phase 2: dirty flags for the incremental command channel. Paint accumulates
// as a ScumblePaintField bitmask; geometry as a ScumbleGeometryField bitmask
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
@property(nonatomic, assign) BOOL dirtyAnimation;

// Phase 2 Step 2: structural hooks. Lynx has no "move" primitive — a move is a
// remove + insert, which the canvas merges into a MoveNode (same id, same batch).
- (nullable ScumbleCanvasShadowNode *)findCanvasOwner;
- (int32_t)ensureNativeId; // 0 if not yet under a canvas

@end

NS_ASSUME_NONNULL_END
