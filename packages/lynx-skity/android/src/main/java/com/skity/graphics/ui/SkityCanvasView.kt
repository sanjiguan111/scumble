// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import com.skity.graphics.SkityInit
import com.skity.graphics.SkityNative
import com.skity.graphics.render.SkityGLRenderSession
import com.skity.graphics.render.SkityRenderBundle
import com.skity.graphics.render.SkityRenderSession
import com.skity.graphics.render.SkityVulkanRenderSession

/**
 * ViewGroup backing `<skity-canvas>`. Contains a [TextureView] (which renders
 * to a GPU texture, so it can be laid out / transformed / nested like a normal
 * view, unlike GLSurfaceView) and drives skity GLES rendering on a dedicated
 * [SkityGLRenderSession] render thread.
 *
 * consumeRenderBundle stores the latest bundle and invalidates the view; the
 * actual hand-off to the render session happens in [onDraw], so the timing is
 * tied to the view's draw pass (the bundle is never lost even if it arrives
 * before the SurfaceTexture — the session keeps it pending).
 */
class SkityCanvasView(context: Context) : FrameLayout(context) {

  // Backend chosen globally via SkityInit.init(env, backend). GLES and Vulkan
  // run on separate shared render threads (EGL/Vulkan queue are thread-local).
  private val session: SkityRenderSession =
    if (SkityInit.backend == SkityNative.BACKEND_VULKAN) {
      SkityVulkanRenderSession()
    } else {
      SkityGLRenderSession()
    }
  private val textureView = TextureView(context)

  private var pendingBundle: SkityRenderBundle? = null

  init {
    addView(
      textureView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    // Enable onDraw so consumeRenderBundle → invalidate → onDraw drives rendering.
    setWillNotDraw(false)
    // Transparent background: where skity draws nothing (glClearColor alpha=0
    // in GLESRenderBackend), let the Lynx view behind show through instead of
    // TextureView's default opaque black.
    textureView.setOpaque(false)
    textureView.surfaceTextureListener =
      object : TextureView.SurfaceTextureListener {
        override fun onSurfaceTextureAvailable(
          surface: SurfaceTexture, width: Int, height: Int
        ) {
          session.attachSurface(Surface(surface), width, height)
        }

        override fun onSurfaceTextureSizeChanged(
          surface: SurfaceTexture, width: Int, height: Int
        ) {
          session.updateSize(width, height)
        }

        override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
          session.detachSurface()
          return true
        }

        override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
      }
  }

  /** Store the latest RenderTree and invalidate so onDraw dispatches it. */
  fun consumeRenderBundle(bundle: SkityRenderBundle?) {
    if (bundle != null) {
      pendingBundle = bundle
      invalidate()
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val bundle = pendingBundle ?: return
    // Hand the bundle to the render session. The session keeps it as pending
    // and draws once the GL surface is ready (SkityGLRenderSession.drawIfReady).
    session.setRenderTree(bundle.renderTreeBytes, bundle.density)
  }

  /** Release the render thread + native renderer. Called from LynxUI.onDetach. */
  fun destroy() {
    session.destroy()
  }
}
