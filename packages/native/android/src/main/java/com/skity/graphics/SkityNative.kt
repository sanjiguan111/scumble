// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics

import android.view.Surface

/**
 * JNI bindings to libskityrender.so (app_renderer + GLES/Vulkan backends +
 * SkityRenderer). Handle-based, mirroring Skity-Android's SkityNative. The
 * render tree is driven solely by [nativeApplyCommands] (Step 3b retired the
 * snapshot channel — no nativeSetRenderTree).
 *
 * All functions are @JvmStatic, so the JNI side receives `jclass` (not the
 * object instance) as the 2nd parameter.
 */
object SkityNative {

  init {
    System.loadLibrary("skityrender")
  }

  const val BACKEND_GLES = 1
  const val BACKEND_VULKAN = 2

  @JvmStatic
  external fun nativeCreateRenderer(backendType: Int, sharedGLHandle: Long, density: Float): Long

  @JvmStatic
  external fun nativeDestroyRenderer(handle: Long)

  @JvmStatic
  external fun nativeCreateSharedGLContext(): Long

  @JvmStatic
  external fun nativeDestroySharedGLContext(handle: Long)

  @JvmStatic
  external fun nativeProbeVulkan(): Boolean

  @JvmStatic
  external fun nativeSetSurface(handle: Long, surface: Surface?)

  @JvmStatic
  external fun nativeOnSurfaceCreated(handle: Long)

  @JvmStatic
  external fun nativeOnSurfaceChanged(handle: Long, width: Int, height: Int)

  @JvmStatic
  external fun nativeOnSurfaceDestroyed(handle: Long)

  @JvmStatic
  external fun nativeDrawFrame(handle: Long)

  @JvmStatic
  external fun nativeApplyCommands(handle: Long, commands: ByteArray)

  /** Apply a <Paragraph> ParagraphRunList snapshot to the retained tree.
   * Called on the render thread right after the batch of the same flush —
   * the runs reference nodes the batch inserts. */
  @JvmStatic
  external fun nativeApplyParagraphRuns(handle: Long, runs: ByteArray)

  /**
   * <Paragraph> layout: shape + wrap the SpanList (HarfBuzz against skity
   * FontManager-resolved typefaces) and return a one-entry ParagraphRunList
   * (height/line_count inside), or null for empty content. Called on the
   * TASM thread from the paragraph ShadowNode's layout pass.
   */
  @JvmStatic
  external fun nativeShapeParagraph(
    spans: ByteArray, nodeId: Int, width: Float, align: Byte, lineHeight: Float, maxLines: Int,
  ): ByteArray?

  /**
   * Store decoded pixels for a uri in the process-wide ImageStore. MUST be
   * called on the active backend's render thread (the store is render-thread
   * only); [com.skity.graphics.image.SkityImageController] dispatches there.
   * No renderer handle — the store is shared by every canvas.
   */
  @JvmStatic
  external fun nativeStoreImage(uri: String, rgba: ByteArray, width: Int, height: Int)

  /** Mark a uri permanently failed (FindImage keeps returning null). */
  @JvmStatic
  external fun nativeMarkImageFailed(uri: String)
}
