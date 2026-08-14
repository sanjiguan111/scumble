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
 * channel. Step 3a: geometry setters also set a dirty bitmask (dirtyGeometry),
 * drained the same way; viewport setters mark dirtyViewport on the canvas node.
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
  @JvmField var pathStart = 0f
  @JvmField var pathEnd = 1f

  // ---- paint (ARGB packed as Long 0xAARRGGBB; null = inactive) ----
  @JvmField var fillColor: Long? = null
  @JvmField var strokeColor: Long? = null
  @JvmField var strokeWidth = 1f
  @JvmField var strokeCap: Byte = 0
  @JvmField var strokeJoin: Byte = 0
  @JvmField var strokeMiter = 4f
  // Stroke dash pattern ([on, off, ...] px; null = solid) + phase offset.
  @JvmField var strokeDash: FloatArray? = null
  @JvmField var strokeDashOffset = 0f
  @JvmField var fillRule: Byte = 0
  @JvmField var opacity = 1f

  // ---- transform & path & gradient (JS-built nested FlatBuffer bytes; null = none) ----
  @JvmField var transformData: ByteArray? = null
  @JvmField var pathData: ByteArray? = null
  @JvmField var fillGradientData: ByteArray? = null
  @JvmField var strokeGradientData: ByteArray? = null

  // Phase 2: stable node id assigned by the canvas node for the retained tree.
  // 0 = not yet assigned; assigned lazily (1, 2, …) in measure() before the
  // snapshot is serialized. Never reused.
  @JvmField var nativeId: Int = 0

  // Phase 2: dirty flags for the incremental command channel. Paint accumulates
  // as a PaintField bitmask; geometry as a GeometryField bitmask (Step 3a);
  // path/transform are booleans. The canvas ShadowNode drains these into a
  // CommandBatch in measure() and clears them.
  @JvmField var dirtyPaint: Int = 0
  @JvmField var dirtyGeometry: Int = 0
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
    const val FILL_GRADIENT = 256
    const val STROKE_GRADIENT = 512
    const val STROKE_DASH = 1024
  }

  /** GeometryField bitmask values (mirrors skityrt::GeometryField in command_batch.fbs). */
  object GeometryField {
    const val X = 1
    const val Y = 2
    const val WIDTH = 4
    const val HEIGHT = 8
    const val CX = 16
    const val CY = 32
    const val R = 64
    const val RX = 128
    const val RY = 256
    const val X1 = 512
    const val Y1 = 1024
    const val X2 = 2048
    const val Y2 = 4096
    const val PATH_START = 8192
    const val PATH_END = 16384
  }

  // Every setter calls markDirty() so a prop change forces a layout pass → the
  // container canvas's measure() re-serializes the tree → repaint. Pure-style
  // props (fill/stroke/opacity/d/transform) don't change layout on their own;
  // without markDirty they'd update the field but never reach the render bundle.
  // onAfterUpdateTransaction does NOT fire on the canvas when a *child*'s prop
  // changes, so the trigger must be per-setter. markDirty() coalesces into one
  // layout pass per batch. (iOS mirrors this with setNeedsLayout per setter.)
  // ---- geometry setters (dirty → command channel, Step 3a) ----
  @LynxProp(name = "x") fun setX(v: Float) {
    x = v
    dirtyGeometry = dirtyGeometry or GeometryField.X
    markDirty()
  }
  @LynxProp(name = "y") fun setY(v: Float) {
    y = v
    dirtyGeometry = dirtyGeometry or GeometryField.Y
    markDirty()
  }
  @LynxProp(name = "width") fun setWidth(v: Float) {
    width = v
    dirtyGeometry = dirtyGeometry or GeometryField.WIDTH
    markDirty()
  }
  @LynxProp(name = "height") fun setHeight(v: Float) {
    height = v
    dirtyGeometry = dirtyGeometry or GeometryField.HEIGHT
    markDirty()
  }
  @LynxProp(name = "cx") fun setCx(v: Float) {
    cx = v
    dirtyGeometry = dirtyGeometry or GeometryField.CX
    markDirty()
  }
  @LynxProp(name = "cy") fun setCy(v: Float) {
    cy = v
    dirtyGeometry = dirtyGeometry or GeometryField.CY
    markDirty()
  }
  @LynxProp(name = "r") fun setR(v: Float) {
    r = v
    dirtyGeometry = dirtyGeometry or GeometryField.R
    markDirty()
  }
  @LynxProp(name = "rx") fun setRx(v: Float) {
    rx = v
    dirtyGeometry = dirtyGeometry or GeometryField.RX
    markDirty()
  }
  @LynxProp(name = "ry") fun setRy(v: Float) {
    ry = v
    dirtyGeometry = dirtyGeometry or GeometryField.RY
    markDirty()
  }
  @LynxProp(name = "x1") fun setX1(v: Float) {
    x1 = v
    dirtyGeometry = dirtyGeometry or GeometryField.X1
    markDirty()
  }
  @LynxProp(name = "y1") fun setY1(v: Float) {
    y1 = v
    dirtyGeometry = dirtyGeometry or GeometryField.Y1
    markDirty()
  }
  @LynxProp(name = "x2") fun setX2(v: Float) {
    x2 = v
    dirtyGeometry = dirtyGeometry or GeometryField.X2
    markDirty()
  }
  @LynxProp(name = "y2") fun setY2(v: Float) {
    y2 = v
    dirtyGeometry = dirtyGeometry or GeometryField.Y2
    markDirty()
  }
  @LynxProp(name = "pathStart") fun setPathStart(v: Float) {
    pathStart = v
    dirtyGeometry = dirtyGeometry or GeometryField.PATH_START
    markDirty()
  }
  @LynxProp(name = "pathEnd") fun setPathEnd(v: Float) {
    pathEnd = v
    dirtyGeometry = dirtyGeometry or GeometryField.PATH_END
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
  // Dash intervals arrive as base64-encoded little-endian float32 bytes (same
  // string channel as d/transform/gradients — Lynx props marshal no byte/float
  // arrays). An empty payload clears dashes (solid stroke).
  @LynxProp(name = "strokeDash") fun setStrokeDash(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    strokeDash = if (decoded.size >= 4) decodeFloatsLE(decoded) else null
    dirtyPaint = dirtyPaint or PaintField.STROKE_DASH
    markDirty()
  }
  @LynxProp(name = "strokeDashOffset") fun setStrokeDashOffset(v: Float) {
    strokeDashOffset = v
    dirtyPaint = dirtyPaint or PaintField.STROKE_DASH
    markDirty()
  }

  /** Raw little-endian float32 bytes → FloatArray (flatbuffers byte order). */
  private fun decodeFloatsLE(bytes: ByteArray): FloatArray {
    val out = FloatArray(bytes.size / 4)
    java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(out)
    return out
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
  @LynxProp(name = "fillGradient") fun setFillGradient(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    fillGradientData = if (decoded.isNotEmpty()) decoded else null
    dirtyPaint = dirtyPaint or PaintField.FILL_GRADIENT
    markDirty()
  }
  @LynxProp(name = "strokeGradient") fun setStrokeGradient(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    strokeGradientData = if (decoded.isNotEmpty()) decoded else null
    dirtyPaint = dirtyPaint or PaintField.STROKE_GRADIENT
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
