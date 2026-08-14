// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke + child shaders)
// into the {fill?, stroke?, fillGradient?, ...} scalars the skity intrinsic
// tags accept. Colors are packed 0xAARRGGBB; strokeCap/strokeJoin are enum
// bytes; a child gradient shader (<LinearGradient>/<RadialGradient>/
// <SweepGradient>) is serialized to base64 Gradient bytes. All
// string/value resolution is delegated to @lynx-skity/graphics; the native side
// never parses strings.

import {
  buildLinearGradient,
  buildRadialGradient,
  buildSweepGradient,
  bytesToBase64,
  parseColor,
  parseStrokeCap,
  parseStrokeJoin,
} from "@lynx-skity/graphics";
import type { ReactNode } from "@lynx-js/react";

import { LinearGradient } from "../shaders/LinearGradient";
import { RadialGradient } from "../shaders/RadialGradient";
import { SweepGradient } from "../shaders/SweepGradient";
import type {
  GraphicProps,
  LinearGradientProps,
  RadialGradientProps,
  SweepGradientProps,
} from "../types";

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
 * A child shader recognized by {@link findShaderChild}: which gradient
 * component was found, plus its props (consumed by the matching builder).
 */
type ShaderChild =
  | { kind: "linear"; props: LinearGradientProps }
  | { kind: "radial"; props: RadialGradientProps }
  | { kind: "sweep"; props: SweepGradientProps };

/**
 * Find the first gradient child (`<LinearGradient>`/`<RadialGradient>`/
 * `<SweepGradient>`) and return its kind + props. Shader components are
 * data-only (render null); the parent consumes their props here and drops them
 * from the emitted tree, so they are never mounted. Children is walked manually
 * (no React.Children dependency) — handles a single element or array.
 */
function findShaderChild(children?: ReactNode): ShaderChild | null {
  if (children == null || typeof children === "boolean") return null;
  const arr: ReadonlyArray<unknown> = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    const el = c as { type?: unknown; props?: never };
    if (!el || !el.props) continue;
    if (el.type === LinearGradient)
      return { kind: "linear", props: el.props as LinearGradientProps };
    if (el.type === RadialGradient)
      return { kind: "radial", props: el.props as RadialGradientProps };
    if (el.type === SweepGradient) return { kind: "sweep", props: el.props as SweepGradientProps };
  }
  return null;
}

/**
 * Serialize a recognized gradient child into base64 Gradient bytes (the native
 * `fillGradient` prop channel).
 */
function gradientBytes(shader: ShaderChild): string {
  switch (shader.kind) {
    case "linear":
      return bytesToBase64(buildLinearGradient(shader.props));
    case "radial":
      return bytesToBase64(buildRadialGradient(shader.props));
    case "sweep":
      return bytesToBase64(buildSweepGradient(shader.props));
  }
}

/**
 * Normalize a shape's {@link GraphicProps} into the `{fill?, stroke?, …}`
 * scalars the skity intrinsic tags accept. `color` is run through `parseColor`
 * and routed to `fill` or `stroke` by `style` (default `"fill"`); `strokeCap`/
 * `strokeJoin` are mapped to enum bytes. A child gradient shader is
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

  // Child gradient (<LinearGradient>/<RadialGradient>/<SweepGradient>) →
  // base64 Gradient bytes (spike: fill only).
  const shader = findShaderChild(children);
  if (shader !== null) {
    out.fillGradient = gradientBytes(shader);
  }

  // blendMode / zIndex are accepted on GraphicProps but not honored natively
  // today (caveat); intentionally dropped here.

  return out;
}
