// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Base ShadowNode for every skity element (canvas + shapes + group). Collects
/// numeric/decoded render props — geometry, paint colors, stroke style, opacity,
/// parsed transform & path — so the container node (SkityCanvasShadowNode) can
/// serialize them directly into the skityrt FlatBuffer render tree without a
/// DOM/property-string layer.
///
/// iOS counterpart of android/.../node/SkityNodeBase.kt. Shape / group nodes
/// are virtual (isVirtual = YES); the canvas node overrides to NO.
#import <Foundation/Foundation.h>
#import <Lynx/LynxShadowNode.h>

#import "SkityPropParser.h"

NS_ASSUME_NONNULL_BEGIN

@interface SkityNodeBase : LynxShadowNode

/// The skity tag name (e.g. "rect", "circle", "canvas", "g"). Subclasses must
/// override. Must match render_tree.fbs tag_name consumed by SkityRenderer.
@property(nonatomic, readonly) NSString *skityTagName;

// ---- geometry (absolute px) ----
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
@property(nonatomic, strong, nullable) NSArray<NSNumber *> *points;

// ---- paint (ARGB 0xAARRGGBB; nil = inactive) ----
@property(nonatomic, strong, nullable) NSNumber *fillColor;
@property(nonatomic, strong, nullable) NSNumber *strokeColor;
@property(nonatomic, assign) float strokeWidth;
@property(nonatomic, assign) uint8_t strokeCap;
@property(nonatomic, assign) uint8_t strokeJoin;
@property(nonatomic, assign) float strokeMiter;
@property(nonatomic, assign) uint8_t fillRule;
@property(nonatomic, assign) float opacity;

// ---- transform & path (parsed) ----
@property(nonatomic, strong) NSArray<SkityTransformOp *> *transformOps;
@property(nonatomic, strong) NSArray<SkityPathCommand *> *pathCommands;

@end

NS_ASSUME_NONNULL_END
