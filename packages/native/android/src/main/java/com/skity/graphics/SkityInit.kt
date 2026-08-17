// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics

import com.lynx.tasm.LynxEnv
import com.skity.graphics.image.BuiltInSkityImageLoader
import com.skity.graphics.image.SkityImageLoader

/**
 * Single entry point for initializing lynx-skity in a host app. Registers the
 * skity element behaviors (skity-canvas + virtual shapes) globally with the
 * given [LynxEnv], so every LynxView can use them. Future global setup (GPU
 * backend defaults, services, etc.) goes here too.
 *
 * Hosts call this once after LynxEnv is initialized, typically in
 * `Application.onCreate`:
 *
 * ```
 * LynxEnv.inst().init(this, ...)
 * SkityInit.init(LynxEnv.inst())
 * ```
 */
object SkityInit {

  /**
   * Active GPU backend (GLES by default). Set via [init] before any
   * `<skity-canvas>` is laid out. GLES = [SkityNative.BACKEND_GLES],
   * Vulkan = [SkityNative.BACKEND_VULKAN].
   */
  @Volatile
  var backend: Int = SkityNative.BACKEND_GLES

  /**
   * Image loader for `<skity-image>` sources (http(s) URL / data URI). Hosts
   * with their own pipeline reassign it (`SkityInit.imageLoader = mine`); the
   * built-in one covers data URIs + http(s). Runs off-thread and reports
   * through SkityImageController.
   */
  @Volatile
  var imageLoader: SkityImageLoader = BuiltInSkityImageLoader()

  @JvmStatic
  @JvmOverloads
  fun init(env: LynxEnv, backend: Int = SkityNative.BACKEND_GLES) {
    // Fall back to GLES if Vulkan was requested but isn't usable on this device
    // (old API level, no Vulkan loader, or context creation fails).
    this.backend =
      if (backend == SkityNative.BACKEND_VULKAN && !SkityNative.nativeProbeVulkan()) {
        SkityNative.BACKEND_GLES
      } else {
        backend
      }
    // Register skity elements globally (skity-canvas container + virtual
    // shape/group elements). BehaviorBundle isn't auto-registered by autolink,
    // so the host must add it explicitly.
    env.addBehaviors(SkityBehavior().create())

    // TODO: future global skity init — e.g. GPU backend selection, default
    // density/MSAA, skity service registration.
  }
}
