// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Normalizes a shape's GraphicProps (color + style + stroke + child shaders)
// into the {fill?, stroke?, fillGradient?, ...} scalars the skity intrinsic
// tags accept. Colors are packed 0xAARRGGBB; strokeCap/strokeJoin are enum
// bytes; a child gradient shader (<LinearGradient>/<RadialGradient>/
// <SweepGradient>) is serialized to base64 Gradient bytes, and a child
// <ImageShader> flattens to uri/fit/tx/ty/rect props. All
// string/value resolution is delegated to @scumble/graphics; the native side
// never parses strings.

import {
  buildColorFilter,
  buildImageFilter,
  buildLinearGradient,
  buildMaskFilter,
  buildMultiPaint,
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
} from "@scumble/graphics";
import type { FilterSpec, PaintPassSpec } from "@scumble/graphics";
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
  GroupLayer,
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
  /**
   * Base64 MultiPaintList bytes — the multi-pass channel (RN-Skia
   * multi-`<Paint>` semantics). When non-empty, the node draws its geometry
   * once per pass with fully independent paint state instead of the fixed
   * fill+stroke double pass, and the single-slot props above are unused.
   * `""` clears (falls back to the single-slot paints); the native setter
   * treats null as a no-op like every other paint prop.
   */
  multiPaint?: string;
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
 * Find the `<Paint>` children (data-only, declarative paint overrides) in
 * declaration order. The single-slot channel reduces this to one entry per
 * style (last wins); the multi-pass channel keeps every entry.
 */
function findPaintChildren(children?: ReactNode): PaintProps[] {
  const found: PaintProps[] = [];
  for (const el of childElements(children)) {
    if (el.type === Paint) found.push(el.props as PaintProps);
  }
  return found;
}

/**
 * Serialize a recognized gradient child into raw Gradient bytes (the shared
 * payload behind both the base64 `fillGradient`/`strokeGradient` prop channel
 * and the multi-pass blob).
 */
function rawGradient(shader: Exclude<ShaderChild, { kind: "image" }>): ArrayBuffer {
  switch (shader.kind) {
    case "linear":
      return buildLinearGradient(shader.props);
    case "radial":
      return buildRadialGradient(shader.props);
    case "sweep":
      return buildSweepGradient(shader.props);
    case "conical":
      return buildTwoPointConicalGradient(shader.props);
  }
}

/**
 * Serialize a recognized gradient child into base64 Gradient bytes (the native
 * `fillGradient` prop channel).
 */
