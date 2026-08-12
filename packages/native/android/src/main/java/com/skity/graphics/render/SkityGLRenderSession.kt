// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.view.Surface
import com.skity.graphics.SkityNative

/**
 * Per-canvas GLES renderer state, driven on the shared [SkityRenderThread].
 * Each SkityCanvasView owns one session (its own native AppRenderer + EGL
 * context/surface); all sessions post to the same render thread so multiple
 * canvases share it.
 *
 * [setRenderTree] keeps the latest RenderTree as pending and renders one frame
 * whenever the surface is ready. A RenderTree pushed before the surface is
 * available (early consumeRenderBundle) is NOT lost — it's held as pending and
 * drawn once [attachSurface] completes.
 */
class SkityGLRenderSession(private val density: Float) : SkityRenderSession {

  // Shared process-wide render thread (see SkityRenderThread).
  private val renderHandler = SkityRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  // Phase 2: incremental CommandBatch bytes (null = no commands pending). Written
  // on the UI thread (applyCommands), read + cleared on the render thread.
  @Volatile
  private var pendingCommands: ByteArray? = null

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      rendererHandle = SkityNative.nativeCreateRenderer(
        SkityNative.BACKEND_GLES, SkityRenderThread.sharedGLContextHandle, density)
    }
  }

  /** Called from the UI thread when the TextureView's SurfaceTexture is ready. */
  override fun attachSurface(surface: Surface, width: Int, height: Int) {
    renderHandler.post {
      ensureRenderer()
      SkityNative.nativeSetSurface(rendererHandle, surface)
      SkityNative.nativeOnSurfaceCreated(rendererHandle)
      if (width > 0 && height > 0) {
        SkityNative.nativeOnSurfaceChanged(rendererHandle, width, height)
      }
      surfaceReady = true
      // Draw any RenderTree that arrived before the surface was ready.
      drawIfReady()
    }
  }

  override fun updateSize(width: Int, height: Int) {
    renderHandler.post {
      if (rendererHandle != 0L) {
        SkityNative.nativeOnSurfaceChanged(rendererHandle, width, height)
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
    pendingCommands = commands
    renderHandler.post { drawIfReady() }
  }

  private fun drawIfReady() {
    if (!surfaceReady || rendererHandle == 0L) return
    // Step 3b: commands are the only mutation path (snapshot retired). The
    // retained tree persists across frames, so every draw uses the current tree
    // state; a null pendingCommands just redraws (e.g. after a resize).
    val commands = pendingCommands
    if (commands != null) {
      SkityNative.nativeApplyCommands(rendererHandle, commands)
      pendingCommands = null
    }
    SkityNative.nativeDrawFrame(rendererHandle)
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

  /** Release this session's native renderer. The shared thread is not quit. */
  override fun destroy() {
    detachSurface()
    renderHandler.post {
      if (rendererHandle != 0L) {
        SkityNative.nativeDestroyRenderer(rendererHandle)
        rendererHandle = 0L
      }
    }
    // SkityRenderThread is shared across views, so it's not quit here.
  }
}
