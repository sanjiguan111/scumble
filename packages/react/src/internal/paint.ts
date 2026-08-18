// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke + child shaders)
// into the {fill?, stroke?, fillGradient?, ...} scalars the skity intrinsic
// tags accept. Colors are packed 0xAARRGGBB; strokeCap/strokeJoin are enum
// bytes; a child gradient shader (<LinearGradient>/<RadialGradient>/
// <SweepGradient>) is serialized to base64 Gradient bytes, and a child
// <ImageShader> flattens to uri/fit/tx/ty/rect props. All
// string/value resolution is delegated to @lynx-skity/graphics; the native side
// never parses strings.

import {
  buildColorFilter,
  buildImageFilter,
  buildLinearGradient,
  buildMaskFilter,
  buildRadialGradient,
  buildSweepGradient,
  buildTwoPointConicalGradient,
  bytesToBase64,
  floatsToBase64,
  formatImageRect,
  parseBlendMode,
  parseColor,
  parseFit,
  parseStrokeCap,
  parseStrokeJoin,
  parseTileMode,
} from "@lynx-skity/graphics";
import type { FilterSpec } from "@lynx-skity/graphics";
import type { ReactNode } from "@lynx-js/react";

import { Blur, ColorBlend, ColorMatrix, DropShadow, MaskBlur } from "../filters/filters";
import { ImageShader } from "../shaders/ImageShader";
import { LinearGradient } from "../shaders/LinearGradient";
import { RadialGradient } from "../shaders/RadialGradient";
import { SweepGradient } from "../shaders/SweepGradient";
import { TwoPointConicalGradient } from "../shaders/TwoPointConicalGradient";
import { Paint } from "../Paint";
import type {
  BlurProps,
  ColorBlendProps,
  ColorMatrixProps,
  DropShadowProps,
  GraphicProps,
  ImageShaderProps,
  LinearGradientProps,
  MaskBlurProps,
  PaintProps,
  RadialGradientProps,
  SweepGradientProps,
  TwoPointConicalGradientProps,
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
  /** Base64 little-endian float32 dash intervals; `""` clears (solid stroke). */
  strokeDash?: string;
  /** Phase offset into the dash pattern (px). */
  strokeDashOffset?: number;
  /** Blend mode byte (skityrt::BlendMode); shared by the fill and stroke paints. */
  blendMode?: number;
  /** Base64 Filter bytes — the paint's color/image/mask filter slots. */
  fillColorFilter?: string;
  strokeColorFilter?: string;
  fillImageFilter?: string;
  strokeImageFilter?: string;
  fillMaskFilter?: string;
  strokeMaskFilter?: string;
  /** Image shader slots (an image as the paint's texture). The uri doubles as
   *  the ImageStore key and the platform loader request ("" clears the slot);
   *  fit/tx/ty are enum bytes; rect is the "x,y,w,h" string (undefined =
   *  identity, 1:1 tiling at the bitmap's intrinsic size). */
  fillImageUri?: string;
  fillImageFit?: number;
  fillImageTx?: number;
  fillImageTy?: number;
  fillImageRect?: string;
  strokeImageUri?: string;
  strokeImageFit?: number;
  strokeImageTx?: number;
  strokeImageTy?: number;
  strokeImageRect?: string;
}

/**
 * Normalize dash intervals to what skity's MakeDashPathEffect accepts: an even
 * count (an odd array is repeated once, SVG `stroke-dasharray` semantics) with
 * non-negative values and a positive sum. Returns `[]` for an invalid pattern
 * (natively: no vector → solid stroke).
 */
function normalizeDash(dash: number[]): number[] {
  const intervals = dash.length % 2 === 0 ? dash.slice() : dash.concat(dash);
  if (intervals.length < 2) return [];
  let sum = 0;
  for (const v of intervals) {
    if (!Number.isFinite(v) || v < 0) return [];
    sum += v;
  }
  return sum > 0 ? intervals : [];
}

/**
 * A child shader recognized by {@link findShaderChild}: which gradient
 * component was found, plus its props (consumed by the matching builder).
 */
type ShaderChild =
  | { kind: "linear"; props: LinearGradientProps }
  | { kind: "radial"; props: RadialGradientProps }
  | { kind: "sweep"; props: SweepGradientProps }
  | { kind: "conical"; props: TwoPointConicalGradientProps }
  | { kind: "image"; props: ImageShaderProps };

/**
 * Find the first shader child (`<LinearGradient>`/`<RadialGradient>`/
 * `<SweepGradient>`/`<TwoPointConicalGradient>`/`<ImageShader>`) and return its
 * kind + props. Shader components are
 * data-only (render null); the parent consumes their props here and drops them
 * from the emitted tree, so they are never mounted. Children is walked manually
 * (no React.Children dependency) — handles a single element or array.
 */
