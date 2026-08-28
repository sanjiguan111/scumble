// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.render

import android.view.Surface
import com.scumble.graphics.ScumbleNative

/**
 * Per-canvas GLES renderer state, driven on the shared [ScumbleRenderThread].
 * Each ScumbleCanvasView owns one session (its own native AppRenderer + EGL
 * context/surface); all sessions post to the same render thread so multiple
 * canvases share it.
 *
 * [setRenderTree] keeps the latest RenderTree as pending and renders one frame
 * whenever the surface is ready. A RenderTree pushed before the surface is
 * available (early consumeRenderBundle) is NOT lost — it's held as pending and
 * drawn once [attachSurface] completes.
 */
class ScumbleGLRenderSession(private val density: Float) : ScumbleRenderSession {

  // Shared process-wide render thread (see ScumbleRenderThread).
  private val renderHandler = ScumbleRenderThread.handler

  private var rendererHandle: Long = 0L

  /** Finish-event sink (D5): set by ScumbleCanvasView; invoked on this render thread. */
  override var onAnimationFinish: ((String) -> Unit)? = null

  @Volatile
  private var surfaceReady: Boolean = false

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      rendererHandle = ScumbleNative.nativeCreateRenderer(
        ScumbleNative.BACKEND_GLES, ScumbleRenderThread.sharedGLContextHandle, density)
    }
  }

  /** Called from the UI thread when the TextureView's SurfaceTexture is ready. */
  override fun attachSurface(surface: Surface, width: Int, height: Int) {
    renderHandler.post {
      ensureRenderer()
      ScumbleNative.nativeSetSurface(rendererHandle, surface)
      ScumbleNative.nativeOnSurfaceCreated(rendererHandle)
      if (width > 0 && height > 0) {
        ScumbleNative.nativeOnSurfaceChanged(rendererHandle, width, height)
      }
      surfaceReady = true
      // Draw any RenderTree that arrived before the surface was ready.
      drawIfReady()
    }
  }

  override fun updateSize(width: Int, height: Int) {
    renderHandler.post {
      if (rendererHandle != 0L) {
        ScumbleNative.nativeOnSurfaceChanged(rendererHandle, width, height)
        drawIfReady() // size changed → redraw the retained tree at the new size
      }
    }
  }

  /**
   * Push a CommandBatch. Kept as pending; applied + drawn now if the surface is
   * ready, otherwise on the next attachSurface. Called from the UI thread
   * (consumeCommands). Step 3b: no snapshot — commands are the only payload.
   */
  override fun applyCommands(commands: ByteArray) {
    // Apply each batch in full on the render thread, then draw. Previously the
    // batch sat in a single `pendingCommands` slot that the next batch would
    // overwrite before drawIfReady ran — under rapid updates that dropped the
    // first batch's structural Insert, so nodes never entered the retained tree
    // and never rendered. ensureRenderer() lets commands apply even before the
    // surface is ready (the tree lives on the renderer, independent of surface).
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
    // Same render-queue ordering as the batch (post order = FIFO), so the
    // batch of this flush applies before the runs that reference its nodes.
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
    // Draw only — commands are applied in applyCommands (or already in the tree
    // when the surface attaches).
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

  /** Release this session's native renderer. The shared thread is not quit. */
  override fun destroy() {
    detachSurface()
    renderHandler.post {
      if (rendererHandle != 0L) {
        ScumbleNative.nativeDestroyRenderer(rendererHandle)
        rendererHandle = 0L
      }
    }
    // ScumbleRenderThread is shared across views, so it's not quit here.
  }
}
