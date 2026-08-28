// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.render

import android.view.Surface
import com.scumble.graphics.ScumbleNative

/**
 * Per-canvas Vulkan renderer state, driven on the shared
 * [ScumbleVulkanRenderThread] (separate from the GL thread). Mirrors
 * [ScumbleGLRenderSession]; differences: backend [ScumbleNative.BACKEND_VULKAN] and
 * the dedicated Vulkan render thread.
 */
class ScumbleVulkanRenderSession(private val density: Float) : ScumbleRenderSession {

  /** Finish-event sink (D5): set by ScumbleCanvasView; invoked on this render thread. */
  override var onAnimationFinish: ((String) -> Unit)? = null

  private val renderHandler = ScumbleVulkanRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      // Vulkan manages its own context; no shared GL handle.
      rendererHandle = ScumbleNative.nativeCreateRenderer(ScumbleNative.BACKEND_VULKAN, 0L, density)
    }
  }

  override fun attachSurface(surface: Surface, width: Int, height: Int) {
    renderHandler.post {
      ensureRenderer()
      ScumbleNative.nativeSetSurface(rendererHandle, surface)
      ScumbleNative.nativeOnSurfaceCreated(rendererHandle)
      if (width > 0 && height > 0) {
        ScumbleNative.nativeOnSurfaceChanged(rendererHandle, width, height)
      }
      surfaceReady = true
      drawIfReady()
    }
  }

  override fun updateSize(width: Int, height: Int) {
    renderHandler.post {
      if (rendererHandle != 0L) {
        ScumbleNative.nativeOnSurfaceChanged(rendererHandle, width, height)
        drawIfReady()
      }
    }
  }

  override fun applyCommands(commands: ByteArray) {
    // Apply each batch in full on the render thread, then draw (see
    // ScumbleGLRenderSession.applyCommands for why the pending slot was dropped).
    renderHandler.post {
      ensureRenderer()
      if (rendererHandle != 0L) {
        ScumbleNative.nativeApplyCommands(rendererHandle, commands)
      }
      drawIfReady()
      // The batch may have installed animations while the driver was idle.
      ScumbleAnimationDriver.wakeUp()
    }
  }

  override fun applyParagraphRuns(runs: List<ByteArray>) {
    renderHandler.post {
      ensureRenderer()
      if (rendererHandle != 0L) {
        for (entry in runs) {
          ScumbleNative.nativeApplyParagraphRuns(rendererHandle, entry)
        }
      }
      drawIfReady()
    }
  }

  private fun drawIfReady() {
    if (!surfaceReady || rendererHandle == 0L) return
    ScumbleNative.nativeDrawFrame(rendererHandle)
  }

  override fun postRedraw() {
    renderHandler.post { drawIfReady() }
  }

  override fun scheduleTick(nowNanos: Long, onDone: (Boolean) -> Unit) {
    renderHandler.post {
      val live =
          rendererHandle != 0L && ScumbleNative.nativeTickAnimations(rendererHandle, nowNanos)
      if (live) drawIfReady()
      drainFinishedHandles()
      onDone(live)
    }
  }

  /** Finish events (D5): pull completed handles and notify on THIS thread;
   * the listener (ScumbleCanvasView) hops to the Lynx UI thread itself. */
  private fun drainFinishedHandles() {
    if (rendererHandle == 0L) return
    val finished = ScumbleNative.nativeTakeFinishedHandles(rendererHandle) ?: return
    for (h in finished) onAnimationFinish?.invoke(h)
  }

  override fun controlAnimation(handle: String, action: Int, timeMs: Double, onDone: (Boolean) -> Unit) {
    renderHandler.post {
      val ok =
          rendererHandle != 0L &&
              ScumbleNative.nativeControlAnimation(rendererHandle, handle, action, timeMs)
      if (ok) {
        // Resume/restart needs the driver back; seek already re-evaluated the
        // overlay synchronously — paint it without waiting a vsync (D3/D4).
        if (action == ScumbleRenderSession.ACTION_PLAY) ScumbleAnimationDriver.wakeUp()
        if (action == ScumbleRenderSession.ACTION_SEEK) {
          drawIfReady()
          drainFinishedHandles() // a seek to/past the end completes inline
        }
      }
      onDone(ok)
    }
  }

  override fun detachSurface() {
    surfaceReady = false
    renderHandler.post {
      if (rendererHandle != 0L) {
        ScumbleNative.nativeOnSurfaceDestroyed(rendererHandle)
        ScumbleNative.nativeSetSurface(rendererHandle, null)
      }
    }
  }

  override fun destroy() {
    detachSurface()
    renderHandler.post {
      if (rendererHandle != 0L) {
        ScumbleNative.nativeDestroyRenderer(rendererHandle)
        rendererHandle = 0L
      }
    }
  }
}
