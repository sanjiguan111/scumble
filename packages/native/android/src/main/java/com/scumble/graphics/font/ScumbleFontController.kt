// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.font

import com.lynx.tasm.behavior.LynxContext
import com.scumble.graphics.ScumbleInit
import com.scumble.graphics.ScumbleNative
import com.scumble.graphics.node.ScumbleNodeBase
import java.util.concurrent.ConcurrentHashMap

/**
 * Drives asynchronous custom-font loads for `<skity-paragraph>`: the shaper
 * reports a missed font URI during layout (TASM thread), the controller
 * dedups the request, delivers the bytes to the native TypefaceCache, and —
 * the font-is-a-layout-input part — re-triggers layout on every waiting
 * paragraph once bytes land.
 *
 * The re-layout goes through [LynxContext.findShadowNodeAndRunTask], the
 * same public API Lynx's own async-font/inline-image paths use (it hops to
 * the layout thread); the strong LynxContext reference is safe, nodes are
 * only touched inside the task.
 */
object ScumbleFontController {

  private class Waiter(val context: LynxContext, val sign: Int)

  private val pending = ConcurrentHashMap.newKeySet<String>()
  // uri → paragraphs (context+sign) whose last layout saw it missing. The
  // same uri may be waited on by many paragraphs across canvases.
  private val waiting = ConcurrentHashMap<String, MutableSet<Waiter>>()

  /**
   * Called from the TASM thread when a paragraph's layout met an unloaded
   * font URI. Falls back to the default font for THAT layout (the shaper
   * already did); this only makes sure the bytes arrive and re-layout runs.
   */
  fun request(uri: String, context: LynxContext, sign: Int) {
    waiting.computeIfAbsent(uri) { ConcurrentHashMap.newKeySet() }.add(Waiter(context, sign))
    if (!pending.add(uri)) return // already loading
    ScumbleInit.fontLoader.loadFont(uri) { bytes ->
      // Any thread (the loader's executor). StoreBytes is mutex-guarded
      // natively; null bytes record a sticky failure for the URI.
      ScumbleNative.nativeStoreFontBytes(uri, bytes)
      pending.remove(uri)
      val waiters = waiting.remove(uri) ?: return@loadFont
      for (w in waiters) {
        w.context.findShadowNodeAndRunTask(w.sign) { node ->
          (node as? ScumbleNodeBase)?.dirtyParagraph = true
          node.markDirty() // virtual node — bubbles to the canvas's measure
        }
      }
    }
  }
}
