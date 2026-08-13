// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Linear gradient → a nested FlatBuffer (Gradient) carried as bytes.
 *
 * Mirrors {@link parsePath}: a friendly spec (start/end points, colors,
 * positions, tile mode) is serialized into the `Gradient` table from
 * `render_tree_common.fbs`, built with flatbuffers.js. The native side memcpy's
 * the bytes verbatim into `RetainedPaint.gradient_data` and reads them back via
 * `GetRoot<Gradient>` — zero custom-format parsing on either side. The bytes are
 * base64-encoded in the react layer for Lynx's string prop channel.
 *
 * Coordinates are **absolute user-space pixels** (`gradient_units =
 * USER_SPACE_ON_USE`), matching react-native-skia's `<LinearGradient>`: the
 * caller passes the same `start`/`end` they would to RN-Skia, with no 0–1
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
  const n = colors.length;
  if (n < 2) throw new Error("buildLinearGradient: needs at least 2 colors");

  const builder = new flatbuffers.Builder(256);

  // Stops are nested tables — build them inner-first, accumulating offsets
  // before the Gradient root (flatbuffers builds inside-out).
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
  const stopsOff = Gradient.createStopsVector(builder, stopOffsets);

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
    0.5,
    0.5,
    0.5,
    0.5,
    0.5,
    0, // radial fields (cx/cy/r/fx/fy/fr) — unused for LINEAR
    stopsOff,
  );
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}
