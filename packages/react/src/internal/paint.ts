// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke + child shaders)
// into the {fill?, stroke?, fillGradient?, ...} scalars the skity intrinsic
// tags accept. Colors are packed 0xAARRGGBB; strokeCap/strokeJoin are enum
// bytes; a child <LinearGradient> is serialized to base64 Gradient bytes. All
// string/value resolution is delegated to @lynx-skity/graphics; the native side
// never parses strings.

import {
  buildLinearGradient,
  bytesToBase64,
  parseColor,
  parseStrokeCap,
  parseStrokeJoin,
} from "@lynx-skity/graphics";
import type { ReactNode } from "@lynx-js/react";

import { LinearGradient } from "../shaders/LinearGradient";
import type { GraphicProps, LinearGradientProps } from "../types";

/**
 * The paint slice of the skity intrinsic props — the output shape of
 * {@link resolvePaint}. Colors are packed `0xAARRGGBB`; `strokeCap`/`strokeJoin`
 * are enum bytes (`LineCap`/`LineJoin`); `fillGradient`/`strokeGradient` are
 * base64 Gradient bytes.
 */
export interface ResolvedPaint {
  fill?: number;
  stroke?: number;
  strokeWidth?: number;
  strokeCap?: number;
  strokeJoin?: number;
  strokeMiter?: number;
  opacity?: number;
  fillGradient?: string;
  strokeGradient?: string;
}

/**
 * Find the first `<LinearGradient>` child and return its props. The gradient is
 * a data-only component (renders null); the parent consumes its props here and
 * drops it from the emitted tree, so it is never mounted. Children is walked
 * manually (no React.Children dependency) — handles a single element or array.
 */
function findLinearGradient(children?: ReactNode): LinearGradientProps | null {
  if (children == null || typeof children === "boolean") return null;
  const arr: ReadonlyArray<unknown> = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    const el = c as { type?: unknown; props?: LinearGradientProps };
    if (el && el.type === LinearGradient && el.props) {
      return el.props;
    }
  }
  return null;
}

/**
 * Normalize a shape's {@link GraphicProps} into the `{fill?, stroke?, …}`
 * scalars the skity intrinsic tags accept. `color` is run through `parseColor`
 * and routed to `fill` or `stroke` by `style` (default `"fill"`); `strokeCap`/
 * `strokeJoin` are mapped to enum bytes. A child `<LinearGradient>` is
 * serialized to base64 Gradient bytes and emitted as `fillGradient` (spike:
 * fill only). `blendMode`/`zIndex` are intentionally dropped (not honored
 * natively yet). A `color`-less, gradient-less shape resolves to an empty
 * object, so the native side draws nothing.
 */
export function resolvePaint(props: GraphicProps, children?: ReactNode): ResolvedPaint {
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

  // Child <LinearGradient> → base64 Gradient bytes (spike: fill only).
  const grad = findLinearGradient(children);
  if (grad !== null) {
    out.fillGradient = bytesToBase64(buildLinearGradient(grad));
  }

  // blendMode / zIndex are accepted on GraphicProps but not honored natively
  // today (caveat); intentionally dropped here.

  return out;
}
