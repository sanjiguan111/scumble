// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.render

import android.os.Handler
import android.os.HandlerThread

/**
 * Process-wide shared skity Vulkan render thread, separate from the GL thread
 * ([ScumbleRenderThread]). Vulkan queues are thread-local and must not share a
 * thread with an EGL context, so Vulkan canvases post here while GL canvases
 * post to [ScumbleRenderThread].
 */
object ScumbleVulkanRenderThread {
  private val thread = HandlerThread("ScumbleVulkanRenderThread").apply { start() }

  /** Handler for posting Vulkan render work onto the shared thread. */
  val handler: Handler = Handler(thread.looper)
}
