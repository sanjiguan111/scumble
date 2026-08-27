// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.ui

import android.content.Context
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxUIMethod
import com.lynx.tasm.behavior.ui.LynxUI
import com.lynx.tasm.event.LynxCustomEvent
import com.skity.graphics.render.SkityRenderSession

/**
 * LynxUI for `<gesso-canvas>`. Receives the CommandBatch bytes from the
 * ShadowNode via Lynx's extra-data channel (Step 3b: the snapshot bundle is
 * retired — commands are the only payload) and forwards them to the view.
 *
 * Mirrors lynx-native-svg's UISvg (updateExtraData → view.consume*); the
 * difference is the backing view renders with skity on a GL surface instead of
 * android.graphics.Canvas.
 */
class SkityCanvasUI(context: LynxContext) : LynxUI<SkityCanvasView>(context) {

  override fun createView(context: Context?): SkityCanvasView? {
    val view = context?.let { SkityCanvasView(it) }
    // Finish events (D5): the view hops to the Lynx UI thread; emit through
    // the event emitter (pattern of LynxBaseUI.sendLayoutChangeEvent).
    view?.animationFinishDispatcher = { handle -> sendAnimationFinishEvent(handle) }
    return view
  }

  private fun sendAnimationFinishEvent(handle: String) {
    val params = HashMap<String, Any>()
    params["handle"] = handle
    lynxContext.eventEmitter.sendCustomEvent(
        LynxCustomEvent(sign, ANIMATION_FINISH_EVENT, params))
  }

  override fun updateExtraData(extraData: Any?) {
    super.updateExtraData(extraData)
    when (extraData) {
      is ByteArray -> view?.consumeCommands(extraData)
      // <gesso-paragraph> flush: the command batch + the glyph-run snapshot,
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

  companion object {
    // Mirrors LynxUIMethodConstants where applicable; ours are library-local.
    private const val ERR_PARAM_INVALID = 1
    private const val ERR_UNKNOWN_HANDLE = 2
    /** Custom-event type (D5): the React layer binds onAnimationFinish. */
    const val ANIMATION_FINISH_EVENT = "gessoanimationfinish"
  }

  /**
   * Playback control, the invoke-lane entry (ANIMATION_CONTROL_DESIGN.md D2).
   * Params (scalars only — the ReadableMap marshal boundary): `handle`
   * (string), `action` ("play" | "pause" | "seek" | "cancel"), `time` (ms,
   * seek only). The body does exactly one thing: forward onto the render
   * thread; all state lives with the retained tree.
   */
  @LynxUIMethod
  fun animateControl(params: ReadableMap, callback: Callback) {
    val handle = params.getString("handle")
    val actionName = params.getString("action")
    if (handle.isNullOrEmpty() || actionName == null) {
      callback.invoke(ERR_PARAM_INVALID)
      return
    }
    val action = when (actionName) {
      "play" -> SkityRenderSession.ACTION_PLAY
      "pause" -> SkityRenderSession.ACTION_PAUSE
      "seek" -> SkityRenderSession.ACTION_SEEK
      "cancel" -> SkityRenderSession.ACTION_CANCEL
      else -> {
        callback.invoke(ERR_PARAM_INVALID)
        return
      }
    }
    val timeMs = if (params.hasKey("time")) params.getDouble("time") else 0.0
    val target = view
    if (target == null) {
      callback.invoke(ERR_UNKNOWN_HANDLE)
      return
    }
    target.controlAnimation(handle, action, timeMs) { ok ->
      // Fires on the render thread (the UI method callback crosses back).
      callback.invoke(if (ok) 0 else ERR_UNKNOWN_HANDLE)
    }
  }
}
