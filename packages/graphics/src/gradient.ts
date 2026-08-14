// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Gradient specs → a nested FlatBuffer (Gradient) carried as bytes.
 *
 * Mirrors {@link parsePath}: a friendly spec (geometry, colors, positions, tile
 * mode) is serialized into the `Gradient` table from
 * `render_tree_common.fbs`, built with flatbuffers.js. The native side memcpy's
 * the bytes verbatim into `RetainedPaint.gradient_data` and reads them back via
 * `GetRoot<Gradient>` — zero custom-format parsing on either side. The bytes are
 * base64-encoded in the react layer for Lynx's string prop channel.
 *
 * Coordinates are **absolute user-space pixels** (`gradient_units =
 * USER_SPACE_ON_USE`), matching react-native-skia's shader children: the
 * caller passes the same geometry they would to RN-Skia, with no 0–1
 * normalization and no dependency on the shape's bounding box (so the C++ draw
 * side needs no bbox lookup).
 */

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { Gradient } from "./generated/skityrt/gradient.js";
import { GradientStop } from "./generated/skityrt/gradient-stop.js";
import { RGBAColor } from "./generated/skityrt/rgbacolor.js";
import { parseColor } from "./color.js";
import type { Color } from "./color.js";

// skityrt enum bytes — must mirror render_tree_common.fbs exactly.
const GRADIENT_TYPE_LINEAR = 0;
const GRADIENT_TYPE_RADIAL = 1;
const GRADIENT_TYPE_SWEEP = 2;
const GRADIENT_UNITS_USER_SPACE = 1; // USER_SPACE_ON_USE
const SPREAD_PAD = 0; // → skity TileMode::kClamp
const SPREAD_REFLECT = 1; // → skity TileMode::kMirror
const SPREAD_REPEAT = 2; // → skity TileMode::kRepeat

/** A 2D point — accepts `{x,y}` (from `vec()`) or `[x,y]`. */
export type Point = { x: number; y: number } | [number, number];

/** How the gradient repeats outside the 0–1 stop range. Matches skity TileMode. */
export type GradientMode = "clamp" | "repeat" | "mirror";

/**
 * The friendly spec users write for a linear gradient. Mirrors the props of
 * react-native-skia's `<LinearGradient>`.
 */
export interface LinearGradientSpec {
  /** Start point (absolute user-space px). */
  start: Point;
  /** End point (absolute user-space px). */
  end: Point;
  /** ≥ 2 colors, evenly distributed unless `positions` overrides. */
  colors: Color[];
  /** Optional per-color offsets in [0,1]; defaults to even spacing. */
  positions?: number[];
  /** Tile mode outside the stop range. Defaults to `"clamp"`. */
  mode?: GradientMode;
}

/**
 * The friendly spec for a radial gradient. Mirrors the props of
 * react-native-skia's `<RadialGradient>` (center + radius, no focal point).
 */
export interface RadialGradientSpec {
  /** Center of the circle (absolute user-space px). */
  c: Point;
  /** Circle radius in px; must be positive. */
  r: number;
  /** ≥ 2 colors, evenly distributed unless `positions` overrides. */
  colors: Color[];
  /** Optional per-color offsets in [0,1]; defaults to even spacing. */
  positions?: number[];
  /** Tile mode outside the stop range. Defaults to `"clamp"`. */
  mode?: GradientMode;
}

/**
 * The friendly spec for a sweep (angular) gradient. Angles are **degrees**
 * (matching skity's `MakeSweep` and this repo's `rotate(deg)` convention):
 * `start` corresponds to stop offset 0, `end` to offset 1.
 */
export interface SweepGradientSpec {
  /** Center of the sweep (absolute user-space px). */
  c: Point;
  /** Start angle in degrees. Defaults to 0. */
  start?: number;
  /** End angle in degrees. Defaults to 360. */
  end?: number;
  /** ≥ 2 colors, evenly distributed unless `positions` overrides. */
  colors: Color[];
  /** Optional per-color offsets in [0,1]; defaults to even spacing. */
  positions?: number[];
  /** Tile mode outside the stop range. Defaults to `"clamp"`. */
  mode?: GradientMode;
}

function toXY(p: Point): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}

/** Packed 0xAARRGGBB → 0–255 RGBA channels (for the RGBAColor table). */
function toRGBA(argb: number): { r: number; g: number; b: number; a: number } {
  return {
    a: (argb >>> 24) & 0xff,
    r: (argb >>> 16) & 0xff,
    g: (argb >>> 8) & 0xff,
    b: argb & 0xff,
  };
}

function spreadByte(mode: GradientMode): number {
  switch (mode) {
    case "repeat":
      return SPREAD_REPEAT;
    case "mirror":
      return SPREAD_REFLECT;
    default:
      return SPREAD_PAD;
  }
}

/**
 * Build the shared `stops` vector for a `Gradient` root (inner-first, before
 * the root table). Offsets default to even spacing `i/(n-1)`.
 */