function findShaderChild(children?: ReactNode): ShaderChild | null {
  for (const el of childElements(children)) {
    if (el.type === LinearGradient)
      return { kind: "linear", props: el.props as LinearGradientProps };
    if (el.type === RadialGradient)
      return { kind: "radial", props: el.props as RadialGradientProps };
    if (el.type === SweepGradient) return { kind: "sweep", props: el.props as SweepGradientProps };
    if (el.type === TwoPointConicalGradient)
      return { kind: "conical", props: el.props as TwoPointConicalGradientProps };
    if (el.type === ImageShader) return { kind: "image", props: el.props as ImageShaderProps };
  }
  return null;
}

/** A child element candidate: its component type + declared props (untyped —
 * callers cast `props` to the component's props interface). */
export interface ChildElement {
  type: unknown;
  props: unknown;
}

/** Iterate a ReactNode children value as {@link ChildElement} candidates
 * (data-only components like `<Paint>`/`<LinearGradient>`/`<ClipRect>` are
 * identified by `type` and read via `props`). Shared with internal/clip.ts. */
export function childElements(children?: ReactNode): ChildElement[] {
  if (children == null || typeof children === "boolean") return [];
  const arr: ReadonlyArray<unknown> = Array.isArray(children) ? children : [children];
  const els: ChildElement[] = [];
  for (const c of arr) {
    const el = c as { type?: unknown; props?: unknown };
    if (el && el.props) els.push({ type: el.type, props: el.props });
  }
  return els;
}

/**
 * Find the `<Paint>` children (data-only, declarative paint
 * overrides). Returns at most one entry per style — fill and stroke — with a
 * later declaration of the same style winning.
 */
function findPaintChildren(children?: ReactNode): Partial<Record<"fill" | "stroke", PaintProps>> {
  const found: Partial<Record<"fill" | "stroke", PaintProps>> = {};
  for (const el of childElements(children)) {
    if (el.type === Paint) {
      const props = el.props as PaintProps;
      found[props.style ?? "fill"] = props;
    }
  }
  return found;
}

/**
 * Serialize a recognized gradient child into base64 Gradient bytes (the native
 * `fillGradient` prop channel).
 */
function gradientBytes(shader: Exclude<ShaderChild, { kind: "image" }>): string {
  switch (shader.kind) {
    case "linear":
      return bytesToBase64(buildLinearGradient(shader.props));
    case "radial":
      return bytesToBase64(buildRadialGradient(shader.props));
    case "sweep":
      return bytesToBase64(buildSweepGradient(shader.props));
    case "conical":
      return bytesToBase64(buildTwoPointConicalGradient(shader.props));
  }
}

/**
 * Route a recognized shader child onto one paint slot (`fill`/`stroke`):
 * gradients serialize to base64 Gradient bytes; the image shader flattens to
 * the intrinsic uri/fit/tx/ty/rect props (an empty image clears the slot).
 */
function applyShader(out: ResolvedPaint, shader: ShaderChild, slot: "fill" | "stroke"): void {
  if (shader.kind !== "image") {
    out[`${slot}Gradient`] = gradientBytes(shader);
    return;
  }
  const { image, fit = "contain", tx = "clamp", ty = "clamp", rect } = shader.props;
  // null/empty image → "" → the native setter clears the slot.
  const uri =
    image == null || (typeof image === "string" && image.length === 0)
      ? ""
      : typeof image === "string"
        ? image
        : image.uri;
  out[`${slot}ImageUri`] = uri;
  out[`${slot}ImageFit`] = parseFit(fit);
  out[`${slot}ImageTx`] = parseTileMode(tx);
  out[`${slot}ImageTy`] = parseTileMode(ty);
  const rectStr = formatImageRect(rect);
  if (rectStr !== undefined) out[`${slot}ImageRect`] = rectStr;
}

/** Map one filter child element to its FilterSpec (null for non-filters). */
function filterSpec(el: ChildElement): FilterSpec | null {
  if (el.type === Blur) return { kind: "blur", blur: (el.props as BlurProps).blur };
  if (el.type === DropShadow) {
    const p = el.props as DropShadowProps;
    return { kind: "dropShadow", dx: p.dx, dy: p.dy, blur: p.blur, color: p.color };
  }
  if (el.type === ColorMatrix) {
    return { kind: "colorMatrix", matrix: (el.props as ColorMatrixProps).matrix };
  }
  if (el.type === ColorBlend) {
    const p = el.props as ColorBlendProps;
    return { kind: "colorBlend", color: p.color, mode: p.mode };
  }
  if (el.type === MaskBlur) {
    const p = el.props as MaskBlurProps;
    return { kind: "maskBlur", blur: p.blur, style: p.style };
  }
  return null;
}

