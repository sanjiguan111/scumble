// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.node

/**
 * Virtual shape/group ShadowNodes. Each only declares its skity tag name; all
 * geometry/paint props are inherited from [ScumbleNodeBase]. The container
 * [ScumbleCanvasShadowNode] walks the child tree and serializes every node.
 *
 * Mirrors lynx-native-svg's leaf ShadowNodes (RectShadowNode, CircleShadowNode,
 * …) which likewise just set `svgTagName` plus a few geometry setters.
 */

class ScumbleRectShadowNode : ScumbleNodeBase() {
  override val skityTagName = "rect"
}

class ScumbleCircleShadowNode : ScumbleNodeBase() {
  override val skityTagName = "circle"
}

class ScumbleEllipseShadowNode : ScumbleNodeBase() {
  override val skityTagName = "ellipse"
}

class ScumbleLineShadowNode : ScumbleNodeBase() {
  override val skityTagName = "line"
}

class ScumblePathShadowNode : ScumbleNodeBase() {
  override val skityTagName = "path"
}

class ScumblePolylineShadowNode : ScumbleNodeBase() {
  override val skityTagName = "polyline"
}

class ScumblePolygonShadowNode : ScumbleNodeBase() {
  override val skityTagName = "polygon"
}

class ScumbleImageShadowNode : ScumbleNodeBase() {
  override val skityTagName = "image"
}

class ScumbleGroupShadowNode : ScumbleNodeBase() {
  override val skityTagName = "g"
}
