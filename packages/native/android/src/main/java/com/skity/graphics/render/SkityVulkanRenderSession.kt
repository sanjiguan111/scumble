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

  private val renderHandler = SkityVulkanRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  // Phase 2: incremental CommandBatch bytes (null = no commands pending).
  @Volatile
  private var pendingCommands: ByteArray? = null

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
    pendingCommands = commands
    renderHandler.post { drawIfReady() }
  }

  private fun drawIfReady() {
    if (!surfaceReady || rendererHandle == 0L) return
    // Step 3b: commands are the only mutation path (snapshot retired). The
    // retained tree persists across frames; a null pendingCommands just redraws.
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
