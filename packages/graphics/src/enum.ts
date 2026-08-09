// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Paint-enum types + byte mapping for lynx-skity.
 *
 * The friendly string-literal types (mirroring react-native-skity's
 * renderer/types.ts) are what the React/Vue component props accept — they give
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
 *   (Also accepts the hyphenated `"even-odp"` spelling for react-native-skity parity.)
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
 * underscored spellings (`"even-odp"`, `"even_odd"`) react-native-skity uses,
 * so either maps to `EVENODD` instead of silently falling back to `NONZERO`.
 * Case-insensitive; numbers pass through.
 *
 * @example
 * parseFillRule("evenodd");   // 1
 * parseFillRule("even-odp");  // 1 (react-native-skity spelling)
 */
export function parseFillRule(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return v.toLowerCase().replace(/[-_]/g, "") === "evenodd" ? 1 : 0;
}
