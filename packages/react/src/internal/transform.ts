// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Transform normalization for the React layer — see {@link resolveTransform}.
 */

import { bytesToBase64, parseTransform } from "@lynx-skity/graphics";

import type { RotateProps, Transform, TransformProp } from "../types";

function opToCss(t: Transform): string {
  if (Array.isArray(t)) {
    // 4x4 column-major → 2D affine matrix(a, b, c, d, e, f).
    // col-major layout: m[col*4 + row]; affine uses m0,m1,m4,m5,m12,m13.
    return `matrix(${t[0]},${t[1]},${t[4]},${t[5]},${t[12]},${t[13]})`;
  }
  if ("translateX" in t || "translateY" in t) {
    return `translate(${t.translateX ?? 0},${t.translateY ?? 0})`;
  }
  if ("scaleX" in t || "scaleY" in t) {
    const sx = t.scaleX ?? 1;
    return `scale(${sx},${t.scaleY ?? sx})`;
  }
  const r = t as RotateProps;
  return r.x !== undefined && r.y !== undefined
    ? `rotate(${r.rotate},${r.x},${r.y})`
    : `rotate(${r.rotate})`;
}

/**
 * Convert a transform prop — a single `{translateX,translateY}` /
 * `{scaleX,scaleY}` / `{rotate,…}` object (rotate in degrees), a 4×4
 * column-major `number[16]` matrix, or an array of ops composed
 * left-to-right — into a base64-encoded `TransformOpList` for the native
 * `transform` prop (every `skity-*` node accepts it; nested transforms
 * cascade in the renderer).
 *
 * The value is first turned into a CSS `transform` string, then
 * `@lynx-skity/graphics`'s `parseTransform` serializes it to nested FlatBuffer
 * bytes, which are base64-encoded for Lynx's string-only prop channel (Lynx
 * won't marshal raw bytes); the native side decodes + memcpys. Returns
 * `undefined` when there is no transform, so the prop can be omitted entirely.
 *
 * @returns The base64 string for the `transform` prop, or `undefined`.
 *
 * @example
 * resolveTransform({ translateX: 10, translateY: 5 });     // "…"
 * resolveTransform({ rotate: 45, x: 50, y: 50 });          // rotate about pivot
 * resolveTransform([1,0,0,0, 0,1,0,0, 0,0,1,0, 10,5,0,1]); // 4×4 matrix
 * resolveTransform([{ translateX: 10 }, { rotate: 45 }]);  // compose ops
 */
export function resolveTransform(t: TransformProp | undefined): string | undefined {
  if (!t) return undefined;

  let css: string;
  if (Array.isArray(t) && typeof t[0] === "number") {
    // A bare 4×4 matrix (element type disambiguates it from an op array).
    css = opToCss(t as number[16]);
  } else if (Array.isArray(t)) {
    css = t.map(opToCss).join(" ");
  } else {
    css = opToCss(t);
  }

  const bytes = parseTransform(css);
  return bytes ? bytesToBase64(bytes) : undefined;
}
