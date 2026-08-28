// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics

import com.lynx.tasm.LynxEnv
import com.scumble.graphics.font.BuiltInScumbleFontLoader
import com.scumble.graphics.font.ScumbleFontLoader
import com.scumble.graphics.image.BuiltInScumbleImageLoader
import com.scumble.graphics.image.ScumbleImageLoader

/**
 * Single entry point for initializing scumble in a host app. Registers the
 * skity element behaviors (scumble-canvas + virtual shapes) globally with the
 * given [LynxEnv], so every LynxView can use them. Future global setup (GPU
 * backend defaults, services, etc.) goes here too.
 *
 * Hosts call this once after LynxEnv is initialized, typically in
 * `Application.onCreate`:
 *
 * ```
 * LynxEnv.inst().init(this, ...)
 * ScumbleInit.init(LynxEnv.inst())
 * ```
 */
object ScumbleInit {

  /**
   * Active GPU backend (GLES by default). Set via [init] before any
   * `<scumble-canvas>` is laid out. GLES = [ScumbleNative.BACKEND_GLES],
   * Vulkan = [ScumbleNative.BACKEND_VULKAN].
   */
  @Volatile
  var backend: Int = ScumbleNative.BACKEND_GLES

  /**
   * Image loader for `<skity-image>` sources (http(s) URL / data URI). Hosts
   * with their own pipeline reassign it (`ScumbleInit.imageLoader = mine`); the
   * built-in one covers data URIs + http(s). Runs off-thread and reports
   * through ScumbleImageController.
   */
  @Volatile
  var imageLoader: ScumbleImageLoader = BuiltInScumbleImageLoader()

  /**
   * Font loader for `<skity-paragraph>` custom fonts with schemed URIs
   * (http(s)/file; `data:` URIs never reach a loader). Hosts with their own
   * pipeline reassign it; loaded bytes land in the native TypefaceCache and
   * trigger a re-layout of the waiting paragraphs.
   */
  @Volatile
  var fontLoader: ScumbleFontLoader = BuiltInScumbleFontLoader()

  @JvmStatic
  @JvmOverloads
  fun init(env: LynxEnv, backend: Int = ScumbleNative.BACKEND_GLES) {
    // Fall back to GLES if Vulkan was requested but isn't usable on this device
    // (old API level, no Vulkan loader, or context creation fails).
    this.backend =
      if (backend == ScumbleNative.BACKEND_VULKAN && !ScumbleNative.nativeProbeVulkan()) {
        ScumbleNative.BACKEND_GLES
      } else {
        backend
      }
    // Register skity elements globally (scumble-canvas container + virtual
    // shape/group elements). BehaviorBundle isn't auto-registered by autolink,
    // so the host must add it explicitly.
    env.addBehaviors(ScumbleBehavior().create())

    // TODO: future global skity init — e.g. GPU backend selection, default
    // density/MSAA, skity service registration.
  }
}
