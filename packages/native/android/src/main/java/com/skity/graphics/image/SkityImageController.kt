// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.image

import android.os.Handler
import com.skity.graphics.SkityInit
import com.skity.graphics.SkityNative
import com.skity.graphics.render.SkityRenderThread
import com.skity.graphics.render.SkityRenderSession
import com.skity.graphics.render.SkityVulkanRenderThread
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes image loads for `<skity-image>` into the shared ImageStore.
 *
 * The TASM setter calls [request] when a node first carries a uri; the loader
 * (built-in or host-injected) fetches + decodes off-thread; the result is
 * posted to the ACTIVE backend's render thread (the ImageStore is
 * render-thread only) and every live session redraws — the bitmap just
 * appears late, no Lynx layout pass involved.
 *
 * Pending dedup lives here: one in-flight request per uri; failures are
 * terminal (no retry — the node stays blank).
 */
object SkityImageController {

  private val pending = ConcurrentHashMap.newKeySet<String>()
  private val sessions = ArrayList<WeakReference<SkityRenderSession>>()

  /** Render-thread port of the active backend, fixed at first use. */
  private val renderHandler: Handler by lazy {
    if (SkityInit.backend == SkityNative.BACKEND_VULKAN) {
      SkityVulkanRenderThread.handler
    } else {
      SkityRenderThread.handler
    }
  }

  /** Register a session for late-bitmap redraws; weak — no unregister needed. */
  fun registerSession(session: SkityRenderSession) {
    synchronized(sessions) {
      sessions.removeAll { it.get() === null }
      sessions.add(WeakReference(session))
    }
  }

  /** Fire (or join) the load for [uri]. No-op while a request is in flight. */
  fun request(uri: String) {
    if (uri.isEmpty() || !pending.add(uri)) return
    val loader = SkityInit.imageLoader
    loader.loadImage(uri) { pixels ->
      val p = pixels
      renderHandler.post {
        if (p != null) {
          SkityNative.nativeStoreImage(uri, p.rgba, p.width, p.height)
        } else {
          SkityNative.nativeMarkImageFailed(uri)
        }
        notifyRedraw()
      }
      pending.remove(uri)
    }
  }

  /** Render-thread only: ping every live session. */
  private fun notifyRedraw() {
    val snapshot: List<SkityRenderSession>
    synchronized(sessions) {
      snapshot = sessions.mapNotNull { it.get() }
    }
    for (s in snapshot) s.postRedraw()
  }
}
