// Copyright 2026 The Lynx Authors. All rights reserved.
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

/** Cap style for the start and end of a stroke. Maps to skityrt.LineCap. */
export type StrokeCap = "butt" | "round" | "square";

/** Join style for the corners of a stroke. Maps to skityrt.LineJoin. */
export type StrokeJoin = "miter" | "round" | "bevel";

/** Fill rule for overlapping subpaths. Maps to skityrt.FillRule. */
export type FillRule = "nonzero" | "evenodd";

/** StrokeCap string/number → LineCap byte (BUTT=0, ROUND=1, SQUARE=2). */
export function parseStrokeCap(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  const s = v.toLowerCase();
  return s === "round" ? 1 : s === "square" ? 2 : 0;
}

/** StrokeJoin string/number → LineJoin byte (MITER=0, ROUND=1, BEVEL=2). */
export function parseStrokeJoin(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  const s = v.toLowerCase();
  return s === "round" ? 1 : s === "bevel" ? 2 : 0;
}

/** FillRule string/number → FillRule byte (NONZERO=0, EVENODD=1). */
export function parseFillRule(v: string | number): number {
  if (typeof v === "number") return v & 0xff;
  return v.toLowerCase() === "evenodd" ? 1 : 0;
}
