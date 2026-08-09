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
class SkityGLRenderSession : SkityRenderSession {

  // Shared process-wide render thread (see SkityRenderThread).
  private val renderHandler = SkityRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  // Written on the UI thread (setRenderTree), read on the render thread
  // (drawIfReady). Held until the surface is ready so an early bundle isn't lost.
  @Volatile
  private var pendingTree: ByteArray? = null
  @Volatile
  private var pendingDensity: Float = 1f

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      rendererHandle = SkityNative.nativeCreateRenderer(
        SkityNative.BACKEND_GLES, SkityRenderThread.sharedGLContextHandle)
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
      }
    }
  }

  /**
   * Push a new RenderTree. Kept as pending; drawn now if the surface is ready,
   * otherwise drawn on the next attachSurface. Called from the UI thread
   * (consumeRenderBundle → onDraw).
   */
  override fun setRenderTree(data: ByteArray, density: Float) {
    pendingTree = data
    pendingDensity = density
    renderHandler.post { drawIfReady() }
  }

  private fun drawIfReady() {
    val data = pendingTree ?: return
    if (!surfaceReady || rendererHandle == 0L) return
    SkityNative.nativeSetRenderTree(rendererHandle, data, pendingDensity)
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
