// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Converts a react-native-skity transform (a single Translate/Scale/Rotate
// object, or a 4x4 column-major number[16]) into the CSS-style transform string
// the native skity-group expects (SkityPropParser.parseTransform).
//
// Native caveat: only translate/scale/rotate are honored today. matrix() and
// skew are no-ops in the C++ renderer's ApplyTransform (TODO Task 3).

import type { RotateProps, Transform } from "../types";

export function resolveTransform(t: Transform | undefined): string | undefined {
  if (!t) return undefined;

  if (Array.isArray(t)) {
    // 4x4 column-major → 2D affine matrix(a, b, c, d, e, f).
    // col-major layout: m[col*4 + row]; affine uses m0,m1,m4,m5,m12,m13.
    return `matrix(${t[0]},${t[1]},${t[4]},${t[5]},${t[12]},${t[13]})`;
  }

  if ("translateX" in t && "translateY" in t) {
    return `translate(${t.translateX},${t.translateY})`;
  }

  if ("scaleX" in t && "scaleY" in t) {
    return `scale(${t.scaleX},${t.scaleY})`;
  }

  const r = t as RotateProps;
  return r.x !== undefined && r.y !== undefined
    ? `rotate(${r.rotate},${r.x},${r.y})`
    : `rotate(${r.rotate})`;
}
