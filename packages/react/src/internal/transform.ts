// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Converts a react-native-skity transform (a single Translate/Scale/Rotate
// object, or a 4x4 column-major number[16]) into the nested FlatBuffer
// TransformOpList bytes the native skity-group expects. The object is first
// turned into a CSS transform string, then @lynx-skity/graphics.parseTransform
// serializes it to bytes; the native side only memcpys the bytes (no string
// parsing). Returns undefined for no transform.

import { bytesToBase64, parseTransform } from "@lynx-skity/graphics";

import type { RotateProps, Transform } from "../types";

// Converts a react-native-skity transform (single Translate/Scale/Rotate object,
// or 4x4 column-major number[16]) into a base64-encoded TransformOpList the
// native skity-group expects. The object is first turned into a CSS string,
// @lynx-skity/graphics serializes it to nested FlatBuffer bytes, then base64 for
// Lynx's string prop channel (Lynx doesn't marshal NSData); the native side
// decodes + memcpys. Returns undefined for no transform.
export function resolveTransform(t: Transform | undefined): string | undefined {
  if (!t) return undefined;

  let css: string;
  if (Array.isArray(t)) {
    // 4x4 column-major → 2D affine matrix(a, b, c, d, e, f).
    // col-major layout: m[col*4 + row]; affine uses m0,m1,m4,m5,m12,m13.
    css = `matrix(${t[0]},${t[1]},${t[4]},${t[5]},${t[12]},${t[13]})`;
  } else if ("translateX" in t && "translateY" in t) {
    css = `translate(${t.translateX},${t.translateY})`;
  } else if ("scaleX" in t && "scaleY" in t) {
    css = `scale(${t.scaleX},${t.scaleY})`;
  } else {
    const r = t as RotateProps;
    css =
      r.x !== undefined && r.y !== undefined
        ? `rotate(${r.rotate},${r.x},${r.y})`
        : `rotate(${r.rotate})`;
  }

  const bytes = parseTransform(css);
  return bytes ? bytesToBase64(bytes) : undefined;
}
