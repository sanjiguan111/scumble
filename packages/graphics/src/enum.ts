// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Paint-enum types + byte mapping for gesso.
 *
 * The friendly string-literal types are what the React/Vue component props accept — they give
 * compile-time autocomplete on `strokeCap="round"` etc. The parse* functions do
 * the runtime mapping to skityrt FlatBuffer enum bytes (LineCap / LineJoin /
 * FillRule); they take a loose `string | number` so they tolerate any case and
 * pass numbers through, like the native SkityPropParser they replace.
 */

/**
 * Cap style for the start and end of an open stroke. Maps to `skityrt.LineCap`.
 *
 * - `"butt"` — cut square at the endpoint, no extension.
 * - `"round"` — capped with a semicircle of radius `strokeWidth / 2`.
 * - `"square"` — cut square but extended by `strokeWidth / 2`.
 */
export type StrokeCap = "butt" | "round" | "square";

/**
 * Join style for the corners of a stroke. Maps to `skityrt.LineJoin`.
 *
 * - `"miter"` — sharp corner (clamped by `strokeMiter`).
 * - `"round"` — rounded corner.
 * - `"bevel"` — flat beveled corner.
 */
export type StrokeJoin = "miter" | "round" | "bevel";

/**
 * Fill rule for overlapping subpaths. Maps to `skityrt.FillRule`.
 *
 * - `"nonzero"` — a point is inside when the path's winding number is non-zero.
 * - `"evenodd"` — a point is inside when a ray crosses an odd number of edges.
 *   (Also accepts the hyphenated `"even-odd"` and underscored `"even_odd"` spellings.)
 */
export type FillRule = "nonzero" | "evenodd";

/**
 * Resolve a {@link StrokeCap} (or its raw byte) to the `LineCap` enum byte the
 * native side expects: `BUTT=0`, `ROUND=1`, `SQUARE=2`. Case-insensitive;
 * numbers pass through masked to a byte.
 *
 * @example
 * parseStrokeCap("round");  // 1
 * parseStrokeCap(2);        // 2
 */
export function parseStrokeCap(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  const s = v.toLowerCase();
  return s === "round" ? 1 : s === "square" ? 2 : 0;
}

/**
 * Resolve a {@link StrokeJoin} (or its raw byte) to the `LineJoin` enum byte:
 * `MITER=0`, `ROUND=1`, `BEVEL=2`. Case-insensitive; numbers pass through.
 *
 * @example
 * parseStrokeJoin("bevel");  // 2
 */
export function parseStrokeJoin(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  const s = v.toLowerCase();
  return s === "round" ? 1 : s === "bevel" ? 2 : 0;
}

/**
 * Resolve a {@link FillRule} (or its raw byte) to the `FillRule` enum byte:
 * `NONZERO=0`, `EVENODD=1`. Recognizes `"evenodd"` plus the hyphenated /
 * hyphenated / underscored spellings (`"even-odd"`, `"even_odd"`), so either maps to `EVENODD` instead of silently falling back to `NONZERO`.
 * Case-insensitive; numbers pass through.
 *
 * @example
 * parseFillRule("evenodd");   // 1
 * parseFillRule("even-odd");  // 1 (hyphenated spelling)
 */
export function parseFillRule(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return v.toLowerCase().replace(/[-_]/g, "") === "evenodd" ? 1 : 0;
}

/**
 * The friendly blend-mode literals (Skia/Skity's 28 modes, kebab-case) — the
 * runtime keys of {@link parseBlendMode}. Value order matches
 * `skityrt.BlendMode` / `skity::BlendMode`.
 */
export type BlendModeLiteral =
  | "clear"
  | "src"
  | "dst"
  | "src-over"
  | "dst-over"
  | "src-in"
  | "dst-in"
  | "src-out"
  | "dst-out"
  | "src-atop"
  | "dst-atop"
  | "xor"
  | "plus"
  | "modulate"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "multiply"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

const BLEND_MODE_BYTES: Record<string, number> = {
  clear: 0,
  src: 1,
  dst: 2,
  "src-over": 3,
  "dst-over": 4,
  "src-in": 5,
  "dst-in": 6,
  "src-out": 7,
  "dst-out": 8,
  "src-atop": 9,
  "dst-atop": 10,
  xor: 11,
  plus: 12,
  modulate: 13,
  screen: 14,
  overlay: 15,
  darken: 16,
  lighten: 17,
  "color-dodge": 18,
  "color-burn": 19,
  "hard-light": 20,
  "soft-light": 21,
  difference: 22,
  exclusion: 23,
  multiply: 24,
  hue: 25,
  saturation: 26,
  color: 27,
  luminosity: 28,
};

/**
 * Resolve a {@link BlendModeLiteral} (or its raw byte) to the `BlendMode` enum
 * byte the native side expects (`skityrt.BlendMode` == `skity::BlendMode`
 * order). Case-insensitive; numbers pass through masked to a byte; an unknown
 * string falls back to `SRC_OVER` (3).
 *
 * @example
 * parseBlendMode("multiply");  // 24
 * parseBlendMode("src-in");    // 5
 */
