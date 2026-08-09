// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityShapeNodes.h"

#import <Lynx/LynxComponentRegistry.h>

// Each shape registers a "skity-<name>" Lynx tag (matching src/elements.ts) and
// reports the SVG-style tag_name (rect/circle/...) that SkityRenderer dispatches
// on. isVirtual = YES is inherited from SkityNodeBase.

@implementation SkityRectShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-rect")
#else
LYNX_REGISTER_SHADOW_NODE("skity-rect")
#endif
- (NSString *)skityTagName {
  return @"rect";
}
@end

@implementation SkityCircleShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-circle")
#else
LYNX_REGISTER_SHADOW_NODE("skity-circle")
#endif
- (NSString *)skityTagName {
  return @"circle";
}
@end

@implementation SkityEllipseShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-ellipse")
#else
LYNX_REGISTER_SHADOW_NODE("skity-ellipse")
#endif
- (NSString *)skityTagName {
  return @"ellipse";
}
@end

@implementation SkityLineShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-line")
#else
LYNX_REGISTER_SHADOW_NODE("skity-line")
#endif
- (NSString *)skityTagName {
  return @"line";
}
@end

@implementation SkityPathShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-path")
#else
LYNX_REGISTER_SHADOW_NODE("skity-path")
#endif
- (NSString *)skityTagName {
  return @"path";
}
@end

@implementation SkityGroupShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-group")
#else
LYNX_REGISTER_SHADOW_NODE("skity-group")
#endif
- (NSString *)skityTagName {
  return @"g";
}
@end
