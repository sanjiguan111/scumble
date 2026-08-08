// Copyright 2026 The Lynx Authors. All rights reserved.
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

  // ---- geometry setters ----
  @LynxProp(name = "x") fun setX(v: Float) { x = v }
  @LynxProp(name = "y") fun setY(v: Float) { y = v }
  @LynxProp(name = "width") fun setWidth(v: Float) { width = v }
  @LynxProp(name = "height") fun setHeight(v: Float) { height = v }
  @LynxProp(name = "cx") fun setCx(v: Float) { cx = v }
  @LynxProp(name = "cy") fun setCy(v: Float) { cy = v }
  @LynxProp(name = "r") fun setR(v: Float) { r = v }
  @LynxProp(name = "rx") fun setRx(v: Float) { rx = v }
  @LynxProp(name = "ry") fun setRy(v: Float) { ry = v }
  @LynxProp(name = "x1") fun setX1(v: Float) { x1 = v }
  @LynxProp(name = "y1") fun setY1(v: Float) { y1 = v }
  @LynxProp(name = "x2") fun setX2(v: Float) { x2 = v }
  @LynxProp(name = "y2") fun setY2(v: Float) { y2 = v }

  // ---- paint setters ----
  @LynxProp(name = "color") fun setColor(v: Double) { fillColor = v.toLong() and 0xFFFFFFFFL }
  @LynxProp(name = "fill") fun setFill(v: Double) { fillColor = v.toLong() and 0xFFFFFFFFL }
  @LynxProp(name = "stroke") fun setStroke(v: Double) { strokeColor = v.toLong() and 0xFFFFFFFFL }
  @LynxProp(name = "strokeWidth") fun setStrokeWidth(v: Float) { strokeWidth = v }
  // Enums arrive as numbers already mapped to skityrt bytes (parsers layer).
  @LynxProp(name = "strokeCap") fun setStrokeCap(v: Int) { strokeCap = v.toByte() }
  @LynxProp(name = "strokeJoin") fun setStrokeJoin(v: Int) { strokeJoin = v.toByte() }
  @LynxProp(name = "strokeMiter") fun setStrokeMiter(v: Float) { strokeMiter = v }
  @LynxProp(name = "fillRule") fun setFillRule(v: Int) { fillRule = v.toByte() }
  @LynxProp(name = "opacity") fun setOpacity(v: Float) { opacity = v }

  // ---- transform & path (base64-encoded nested FlatBuffer; decode + memcpy) ----
  // Lynx props marshal String but not ByteArray, so the JS-built PathCommandList
  // / TransformOpList bytes travel base64-encoded and are decoded here, then
  // memcpy'd verbatim into the render tree. See RENDER_ARCHITECTURE.md §5.
  @LynxProp(name = "transform") fun setTransform(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    transformData = if (decoded.isNotEmpty()) decoded else null
  }
  @LynxProp(name = "d") fun setD(v: String) {
    val decoded = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
    pathData = if (decoded.isNotEmpty()) decoded else null
  }

  /** Shape & group nodes are virtual (no platform view); the canvas node overrides this. */
  override fun isVirtual(): Boolean = true
}
