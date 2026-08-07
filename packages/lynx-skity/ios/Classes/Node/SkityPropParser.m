// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityPropParser.h"

@implementation SkityTransformOp
@end

@implementation SkityPathCommand
@end

// TransformType bytes (render_tree_style.fbs)
static const uint8_t T_MATRIX = 0;
static const uint8_t T_TRANSLATE = 1;
static const uint8_t T_SCALE = 2;
static const uint8_t T_ROTATE = 3;
static const uint8_t T_SKEW_X = 4;
static const uint8_t T_SKEW_Y = 5;

// PathCommandType bytes (render_tree_style.fbs)
static const uint8_t P_MOVE = 0;
static const uint8_t P_LINE = 1;
static const uint8_t P_CUBIC = 2;
static const uint8_t P_QUAD = 3;
static const uint8_t P_CLOSE = 5;

static NSNumber *SkityNum(float f) { return @(f); }

static float SkityGet(NSArray<NSNumber *> *args, NSUInteger idx, float def) {
  return idx < args.count ? args[idx].floatValue : def;
}

@implementation SkityPropParser

+ (NSArray<NSNumber *> *)parseFloatList:(NSString *)s {
  if (s.length == 0) return nil;
  NSError *err = nil;
  NSRegularExpression *re = [NSRegularExpression
      regularExpressionWithPattern:@"-?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?"
                            options:0
                              error:&err];
  if (!re) return nil;
  NSMutableArray *nums = [NSMutableArray array];
  [re enumerateMatchesInString:s
                       options:0
                         range:NSMakeRange(0, s.length)
                    usingBlock:^(NSTextCheckingResult *m, NSMatchingFlags flags,
                                 BOOL *stop) {
                      NSString *sub = [s substringWithRange:m.range];
                      float v = [sub floatValue];
                      [nums addObject:SkityNum(v)];
                    }];
  return nums.count > 0 ? nums : nil;
}

+ (uint8_t)parseCap:(NSString *)v {
  NSString *s = [v lowercaseString];
  if ([s isEqualToString:@"round"]) return 1;
  if ([s isEqualToString:@"square"]) return 2;
  return 0;  // butt
}

+ (uint8_t)parseJoin:(NSString *)v {
  NSString *s = [v lowercaseString];
  if ([s isEqualToString:@"round"]) return 1;
  if ([s isEqualToString:@"bevel"]) return 2;
  return 0;  // miter
}

+ (uint8_t)parseFillRule:(NSString *)v {
  NSString *s = [v lowercaseString];
  if ([s isEqualToString:@"evenodd"]) return 1;
  return 0;  // nonzero
}

+ (NSArray<SkityTransformOp *> *)parseTransform:(NSString *)s {
  if (s.length == 0) return @[];
  NSMutableArray *out = [NSMutableArray array];
  NSError *err = nil;
  NSRegularExpression *re = [NSRegularExpression
      regularExpressionWithPattern:@"([a-zA-Z]+)\\s*\\(([^)]*)\\)"
                            options:0
                              error:&err];
  if (!re) return @[];
  [re enumerateMatchesInString:s
                       options:0
                         range:NSMakeRange(0, s.length)
                    usingBlock:^(NSTextCheckingResult *m, NSMatchingFlags flags,
                                 BOOL *stop) {
                      NSString *name =
                          [[s substringWithRange:[m rangeAtIndex:1]]
                              lowercaseString];
                      NSArray<NSNumber *> *args = [SkityPropParser
                          parseFloatList:[s substringWithRange:[m rangeAtIndex:2]]];
                      if (args.count == 0) return;
                      SkityTransformOp *op = [SkityTransformOp new];
                      if ([name isEqualToString:@"translate"]) {
                        op.type = T_TRANSLATE;
                        op.args = @[ SkityNum(SkityGet(args, 0, 0)),
                                     SkityNum(SkityGet(args, 1, 0)) ];
                      } else if ([name isEqualToString:@"scale"]) {
                        float sx = SkityGet(args, 0, 1);
                        op.type = T_SCALE;
                        op.args = @[ SkityNum(sx), SkityNum(SkityGet(args, 1, sx)) ];
                      } else if ([name isEqualToString:@"rotate"]) {
                        op.type = T_ROTATE;
                        op.args = @[ SkityNum(SkityGet(args, 0, 0)),
                                     SkityNum(SkityGet(args, 1, 0)),
                                     SkityNum(SkityGet(args, 2, 0)) ];
                      } else if ([name isEqualToString:@"skewx"]) {
                        op.type = T_SKEW_X;
                        op.args = @[ SkityNum(SkityGet(args, 0, 0)) ];
                      } else if ([name isEqualToString:@"skewy"]) {
                        op.type = T_SKEW_Y;
                        op.args = @[ SkityNum(SkityGet(args, 0, 0)) ];
                      } else if ([name isEqualToString:@"matrix"]) {
                        if (args.count < 6) return;
                        op.type = T_MATRIX;
                        op.args = @[
                          SkityNum(SkityGet(args, 0, 0)), SkityNum(SkityGet(args, 1, 0)),
                          SkityNum(SkityGet(args, 2, 0)), SkityNum(SkityGet(args, 3, 0)),
                          SkityNum(SkityGet(args, 4, 0)), SkityNum(SkityGet(args, 5, 0))
                        ];
                      } else {
                        return;
                      }
                      [out addObject:op];
                    }];
  return out;
}

