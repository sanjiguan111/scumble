// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.ui

import android.content.Context
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.ui.LynxUI

/**
 * LynxUI for `<skity-canvas>`. Receives the CommandBatch bytes from the
 * ShadowNode via Lynx's extra-data channel (Step 3b: the snapshot bundle is
 * retired — commands are the only payload) and forwards them to the view.
 *
 * Mirrors lynx-native-svg's UISvg (updateExtraData → view.consume*); the
 * difference is the backing view renders with skity on a GL surface instead of
 * android.graphics.Canvas.
 */
class SkityCanvasUI(context: LynxContext) : LynxUI<SkityCanvasView>(context) {

  override fun createView(context: Context?): SkityCanvasView? {
    return context?.let { SkityCanvasView(it) }
  }

  override fun updateExtraData(extraData: Any?) {
    super.updateExtraData(extraData)
    when (extraData) {
      is ByteArray -> view?.consumeCommands(extraData)
      // <skity-paragraph> flush: the command batch + the glyph-run snapshot,
      // same payload, applied in order (batch first).
      is Map<*, *> -> {
        (extraData["batch"] as? ByteArray)?.takeIf { it.isNotEmpty() }?.let {
          view?.consumeCommands(it)
        }
        @Suppress("UNCHECKED_CAST")
        val runs = extraData["runs"] as? List<ByteArray>
        if (!runs.isNullOrEmpty()) {
          view?.consumeParagraphRuns(runs)
        }
      }
    }
  }

  override fun onDetach() {
    super.onDetach()
    view?.destroy()
  }
}