export function parseBlendMode(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return BLEND_MODE_BYTES[v.toLowerCase()] ?? 3;
}

/**
 * How a bitmap is inscribed into its destination rect (the CSS object-fit family). The renderer resolves it against the bitmap's
 * intrinsic size at draw time.
 */
export type Fit = "cover" | "contain" | "fill" | "fitHeight" | "fitWidth" | "none" | "scaleDown";

/** `Fit` literal → `skityrt.BoxFit` byte (command_batch.fbs value order). */
const FIT_BYTES: Record<string, number> = {
  fill: 0,
  contain: 1,
  cover: 2,
  fitwidth: 3,
  fitheight: 4,
  none: 5,
  scaledown: 6,
};

/**
 * Resolve a {@link Fit} literal (or its raw byte) to the `BoxFit` byte the
 * native side expects. Case-insensitive (the camelCase keys are matched
 * lowercased); numbers pass through masked to a byte; an unknown string falls
 * back to `CONTAIN` (1) — the `<Image>` default.
 *
 * @example
 * parseFit("cover");      // 2
 * parseFit("scaleDown");  // 6
 */
export function parseFit(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return FIT_BYTES[v.toLowerCase()] ?? 1;
}

/**
 * How image texels are sampled when scaled (the `sampling.filter` /
 * `sampling.mipmap` axes of Skia's `SkSamplingOptions`).
 */
export type ImageFilterMode = "nearest" | "linear";
export type ImageMipmapMode = "none" | "nearest" | "linear";

/** Mitchell/Robinson cubic resampler weights. `B == 0 && C == 0` disables cubic sampling. */
export interface ImageCubicResampler {
  B: number;
  C: number;
}

/** Sampling knobs for `<Image>`; every axis is optional and defaults to the pre-sampling hardcoded behavior. */
export interface ImageSamplingOptions {
  filter?: ImageFilterMode;
  mipmap?: ImageMipmapMode;
  cubic?: ImageCubicResampler;
}

/** `ImageFilterMode` literal → `skityrt.ImageFilterMode` byte (command_batch.fbs value order == skity). */
const IMAGE_FILTER_MODE_BYTES: Record<string, number> = {
  nearest: 0,
  linear: 1,
};

/** `ImageMipmapMode` literal → `skityrt.ImageMipmapMode` byte (command_batch.fbs value order == skity). */
const IMAGE_MIPMAP_MODE_BYTES: Record<string, number> = {
  none: 0,
  nearest: 1,
  linear: 2,
};

/**
 * Resolve an {@link ImageFilterMode} literal (or its raw byte) to the
 * `ImageFilterMode` byte the native side expects. Case-insensitive; numbers
 * pass through masked to a byte; an unknown string falls back to `LINEAR` (1)
 * — the `<Image>` default.
 *
 * @example
 * parseImageFilterMode("nearest");  // 0
 */
export function parseImageFilterMode(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return IMAGE_FILTER_MODE_BYTES[v.toLowerCase()] ?? 1;
}

/**
 * Resolve an {@link ImageMipmapMode} literal (or its raw byte) to the
 * `ImageMipmapMode` byte the native side expects. Case-insensitive; numbers
 * pass through masked to a byte; an unknown string falls back to `NONE` (0)
 * — the `<Image>` default.
 *
 * @example
 * parseImageMipmapMode("linear");  // 2
 */
export function parseImageMipmapMode(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return IMAGE_MIPMAP_MODE_BYTES[v.toLowerCase()] ?? 0;
}

/**
 * How an image shader tiles outside its fitted rect (Skia's SkTileMode
 * family; also applies to gradient spread).
 */
export type TileMode = "clamp" | "repeat" | "mirror" | "decal";

/** `TileMode` literal → `skityrt.TileMode` byte (command_batch.fbs value order == skity). */
const TILE_MODE_BYTES: Record<string, number> = {
  clamp: 0,
  repeat: 1,
  mirror: 2,
  decal: 3,
};

/**
 * Resolve a {@link TileMode} literal (or its raw byte) to the `TileMode` byte
 * the native side expects. Case-insensitive; numbers pass through masked to a
 * byte; an unknown string falls back to `CLAMP` (0) — the `<ImageShader>`
 * default.
 *
 * @example
 * parseTileMode("decal");  // 3
 */
export function parseTileMode(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return TILE_MODE_BYTES[v.toLowerCase()] ?? 0;
}

/**
 * Serialize an image-shader destination rect to the `"x,y,w,h"` string the
 * native prop channel expects (same shape as the dash intervals string).
 * `undefined` in, `undefined` out (identity — 1:1 tiling at the bitmap's
 * intrinsic size).
 *
 * @example
 * formatImageRect({x: 10, y: 20, width: 30, height: 40});  // "10,20,30,40"
 */
export function formatImageRect(
  rect: { x?: number; y?: number; width: number; height: number } | undefined,
): string | undefined {
  if (rect === undefined) return undefined;
  return `${rect.x ?? 0},${rect.y ?? 0},${rect.width},${rect.height}`;
}
