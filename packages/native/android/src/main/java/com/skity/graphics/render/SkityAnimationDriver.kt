// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import java.lang.ref.WeakReference

/**
 * Per-frame vsync driver for the native animation engine (ANIMATION_DESIGN.md
 * D4): Choreographer is the clock, the tick body runs on EACH session's render
 * thread (GL and Vulkan sessions live on different threads — the tree is
 * single-threaded by contract, so the driver never touches a tree itself).
 *
 * Flow per frame: doFrame → scheduleTick(now) on every live session (each
 * posts to its own render handler, ticks its trees, redraws when live) →
 * results funnel back through [onTickReported] → when all have reported,
 * continue or stop. Stop-on-idle: a frame where no session reports live ends
 * the Choreographer loop (zero cost when nothing animates).
 *
 * At most one frame is in flight at a time ([running]); a batch installing new
 * animations while stopped re-arms it via [wakeUp] (called from the sessions'
 * applyCommands).
 */
object SkityAnimationDriver {

  private val sessions = ArrayList<WeakReference<SkityRenderSession>>()
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile private var running = false

  // Frame funnel state — guarded by this (reported from render threads).
  private var pendingReports = 0
  private var anyLive = false

  /** Register a session for animation ticks; weak — no unregister needed. */
  fun registerSession(session: SkityRenderSession) {
    synchronized(sessions) {
      sessions.removeAll { it.get() === null }
      sessions.add(WeakReference(session))
    }
  }

  /**
   * Arm the vsync loop if it isn't running. Safe from any thread (the actual
   * Choreographer registration happens on the main thread).
   */
  fun wakeUp() {
    mainHandler.post {
      if (!running) {
        running = true
        Choreographer.getInstance().postFrameCallback(frameCallback)
      }
    }
  }

  private val frameCallback = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      val snapshot: List<SkityRenderSession>
      synchronized(sessions) {
        sessions.removeAll { it.get() === null }
        snapshot = sessions.mapNotNull { it.get() }
      }
      if (snapshot.isEmpty()) { // every canvas gone — nothing to drive
        running = false
        return
      }
      synchronized(this@SkityAnimationDriver) {
        pendingReports = snapshot.size
        anyLive = false
      }
      for (s in snapshot) s.scheduleTick(frameTimeNanos) { live -> onTickReported(live) }
    }
  }

  /** Called on each session's render thread once its tick completed. */
  private fun onTickReported(live: Boolean) {
    val continueNext: Boolean
    synchronized(this) {
      if (live) anyLive = true
      pendingReports--
      if (pendingReports > 0) return
      continueNext = anyLive
    }
    mainHandler.post {
      if (continueNext) {
        Choreographer.getInstance().postFrameCallback(frameCallback)
      } else {
        running = false // idle: zero-cost until the next wakeUp
      }
    }
  }
}
