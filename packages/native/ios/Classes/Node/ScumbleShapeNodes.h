// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Virtual shape/group ShadowNodes. Each only declares its skity tag name; all
/// geometry/paint props are inherited from ScumbleNodeBase. The container
/// ScumbleCanvasShadowNode walks the child tree and serializes every node.
///
/// iOS counterpart of android/.../node/ScumbleShapeNodes.kt.
#import "ScumbleNodeBase.h"

NS_ASSUME_NONNULL_BEGIN

@interface ScumbleRectShadowNode : ScumbleNodeBase
@end
@interface ScumbleCircleShadowNode : ScumbleNodeBase
@end
@interface ScumbleEllipseShadowNode : ScumbleNodeBase
@end
@interface ScumbleLineShadowNode : ScumbleNodeBase
@end
@interface ScumblePathShadowNode : ScumbleNodeBase
@end
@interface ScumblePolylineShadowNode : ScumbleNodeBase
@end
@interface ScumblePolygonShadowNode : ScumbleNodeBase
@end
@interface ScumbleImageShadowNode : ScumbleNodeBase
@end
@interface ScumbleGroupShadowNode : ScumbleNodeBase
@end

NS_ASSUME_NONNULL_END
