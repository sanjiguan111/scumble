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

// ---- paint (ARGB 0xAARRGGBB; nil = inactive) ----
@property(nonatomic, strong, nullable) NSNumber *fillColor;
@property(nonatomic, strong, nullable) NSNumber *strokeColor;
@property(nonatomic, assign) float strokeWidth;
@property(nonatomic, assign) uint8_t strokeCap;
@property(nonatomic, assign) uint8_t strokeJoin;
@property(nonatomic, assign) float strokeMiter;
@property(nonatomic, assign) uint8_t fillRule;
@property(nonatomic, assign) float opacity;

// ---- transform & path (JS-built nested FlatBuffer bytes; nil = none) ----
@property(nonatomic, strong, nullable) NSData *transformData;
@property(nonatomic, strong, nullable) NSData *pathData;

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
@property(nonatomic, assign) BOOL dirtyTransform;

// Phase 2 Step 2: structural hooks. Lynx has no "move" primitive — a move is a
// remove + insert, which the canvas merges into a MoveNode (same id, same batch).
- (nullable SkityCanvasShadowNode *)findCanvasOwner;
- (int32_t)ensureNativeId; // 0 if not yet under a canvas

@end

NS_ASSUME_NONNULL_END
