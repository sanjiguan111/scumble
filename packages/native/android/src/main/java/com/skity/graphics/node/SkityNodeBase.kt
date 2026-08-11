// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

import com.lynx.tasm.behavior.LynxProp
import com.lynx.tasm.behavior.shadow.ShadowNode
import kotlin.jvm.JvmField

/**
 * Base ShadowNode for every skity element (canvas + shapes + group). Collects
 * numeric render props — geometry, paint colors, stroke style, opacity — plus
 * the JS-built nested FlatBuffer bytes for path/transform, so the container
 * node can serialize them directly into the skityrt FlatBuffer render tree
 * without any string parsing on the native side.
 *
 * Variable-length fields (path d, transform) arrive as pre-serialized FlatBuffer
 * bytes (PathCommandList / TransformOpList) from @lynx-skity/parsers and are
 * memcpy'd verbatim into the render tree. Enum props (cap/join/fillRule) arrive
 * as numbers already mapped to skityrt bytes. See RENDER_ARCHITECTURE.md §5.
 *
 * Fields use @JvmField (exposed as plain fields, no synthetic getX/setX), so
 * they don't clash with the @LynxProp setters below (e.g. setX) on the JVM.
 *
 * Phase 2 Step 1b: the 11 pure-paint/path/transform setters also set a dirty
 * flag (dirtyPaint bitmask / dirtyPath / dirtyTransform); the canvas ShadowNode
 * drains these into a CommandBatch in measure() for the incremental command
 * channel. Geometry setters stay on the snapshot path (no dirty flag).
 */
abstract class SkityNodeBase : ShadowNode() {

  abstract val skityTagName: String

  // ---- geometry (logical px within the canvas viewport) ----
  @JvmField var x = 0f
  @JvmField var y = 0f
  @JvmField var width = 0f
  @JvmField var height = 0f
  @JvmField var cx = 0f
  @JvmField var cy = 0f
  @JvmField var r = 0f
  @JvmField var rx = 0f
  @JvmField var ry = 0f
  @JvmField var x1 = 0f
  @JvmField var y1 = 0f
  @JvmField var x2 = 0f
  @JvmField var y2 = 0f

  // ---- paint (ARGB packed as Long 0xAARRGGBB; null = inactive) ----
  @JvmField var fillColor: Long? = null
  @JvmField var strokeColor: Long? = null
  @JvmField var strokeWidth = 1f
  @JvmField var strokeCap: Byte = 0
  @JvmField var strokeJoin: Byte = 0
  @JvmField var strokeMiter = 4f
  @JvmField var fillRule: Byte = 0
  @JvmField var opacity = 1f

  // ---- transform & path (JS-built nested FlatBuffer bytes; null = none) ----
  @JvmField var transformData: ByteArray? = null
  @JvmField var pathData: ByteArray? = null

  // Phase 2: stable node id assigned by the canvas node for the retained tree.
  // 0 = not yet assigned; assigned lazily (1, 2, …) in measure() before the
  // snapshot is serialized. Never reused.
  @JvmField var nativeId: Int = 0

  // Phase 2 Step 1b: dirty flags for the incremental command channel. Paint
  // accumulates as a PaintField bitmask; path/transform are booleans. The canvas
  // ShadowNode drains these into a CommandBatch in measure() and clears them.
  @JvmField var dirtyPaint: Int = 0
  @JvmField var dirtyPath: Boolean = false
  @JvmField var dirtyTransform: Boolean = false

  /** PaintField bitmask values (mirrors skityrt::PaintField in command_batch.fbs). */
  object PaintField {
    const val FILL = 1
    const val STROKE = 2
    const val STROKE_WIDTH = 4
    const val STROKE_CAP = 8
    const val STROKE_JOIN = 16
    const val STROKE_MITER = 32
    const val FILL_RULE = 64
    const val OPACITY = 128
  }

  // Every setter calls markDirty() so a prop change forces a layout pass → the
  // container canvas's measure() re-serializes the tree → repaint. Pure-style
  // props (fill/stroke/opacity/d/transform) don't change layout on their own;
  // without markDirty they'd update the field but never reach the render bundle.
  // onAfterUpdateTransaction does NOT fire on the canvas when a *child*'s prop
  // changes, so the trigger must be per-setter. markDirty() coalesces into one
  // layout pass per batch. (iOS mirrors this with setNeedsLayout per setter.)
  // ---- geometry setters ----
  @LynxProp(name = "x") fun setX(v: Float) {
    x = v
    markDirty()
  }
  @LynxProp(name = "y") fun setY(v: Float) {
    y = v
    markDirty()
  }
  @LynxProp(name = "width") fun setWidth(v: Float) {
    width = v
    markDirty()
  }
  @LynxProp(name = "height") fun setHeight(v: Float) {
    height = v
    markDirty()
  }
  @LynxProp(name = "cx") fun setCx(v: Float) {
    cx = v
    markDirty()
  }
  @LynxProp(name = "cy") fun setCy(v: Float) {
    cy = v
    markDirty()
  }
  @LynxProp(name = "r") fun setR(v: Float) {
    r = v
    markDirty()
  }
  @LynxProp(name = "rx") fun setRx(v: Float) {
    rx = v
    markDirty()
  }
  @LynxProp(name = "ry") fun setRy(v: Float) {
    ry = v
    markDirty()
  }
  @LynxProp(name = "x1") fun setX1(v: Float) {
    x1 = v
    markDirty()
  }
  @LynxProp(name = "y1") fun setY1(v: Float) {
    y1 = v
    markDirty()
  }
  @LynxProp(name = "x2") fun setX2(v: Float) {
    x2 = v
    markDirty()
  }
  @LynxProp(name = "y2") fun setY2(v: Float) {
    y2 = v
    markDirty()
  }

