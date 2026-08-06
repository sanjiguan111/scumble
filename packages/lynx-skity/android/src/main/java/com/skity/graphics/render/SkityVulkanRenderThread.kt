// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.os.Handler
import android.os.HandlerThread

/**
 * Process-wide shared skity Vulkan render thread, separate from the GL thread
 * ([SkityRenderThread]). Vulkan queues are thread-local and must not share a
 * thread with an EGL context, so Vulkan canvases post here while GL canvases
 * post to [SkityRenderThread].
 */
object SkityVulkanRenderThread {
  private val thread = HandlerThread("SkityVulkanRenderThread").apply { start() }

  /** Handler for posting Vulkan render work onto the shared thread. */
  val handler: Handler = Handler(thread.looper)
}
