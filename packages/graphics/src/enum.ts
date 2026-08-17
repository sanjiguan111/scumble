// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Paint-enum types + byte mapping for lynx-skity.
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