function gradientBytes(shader: Exclude<ShaderChild, { kind: "image" }>): string {
  return bytesToBase64(rawGradient(shader));
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
 * Build the three filter-slot payloads (raw Filter bytes) from specs: image
 * filters (blur/dropShadow) compose in declaration order, color filters
 * (colorMatrix/colorBlend) likewise, and the mask filter takes the first
 * maskBlur. Empty kinds leave the slot unset.
 */
function filterSlotRaw(specs: FilterSpec[]): {
  image?: ArrayBuffer;
  color?: ArrayBuffer;
  mask?: ArrayBuffer;
} {
  const out: { image?: ArrayBuffer; color?: ArrayBuffer; mask?: ArrayBuffer } = {};
  const image = buildImageFilter(specs);
  if (image !== null) out.image = image;
  const color = buildColorFilter(specs);
  if (color !== null) out.color = color;
  const mask = buildMaskFilter(specs);
  if (mask !== null) out.mask = mask;
  return out;
}

/**
 * Build the three filter-slot payloads (base64 Filter bytes) from specs:
 * image filters (blur/dropShadow) compose in declaration order, color filters
 * (colorMatrix/colorBlend) likewise, and the mask filter takes the first
 * maskBlur. Empty kinds leave the slot unset.
 */
function filterSlotBytes(specs: FilterSpec[]): { image?: string; color?: string; mask?: string } {
  const raw = filterSlotRaw(specs);
  const out: { image?: string; color?: string; mask?: string } = {};
  if (raw.image !== undefined) out.image = bytesToBase64(raw.image);
  if (raw.color !== undefined) out.color = bytesToBase64(raw.color);
  if (raw.mask !== undefined) out.mask = bytesToBase64(raw.mask);
  return out;
}

/**
 * Serialize the filter specs onto one paint slot (`fill`/`stroke`): image
 * filters (blur/dropShadow) compose in declaration order, color filters
 * (colorMatrix/colorBlend) likewise, and the mask filter takes the first
 * maskBlur. Empty kinds leave the slot unset.
 */
function applyFilterProps(out: ResolvedPaint, specs: FilterSpec[], slot: "fill" | "stroke"): void {
  const bytes = filterSlotBytes(specs);
  if (bytes.image !== undefined) out[`${slot}ImageFilter`] = bytes.image;
  if (bytes.color !== undefined) out[`${slot}ColorFilter`] = bytes.color;
  if (bytes.mask !== undefined) out[`${slot}MaskFilter`] = bytes.mask;
}

/**
 * The layer-effect slice of the group intrinsic props — the output shape of
 * {@link resolveLayerEffect}. `layerForce` is the "composite the subtree
 * offscreen" flag; the three filter slots ride the LAYER composite (skity
 * saveLayer paint), not the per-shape paint inheritance.
 */
export interface ResolvedLayerEffect {
  layerForce?: boolean;
  layerColorFilter?: string;
  layerImageFilter?: string;
  layerMaskFilter?: string;
}

/**
 * Resolve {@link GroupProps.layer} (RN-Skia `<Group layer>`) into the
 * `layerForce` + three base64 Filter props. `true` forces an offscreen
 * composite with no effects; a `<Paint>` element additionally carries its
 * FILTER children onto the layer composite (its other props are ignored —
 * the layer alpha is the Group's own `opacity`). `false` clears explicitly
 * (full state: force off + empty slots) — removing the prop alone leaves the
 * native state alone, because Lynx fires the setters with null on
 * prop removal and null is a no-op. A non-`<Paint>` element is ignored.
 */
export function resolveLayerEffect(layer?: GroupLayer): ResolvedLayerEffect {
  if (layer === undefined) return {};
  if (layer === true) return { layerForce: true };
  if (layer === false)
    return { layerForce: false, layerColorFilter: "", layerImageFilter: "", layerMaskFilter: "" };
  const el = childElements(layer).find((e) => e.type === Paint);
  if (el == null) return {};
  const bytes = filterSlotBytes(findFilterSpecs((el.props as PaintProps).children));
  return {
    layerForce: true,
    layerColorFilter: bytes.color,
    layerImageFilter: bytes.image,
    layerMaskFilter: bytes.mask,
  };
}

// ---- multi-pass channel (RN-Skia multi-<Paint> semantics, F.1.3) ----

/**
 * True when the declarative paints must ride the multi-pass channel instead
 * of the single-slot one: several `<Paint>` declarations of the same style
 * (only the last could survive the single slot), or any declaration carrying
 * its own `opacity` (the single slot shares opacity between fill and stroke).
 */
function needsMultiPaint(paints: PaintProps[]): boolean {
  if (paints.some((p) => p.opacity !== undefined)) return true;
  const seen = new Set<"fill" | "stroke">();
  for (const p of paints) {
    const style = p.style ?? "fill";
    if (seen.has(style)) return true;
    seen.add(style);
  }
  return false;
}

/** Fill the shader fields of one pass from a recognized shader child. */
function applyShaderToPass(pass: PaintPassSpec, shader: ShaderChild): void {
  if (shader.kind !== "image") {
    pass.gradient = rawGradient(shader);
    return;
  }
  const { image, fit = "contain", tx = "clamp", ty = "clamp", rect } = shader.props;
  const uri =
    image == null || (typeof image === "string" && image.length === 0)
      ? ""
      : typeof image === "string"
        ? image
        : image.uri;
  pass.image = {
    uri,
    fit: parseFit(fit),
    tx: parseTileMode(tx),
    ty: parseTileMode(ty),
    rect: rect === undefined ? undefined : [rect.x ?? 0, rect.y ?? 0, rect.width, rect.height],
  };
}

/**
 * Build the multi-pass payload (`""` when there are no passes). The base pass
 * comes first — the shape's OWN paint props (color / shader / filters), only
 * when it declares any — then one pass per `<Paint>` child in declaration
 * order. Each pass starts from the shape's stroke/dash/opacity/blendMode
 * defaults and overrides only what its source declares (the same
 * partial-override rule as the single-slot channel).
 */
function multiPaintProp(
  props: GraphicProps,
  children: ReactNode,
  paints: PaintProps[],
  defaultStyle: "fill" | "stroke",
): string {
  const { color, style = defaultStyle } = props;
  const shader = findShaderChild(children);
  const filterSpecs = findFilterSpecs(children);
  const hasBase = color !== undefined || shader !== null || filterSpecs.length > 0;

  const passes: PaintPassSpec[] = [];

  if (hasBase) {
    const base: PaintPassSpec = { style };
    if (color !== undefined) base.color = parseColor(color);
    if (shader !== null) applyShaderToPass(base, shader);
    if (props.strokeWidth !== undefined) base.strokeWidth = props.strokeWidth;
    if (props.strokeCap !== undefined) base.strokeCap = parseStrokeCap(props.strokeCap);
    if (props.strokeJoin !== undefined) base.strokeJoin = parseStrokeJoin(props.strokeJoin);
    if (props.strokeMiter !== undefined) base.strokeMiter = props.strokeMiter;
    if (props.dash !== undefined) base.dash = normalizeDash(props.dash);
    if (props.dashOffset !== undefined) base.dashOffset = props.dashOffset;
    if (props.opacity !== undefined) base.opacity = props.opacity;
    if (props.blendMode !== undefined) base.blendMode = parseBlendMode(props.blendMode);
    if (filterSpecs.length > 0) {
      const bytes = filterSlotRaw(filterSpecs);
      if (bytes.image !== undefined) base.imageFilter = bytes.image;
      if (bytes.color !== undefined) base.colorFilter = bytes.color;
      if (bytes.mask !== undefined) base.maskFilter = bytes.mask;
    }
    passes.push(base);
  }

  for (const p of paints) {
    const pass: PaintPassSpec = { style: p.style ?? "fill" };
    if (p.color !== undefined) pass.color = parseColor(p.color);
    if (p.strokeWidth !== undefined) pass.strokeWidth = p.strokeWidth;
    else if (props.strokeWidth !== undefined) pass.strokeWidth = props.strokeWidth;
    if (p.strokeCap !== undefined) pass.strokeCap = parseStrokeCap(p.strokeCap);
    else if (props.strokeCap !== undefined) pass.strokeCap = parseStrokeCap(props.strokeCap);
    if (p.strokeJoin !== undefined) pass.strokeJoin = parseStrokeJoin(p.strokeJoin);
    else if (props.strokeJoin !== undefined) pass.strokeJoin = parseStrokeJoin(props.strokeJoin);
    if (p.strokeMiter !== undefined) pass.strokeMiter = p.strokeMiter;
    else if (props.strokeMiter !== undefined) pass.strokeMiter = props.strokeMiter;
    if (p.dash !== undefined) pass.dash = normalizeDash(p.dash);
    else if (props.dash !== undefined) pass.dash = normalizeDash(props.dash);
    if (p.dashOffset !== undefined) pass.dashOffset = p.dashOffset;
    else if (props.dashOffset !== undefined) pass.dashOffset = props.dashOffset;
    if (p.opacity !== undefined) pass.opacity = p.opacity;
    else if (props.opacity !== undefined) pass.opacity = props.opacity;
    if (p.blendMode !== undefined) pass.blendMode = parseBlendMode(p.blendMode);
    else if (props.blendMode !== undefined) pass.blendMode = parseBlendMode(props.blendMode);
    const pShader = findShaderChild(p.children);
    if (pShader !== null) applyShaderToPass(pass, pShader);
    const pFilters = findFilterSpecs(p.children);
    if (pFilters.length > 0) {
      const bytes = filterSlotRaw(pFilters);
      if (bytes.image !== undefined) pass.imageFilter = bytes.image;
      if (bytes.color !== undefined) pass.colorFilter = bytes.color;
      if (bytes.mask !== undefined) pass.maskFilter = bytes.mask;
    }
    passes.push(pass);
  }

  const bytes = buildMultiPaint(passes);
  return bytes === null ? "" : bytesToBase64(bytes);
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

  // Multi-pass channel: several paints of the same style, or any paint with
  // its own opacity — the shape's geometry draws once per pass with fully
  // independent paint state (base64 MultiPaintList bytes; the single-slot
  // props are left unset so the node doesn't double-draw). Every other shape
  // carries `multiPaint: ""` so a multi→single transition clears natively
  // (prop removal fires the setter with null, which is a no-op).
  const paints = findPaintChildren(children);
  if (needsMultiPaint(paints)) {
    return { multiPaint: multiPaintProp(props, children ?? null, paints, defaultStyle) };
  }
  out.multiPaint = "";

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
  // properties the <Paint> actually declares are overridden. (Here the list
  // is already reduced to ≤1 per style — the multi-pass branch above returned
  // when that didn't hold.)
  const paintsByStyle: Partial<Record<"fill" | "stroke", PaintProps>> = {};
  for (const p of paints) paintsByStyle[p.style ?? "fill"] = p;
  for (const target of ["fill", "stroke"] as const) {
    const p = paintsByStyle[target];
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
