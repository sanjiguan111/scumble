// @lat: [[tests#Graphics parsing layer#Corner radii resolution]]
import { describe, it, expect } from "vitest";

import { resolveCornerRadii } from "../radii.js";

describe("resolveCornerRadii", () => {
  it("number → uniform", () => {
    expect(resolveCornerRadii(16)).toEqual({ rx: 16, ry: 16 });
  });

  it("{x, y} → uniform per-axis", () => {
    expect(resolveCornerRadii({ x: 10, y: 20 })).toEqual({ rx: 10, ry: 20 });
  });

  it("undefined → zeros", () => {
    expect(resolveCornerRadii(undefined)).toEqual({ rx: 0, ry: 0 });
  });

  it("4-corner array → TL uniform fallback + the 8-float vector (TL,TR,BR,BL)", () => {
    const r = resolveCornerRadii([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ]);
    expect(r.rx).toBe(1);
    expect(r.ry).toBe(2);
    expect(r.cornerRadii).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("clamps negatives and non-finite values to 0", () => {
    const r = resolveCornerRadii(-5);
    expect(r).toEqual({ rx: 0, ry: 0 });
    const arr = resolveCornerRadii([
      { x: Number.NaN, y: -1 },
      { x: 4, y: Number.POSITIVE_INFINITY },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(arr.cornerRadii).toEqual([0, 0, 4, 0, 0, 0, 0, 0]);
  });

  it("a malformed array (≠4 corners) degrades to uniform first-entry, no vector", () => {
    const short = resolveCornerRadii([{ x: 9, y: 8 }]);
    expect(short).toEqual({ rx: 9, ry: 8 });
    expect(short.cornerRadii).toBeUndefined();
  });
});
