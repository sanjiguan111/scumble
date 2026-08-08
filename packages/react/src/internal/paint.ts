// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke attributes) into
// the {fill?, stroke?, ...} scalars the skity intrinsic tags accept. The native
// layer takes a packed 0xAARRGGBB number for fill/stroke and never parses color
// strings — parseColor (from lynx-skity/parsers) does that here.

import { parseColor } from "@lynx-skity/parsers";

import type { GraphicProps } from "../types";

/** The paint slice of the skity intrinsic props. */
export interface ResolvedPaint {
  fill?: number;
  stroke?: number;
  strokeWidth?: number;
  strokeCap?: "butt" | "round" | "square";
  strokeJoin?: "miter" | "round" | "bevel";
  strokeMiter?: number;
  opacity?: number;
}

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
  if (strokeCap !== undefined) out.strokeCap = strokeCap;
  if (strokeJoin !== undefined) out.strokeJoin = strokeJoin;
  if (strokeMiter !== undefined) out.strokeMiter = strokeMiter;
  if (opacity !== undefined) out.opacity = opacity;

  // blendMode / zIndex are accepted on GraphicProps but not honored natively
  // today (caveat); intentionally dropped here.

  return out;
}
