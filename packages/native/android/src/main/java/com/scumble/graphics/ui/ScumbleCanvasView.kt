// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.ui

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import com.scumble.graphics.ScumbleInit
import com.scumble.graphics.ScumbleNative
import com.scumble.graphics.image.ScumbleImageController
import com.scumble.graphics.render.ScumbleAnimationDriver
import com.scumble.graphics.render.ScumbleGLRenderSession
import com.scumble.graphics.render.ScumbleRenderSession
import com.scumble.graphics.render.ScumbleVulkanRenderSession

/**
 * ViewGroup backing `<scumble-canvas>`. Contains a [TextureView] (which renders
 * to a GPU texture, so it can be laid out / transformed / nested like a normal
 * view, unlike GLSurfaceView) and drives skity rendering on a dedicated
 * [ScumbleGLRenderSession] render thread.
 *
 * consumeCommands forwards CommandBatch bytes straight to the render session
 * (Step 3b: no snapshot bundle; the session posts apply + draw to the render
 * thread, and an early command before the SurfaceTexture is ready is held
 * pending by the session).
 */
class ScumbleCanvasView(context: Context) : FrameLayout(context) {

  // Backend chosen globally via ScumbleInit.init(env, backend). GLES and Vulkan
  // run on separate shared render threads (EGL/Vulkan queue are thread-local).
  private val session: ScumbleRenderSession =
    if (ScumbleInit.backend == ScumbleNative.BACKEND_VULKAN) {
      ScumbleVulkanRenderSession(context.resources.displayMetrics.density)
    } else {
      ScumbleGLRenderSession(context.resources.displayMetrics.density)
    }
  private val textureView = TextureView(context)

  /**
   * Finish-event dispatcher (D5), installed by ScumbleCanvasUI: invoked on THIS
   * view's thread with the completed animation's handle. Emits
   * `skityAnimationFinish` through the Lynx event emitter.
   */
  var animationFinishDispatcher: ((String) -> Unit)? = null

  init {
    // Register for late-bitmap redraws (an ImageStore write pings every live
    // session; weak reference, cleaned up automatically on destroy).
    ScumbleImageController.registerSession(session)
    // Register for animation ticks (each session receives the vsync timestamp
    // on ITS render thread; weak reference, same cleanup story).
    ScumbleAnimationDriver.registerSession(session)
    // Finish events (D5): the session notifies on the render thread — hop to
    // this view's thread (the Lynx UI thread) before invoking the dispatcher
    // ScumbleCanvasUI installed (it emits `skityAnimationFinish`).
    session.onAnimationFinish = { handle -> post { animationFinishDispatcher?.invoke(handle) } }
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

  /** Forward <scumble-paragraph> glyph-run snapshots — one serialized
   * ParagraphRunList entry per paragraph, applied per node id (idempotent
   * overwrite). Same flush as the batch that precedes it. */
  fun consumeParagraphRuns(runs: List<ByteArray>) {
    session.applyParagraphRuns(runs)
  }

  /** Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D2): forwards
   * to the session, which posts onto the render thread. */
  fun controlAnimation(handle: String, action: Int, timeMs: Double, onDone: (Boolean) -> Unit) {
    session.controlAnimation(handle, action, timeMs, onDone)
  }

  /** Release the render thread + native renderer. Called from LynxUI.onDetach. */
  fun destroy() {
    session.destroy()
  }
}
