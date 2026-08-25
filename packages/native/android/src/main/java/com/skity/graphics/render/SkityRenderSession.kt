// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.view.Surface

/**
 * Backend-agnostic render session surface. [SkityGLRenderSession] and
 * [SkityVulkanRenderSession] implement it; [com.skity.graphics.ui.SkityCanvasView]
 * holds one of them based on the active backend ([com.skity.graphics.SkityInit]).
 */
interface SkityRenderSession {
  fun attachSurface(surface: Surface, width: Int, height: Int)
  fun updateSize(width: Int, height: Int)
  fun applyCommands(commands: ByteArray)

  /**
   * Push <skity-paragraph> glyph-run snapshots (one ParagraphRunList entry
   * each, node-id keyed — applied individually, overwrite semantics). Called
   * from the UI thread right after the batch of the same flush.
   */
  fun applyParagraphRuns(runs: List<ByteArray>)
  fun detachSurface()
  fun destroy()

  /**
   * Request a redraw of the retained tree (e.g. after an ImageStore bitmap
   * arrived). Safe from any thread — posts to the render thread like
   * [applyCommands].
   */
  fun postRedraw()

  /**
   * Native animation tick (ANIMATION_DESIGN.md D4): posts to THIS session's
   * render thread, interpolates the retained tree's animation tracks to
   * `nowNanos` (the Choreographer frame timestamp), redraws when live, then
   * reports whether anything is still animating. The driver funnels results
   * and stops the vsync loop when every session goes idle.
   */
  fun scheduleTick(nowNanos: Long, onDone: (Boolean) -> Unit)
}
