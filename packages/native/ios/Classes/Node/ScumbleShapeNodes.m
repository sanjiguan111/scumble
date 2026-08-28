// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "ScumbleShapeNodes.h"

#import <Lynx/LynxComponentRegistry.h>

// Each shape registers a "scumble-<name>" Lynx tag (matching src/elements.ts) and
// reports the SVG-style tag_name (rect/circle/...) that ScumbleRenderer dispatches
// on. isVirtual = YES is inherited from ScumbleNodeBase.

@implementation ScumbleRectShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-rect")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-rect")
#endif
- (NSString *)scumbleTagName {
  return @"rect";
}
@end

@implementation ScumbleCircleShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-circle")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-circle")
#endif
- (NSString *)scumbleTagName {
  return @"circle";
}
@end

@implementation ScumbleEllipseShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-ellipse")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-ellipse")
#endif
- (NSString *)scumbleTagName {
  return @"ellipse";
}
@end

@implementation ScumbleLineShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-line")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-line")
#endif
- (NSString *)scumbleTagName {
  return @"line";
}
@end

@implementation ScumblePathShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-path")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-path")
#endif
- (NSString *)scumbleTagName {
  return @"path";
}
@end

@implementation ScumblePolylineShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-polyline")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-polyline")
#endif
- (NSString *)scumbleTagName {
  return @"polyline";
}
@end

@implementation ScumblePolygonShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-polygon")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-polygon")
#endif
- (NSString *)scumbleTagName {
  return @"polygon";
}
@end

@implementation ScumbleImageShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-image")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-image")
#endif
- (NSString *)scumbleTagName {
  return @"image";
}
@end

@implementation ScumbleGroupShadowNode
#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("scumble-group")
#else
LYNX_REGISTER_SHADOW_NODE("scumble-group")
#endif
- (NSString *)scumbleTagName {
  return @"g";
}
@end
