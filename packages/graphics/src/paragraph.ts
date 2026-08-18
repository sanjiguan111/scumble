// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Paragraph layout-input serialization: a styled span list (the `<TextSpan>`
// children of `<Paragraph>`) into a nested `SpanList` FlatBuffer
// (paragraph_runs.fbs). The bytes ride the string prop channel base64-encoded,
// like the gradients; the platform TASM side decodes them, lays the paragraph
// out (CoreText / HarfBuzz + the shared line breaker), and ships glyph runs to
// the render thread through the side channel. Text + styles only — glyph data
// never crosses this boundary (TEXT_PARAGRAPH_DESIGN.md §7).

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { Span } from "./generated/skityrt/span.js";
import { SpanList } from "./generated/skityrt/span-list.js";

import { parseColor } from "./color.js";

/** One styled run of source text — the serialization input for {@link buildSpanList}. */
export interface SpanSpec {
  text: string;
  /** Font family; empty/undefined = platform default. */
  fontFamily?: string;
  /** Font size in px. Default 14. */
  fontSize?: number;
  /** CSS-style weight 100–900. Default 400. */
  fontWeight?: number;
  italic?: boolean;
  /** Span color (any format {@link parseColor} accepts). Default black. */
  color?: string;
  /** Extra letter spacing in px (skity has none; the layout layer applies it). */
  letterSpacing?: number;
}

/**
 * Serialize span specs into a nested `SpanList` FlatBuffer (the native
 * `spans` prop payload of `skity-paragraph`).
 *
 * @returns SpanList FlatBuffer bytes (base64-encode for the prop channel).
 * @throws if `spans` is empty.
 *
 * @example
 * buildSpanList([{ text: "Hello " }, { text: "skity", color: "#3b82f6" }]);
 */
export function buildSpanList(spans: SpanSpec[]): ArrayBuffer {
  if (spans.length === 0) throw new Error("buildSpanList: needs at least one span");

  const builder = new flatbuffers.Builder(512);
  const spanOffsets: flatbuffers.Offset[] = [];
  for (const span of spans) {
    const textOff = builder.createString(span.text ?? "");
    const familyOff = span.fontFamily ? builder.createString(span.fontFamily) : 0;
    const color = span.color !== undefined ? parseColor(span.color) : 0xff000000;
    Span.startSpan(builder);
    Span.addText(builder, textOff);
    if (familyOff !== 0) Span.addFontFamily(builder, familyOff);
    Span.addFontSize(builder, span.fontSize ?? 14);
    Span.addFontWeight(builder, span.fontWeight ?? 400);
    Span.addItalic(builder, span.italic === true);
    Span.addColor(builder, color >>> 0);
    Span.addLetterSpacing(builder, span.letterSpacing ?? 0);
    spanOffsets.push(Span.endSpan(builder));
  }
  const spansOff = SpanList.createSpansVector(builder, spanOffsets);
  SpanList.startSpanList(builder);
  SpanList.addSpans(builder, spansOff);
  const root = SpanList.endSpanList(builder);
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}
