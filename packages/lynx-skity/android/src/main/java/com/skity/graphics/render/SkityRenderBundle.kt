// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

/**
 * Serialized RenderTree payload produced by the container ShadowNode
 * (SkityCanvasShadowNode.measure) and consumed by SkityCanvasUI → JNI →
 * SkityRenderer. Carries the FlatBuffer bytes (parsed on the C++ side) plus the
 * resolved viewport, mirroring lynx-native-svg's RenderBundle.kt — but holding
 * raw bytes because Android does not need to read the tree, only forward it.
 */
data class SkityRenderBundle(
  val renderTreeBytes: ByteArray,
  val viewportWidth: Float,
  val viewportHeight: Float,
  val density: Float,
) {
  // ByteArray identity equality by default is fine — bundles are not compared.
  override fun equals(other: Any?): Boolean = this === other
  override fun hashCode(): Int = System.identityHashCode(this)
}