/** Collect the filter children's specs, in declaration order. */
function findFilterSpecs(children?: ReactNode): FilterSpec[] {
  const out: FilterSpec[] = [];
  for (const el of childElements(children)) {
    const spec = filterSpec(el);
    if (spec !== null) out.push(spec);
  }
  return out;
}

/**
 * Serialize the filter specs onto one paint slot (`fill`/`stroke`): image
 * filters (blur/dropShadow) compose in declaration order, color filters
 * (colorMatrix/colorBlend) likewise, and the mask filter takes the first
 * maskBlur. Empty kinds leave the slot unset.
 */
function applyFilterProps(out: ResolvedPaint, specs: FilterSpec[], slot: "fill" | "stroke"): void {
  const image = buildImageFilter(specs);
  if (image !== null) out[`${slot}ImageFilter`] = bytesToBase64(image);
  const color = buildColorFilter(specs);
  if (color !== null) out[`${slot}ColorFilter`] = bytesToBase64(color);
  const mask = buildMaskFilter(specs);
  if (mask !== null) out[`${slot}MaskFilter`] = bytesToBase64(mask);
}

/**
 * Normalize a shape's {@link GraphicProps} into the `{fill?, stroke?, …}`
 * scalars the skity intrinsic tags accept. `color` is run through `parseColor`
 * and routed to `fill` or `stroke` by `style` (default `defaultStyle` —
 * `"fill"` for most shapes, `"stroke"` for stroke-only ones like `Line`); a
 * child gradient shader is routed the same way; `strokeCap`/`strokeJoin` are
 * mapped to enum bytes. A declarative `<Paint>` child overrides
 * the paint properties of its `style`, with shaders inside it routed to that
 * paint (`strokeGradient` for `"stroke"`). `blendMode` is mapped to a byte
 * (one mode shared by both paints). `zIndex` is intentionally dropped (not
 * honored natively yet). A `color`-less, gradient-less shape resolves to an
 * empty object, so the native side draws nothing.
 */
export function resolvePaint(
  props: GraphicProps,
  children?: ReactNode,
  defaultStyle: "fill" | "stroke" = "fill",
): ResolvedPaint {
  const {
    color,
    style = defaultStyle,
    strokeWidth,
    strokeCap,
    strokeJoin,
    strokeMiter,
    opacity,
    dash,
    dashOffset,
    blendMode,
  } = props;

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
  if (dash !== undefined) out.strokeDash = floatsToBase64(normalizeDash(dash));
  if (dashOffset !== undefined) out.strokeDashOffset = dashOffset;
  if (blendMode !== undefined) out.blendMode = parseBlendMode(blendMode);

  // Child shader (<LinearGradient>/<RadialGradient>/<SweepGradient>/
  // <ImageShader>/…) placed directly under the shape → routed onto the paint
  // the shape actually draws with (fill, or stroke for stroke-only shapes
  // like Line).
  const shader = findShaderChild(children);
  if (shader !== null) applyShader(out, shader, style);

  // Child filters (<Blur>/<DropShadow>/<ColorMatrix>/<ColorBlend>/<MaskBlur>)
  // route to the same paint the shape draws with — same rule as shaders.
  const filterSpecs = findFilterSpecs(children);
  if (filterSpecs.length > 0) applyFilterProps(out, filterSpecs, style);

  // Declarative <Paint> children override the paint of their
  // style; shaders nested inside route to that paint's gradient slot. Only
  // properties the <Paint> actually declares are overridden.
  const paints = findPaintChildren(children);
  for (const target of ["fill", "stroke"] as const) {
    const p = paints[target];
    if (p === undefined) continue;
    if (p.color !== undefined) out[target] = parseColor(p.color);
    if (p.strokeWidth !== undefined) out.strokeWidth = p.strokeWidth;
    if (p.strokeCap !== undefined) out.strokeCap = parseStrokeCap(p.strokeCap);
    if (p.strokeJoin !== undefined) out.strokeJoin = parseStrokeJoin(p.strokeJoin);
    if (p.strokeMiter !== undefined) out.strokeMiter = p.strokeMiter;
    if (p.dash !== undefined) out.strokeDash = floatsToBase64(normalizeDash(p.dash));
    if (p.dashOffset !== undefined) out.strokeDashOffset = p.dashOffset;
    // One blend mode is shared by both paints natively; the last <Paint>
    // declaration that sets one wins.
    if (p.blendMode !== undefined) out.blendMode = parseBlendMode(p.blendMode);
    const pShader = findShaderChild(p.children);
    if (pShader !== null) {
      applyShader(out, pShader, target);
    }
    const pFilters = findFilterSpecs(p.children);
    if (pFilters.length > 0) applyFilterProps(out, pFilters, target);
  }

  // zIndex is accepted on GraphicProps but not honored natively today
  // (z-order follows tree order); intentionally dropped here.

  return out;
}
