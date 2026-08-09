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