function buildStopsVector(
  builder: flatbuffers.Builder,
  colors: Color[],
  positions?: number[],
): flatbuffers.Offset {
  const n = colors.length;
  const stopOffsets: flatbuffers.Offset[] = [];
  for (let i = 0; i < n; i++) {
    const { r, g, b, a } = toRGBA(parseColor(colors[i]!));
    const colorOff = RGBAColor.createRGBAColor(builder, r, g, b, a);
    const offset = positions && positions[i] !== undefined ? positions[i]! : i / (n - 1);
    GradientStop.startGradientStop(builder);
    GradientStop.addOffset(builder, offset);
    GradientStop.addColor(builder, colorOff);
    stopOffsets.push(GradientStop.endGradientStop(builder));
  }
  return Gradient.createStopsVector(builder, stopOffsets);
}

function finishGradient(builder: flatbuffers.Builder, root: flatbuffers.Offset): ArrayBuffer {
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}

/**
 * Serialize a linear gradient spec into a nested `Gradient` FlatBuffer. See the
 * module note for the wire contract (native memcpy's the bytes verbatim).
 *
 * @returns Gradient FlatBuffer bytes (base64-encode for the native
 *   `fillGradient` prop).
 * @throws if `colors` has fewer than 2 entries.
 *
 * @example
 * buildLinearGradient({ start: [0, 0], end: [100, 0], colors: ["#f00", "#00f"] });
 */
export function buildLinearGradient(spec: LinearGradientSpec): ArrayBuffer {
  const { start, end, colors, positions, mode = "clamp" } = spec;
  if (colors.length < 2) throw new Error("buildLinearGradient: needs at least 2 colors");

  const builder = new flatbuffers.Builder(256);
  const stopsOff = buildStopsVector(builder, colors, positions);

  const [x1, y1] = toXY(start);
  const [x2, y2] = toXY(end);

  const root = Gradient.createGradient(
    builder,
    GRADIENT_TYPE_LINEAR,
    GRADIENT_UNITS_USER_SPACE,
    spreadByte(mode),
    x1,
    y1,
    x2,
    y2,
    0.5, // radial fields (cx/cy/r/fx/fy/fr) — unused for LINEAR
    0.5,
    0.5,
    0.5,
    0.5,
    0,
    stopsOff,
    0, // sweep angles — unused for LINEAR
    360,
  );
  return finishGradient(builder, root);
}

/**
 * Serialize a radial gradient spec into a nested `Gradient` FlatBuffer.
 * Center + radius only; the focal fields (fx/fy/fr → skity's
 * `MakeTwoPointConical`) are a future extension and left at defaults.
 *
 * @returns Gradient FlatBuffer bytes (base64-encode for the native
 *   `fillGradient` prop).
 * @throws if `colors` has fewer than 2 entries or `r` is not positive.
 *
 * @example
 * buildRadialGradient({ c: [50, 50], r: 50, colors: ["#fff", "#000"] });
 */
export function buildRadialGradient(spec: RadialGradientSpec): ArrayBuffer {
  const { c, r, colors, positions, mode = "clamp" } = spec;
  if (colors.length < 2) throw new Error("buildRadialGradient: needs at least 2 colors");
  if (!(r > 0)) throw new Error("buildRadialGradient: r must be positive");

  const builder = new flatbuffers.Builder(256);
  const stopsOff = buildStopsVector(builder, colors, positions);

  const [cx, cy] = toXY(c);

  const root = Gradient.createGradient(
    builder,
    GRADIENT_TYPE_RADIAL,
    GRADIENT_UNITS_USER_SPACE,
    spreadByte(mode),
    0, // linear fields (x1/y1/x2/y2) — unused for RADIAL
    0,
    1,
    0,
    cx,
    cy,
    r,
    0.5, // focal fields (fx/fy/fr) — unused (TwoPointConical TODO)
    0.5,
    0,
    stopsOff,
    0, // sweep angles — unused for RADIAL
    360,
  );
  return finishGradient(builder, root);
}

/**
 * Serialize a sweep gradient spec into a nested `Gradient` FlatBuffer. Angles
 * are degrees: `start` maps to stop offset 0, `end` to offset 1 (defaults
 * 0–360, a full turn).
 *
 * @returns Gradient FlatBuffer bytes (base64-encode for the native
 *   `fillGradient` prop).
 * @throws if `colors` has fewer than 2 entries or the angular range is empty.
 *
 * @example
 * buildSweepGradient({ c: [50, 50], colors: ["#f00", "#0f0", "#00f"] });
 */
export function buildSweepGradient(spec: SweepGradientSpec): ArrayBuffer {
  const { c, start = 0, end = 360, colors, positions, mode = "clamp" } = spec;
  if (colors.length < 2) throw new Error("buildSweepGradient: needs at least 2 colors");
  if (!(end > start)) throw new Error("buildSweepGradient: end must be greater than start");

  const builder = new flatbuffers.Builder(256);
  const stopsOff = buildStopsVector(builder, colors, positions);

  const [cx, cy] = toXY(c);

  const root = Gradient.createGradient(
    builder,
    GRADIENT_TYPE_SWEEP,
    GRADIENT_UNITS_USER_SPACE,
    spreadByte(mode),
    0, // linear fields — unused for SWEEP
    0,
    1,
    0,
    cx,
    cy,
    0.5, // radial geometry — unused for SWEEP (cx/cy carry the center)
    0.5,
    0.5,
    0,
    stopsOff,
    start,
    end,
  );
  return finishGradient(builder, root);
}
