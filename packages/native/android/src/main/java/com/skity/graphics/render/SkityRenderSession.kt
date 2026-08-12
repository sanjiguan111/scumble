// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.render

import android.view.Surface

/**
 * Backend-agnostic render session surface. [SkityGLRenderSession] and
 * [SkityVulkanRenderSession] implement it; [com.skity.graphics.ui.SkityCanvasView]
 * holds one of them based on the active backend ([com.skity.graphics.SkityInit]).
 */
interface SkityRenderSession {
  fun attachSurface(surface: Surface, width: Int, height: Int)
  fun updateSize(width: Int, height: Int)
  fun applyCommands(commands: ByteArray)
  fun detachSurface()
  fun destroy()
}
