// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke attributes) into
// the {fill?, stroke?, ...} scalars the skity intrinsic tags accept. The native
// layer takes a packed 0xAARRGGBB number for fill/stroke and number bytes for
// enums — parseColor / parseStrokeCap / parseStrokeJoin (from lynx-skity/graphics)
// do all string resolution here; the native side never parses strings.

import { parseColor, parseStrokeCap, parseStrokeJoin } from "@lynx-skity/graphics";

import type { GraphicProps } from "../types";

/**
 * The paint slice of the skity intrinsic props — the output shape of
 * {@link resolvePaint}. Colors are packed `0xAARRGGBB`; `strokeCap`/`strokeJoin`
 * are enum bytes (`LineCap`/`LineJoin`).
 */
export interface ResolvedPaint {
  fill?: number;
  stroke?: number;
  strokeWidth?: number;
  strokeCap?: number;
  strokeJoin?: number;
  strokeMiter?: number;
  opacity?: number;
}

/**
 * Normalize a shape's {@link GraphicProps} into the `{fill?, stroke?, …}`
 * scalars the skity intrinsic tags accept. `color` is run through `parseColor`
 * and routed to `fill` or `stroke` by `style` (default `"fill"`); `strokeCap`/
 * `strokeJoin` are mapped to enum bytes. `blendMode`/`zIndex` are intentionally
 * dropped (not honored natively yet). A `color`-less shape resolves to an empty
 * object, so the native side draws nothing.
 */
export function resolvePaint(props: GraphicProps): ResolvedPaint {
  const { color, style = "fill", strokeWidth, strokeCap, strokeJoin, strokeMiter, opacity } = props;

  const out: ResolvedPaint = {};

  // color omitted → no fill/stroke set → native draws nothing (== transparent).
  if (color !== undefined) {
    const packed = parseColor(color);
    if (style === "stroke") {
      out.stroke = packed;
    } else {
      out.fill = packed;
    }
  }

  if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
  // Map friendly enum strings → skityrt bytes; the native side takes numbers.
  if (strokeCap !== undefined) out.strokeCap = parseStrokeCap(strokeCap);
  if (strokeJoin !== undefined) out.strokeJoin = parseStrokeJoin(strokeJoin);
  if (strokeMiter !== undefined) out.strokeMiter = strokeMiter;
  if (opacity !== undefined) out.opacity = opacity;

  // blendMode / zIndex are accepted on GraphicProps but not honored natively
  // today (caveat); intentionally dropped here.

  return out;
}
