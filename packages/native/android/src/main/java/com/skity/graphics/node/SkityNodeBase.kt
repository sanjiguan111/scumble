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

  // ---- paint setters ----
  @LynxProp(name = "color") fun setColor(v: Double) {
    fillColor = v.toLong() and 0xFFFFFFFFL
    markDirty()
  }
  @LynxProp(name = "fill") fun setFill(v: Double) {
    fillColor = v.toLong() and 0xFFFFFFFFL
    markDirty()
  }
  @LynxProp(name = "stroke") fun setStroke(v: Double) {
    strokeColor = v.toLong() and 0xFFFFFFFFL
    markDirty()
  }
  @LynxProp(name = "strokeWidth") fun setStrokeWidth(v: Float) {
    strokeWidth = v
    markDirty()
  }
  // Enums arrive as numbers already mapped to skityrt bytes (parsers layer).
  @LynxProp(name = "strokeCap") fun setStrokeCap(v: Int) {
    strokeCap = v.toByte()
    markDirty()
  }
  @LynxProp(name = "strokeJoin") fun setStrokeJoin(v: Int) {
    strokeJoin = v.toByte()
    markDirty()
  }
  @LynxProp(name = "strokeMiter") fun setStrokeMiter(v: Float) {
    strokeMiter = v
    markDirty()
  }
  @LynxProp(name = "fillRule") fun setFillRule(v: Int) {
    fillRule = v.toByte()
    markDirty()
  }
  @LynxProp(name = "opacity") fun setOpacity(v: Float) {
    opacity = v
    markDirty()
  }

  // ---- transform & path (base64-encoded nested FlatBuffer; decode + memcpy) ----
  // Lynx props marshal String but not ByteArray, so the JS-built PathCommandList
  // / TransformOpList bytes travel base64-encoded and are decoded here, then
  // memcpy'd verbatim into the render tree. See RENDER_ARCHITECTURE.md §5.
  @LynxProp(name = "transform") fun setTransform(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    transformData = if (decoded.isNotEmpty()) decoded else null
    markDirty()
  }
  @LynxProp(name = "d") fun setD(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    pathData = if (decoded.isNotEmpty()) decoded else null
    markDirty()
  }

  /** Shape & group nodes are virtual (no platform view); the canvas node overrides this. */
  override fun isVirtual(): Boolean = true
}
