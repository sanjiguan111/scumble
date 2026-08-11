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
class SkityVulkanRenderSession : SkityRenderSession {

  private val renderHandler = SkityVulkanRenderThread.handler

  private var rendererHandle: Long = 0L

  @Volatile
  private var surfaceReady: Boolean = false

  @Volatile
  private var pendingTree: ByteArray? = null
  @Volatile
  private var pendingDensity: Float = 1f
  // Phase 2 Step 1b: incremental CommandBatch bytes (null = no commands).
  @Volatile
  private var pendingCommands: ByteArray? = null

  private fun ensureRenderer() {
    if (rendererHandle == 0L) {
      // Vulkan manages its own context; no shared GL handle.
      rendererHandle = SkityNative.nativeCreateRenderer(SkityNative.BACKEND_VULKAN, 0L)
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
      }
    }
  }

  override fun setRenderTree(data: ByteArray, density: Float, commands: ByteArray?) {
    pendingTree = data
    pendingDensity = density
    pendingCommands = commands
    renderHandler.post { drawIfReady() }
  }

  private fun drawIfReady() {
    val data = pendingTree ?: return
    if (!surfaceReady || rendererHandle == 0L) return
    // Phase 2 Step 2: apply commands BEFORE the snapshot sync — Insert creates
    // nodes so Sync can populate their fields. (Step 1b was Sync→Apply; Step 2
    // topology-by-command requires Apply→Sync.)
    val commands = pendingCommands
    if (commands != null) {
      SkityNative.nativeApplyCommands(rendererHandle, commands)
      pendingCommands = null
    }
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
