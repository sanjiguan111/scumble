// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Parses declarative prop values — transform string, SVG path "d", color,
// stroke/fill enums — into the intermediate SkityTransformOp / SkityPathCommand
// stored on SkityNodeBase, which SkityCanvasShadowNode then serializes into the
// skityrt FlatBuffer.
//
// iOS counterpart of android/.../node/SkityPropParser.kt. The enum byte values
// (type bytes) must match render_tree_style.fbs (PathCommandType / TransformType
// / LineCap / LineJoin / FillRule).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Parsed transform operation; maps to a skityrt::TransformOp (type byte + args).
/// type bytes (render_tree_style.fbs TransformType):
/// MATRIX=0, TRANSLATE=1, SCALE=2, ROTATE=3, SKEW_X=4, SKEW_Y=5
@interface SkityTransformOp : NSObject
@property(nonatomic, assign) uint8_t type;
@property(nonatomic, strong) NSArray<NSNumber *> *args; ///< float values
@end

/// Parsed path command; maps to a skityrt::PathCommand (type byte + args).
/// type bytes (render_tree_style.fbs PathCommandType):
/// MOVE_TO=0, LINE_TO=1, CUBIC_TO=2, QUAD_TO=3, ARC_TO=4, CLOSE=5
@interface SkityPathCommand : NSObject
@property(nonatomic, assign) uint8_t type;
@property(nonatomic, strong) NSArray<NSNumber *> *args; ///< float values
@end

/// Pure-ObjC port of SkityPropParser.kt.
@interface SkityPropParser : NSObject

/// Parse a whitespace/comma-separated float list, e.g. "10,20 30 40".
+ (nullable NSArray<NSNumber *> *)parseFloatList:(nullable NSString *)s;

/// LineCap: butt=0, round=1, square=2.
+ (uint8_t)parseCap:(nullable NSString *)v;
/// LineJoin: miter=0, round=1, bevel=2.
+ (uint8_t)parseJoin:(nullable NSString *)v;
/// FillRule: nonzero=0, evenodd=1.
+ (uint8_t)parseFillRule:(nullable NSString *)v;

/// CSS/SVG-style transform list, e.g. "translate(10,5) scale(2) rotate(45,1,1)".
+ (NSArray<SkityTransformOp *> *)parseTransform:(nullable NSString *)s;

/// Minimal SVG path parser. Supports absolute M/L/C/Q/Z (lowercase treated as
/// absolute for MVP). Each command may repeat with extra coordinate groups.
+ (NSArray<SkityPathCommand *> *)parsePath:(nullable NSString *)d;

@end

NS_ASSUME_NONNULL_END
