// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.skity.graphics.node

import com.lynx.tasm.event.EventsListener
import com.lynx.tasm.event.LynxDetailEvent
import com.skity.graphics.SkityNative
import com.skity.graphics.skityrt.ParagraphRunList
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Virtual ShadowNode for `<skity-paragraph>`. The Android layout backend:
 * when the owning canvas's measure walk reaches a dirty paragraph, it lays
 * out (HarfBuzz shaping against skity FontManager-resolved typefaces on this
 * TASM thread, via [SkityNative.nativeShapeParagraph]) and caches the result
 * as a single-entry ParagraphRunList keyed by the node's retained-tree id.
 *
 * The runs channel is a FULL snapshot: the canvas serializes every live
 * paragraph's current result on each measure flush (dirty ones re-laid,
 * clean ones from cache), because individual extra-bundle deliveries are
 * best-effort — whichever flush lands last must carry every paragraph's
 * layout. Mirrors the iOS backend's SkityParagraphShadowNode.mm.
 */
class SkityParagraphShadowNode : SkityNodeBase() {

  override val skityTagName = "paragraph"

  /** One layout pass's output: the serialized ParagraphRunList entry + metrics. */
  class Result(val runsBytes: ByteArray, val height: Float, val lineCount: Int)

  @JvmField var lastResult: Result? = null

  // Whether JS bound bindlayout (Lynx routes the "layout" event through
  // setEvents like any component event; Paragraph.tsx maps onLayout to it).
  private var layoutBound = false

  override fun setEvents(events: MutableMap<String, EventsListener>?) {
    super.setEvents(events)
    layoutBound = events?.containsKey("layout") == true
  }

  /**
   * Lay out if dirty (spans present + width > 0) and return the cached or
   * fresh result. Called from the canvas node's measure walk.
   */
  fun layoutIfNeeded(): Result? {
    if (!dirtyParagraph) return lastResult
    dirtyParagraph = false
    val spans = paragraphSpansData
    if (spans == null || !(width > 0f)) return lastResult
    val id = ensureNativeId()
    if (id == 0) return lastResult

    val bytes = SkityNative.nativeShapeParagraph(
      spans, id, width, paragraphAlign, paragraphLineHeight, paragraphMaxLines)
    if (bytes == null) {
      lastResult = null
      return null
    }
    // height/lineCount ride inside the serialized entry (the shaper wrote
    // them) — read them back so JS events don't need a second channel.
    val list = ParagraphRunList.getRootAsParagraphRunList(
      ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN))
    val entry = if (list.entriesLength() > 0) list.entries(0) else null
    if (entry == null) {
      lastResult = null
      return null
    }
    lastResult = Result(bytes, entry.height(), entry.lineCount())
    dispatchLayoutEvent(entry.height(), entry.lineCount())
    return lastResult
  }

  /** Async "layout" LynxDetailEvent ({height, lineCount}) — only when JS
   * bound bindlayout. The emitter hops to the UI thread itself, so this is
   * safe to call from the TASM thread. */
  private fun dispatchLayoutEvent(height: Float, lineCount: Int) {
    if (!layoutBound) return
    val detail = mapOf<String, Any>("height" to height, "lineCount" to lineCount)
    val event = LynxDetailEvent(getSignature(), "layout", detail)
    getContext().getEventEmitter().sendCustomEvent(event)
  }
}
