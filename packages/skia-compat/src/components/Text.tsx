// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Text x y text color font>` — RN-Skia's single-run glyph text over
 * scumble's `<Paragraph>`+`<TextSpan>`.
 *
 * The y-anchoring differs between the two models and the translation is the
 * whole point: RN-Skia draws glyphs with `y` at the BASELINE, while scumble
 * positions a paragraph box by its TOP — the shim lifts the box by the
 * font's ascent so `y` keeps baseline semantics. Paragraph `width` is set to
 * the measured text width (+1px slack) so no wrapping can occur — an
 * unwrapped single line is what RN-Skia `<Text>` always drew.
 */

import { Paragraph as ScumbleParagraph, TextSpan } from "@scumble/react";

import type { SkFont } from "../useFont.js";

export interface ShimTextProps {
  text: string;
  x?: number;
  y?: number;
  color?: string | number;
  font: SkFont;
}

/** Fallback when the font carries no metrics (a bare family name). */
const UNMEASURED_FALLBACK_WIDTH = 4096;

/** The prop mapping, exported for tests. */
export function textPropsToScumble(props: ShimTextProps) {
  const { text, x = 0, y = 0, color = "black", font } = props;
  let width = UNMEASURED_FALLBACK_WIDTH;
  let lift = 0; // baseline lift = ascent of the font at its size
  try {
    const v = font.getVerticalMetrics();
    width = font.measureText(text) + 1;
    lift = v.ascent;
  } catch {
    // Metrics-less font (family name): keep a wide no-wrap box; lift by the
    // size as a rough ascent (cap-height-ish for most UI fonts).
    lift = font.getSize();
  }
  return {
    x,
    y: y - lift,
    width,
    maxLines: 1,
    span: {
      text,
      fontSize: font.getSize(),
      fontFamily: font.fontFamily || undefined,
      color: color as string,
    },
  };
}

export function Text(props: ShimTextProps) {
  const { span, ...paragraph } = textPropsToScumble(props);
  return (
    <ScumbleParagraph {...paragraph}>
      <TextSpan {...span} />
    </ScumbleParagraph>
  );
}
