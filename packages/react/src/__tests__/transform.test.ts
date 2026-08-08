// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { bytesToBase64, parseTransform } from "@lynx-skity/parsers";

import { resolveTransform } from "../internal/transform";

// resolveTransform returns a base64-encoded TransformOpList (the nested
// FlatBuffer bytes go through Lynx's string prop channel). Assert equality
// against bytesToBase64(parseTransform(<expected css>)) — the serialization
// itself is covered by @lynx-skity/parsers' own round-trip tests.
function expectBytes(actual: string | undefined, expectedCss: string) {
  const expected = parseTransform(expectedCss);
  expect(typeof actual).toBe("string");
  expect(expected).not.toBeNull();
  expect(actual).toBe(bytesToBase64(expected!));
}

describe("resolveTransform", () => {
  it("translates", () => {
    expectBytes(resolveTransform({ translateX: 10, translateY: 20 }), "translate(10,20)");
  });

  it("scales", () => {
    expectBytes(resolveTransform({ scaleX: 2, scaleY: 3 }), "scale(2,3)");
  });

  it("rotates in degrees with no pivot", () => {
    expectBytes(resolveTransform({ rotate: 45 }), "rotate(45)");
  });

  it("rotates with a pivot", () => {
    expectBytes(resolveTransform({ rotate: 45, x: 10, y: 20 }), "rotate(45,10,20)");
  });

  it("converts a 4x4 column-major matrix to a 2D affine matrix()", () => {
    // column-major identity with translation in m[12]=tx, m[13]=ty
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 80, 20, 0, 1];
    expectBytes(resolveTransform(m), "matrix(1,0,0,1,80,20)");
  });

  it("returns undefined when no transform is given", () => {
    expect(resolveTransform(undefined)).toBeUndefined();
  });
});
