// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.render

import android.view.Surface

/**
 * Backend-agnostic render session surface. [ScumbleGLRenderSession] and
 * [ScumbleVulkanRenderSession] implement it; [com.scumble.graphics.ui.ScumbleCanvasView]
 * holds one of them based on the active backend ([com.scumble.graphics.ScumbleInit]).
 */
interface ScumbleRenderSession {
  fun attachSurface(surface: Surface, width: Int, height: Int)
  fun updateSize(width: Int, height: Int)
  fun applyCommands(commands: ByteArray)

  /**
   * Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D2/D3): posts
   * the command onto the render thread. `action` is an ACTION_* constant
   * (AnimControlAction enum value); `timeMs` is only read by seek. `onDone`
   * fires on the CALLING thread's post side (render thread) with false when
   * the handle is unknown/stale.
   */
  fun controlAnimation(handle: String, action: Int, timeMs: Double, onDone: (Boolean) -> Unit)

  companion object {
    // Mirrors skityrt::AnimControlAction (node_animation.h) — wire contract.
    const val ACTION_PLAY = 0
    const val ACTION_PAUSE = 1
    const val ACTION_SEEK = 2
    const val ACTION_CANCEL = 3
  }

  /**
   * Finish-event sink (D5): invoked ON THE RENDER THREAD whenever a tracked
   * animation completes; the owner (ScumbleCanvasView) hops to the Lynx UI
   * thread before emitting `skityAnimationFinish`. null = nobody listening.
   */
  var onAnimationFinish: ((String) -> Unit)?

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