  // ---- paint setters (dirty → command channel) ----
  @LynxProp(name = "color") fun setColor(v: Double) {
    fillColor = v.toLong() and 0xFFFFFFFFL
    dirtyPaint = dirtyPaint or PaintField.FILL
    markDirty()
  }
  @LynxProp(name = "fill") fun setFill(v: Double) {
    fillColor = v.toLong() and 0xFFFFFFFFL
    dirtyPaint = dirtyPaint or PaintField.FILL
    markDirty()
  }
  @LynxProp(name = "stroke") fun setStroke(v: Double) {
    strokeColor = v.toLong() and 0xFFFFFFFFL
    dirtyPaint = dirtyPaint or PaintField.STROKE
    markDirty()
  }
  @LynxProp(name = "strokeWidth") fun setStrokeWidth(v: Float) {
    strokeWidth = v
    dirtyPaint = dirtyPaint or PaintField.STROKE_WIDTH
    markDirty()
  }
  // Enums arrive as numbers already mapped to skityrt bytes (parsers layer).
  @LynxProp(name = "strokeCap") fun setStrokeCap(v: Int) {
    strokeCap = v.toByte()
    dirtyPaint = dirtyPaint or PaintField.STROKE_CAP
    markDirty()
  }
  @LynxProp(name = "strokeJoin") fun setStrokeJoin(v: Int) {
    strokeJoin = v.toByte()
    dirtyPaint = dirtyPaint or PaintField.STROKE_JOIN
    markDirty()
  }
  @LynxProp(name = "strokeMiter") fun setStrokeMiter(v: Float) {
    strokeMiter = v
    dirtyPaint = dirtyPaint or PaintField.STROKE_MITER
    markDirty()
  }
  @LynxProp(name = "fillRule") fun setFillRule(v: Int) {
    fillRule = v.toByte()
    dirtyPaint = dirtyPaint or PaintField.FILL_RULE
    markDirty()
  }
  @LynxProp(name = "opacity") fun setOpacity(v: Float) {
    opacity = v
    dirtyPaint = dirtyPaint or PaintField.OPACITY
    markDirty()
  }

  // ---- transform & path (base64-encoded nested FlatBuffer; decode + memcpy) ----
  // Lynx props marshal String but not ByteArray, so the JS-built PathCommandList
  // / TransformOpList bytes travel base64-encoded and are decoded here, then
  // memcpy'd verbatim into the render tree. See RENDER_ARCHITECTURE.md §5.
  @LynxProp(name = "transform") fun setTransform(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    transformData = if (decoded.isNotEmpty()) decoded else null
    dirtyTransform = true
    markDirty()
  }
  @LynxProp(name = "d") fun setD(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    pathData = if (decoded.isNotEmpty()) decoded else null
    dirtyPath = true
    markDirty()
  }

  // ---- Phase 2 Step 2: structural hooks ----
  // Lynx ShadowNode has no "move" primitive — a move is remove + insert, which
  // the canvas's enqueueStructural merges into a MoveNode (same id, same batch).

  /** Walk parents to the owning SkityCanvasShadowNode (owns the retained-tree
   * id allocator + pending structural queue). */
  fun findCanvasOwner(): SkityCanvasShadowNode? {
    var n: ShadowNode? = this
    while (n != null) {
      if (n is SkityCanvasShadowNode) return n
      n = n.parent
    }
    return null
  }

  /** Lazily assign a stable nativeId at hook time (not measure time), so the
   * InsertNode from addChildAt has an id. Returns 0 if not yet under a canvas. */
  fun ensureNativeId(): Int {
    if (nativeId != 0) return nativeId
    val canvas = findCanvasOwner() ?: return 0
    nativeId = canvas.takeNextNodeId()
    return nativeId
  }

  override fun addChildAt(child: ShadowNode, i: Int) {
    super.addChildAt(child, i)
    if (child is SkityNodeBase) {
      val canvas = findCanvasOwner() ?: return
      val childId = child.ensureNativeId()
      val parentId = ensureNativeId()
      if (childId != 0 && parentId != 0) {
        canvas.enqueueStructural(StructuralOp.Insert(childId, parentId, i, child.skityTagName))
      }
    }
  }

  override fun removeChildAt(i: Int): ShadowNode {
    val child = getChildAt(i) // capture before super removes (getChildAt is final)
    val removed = super.removeChildAt(i)
    if (child is SkityNodeBase && child.nativeId != 0) {
      findCanvasOwner()?.enqueueStructural(StructuralOp.Remove(child.nativeId))
    }
    return removed
  }

  /** Shape & group nodes are virtual (no platform view); the canvas node overrides this. */
  override fun isVirtual(): Boolean = true
}
