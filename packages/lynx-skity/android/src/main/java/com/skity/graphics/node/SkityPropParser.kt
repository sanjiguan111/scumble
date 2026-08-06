// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

/**
 * Parses declarative prop values — transform string, SVG path "d", color,
 * stroke/fill enums — into the intermediate [TransformOpData] / [PathCommandData]
 * stored on [SkityNodeBase], which [SkityCanvasShadowNode] then serializes into
 * the skityrt FlatBuffer.
 *
 * This is the Kotlin-side equivalent of the value parsing that lynx-native-svg
 * defers to its C++ DOMBuilder; skity has no DOMBuilder, so nodes resolve their
 * own props to numeric render-tree fields here.
 *
 * MVP coverage: transform(translate/scale/rotate/skew/matrix); path M/L/C/Q/Z
 * (absolute). H/V/S/T/A and relative commands are TODO.
 */
object SkityPropParser {

  // TransformType bytes (render_tree_style.fbs)
  private const val T_MATRIX = 0.toByte()
  private const val T_TRANSLATE = 1.toByte()
  private const val T_SCALE = 2.toByte()
  private const val T_ROTATE = 3.toByte()
  private const val T_SKEW_X = 4.toByte()
  private const val T_SKEW_Y = 5.toByte()

  // PathCommandType bytes (render_tree_style.fbs)
  private const val P_MOVE = 0.toByte()
  private const val P_LINE = 1.toByte()
  private const val P_CUBIC = 2.toByte()
  private const val P_QUAD = 3.toByte()
  private const val P_CLOSE = 5.toByte()

  // LineCap / LineJoin / FillRule bytes
  private const val CAP_BUTT = 0.toByte()
  private const val CAP_ROUND = 1.toByte()
  private const val CAP_SQUARE = 2.toByte()
  private const val JOIN_MITER = 0.toByte()
  private const val JOIN_ROUND = 1.toByte()
  private const val JOIN_BEVEL = 2.toByte()
  private const val FILL_NONZERO = 0.toByte()
  private const val FILL_EVENODD = 1.toByte()

  private val NUMBER_RE = Regex("""-?\d*\.?\d+(?:[eE][+-]?\d+)?""")
  private val TRANSFORM_RE = Regex("""([a-zA-Z]+)\s*\(([^)]*)\)""")
  private val PATH_CMD_CHARS =
    setOf('M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z',
      'm', 'l', 'h', 'v', 'c', 's', 'q', 't', 'a', 'z')

  fun parseFloatList(s: String): FloatArray? {
    val nums = NUMBER_RE.findAll(s).mapNotNull { it.value.toFloatOrNull() }.toList()
    return if (nums.isEmpty()) null else nums.toFloatArray()
  }

  fun parseCap(v: String): Byte = when (v.lowercase()) {
    "round" -> CAP_ROUND
    "square" -> CAP_SQUARE
    else -> CAP_BUTT
  }

  fun parseJoin(v: String): Byte = when (v.lowercase()) {
    "round" -> JOIN_ROUND
    "bevel" -> JOIN_BEVEL
    else -> JOIN_MITER
  }

  fun parseFillRule(v: String): Byte = when (v.lowercase()) {
    "evenodd" -> FILL_EVENODD
    else -> FILL_NONZERO
  }

  /** CSS/SVG-style transform list, e.g. "translate(10,5) scale(2) rotate(45,1,1)". */
  fun parseTransform(s: String): List<TransformOpData> {
    val out = mutableListOf<TransformOpData>()
    for (m in TRANSFORM_RE.findAll(s)) {
      val name = m.groupValues[1].lowercase()
      val args = parseFloatList(m.groupValues[2]) ?: continue
      val op = when (name) {
        "translate" -> TransformOpData(
          T_TRANSLATE, floatArrayOf(args.getOrElse(0) { 0f }, args.getOrElse(1) { 0f }))
        "scale" -> {
          val sx = args.getOrElse(0) { 1f }
          TransformOpData(T_SCALE, floatArrayOf(sx, args.getOrElse(1) { sx }))
        }
        "rotate" -> TransformOpData(
          T_ROTATE,
          floatArrayOf(args.getOrElse(0) { 0f }, args.getOrElse(1) { 0f }, args.getOrElse(2) { 0f }))
        "skewx" -> TransformOpData(T_SKEW_X, floatArrayOf(args.getOrElse(0) { 0f }))
        "skewy" -> TransformOpData(T_SKEW_Y, floatArrayOf(args.getOrElse(0) { 0f }))
        "matrix" -> if (args.size >= 6) TransformOpData(T_MATRIX, args.copyOf(6)) else continue
        else -> continue
      }
      out.add(op)
    }
    return out
  }

  /**
   * Minimal SVG path parser. Supports absolute M/L/C/Q/Z (lowercase treated as
   * absolute for MVP). Each command may repeat with extra coordinate groups.
   */
  fun parsePath(d: String): List<PathCommandData> {
    val out = mutableListOf<PathCommandData>()
    val s = d.trim()
    var idx = 0
    var cmd = 'M'
    val nums = mutableListOf<Float>()

    fun flush() {
      if (nums.isEmpty()) return
      when (cmd.uppercaseChar()) {
        'M' -> chunk(nums, 2).forEach { out.add(PathCommandData(P_MOVE, it)) }
        'L' -> chunk(nums, 2).forEach { out.add(PathCommandData(P_LINE, it)) }
        'C' -> chunk(nums, 6).forEach { out.add(PathCommandData(P_CUBIC, it)) }
        'Q' -> chunk(nums, 4).forEach { out.add(PathCommandData(P_QUAD, it)) }
        // H/V/S/T/A: TODO (need current-point tracking / arc conversion)
      }
      nums.clear()
    }

    while (idx < s.length) {
      val c = s[idx]
      when {
        c in PATH_CMD_CHARS -> {
          if (c.uppercaseChar() == 'Z') {
            flush()
            out.add(PathCommandData(P_CLOSE, FloatArray(0)))
            cmd = if (c == 'Z') 'L' else 'l'
          } else {
            flush()
            cmd = c
          }
          idx++
        }
        c.isWhitespace() || c == ',' -> idx++
        else -> {
          val m = NUMBER_RE.find(s, idx)
          if (m != null && m.range.first == idx) {
            m.value.toFloatOrNull()?.let { nums.add(it) }
            idx = m.range.last + 1
          } else {
            idx++ // skip stray char
          }
        }
      }
    }
    flush()
    return out
  }

  private fun chunk(nums: List<Float>, size: Int): List<FloatArray> {
    val out = mutableListOf<FloatArray>()
    var i = 0
    while (i + size <= nums.size) {
      out.add(FloatArray(size) { nums[i + it] })
      i += size
    }
    return out
  }
}
