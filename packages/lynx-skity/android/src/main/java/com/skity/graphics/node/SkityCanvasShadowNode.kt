// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

import com.google.flatbuffers.FlatBufferBuilder
import com.lynx.tasm.behavior.LynxProp
import com.lynx.tasm.behavior.shadow.AlignContext
import com.lynx.tasm.behavior.shadow.AlignParam
import com.lynx.tasm.behavior.shadow.CustomMeasureFunc
import com.lynx.tasm.behavior.shadow.MeasureContext
import com.lynx.tasm.behavior.shadow.MeasureMode
import com.lynx.tasm.behavior.shadow.MeasureParam
import com.lynx.tasm.behavior.shadow.MeasureResult
import com.skity.graphics.render.SkityRenderBundle
import com.skity.graphics.skityrt.AspectRatioAlign
import com.skity.graphics.skityrt.AspectRatioMeetOrSlice
import com.skity.graphics.skityrt.ComputedStyle
import com.skity.graphics.skityrt.PreserveAspectRatio
import com.skity.graphics.skityrt.RenderNode
import com.skity.graphics.skityrt.RenderTree
import com.skity.graphics.skityrt.ResolvedPaint
import com.skity.graphics.skityrt.RGBAColor
import com.skity.graphics.skityrt.ViewBox

/**
 * Container ShadowNode for `<skity-canvas>`. Implements [CustomMeasureFunc]:
 * during `measure()` it walks the child SkityNodeBase tree and serializes it
 * directly into a `skityrt::RenderTree` FlatBuffer (built leaf→root), wraps it
 * in a [SkityRenderBundle], and exposes it via [getExtraBundle] — which Lynx
 * hands to SkityCanvasUI.updateExtraData.
 *
 * This is the skity counterpart of lynx-native-svg's SvgShadowNode. The key
 * difference: skity has no DOMBuilder, so all string parsing (color/path/
 * transform/enum) happens in front-end JS (@lynx-skity/parsers); this node only
 * ferries scalars and memcpy's the JS-built nested FlatBuffer bytes (path_data /
 * transform_data) plus the canvas viewport into the render tree.
 */
class SkityCanvasShadowNode : SkityNodeBase(), CustomMeasureFunc {

  override val skityTagName = "canvas"

  // Canvas logical viewport (SVG viewBox). When width/height > 0, child geometry
  // authored in these logical pixels is scaled by the renderer to fit the
  // canvas physical size (preserveAspectRatio defaults to X_MID/MEET).
  private var viewportX = 0f
  private var viewportY = 0f
  private var viewportWidth = 0f
  private var viewportHeight = 0f

  @LynxProp(name = "viewportX") fun setViewportX(v: Float) { viewportX = v }
  @LynxProp(name = "viewportY") fun setViewportY(v: Float) { viewportY = v }
  @LynxProp(name = "viewportWidth") fun setViewportWidth(v: Float) { viewportWidth = v }
  @LynxProp(name = "viewportHeight") fun setViewportHeight(v: Float) { viewportHeight = v }

  private var renderBundle: SkityRenderBundle? = null

  init {
    setCustomMeasureFunc(this)
  }

  override fun isVirtual(): Boolean = false

  override fun getExtraBundle(): Any? {
    val b = renderBundle
    renderBundle = null
    return b
  }

