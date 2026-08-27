// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics

import com.lynx.tasm.behavior.Behavior
import com.lynx.tasm.behavior.BehaviorBundle
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.shadow.ShadowNode
import com.lynx.tasm.behavior.ui.LynxUI
import com.skity.graphics.node.SkityCanvasShadowNode
import com.skity.graphics.node.SkityCircleShadowNode
import com.skity.graphics.node.SkityEllipseShadowNode
import com.skity.graphics.node.SkityGroupShadowNode
import com.skity.graphics.node.SkityImageShadowNode
import com.skity.graphics.node.SkityLineShadowNode
import com.skity.graphics.node.SkityParagraphShadowNode
import com.skity.graphics.node.SkityPathShadowNode
import com.skity.graphics.node.SkityPolygonShadowNode
import com.skity.graphics.node.SkityPolylineShadowNode
import com.skity.graphics.node.SkityRectShadowNode
import com.skity.graphics.ui.SkityCanvasUI

/**
 * Registers the skity element set with Lynx. The canvas element owns both a
 * ShadowNode (SkityCanvasShadowNode, custom-measured, emits the RenderTree) and
 * a UI (SkityCanvasUI); shape/group elements are virtual (ShadowNode only).
 *
 * Mirrors lynx-native-svg's SvgBehavior.kt. This is what lets data flow from JS
 * props → ShadowNode → getExtraBundle → UI (the extra-data channel requires a
 * custom ShadowNode, which the previous @LynxElement registration lacked).
 */
class SkityBehavior : BehaviorBundle {

  override fun create(): List<Behavior> {
    return listOf(
      object : Behavior("gesso-canvas") {
        override fun createUI(context: LynxContext?): LynxUI<*>? =
          context?.let { SkityCanvasUI(it) }

        override fun createShadowNode(): ShadowNode = SkityCanvasShadowNode()
      },

      virtualBehavior("gesso-rect", ::SkityRectShadowNode),
      virtualBehavior("gesso-circle", ::SkityCircleShadowNode),
      virtualBehavior("gesso-ellipse", ::SkityEllipseShadowNode),
      virtualBehavior("gesso-line", ::SkityLineShadowNode),
      virtualBehavior("gesso-path", ::SkityPathShadowNode),
      virtualBehavior("gesso-polyline", ::SkityPolylineShadowNode),
      virtualBehavior("gesso-polygon", ::SkityPolygonShadowNode),
      virtualBehavior("gesso-image", ::SkityImageShadowNode),
      virtualBehavior("gesso-group", ::SkityGroupShadowNode),
      virtualBehavior("gesso-paragraph", ::SkityParagraphShadowNode),
    )
  }

  private fun virtualBehavior(name: String, factory: () -> ShadowNode) =
    object : Behavior(name) {
      override fun createShadowNode(): ShadowNode = factory()
    }
}
