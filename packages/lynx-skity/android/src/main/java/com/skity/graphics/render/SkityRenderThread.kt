// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.os.Handler
import android.os.HandlerThread
import com.skity.graphics.SkityNative


/**
 * Process-wide shared skity render thread. All [SkityCanvasView] instances post
 * their EGL/skity work onto this single thread. Each view keeps its own native
 * renderer + EGL context (created and made-current here); EGL/skity GL state is
 * thread-local, so concentrating everything on one thread keeps it consistent
 * while letting multiple canvases share the render thread instead of spawning
 * one per view.
 */
object SkityRenderThread {
  private val thread = HandlerThread("SkityRenderThread").apply { start() }

  /** Handler for posting render work onto the shared thread. */
  val handler: Handler = Handler(thread.looper)

  /**
   * Handle to the shared C++ GL context (EGL display/context + skity
   * GPUContext), created lazily and owned by this thread. All GL canvases on
   * this thread reuse it; each only owns its window surface. Avoids the
   * thread_local slot limit by holding the pointer explicitly.
   */
  val sharedGLContextHandle: Long by lazy {
    SkityNative.nativeCreateSharedGLContext()
  }
}
