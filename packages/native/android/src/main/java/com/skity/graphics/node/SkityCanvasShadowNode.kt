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
import com.skity.graphics.skityrt.Command
import com.skity.graphics.skityrt.CommandBatch
import com.skity.graphics.skityrt.InsertNode
import com.skity.graphics.skityrt.MoveNode
import com.skity.graphics.skityrt.RemoveNode
import com.skity.graphics.skityrt.SetClip
import com.skity.graphics.skityrt.SetGeometry
import com.skity.graphics.skityrt.SetPaint
import com.skity.graphics.skityrt.SetPathData
import com.skity.graphics.skityrt.SetTransform
import com.skity.graphics.skityrt.SetViewport

/**
 * Phase 2 Step 2 structural operations enqueued by SkityNodeBase's addChildAt/
 * removeChildAt hooks and drained into a CommandBatch in measure(). A Remove +
 * Insert of the same id in one batch is merged into a Move by enqueueStructural.
 */
sealed class StructuralOp {
  data class Insert(val nodeId: Int, val parentId: Int, val index: Int, val tag: String) : StructuralOp()
  data class Remove(val nodeId: Int) : StructuralOp()
  data class Move(val nodeId: Int, val newParentId: Int, val index: Int) : StructuralOp()
}

/**
 * Container ShadowNode for `<skity-canvas>`. Implements [CustomMeasureFunc] so
 * Lynx keeps calling `measure()` each layout pass — but measure no longer
 * serializes a snapshot: it only drains dirty props into a CommandBatch
 * (structural + paint/path/transform/geometry/viewport) and exposes it via
 * [getExtraBundle]. The render thread's retained tree is the single source of
 * truth (Step 3b retired the snapshot channel). markDirty/setNeedsLayout is kept
 * as the flush trigger — Lynx 4.0.1 exposes no ShadowNode frame callback, so the
 * layout pass remains the only coalescing point (mirrors lynx-native-svg).
 *
 * All string parsing (color/path/transform/enum) happens in front-end JS
 * (@lynx-skity/parsers); this node only ferries scalars and memcpy's the JS-built
 * nested FlatBuffer bytes into commands.
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

  // Phase 2 Step 3a: dirty flag for the SetViewport command (canvas-level).
  private var dirtyViewport = false

  // Monotonic node-id allocator for the retained render tree (Phase 2). Starts
  // at 1; assigned lazily in measure() via assignNativeIds(). Never reused.
  private var nextNodeId = 1

  // Phase 2 Step 1b: monotonic CommandBatch version (debug counter for now).
  private var nextCommandVersion = 0L

  // Phase 2 Step 2: pending structural ops (Insert/Remove/Move) enqueued by the
  // SkityNodeBase hooks; drained into the CommandBatch at the top of measure().
  private val pendingStructural: MutableList<StructuralOp> = mutableListOf()
  // The canvas has no skity parent, so addChildAt never fires for it — measure
  // synthesizes its root InsertNode once.
  private var canvasInserted = false

  /** Allocate a fresh stable node id (called at hook time by SkityNodeBase). */
  fun takeNextNodeId(): Int = nextNodeId++

  /** Enqueue a structural op. A Remove + later Insert of the same id in the same
   * batch is merged into a Move (Lynx has no move primitive; it's remove+insert). */
  fun enqueueStructural(op: StructuralOp) {
    if (op is StructuralOp.Insert) {
      val remIdx = pendingStructural.indexOfFirst {
        it is StructuralOp.Remove && it.nodeId == op.nodeId
      }
      if (remIdx >= 0) {
        pendingStructural.removeAt(remIdx)
        pendingStructural.add(StructuralOp.Move(op.nodeId, op.parentId, op.index))
        return
      }
    }
    pendingStructural.add(op)
  }

  // Each setter calls markDirty() to force a layout pass → measure → repaint,
  // mirroring SkityNodeBase's per-setter trigger.
  @LynxProp(name = "viewportX") fun setViewportX(v: Float) { viewportX = v; dirtyViewport = true; markDirty() }
  @LynxProp(name = "viewportY") fun setViewportY(v: Float) { viewportY = v; dirtyViewport = true; markDirty() }
  @LynxProp(name = "viewportWidth") fun setViewportWidth(v: Float) { viewportWidth = v; dirtyViewport = true; markDirty() }
  @LynxProp(name = "viewportHeight") fun setViewportHeight(v: Float) { viewportHeight = v; dirtyViewport = true; markDirty() }

  // Phase 2 Step 3b: pending CommandBatch bytes (the only extra-bundle payload
  // now — snapshot retired). Drained in measure(), consumed in getExtraBundle().
  private var pendingCommandBatch: ByteArray? = null

  init {
    setCustomMeasureFunc(this)
  }

  override fun isVirtual(): Boolean = false

  override fun getExtraBundle(): Any? {
    val c = pendingCommandBatch
    pendingCommandBatch = null
    return c
  }

  override fun measure(mp: MeasureParam?, mc: MeasureContext?): MeasureResult? {
    if (mp == null) return null
    // Phase 2 Step 2: the canvas has no skity parent so addChildAt never fires
    // for it — synthesize its root InsertNode once (the retained tree's root).
    if (!canvasInserted) {
      val cid = ensureNativeId()
      if (cid != 0) {
        pendingStructural.add(0, StructuralOp.Insert(cid, -1, 0, skityTagName))
        canvasInserted = true
      }
    }
    // Step 3b: drain structural + paint/path/transform/geometry/viewport commands
    // into a CommandBatch — the only mutation path now (snapshot retired). Stored
    // for getExtraBundle; null when nothing is dirty.
    pendingCommandBatch = buildCommandBatchIfNeeded(this)

    // Layout is driven by Lynx (style width/height). Resolve to a concrete size
    // from the measure param; only fall back to the width/height props when the
    // parent left it unspecified.
    val density = context.resources.displayMetrics.density
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
    return MeasureResult(w, h)
  }

  override fun align(p0: AlignParam?, p1: AlignContext?) {
    // no-op — layout is handled by Lynx
  }

  // ---- Phase 2 Step 2: structural command drain ----

  /** Drain pending structural ops into the CommandBatch (Insert → Move → Remove
   * order: parents before children, the node exists when Move runs, removed last). */
  private fun drainStructural(
    fbb: FlatBufferBuilder, offsets: MutableList<Int>, types: MutableList<Byte>,
  ) {
    if (pendingStructural.isEmpty()) return
    for (op in pendingStructural) if (op is StructuralOp.Insert) {
      val tagOff = fbb.createString(op.tag)
      offsets += InsertNode.createInsertNode(fbb, op.nodeId, op.parentId, op.index.toLong(), tagOff)
      types += Command.InsertNode
    }
    for (op in pendingStructural) if (op is StructuralOp.Move) {
      offsets += MoveNode.createMoveNode(fbb, op.nodeId, op.newParentId, op.index.toLong())
      types += Command.MoveNode
    }
    for (op in pendingStructural) if (op is StructuralOp.Remove) {
      offsets += RemoveNode.createRemoveNode(fbb, op.nodeId)
      types += Command.RemoveNode
    }
    pendingStructural.clear()
  }

  /** Drain the canvas viewport into a SetViewport command (Step 3a). Canvas-level,
   *  so it targets the retained tree's viewport, not a node field. */
  private fun drainViewport(
    fbb: FlatBufferBuilder, offsets: MutableList<Int>, types: MutableList<Byte>,
  ) {
    if (!dirtyViewport) return
    offsets += SetViewport.createSetViewport(
      fbb, nativeId, viewportX, viewportY, viewportWidth, viewportHeight)
    types += Command.SetViewport
    dirtyViewport = false
  }

  // ---- Phase 2 Step 1b: incremental command channel ----

  /** Drain dirty paint/path/transform props across the shadow tree into a
   * CommandBatch FlatBuffer (or null if nothing is dirty). Clears the flags. */
  private fun buildCommandBatchIfNeeded(root: SkityNodeBase): ByteArray? {
    val fbb = FlatBufferBuilder(256)
    val offsets = mutableListOf<Int>()
    val types = mutableListOf<Byte>()
    drainStructural(fbb, offsets, types) // Step 2: topology before paint
    drainViewport(fbb, offsets, types)   // Step 3a: canvas viewport
    collectCommands(fbb, root, offsets, types) // paint/path/transform/geometry
    if (offsets.isEmpty()) return null
    val typesVec = CommandBatch.createCommandsTypeVector(fbb, types.toByteArray())
    val cmdsVec = CommandBatch.createCommandsVector(fbb, offsets.toIntArray())
    val batch = CommandBatch.createCommandBatch(fbb, nextCommandVersion, typesVec, cmdsVec)
    nextCommandVersion += 1
    CommandBatch.finishCommandBatchBuffer(fbb, batch)
    return fbb.sizedByteArray()
  }

  private fun collectCommands(
    fbb: FlatBufferBuilder, node: SkityNodeBase,
    offsets: MutableList<Int>, types: MutableList<Byte>,
  ) {
    if (node.dirtyPaint != 0) {
      // Gradient bytes (nested Gradient FlatBuffer) ride the same SetPaint
      // command as opaque [ubyte] vectors — same pattern as SetPathData.
      val fillGrad = node.fillGradientData
      val fillGradOff = if (fillGrad != null && fillGrad.isNotEmpty())
          SetPaint.createFillGradientVector(fbb, fillGrad) else 0
      val strokeGrad = node.strokeGradientData
      val strokeGradOff = if (strokeGrad != null && strokeGrad.isNotEmpty())
          SetPaint.createStrokeGradientVector(fbb, strokeGrad) else 0
      // Dash intervals ride as a [float] vector; null/empty = no vector = solid.
      val dash = node.strokeDash
      val dashOff = if (dash != null && dash.isNotEmpty())
          SetPaint.createStrokeDashVector(fbb, dash) else 0
      offsets += SetPaint.createSetPaint(
        fbb, node.nativeId, node.dirtyPaint.toLong(),
        node.fillColor ?: 0L, node.strokeColor ?: 0L,
        fillGradOff, strokeGradOff,
        node.strokeWidth, node.strokeCap, node.strokeJoin,
        node.strokeMiter, node.fillRule, node.opacity,
        dashOff, node.strokeDashOffset)
      types += Command.SetPaint
      node.dirtyPaint = 0
    }
    if (node.dirtyPath) {
      val data = node.pathData
      val off = if (data != null && data.isNotEmpty()) SetPathData.createDataVector(fbb, data) else 0
      offsets += SetPathData.createSetPathData(fbb, node.nativeId, off)
      types += Command.SetPathData
      node.dirtyPath = false
    }
    if (node.dirtyTransform) {
      val data = node.transformData
      val off = if (data != null && data.isNotEmpty()) SetTransform.createDataVector(fbb, data) else 0
      offsets += SetTransform.createSetTransform(fbb, node.nativeId, off)
      types += Command.SetTransform
      node.dirtyTransform = false
    }
    if (node.dirtyClip) {
      val data = node.clipData
      val off = if (data != null && data.isNotEmpty()) SetClip.createDataVector(fbb, data) else 0
      offsets += SetClip.createSetClip(fbb, node.nativeId, off)
      types += Command.SetClip
      node.dirtyClip = false
    }
    if (node.dirtyGeometry != 0) {
      offsets += SetGeometry.createSetGeometry(
        fbb, node.nativeId, node.dirtyGeometry.toLong(),
        node.x, node.y, node.width, node.height,
        node.cx, node.cy, node.r, node.rx, node.ry,
        node.x1, node.y1, node.x2, node.y2,
        node.pathStart, node.pathEnd)
      types += Command.SetGeometry
      node.dirtyGeometry = 0
    }
    val count = node.childCount
    for (i in 0 until count) {
      val child = node.getChildAt(i)
      if (child is SkityNodeBase) collectCommands(fbb, child, offsets, types)
    }
  }

}
