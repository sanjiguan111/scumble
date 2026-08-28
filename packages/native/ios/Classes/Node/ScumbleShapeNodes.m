// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityShapeNodes.h"

#import <Lynx/LynxComponentRegistry.h>

// Each shape registers a "skity-<name>" Lynx tag (matching src/elements.ts) and
// reports the SVG-style tag_name (rect/circle/...) that SkityRenderer dispatches
// on. isVirtual = YES is inherited from SkityNodeBase.

@implementation SkityRectShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-rect")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-rect")
#endif
- (NSString *)skityTagName {
  return @"rect";
}
@end

@implementation SkityCircleShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-circle")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-circle")
#endif
- (NSString *)skityTagName {
  return @"circle";
}
@end

@implementation SkityEllipseShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-ellipse")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-ellipse")
#endif
- (NSString *)skityTagName {
  return @"ellipse";
}
@end

@implementation SkityLineShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-line")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-line")
#endif
- (NSString *)skityTagName {
  return @"line";
}
@end

@implementation SkityPathShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-path")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-path")
#endif
- (NSString *)skityTagName {
  return @"path";
}
@end

@implementation SkityPolylineShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-polyline")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-polyline")
#endif
- (NSString *)skityTagName {
  return @"polyline";
}
@end

@implementation SkityPolygonShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-polygon")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-polygon")
#endif
- (NSString *)skityTagName {
  return @"polygon";
}
@end

@implementation SkityImageShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-image")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-image")
#endif
- (NSString *)skityTagName {
  return @"image";
}
@end

@implementation SkityGroupShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-group")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-group")
#endif
- (NSString *)skityTagName {
  return @"g";
}
@end