  override fun measure(mp: MeasureParam?, mc: MeasureContext?): MeasureResult? {
    if (mp == null) return null
    val density = context.resources.displayMetrics.density

    // Layout is driven by Lynx (style width/height). Resolve to a concrete size
    // from the measure param; only fall back to the width/height props when the
    // parent left it unspecified.
    val w = when (mp.mWidthMode) {
      MeasureMode.EXACTLY -> mp.mWidth
      MeasureMode.AT_MOST -> mp.mWidth
      else -> if (width > 0f) width * density else mp.mWidth
    }
    val h = when (mp.mHeightMode) {
      MeasureMode.EXACTLY -> mp.mHeight
      MeasureMode.AT_MOST -> mp.mHeight
      else -> if (height > 0f) height * density else mp.mHeight
    }

    if (w > 0f && h > 0f) {
      val fbb = FlatBufferBuilder(1024)
      val rootOff = buildRenderNode(fbb, this)

      // Viewport offsets must be built before startRenderTree (referenced tables).
      var vpOff = 0
      var paOff = 0
      if (viewportWidth > 0f && viewportHeight > 0f) {
        vpOff = ViewBox.createViewBox(fbb, viewportX, viewportY, viewportWidth, viewportHeight)
        paOff = PreserveAspectRatio.createPreserveAspectRatio(
          fbb, AspectRatioAlign.X_MID, AspectRatioMeetOrSlice.MEET)
      }
      RenderTree.startRenderTree(fbb)
      RenderTree.addRoot(fbb, rootOff)
      if (vpOff != 0) RenderTree.addViewport(fbb, vpOff)
      if (paOff != 0) RenderTree.addPreserveAspect(fbb, paOff)
      // density is not serialized — the renderer's Draw() density arg is the
      // single source of truth (avoids double-applying).
      val treeOff = RenderTree.endRenderTree(fbb)
      fbb.finish(treeOff)
      renderBundle = SkityRenderBundle(fbb.sizedByteArray(), w / density, h / density, density)
    }
    return MeasureResult(w, h)
  }

  override fun align(p0: AlignParam?, p1: AlignContext?) {
    // no-op — layout is handled by Lynx
  }

  // ---- FlatBuffer serialization (built leaves → root) ----

  private fun buildRenderNode(fbb: FlatBufferBuilder, node: SkityNodeBase): Int {
    val childCount = node.childCount
    val childOffsets = IntArray(childCount) { i ->
      val child = node.getChildAt(i)
      if (child is SkityNodeBase) buildRenderNode(fbb, child) else 0
    }
    val childrenVec =
      if (childCount > 0) RenderNode.createChildrenVector(fbb, childOffsets) else 0

    val styleOff = buildStyle(fbb, node)
    // path d arrives as JS-built PathCommandList bytes; memcpy verbatim.
    val pathDataOff = node.pathData?.let { RenderNode.createPathDataVector(fbb, it) } ?: 0
    val tagOff = fbb.createString(node.skityTagName)

    return RenderNode.createRenderNode(
      fbb, /*id*/ 0, tagOff, styleOff,
      node.x, node.y, node.width, node.height,
      node.cx, node.cy, node.r, node.rx, node.ry,
      node.x1, node.y1, node.x2, node.y2, /*offset*/ 0f,
      childrenVec, /*path_commands*/ 0, pathDataOff, /*points*/ 0,
      /*gradientUnits*/ 0, /*spreadMethod*/ 0)
  }

  private fun buildStyle(fbb: FlatBufferBuilder, node: SkityNodeBase): Int {
    val fillOff = buildPaint(fbb, node.fillColor)
    val strokeOff = buildPaint(fbb, node.strokeColor)
    // CSS transform arrives as JS-built TransformOpList bytes; memcpy verbatim.
    val transformDataOff =
      node.transformData?.let { ComputedStyle.createTransformDataVector(fbb, it) } ?: 0
    // display=INLINE(0), visibility=VISIBLE(0); dasharray/dashoffset TODO.
    return ComputedStyle.createComputedStyle(
      fbb, fillOff, strokeOff,
      node.strokeWidth, node.strokeCap, node.strokeJoin,
      /*dasharray*/ 0, /*dashoffset*/ 0f, node.strokeMiter,
      node.fillRule, node.opacity,
      /*display*/ 0, /*visibility*/ 0,
      /*transform*/ 0, transformDataOff)
  }

  private fun buildPaint(fbb: FlatBufferBuilder, color: Long?): Int {
    if (color == null) {
      // type=NONE(0); color/gradient offsets 0.
      return ResolvedPaint.createResolvedPaint(fbb, 0, 0, 0)
    }
    // RGBAColor channels are uint32 → flatc maps them to Java long.
    val a = (color shr 24) and 0xffL
    val r = (color shr 16) and 0xffL
    val g = (color shr 8) and 0xffL
    val b = color and 0xffL
    val colorOff = RGBAColor.createRGBAColor(fbb, r, g, b, a)
    // type=COLOR(1); gradient offset 0.
    return ResolvedPaint.createResolvedPaint(fbb, 1, colorOff, 0)
  }
}
