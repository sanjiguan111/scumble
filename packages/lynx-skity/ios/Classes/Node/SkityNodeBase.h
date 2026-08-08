// Copyright 2026 The Lynx Authors. All rights reserved.
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

NS_ASSUME_NONNULL_BEGIN

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

@end

NS_ASSUME_NONNULL_END