+ (NSArray<SkityPathCommand *> *)parsePath:(NSString *)d {
  if (d.length == 0) return @[];
  NSMutableArray *out = [NSMutableArray array];

  // Split into command tokens: a letter starts a new command; numbers
  // (including sign / decimal / exponent) accumulate as args. Mirrors
  // SkityPropParser.kt's scanner, treating lowercase as absolute (MVP).
  NSError *err = nil;
  NSRegularExpression *numRe = [NSRegularExpression
      regularExpressionWithPattern:@"-?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?"
                            options:0
                              error:&err];
  NSCharacterSet *cmdChars = [NSCharacterSet
      characterSetWithCharactersInString:@"MLHVCSTAQZmlhvcstaqz"];

  void (^flush)(unichar *, NSMutableArray<NSNumber *> *) = ^void(
      unichar *cmd, NSMutableArray<NSNumber *> *nums) {
    if (nums.count == 0) return;
    unichar c = (*cmd >= 'a' && *cmd <= 'z') ? *cmd - ('a' - 'A') : *cmd;
    switch (c) {
      case 'M':
        for (NSUInteger i = 0; i + 1 < nums.count; i += 2) {
          SkityPathCommand *p = [SkityPathCommand new];
          p.type = P_MOVE;
          p.args = @[ nums[i], nums[i + 1] ];
          [out addObject:p];
        }
        break;
      case 'L':
        for (NSUInteger i = 0; i + 1 < nums.count; i += 2) {
          SkityPathCommand *p = [SkityPathCommand new];
          p.type = P_LINE;
          p.args = @[ nums[i], nums[i + 1] ];
          [out addObject:p];
        }
        break;
      case 'C':
        for (NSUInteger i = 0; i + 5 < nums.count; i += 6) {
          SkityPathCommand *p = [SkityPathCommand new];
          p.type = P_CUBIC;
          p.args = @[ nums[i], nums[i + 1], nums[i + 2], nums[i + 3],
                      nums[i + 4], nums[i + 5] ];
          [out addObject:p];
        }
        break;
      case 'Q':
        for (NSUInteger i = 0; i + 3 < nums.count; i += 4) {
          SkityPathCommand *p = [SkityPathCommand new];
          p.type = P_QUAD;
          p.args = @[ nums[i], nums[i + 1], nums[i + 2], nums[i + 3] ];
          [out addObject:p];
        }
        break;
      // H/V/S/T/A: TODO (need current-point tracking / arc conversion)
      default:
        break;
    }
    [nums removeAllObjects];
  };

  NSUInteger i = 0;
  NSUInteger len = d.length;
  unichar cmd = 'M';
  NSMutableArray<NSNumber *> *nums = [NSMutableArray array];
  while (i < len) {
    unichar c = [d characterAtIndex:i];
    if ([cmdChars characterIsMember:c]) {
      if (c == 'Z' || c == 'z') {
        flush(&cmd, nums);
        SkityPathCommand *p = [SkityPathCommand new];
        p.type = P_CLOSE;
        p.args = @[];
        [out addObject:p];
        cmd = (c == 'Z') ? 'L' : 'l';
      } else {
        flush(&cmd, nums);
        cmd = c;
      }
      i++;
    } else if (c == ' ' || c == ',' || c == '\t' || c == '\n' || c == '\r') {
      i++;
    } else {
      // Try to match a number at position i.
      NSTextCheckingResult *m =
          [numRe firstMatchInString:d options:0 range:NSMakeRange(i, len - i)];
      if (m && m.range.location == i) {
        NSString *sub = [d substringWithRange:m.range];
        [nums addObject:SkityNum([sub floatValue])];
        i = m.range.location + m.range.length;
      } else {
        i++;  // skip stray char
      }
    }
  }
  flush(&cmd, nums);
  return out;
}

@end
