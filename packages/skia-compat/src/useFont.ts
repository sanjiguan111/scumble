// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `useFont` / `matchFont` — the SkFont-shaped font handle. Measurement is
 * backed by `createFontMetrics` (JS-side, synchronous — see
 * @scumble/graphics/font-metrics); the RENDER side is the same source string
 * passed as the span `fontFamily`, so JS math and native layout read the
 * identical bytes.
 *
 * scumble convention (mirroring `useImage`): the handle returns IMMEDIATELY —
 * no null-while-loading phase, no onError. A `data:` URI (or raw bytes) is
 * parsed synchronously on first use and cached per source; a bare family
 * NAME resolves to a metrics-less handle — rendering follows the platform
 * default for it, but width queries throw with guidance (measuring platform
 * system fonts needs the skity table-prefetch lane, not built yet). Pass the
 * font binary (data: URI or `Uint8Array`) for measurable text.
 */

import {
  createFontMetrics,
  type FontMetrics,
  type FontMetricsSource,
  type FontVerticalMetrics,
} from "@scumble/graphics";

import { PaintStyle, type Color, type SkTextStyle } from "./types.js";

/** The used surface of RN-Skia's `SkFont` (the Victory axis/label lane). */
export interface SkFont {
  /** Bound size in px. */
  readonly size: number;
  getSize(): number;
  /** The span `fontFamily` value that renders this font — a data: URI or a family name. */
  readonly fontFamily: string;
  getGlyphIDs(text: string): number[];
  getGlyphWidths(glyphIDs: number[]): number[];
  measureText(text: string): number;
  getTextWidth(text: string): number;
  getVerticalMetrics(): FontVerticalMetrics;
}

const cache = new Map<string, SkFont>();

function buildFont(source: FontMetricsSource | string, size: number): SkFont {
  const key = `${typeof source === "string" ? source : "bytes"}|${size}`;
  if (typeof source === "string") {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const measurable = looksLikeBinarySource(source);
  let metrics: FontMetrics | null = null;
  if (measurable) {
    metrics = createFontMetrics(source as FontMetricsSource);
  }
  const family = typeof source === "string" ? source : "";
  const font: SkFont = {
    size,
    getSize: () => size,
    fontFamily: family,
    getGlyphIDs: (text) => withMetrics(metrics, (m) => m.at(size).getGlyphIDs(text)),
    getGlyphWidths: (ids) => withMetrics(metrics, (m) => m.at(size).getGlyphWidths(ids)),
    measureText: (text) => withMetrics(metrics, (m) => m.at(size).measureText(text)),
    getTextWidth: (text) => withMetrics(metrics, (m) => m.at(size).measureText(text)),
    getVerticalMetrics: () => withMetrics(metrics, (m) => m.at(size).getVerticalMetrics()),
  };
  if (typeof source === "string") cache.set(key, font);
  return font;
}

function withMetrics<T>(metrics: FontMetrics | null, fn: (m: FontMetrics) => T): T {
  if (!metrics) {
    throw new Error(
      "skia-compat: this font handle carries no metrics (a bare family name cannot be measured on the JS side — no JSI channel). Pass the font binary — a data: URI or Uint8Array — to useFont.",
    );
  }
  return fn(metrics);
}

function looksLikeBinarySource(source: FontMetricsSource | string): boolean {
  // A data: URI or raw bytes carry measurable binaries; anything else is a
  // family NAME rendered natively (metrics-less — see the module doc).
  return typeof source !== "string" || source.startsWith("data:");
}

/**
 * Load a font handle. `source` is the same value a `<TextSpan fontFamily>`
 * accepts (data: URI, or bytes via `Uint8Array`/`ArrayBuffer`) or a bare
 * family name (render-only). Returns immediately — scumble's no-null-phase
 * convention; invalid binaries throw from `createFontMetrics`.
 *
 * @example
 * const font = useFont(FONT_URI, 12);
 * font.measureText("Q3");  // px, synchronous
 */
export function useFont(source: FontMetricsSource | string, size = 14): SkFont {
  return buildFont(source, size);
}

/** RN-Skia `matchFont({fontFamily, fontSize})` — same construction rules. */
export function matchFont(
  spec: { fontFamily?: string; fontSize?: number },
  _fontMgr?: unknown,
): SkFont {
  return buildFont(spec.fontFamily ?? "", spec.fontSize ?? 14);
}

// ---- SkPaint: the mutable paint object Skia.Paint() produces (used by the
// pie angular-inset lane). Setters store; the component layer reads. ----

/** The used surface of RN-Skia's `SkPaint`. */
export interface SkPaint {
  setColor(color: Color): void;
  setStyle(style: PaintStyle): void;
  setStrokeWidth(width: number): void;
  setOpacity?(alpha: number): void;
  readonly color?: Color;
  readonly style?: PaintStyle;
  readonly strokeWidth?: number;
}

export function createPaint(): SkPaint {
  const state: { color?: Color; style?: PaintStyle; strokeWidth?: number } = {};
  return {
    setColor: (c) => (state.color = c),
    setStyle: (s) => (state.style = s),
    setStrokeWidth: (w) => (state.strokeWidth = w),
    get color() {
      return state.color;
    },
    get style() {
      return state.style;
    },
    get strokeWidth() {
      return state.strokeWidth;
    },
  };
}

/** SkTextStyle → span props (the ParagraphBuilder lane). */
export function textStyleToSpanProps(style: SkTextStyle): {
  fontSize?: number;
  fontFamily?: string;
  color?: Color;
  letterSpacing?: number;
} {
  return {
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.fontFamily !== undefined ? { fontFamily: style.fontFamily } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.letterSpacing !== undefined ? { letterSpacing: style.letterSpacing } : {}),
  };
}
