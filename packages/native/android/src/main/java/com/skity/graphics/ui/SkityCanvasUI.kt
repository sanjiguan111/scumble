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
    if (extraData is ByteArray) {
      view?.consumeCommands(extraData)
    }
  }

  override fun onDetach() {
    super.onDetach()
    view?.destroy()
  }
}
