// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.ui

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import com.skity.graphics.SkityInit
import com.skity.graphics.SkityNative
import com.skity.graphics.image.SkityImageController
import com.skity.graphics.render.SkityGLRenderSession
import com.skity.graphics.render.SkityRenderSession
import com.skity.graphics.render.SkityVulkanRenderSession

/**
 * ViewGroup backing `<skity-canvas>`. Contains a [TextureView] (which renders
 * to a GPU texture, so it can be laid out / transformed / nested like a normal
 * view, unlike GLSurfaceView) and drives skity rendering on a dedicated
 * [SkityGLRenderSession] render thread.
 *
 * consumeCommands forwards CommandBatch bytes straight to the render session
 * (Step 3b: no snapshot bundle; the session posts apply + draw to the render
 * thread, and an early command before the SurfaceTexture is ready is held
 * pending by the session).
 */
class SkityCanvasView(context: Context) : FrameLayout(context) {

  // Backend chosen globally via SkityInit.init(env, backend). GLES and Vulkan
  // run on separate shared render threads (EGL/Vulkan queue are thread-local).
  private val session: SkityRenderSession =
    if (SkityInit.backend == SkityNative.BACKEND_VULKAN) {
      SkityVulkanRenderSession(context.resources.displayMetrics.density)
    } else {
      SkityGLRenderSession(context.resources.displayMetrics.density)
    }
  private val textureView = TextureView(context)

  init {
    // Register for late-bitmap redraws (an ImageStore write pings every live
    // session; weak reference, cleaned up automatically on destroy).
    SkityImageController.registerSession(session)
    addView(
      textureView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
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

  /** Forward CommandBatch bytes to the render session (posts apply + draw). */
  fun consumeCommands(commands: ByteArray) {
    session.applyCommands(commands)
  }

  /** Release the render thread + native renderer. Called from LynxUI.onDetach. */
  fun destroy() {
    session.destroy()
  }
}
