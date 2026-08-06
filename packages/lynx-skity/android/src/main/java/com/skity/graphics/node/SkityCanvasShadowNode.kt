// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

import com.google.flatbuffers.FlatBufferBuilder
import com.lynx.tasm.behavior.shadow.AlignContext
import com.lynx.tasm.behavior.shadow.AlignParam
import com.lynx.tasm.behavior.shadow.CustomMeasureFunc
import com.lynx.tasm.behavior.shadow.MeasureContext
import com.lynx.tasm.behavior.shadow.MeasureMode
import com.lynx.tasm.behavior.shadow.MeasureParam
import com.lynx.tasm.behavior.shadow.MeasureResult
import com.skity.graphics.render.SkityRenderBundle
import com.skity.graphics.skityrt.ComputedStyle
import com.skity.graphics.skityrt.PathCommand
import com.skity.graphics.skityrt.RenderNode
import com.skity.graphics.skityrt.RenderTree
import com.skity.graphics.skityrt.ResolvedPaint
import com.skity.graphics.skityrt.RGBAColor
import com.skity.graphics.skityrt.TransformOp

/**
 * Container ShadowNode for `<skity-canvas>`. Implements [CustomMeasureFunc]:
 * during `measure()` it walks the child SkityNodeBase tree and serializes it
 * directly into a `skityrt::RenderTree` FlatBuffer (built leaf→root), wraps it
 * in a [SkityRenderBundle], and exposes it via [getExtraBundle] — which Lynx
 * hands to SkityCanvasUI.updateExtraData.
 *
 * This is the skity counterpart of lynx-native-svg's SvgShadowNode. The key
 * difference: SvgShadowNode emits MutationOps (attribute strings) consumed by a
 * C++ DOMBuilder that resolves values; skity has no DOMBuilder, so resolution
 * happens in the ShadowNodes (SkityPropParser) and this node emits the final
 * RenderTree directly.
 *
 * NOTE: ResolvedPaint/RGBAColor/PathCommand/TransformOp `create*` calls follow
 * the standard flatc --java pattern; verify against the generated classes.
 */
class SkityCanvasShadowNode : SkityNodeBase(), CustomMeasureFunc {

  override val skityTagName = "canvas"

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
      RenderTree.startRenderTree(fbb)
      RenderTree.addRoot(fbb, rootOff)
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
    val pathVec = buildPathCommands(fbb, node)
    val pts = node.points
    val pointsVec = if (pts != null && pts.isNotEmpty())
      RenderNode.createPointsVector(fbb, pts) else 0
    val tagOff = fbb.createString(node.skityTagName)

    return RenderNode.createRenderNode(
      fbb, /*id*/ 0, tagOff, styleOff,
      node.x, node.y, node.width, node.height,
      node.cx, node.cy, node.r, node.rx, node.ry,
      node.x1, node.y1, node.x2, node.y2, /*offset*/ 0f,
      childrenVec, pathVec, pointsVec,
      /*gradientUnits*/ 0, /*spreadMethod*/ 0)
  }

  private fun buildStyle(fbb: FlatBufferBuilder, node: SkityNodeBase): Int {
    val fillOff = buildPaint(fbb, node.fillColor)
    val strokeOff = buildPaint(fbb, node.strokeColor)
    val transformVec = buildTransformVec(fbb, node.transformOps)
    // display=INLINE(0), visibility=VISIBLE(0); dasharray/dashoffset TODO.
    return ComputedStyle.createComputedStyle(
      fbb, fillOff, strokeOff,
      node.strokeWidth, node.strokeCap, node.strokeJoin,
      /*dasharray*/ 0, /*dashoffset*/ 0f, node.strokeMiter,
      node.fillRule, node.opacity,
      /*display*/ 0, /*visibility*/ 0,
      transformVec)
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

  private fun buildTransformVec(fbb: FlatBufferBuilder, ops: List<TransformOpData>): Int {
    if (ops.isEmpty()) return 0
    val offsets = IntArray(ops.size) { i ->
      val op = ops[i]
      val argsOff = TransformOp.createArgsVector(fbb, op.args)
      TransformOp.createTransformOp(fbb, op.type, argsOff)
    }
    return ComputedStyle.createTransformVector(fbb, offsets)
  }

  private fun buildPathCommands(fbb: FlatBufferBuilder, node: SkityNodeBase): Int {
    if (node.pathCommands.isEmpty()) return 0
    val offsets = IntArray(node.pathCommands.size) { i ->
      val cmd = node.pathCommands[i]
      val argsOff = PathCommand.createArgsVector(fbb, cmd.args)
      PathCommand.createPathCommand(fbb, cmd.type, argsOff)
    }
    return RenderNode.createPathCommandsVector(fbb, offsets)
  }
}
