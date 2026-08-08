import { describe, it, expect } from "vitest";

import { resolveTransform } from "../internal/transform";

describe("resolveTransform", () => {
  it("translates", () => {
    expect(resolveTransform({ translateX: 10, translateY: 20 })).toBe("translate(10,20)");
  });

  it("scales", () => {
    expect(resolveTransform({ scaleX: 2, scaleY: 3 })).toBe("scale(2,3)");
  });

  it("rotates in degrees with no pivot", () => {
    expect(resolveTransform({ rotate: 45 })).toBe("rotate(45)");
  });

  it("rotates with a pivot", () => {
    expect(resolveTransform({ rotate: 45, x: 10, y: 20 })).toBe("rotate(45,10,20)");
  });

  it("converts a 4x4 column-major matrix to a 2D affine matrix()", () => {
    // column-major identity with translation in m[12]=tx, m[13]=ty
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 80, 20, 0, 1];
    expect(resolveTransform(m)).toBe("matrix(1,0,0,1,80,20)");
  });

  it("returns undefined when no transform is given", () => {
    expect(resolveTransform(undefined)).toBeUndefined();
  });
});
