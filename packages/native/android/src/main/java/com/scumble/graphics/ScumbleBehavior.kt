// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics

import com.lynx.tasm.behavior.Behavior
import com.lynx.tasm.behavior.BehaviorBundle
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.shadow.ShadowNode
import com.lynx.tasm.behavior.ui.LynxUI
import com.scumble.graphics.node.ScumbleCanvasShadowNode
import com.scumble.graphics.node.ScumbleCircleShadowNode
import com.scumble.graphics.node.ScumbleEllipseShadowNode
import com.scumble.graphics.node.ScumbleGroupShadowNode
import com.scumble.graphics.node.ScumbleImageShadowNode
import com.scumble.graphics.node.ScumbleLineShadowNode
import com.scumble.graphics.node.ScumbleParagraphShadowNode
import com.scumble.graphics.node.ScumblePathShadowNode
import com.scumble.graphics.node.ScumblePolygonShadowNode
import com.scumble.graphics.node.ScumblePolylineShadowNode
import com.scumble.graphics.node.ScumbleRectShadowNode
import com.scumble.graphics.ui.ScumbleCanvasUI

/**
 * Registers the skity element set with Lynx. The canvas element owns both a
 * ShadowNode (ScumbleCanvasShadowNode, custom-measured, emits the RenderTree) and
 * a UI (ScumbleCanvasUI); shape/group elements are virtual (ShadowNode only).
 *
 * Mirrors lynx-native-svg's SvgBehavior.kt. This is what lets data flow from JS
 * props → ShadowNode → getExtraBundle → UI (the extra-data channel requires a
 * custom ShadowNode, which the previous @LynxElement registration lacked).
 */
class ScumbleBehavior : BehaviorBundle {

  override fun create(): List<Behavior> {
    return listOf(
      object : Behavior("scumble-canvas") {
        override fun createUI(context: LynxContext?): LynxUI<*>? =
          context?.let { ScumbleCanvasUI(it) }

        override fun createShadowNode(): ShadowNode = ScumbleCanvasShadowNode()
      },

      virtualBehavior("scumble-rect", ::ScumbleRectShadowNode),
      virtualBehavior("scumble-circle", ::ScumbleCircleShadowNode),
      virtualBehavior("scumble-ellipse", ::ScumbleEllipseShadowNode),
      virtualBehavior("scumble-line", ::ScumbleLineShadowNode),
      virtualBehavior("scumble-path", ::ScumblePathShadowNode),
      virtualBehavior("scumble-polyline", ::ScumblePolylineShadowNode),
      virtualBehavior("scumble-polygon", ::ScumblePolygonShadowNode),
      virtualBehavior("scumble-image", ::ScumbleImageShadowNode),
      virtualBehavior("scumble-group", ::ScumbleGroupShadowNode),
      virtualBehavior("scumble-paragraph", ::ScumbleParagraphShadowNode),
    )
  }

  private fun virtualBehavior(name: String, factory: () -> ShadowNode) =
    object : Behavior(name) {
      override fun createShadowNode(): ShadowNode = factory()
    }
}
