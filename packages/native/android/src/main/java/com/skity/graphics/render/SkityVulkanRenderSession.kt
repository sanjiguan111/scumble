// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.view.Surface
import com.skity.graphics.SkityNative

/**
 * Per-canvas Vulkan renderer state, driven on the shared
 * [SkityVulkanRenderThread] (separate from the GL thread). Mirrors
 * [SkityGLRenderSession]; differences: backend [SkityNative.BACKEND_VULKAN] and
 * the dedicated Vulkan render thread.
 */
class SkityVulkanRenderSession(private val density: Float) : SkityRenderSession {

  /** Finish-event sink (D5): set by SkityCanvasView; invoked on this render thread. */
  override var onAnimationFinish: ((String) -> Unit)? = null

  private val renderHandler = SkityVulkanRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      // Vulkan manages its own context; no shared GL handle.
      rendererHandle = SkityNative.nativeCreateRenderer(SkityNative.BACKEND_VULKAN, 0L, density)
    }
  }

  override fun attachSurface(surface: Surface, width: Int, height: Int) {
    renderHandler.post {
      ensureRenderer()
      SkityNative.nativeSetSurface(rendererHandle, surface)
      SkityNative.nativeOnSurfaceCreated(rendererHandle)
      if (width > 0 && height > 0) {
        SkityNative.nativeOnSurfaceChanged(rendererHandle, width, height)
      }
      surfaceReady = true
      drawIfReady()
    }
  }

  override fun updateSize(width: Int, height: Int) {
    renderHandler.post {
      if (rendererHandle != 0L) {
        SkityNative.nativeOnSurfaceChanged(rendererHandle, width, height)
        drawIfReady()
      }
    }
  }

  override fun applyCommands(commands: ByteArray) {
    // Apply each batch in full on the render thread, then draw (see
    // SkityGLRenderSession.applyCommands for why the pending slot was dropped).
    renderHandler.post {
      ensureRenderer()
      if (rendererHandle != 0L) {
        SkityNative.nativeApplyCommands(rendererHandle, commands)
      }
      drawIfReady()
      // The batch may have installed animations while the driver was idle.
      SkityAnimationDriver.wakeUp()
    }
  }

  override fun applyParagraphRuns(runs: List<ByteArray>) {
    renderHandler.post {
      ensureRenderer()
      if (rendererHandle != 0L) {
        for (entry in runs) {
          SkityNative.nativeApplyParagraphRuns(rendererHandle, entry)
        }
      }
      drawIfReady()
    }
  }

  private fun drawIfReady() {
    if (!surfaceReady || rendererHandle == 0L) return
    SkityNative.nativeDrawFrame(rendererHandle)
  }

  override fun postRedraw() {
    renderHandler.post { drawIfReady() }
  }

  override fun scheduleTick(nowNanos: Long, onDone: (Boolean) -> Unit) {
    renderHandler.post {
      val live =
          rendererHandle != 0L && SkityNative.nativeTickAnimations(rendererHandle, nowNanos)
      if (live) drawIfReady()
      drainFinishedHandles()
      onDone(live)
    }
  }

  /** Finish events (D5): pull completed handles and notify on THIS thread;
   * the listener (SkityCanvasView) hops to the Lynx UI thread itself. */
  private fun drainFinishedHandles() {
    if (rendererHandle == 0L) return
    val finished = SkityNative.nativeTakeFinishedHandles(rendererHandle) ?: return
    for (h in finished) onAnimationFinish?.invoke(h)
  }

  override fun controlAnimation(handle: String, action: Int, timeMs: Double, onDone: (Boolean) -> Unit) {
    renderHandler.post {
      val ok =
          rendererHandle != 0L &&
              SkityNative.nativeControlAnimation(rendererHandle, handle, action, timeMs)
      if (ok) {
        // Resume/restart needs the driver back; seek already re-evaluated the
        // overlay synchronously — paint it without waiting a vsync (D3/D4).
        if (action == SkityRenderSession.ACTION_PLAY) SkityAnimationDriver.wakeUp()
        if (action == SkityRenderSession.ACTION_SEEK) {
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
        SkityNative.nativeOnSurfaceDestroyed(rendererHandle)
        SkityNative.nativeSetSurface(rendererHandle, null)
      }
    }
  }

  override fun destroy() {
    detachSurface()
    renderHandler.post {
      if (rendererHandle != 0L) {
        SkityNative.nativeDestroyRenderer(rendererHandle)
        rendererHandle = 0L
      }
    }
  }
}
