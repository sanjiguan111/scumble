// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Virtual shape/group ShadowNodes. Each only declares its skity tag name; all
/// geometry/paint props are inherited from SkityNodeBase. The container
/// SkityCanvasShadowNode walks the child tree and serializes every node.
///
/// iOS counterpart of android/.../node/SkityShapeNodes.kt.
#import "SkityNodeBase.h"

NS_ASSUME_NONNULL_BEGIN

@interface SkityRectShadowNode : SkityNodeBase
@end
@interface SkityCircleShadowNode : SkityNodeBase
@end
@interface SkityEllipseShadowNode : SkityNodeBase
@end
@interface SkityLineShadowNode : SkityNodeBase
@end
@interface SkityPathShadowNode : SkityNodeBase
@end
@interface SkityGroupShadowNode : SkityNodeBase
@end

NS_ASSUME_NONNULL_END
