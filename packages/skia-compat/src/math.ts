// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * The RN-Skia math helpers Victory imports (`vec`, `rect`, `translate`,
 * `scale`, `multiply4`). Pure functions, no rendering involvement — matrices
 * are 4×4 column-major ({@link Matrix4}), matching both RN-Skia and what
 * scumble's `<Group transform>` accepts natively.
 */

import type { Matrix4, NonUniformRRect, RRectCorner, SkPoint, SkRect } from "./types.js";

/** Build an `{x, y}` point — RN-Skia `vec`. */
export function vec(x: number, y: number): SkPoint {
  return { x, y };
}

/** Build an `[x, y, width, height]` rect — RN-Skia `rect` / `Skia.XYWHRect`. */
export function rect(x: number, y: number, width: number, height: number): SkRect {
  return [x, y, width, height];
}

/**
 * Build a rounded rect with per-corner radii — the `NonUniformRRect` shape
 * `builder.addRRect` takes. `radius` is a number (all corners), a
 * `{topLeft, topRight, bottomRight, bottomLeft}` of numbers, or omitted
 * (square corners); each corner radius is clamped to half the shorter side,
 * mirroring Victory's own `createRoundedRectPath` capping.
 */
export function rrect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius?:
    number | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number },
): NonUniformRRect {
  const cap = Math.max(0, Math.min(width, height) / 2);
  const from = (r: number | undefined): RRectCorner | undefined =>
    r === undefined
      ? undefined
      : { x: Math.min(Math.max(r, 0), cap), y: Math.min(Math.max(r, 0), cap) };
  const corners =
    typeof radius === "number"
      ? { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius }
      : (radius ?? {});
  return {
    rect: { x, y, width, height },
    topLeft: from(corners.topLeft),
    topRight: from(corners.topRight),
    bottomRight: from(corners.bottomRight),
    bottomLeft: from(corners.bottomLeft),
  };
}

/** 4×4 identity. */
export function identity4(): Matrix4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Column-major translate — RN-Skia `translate(x, y)`. */
export function translate(x: number, y: number, z = 0): Matrix4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** Column-major scale — RN-Skia `scale(x, y?, z?)`. */
export function scale(x: number, y = x, z = 1): Matrix4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

/** Column-major rotate around Z, radians (gl-matrix convention). */
export function rotate(radians: number): Matrix4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Matrix product `a·b` (column-major: transforms by `b` first, then `a`) —
 * RN-Skia `multiply4`. The 2×2/translation blocks are what scumble reads;
 * the rest composes correctly for chained transforms.
 */
export function multiply4(a: Matrix4, b: Matrix4): Matrix4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}
