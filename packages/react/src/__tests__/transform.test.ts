// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { bytesToBase64, parseTransform } from "@gesso/graphics";

import { resolveTransform } from "../internal/transform";
import { Circle } from "../shapes/Circle";
import { Rect } from "../shapes/Rect";

// resolveTransform returns a base64-encoded TransformOpList (the nested
// FlatBuffer bytes go through Lynx's string prop channel). Assert equality
// against bytesToBase64(parseTransform(<expected css>)) — the serialization
// itself is covered by @gesso/graphics' own round-trip tests.
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

  it("composes an op array left-to-right (translate then rotate)", () => {
    expectBytes(
      resolveTransform([{ translateX: 10 }, { rotate: 45 }]),
      "translate(10,0) rotate(45)",
    );
  });

  it("composes a 4x4 matrix element inside an op array", () => {
    const m = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expectBytes(
      resolveTransform([m, { translateX: 5, translateY: 5 }]),
      "matrix(2,0,0,2,0,0) translate(5,5)",
    );
  });

  it("returns undefined when no transform is given", () => {
    expect(resolveTransform(undefined)).toBeUndefined();
  });
});

describe("shape transform passthrough", () => {
  // Calling a component directly returns the intrinsic element (a plain
  // object from createElement) — inspect its props without a renderer.
  const elementFor = (el: unknown) => el as { props: Record<string, unknown> };

  it("routes a shape-level transform onto the intrinsic transform prop", () => {
    const el = elementFor(Rect({ x: 0, y: 0, width: 10, height: 10, transform: { rotate: 30 } }));
    expectBytes(el.props.transform as string, "rotate(30)");
  });

  it("omits the intrinsic transform prop when the shape has none", () => {
    const el = elementFor(Rect({ x: 0, y: 0, width: 10, height: 10 }));
    expect(el.props.transform).toBeUndefined();
  });

  it("accepts an op array on a shape", () => {
    const el = elementFor(
      Circle({ cx: 5, cy: 5, radius: 5, transform: [{ scaleX: 2 }, { translateY: 8 }] }),
    );
    expectBytes(el.props.transform as string, "scale(2,2) translate(0,8)");
  });
});
