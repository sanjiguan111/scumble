// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

/**
 * Virtual shape/group ShadowNodes. Each only declares its skity tag name; all
 * geometry/paint props are inherited from [SkityNodeBase]. The container
 * [SkityCanvasShadowNode] walks the child tree and serializes every node.
 *
 * Mirrors lynx-native-svg's leaf ShadowNodes (RectShadowNode, CircleShadowNode,
 * …) which likewise just set `svgTagName` plus a few geometry setters.
 */

class SkityRectShadowNode : SkityNodeBase() {
  override val skityTagName = "rect"
}

class SkityCircleShadowNode : SkityNodeBase() {
  override val skityTagName = "circle"
}

class SkityEllipseShadowNode : SkityNodeBase() {
  override val skityTagName = "ellipse"
}

class SkityLineShadowNode : SkityNodeBase() {
  override val skityTagName = "line"
}

class SkityPathShadowNode : SkityNodeBase() {
  override val skityTagName = "path"
}

class SkityPolylineShadowNode : SkityNodeBase() {
  override val skityTagName = "polyline"
}

class SkityPolygonShadowNode : SkityNodeBase() {
  override val skityTagName = "polygon"
}

class SkityImageShadowNode : SkityNodeBase() {
  override val skityTagName = "image"
}

class SkityGroupShadowNode : SkityNodeBase() {
  override val skityTagName = "g"
}
