// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, it } from "vitest";

import { line, curveMonotoneX } from "d3-shape";

import { Easing, tweenValue } from "../useTween.js";
import { Skia } from "../Skia.js";

// @lat: [[tests#Skia compat layer#Tween core and morph lane]]
describe("tween core (the withTiming replacement's pure half)", () => {
  it("progresses with the easing and clamps to [0, 1]", () => {
    expect(tweenValue(0, 400, Easing.linear)).toBe(0);
    expect(tweenValue(200, 400, Easing.linear)).toBe(0.5);
    expect(tweenValue(400, 400, Easing.linear)).toBe(1);
    expect(tweenValue(999, 400, Easing.linear)).toBe(1); // clamped past the end
    expect(tweenValue(-50, 400, Easing.linear)).toBe(0); // clamped before start
  });

  it("completes instantly for zero/negative/non-finite durations", () => {
    expect(tweenValue(0, 0)).toBe(1);
    expect(tweenValue(0, -10)).toBe(1);
    expect(tweenValue(0, Number.NaN)).toBe(1);
  });

  it("easing presets match the standard cubic curves", () => {
    expect(Easing.linear(0.7)).toBeCloseTo(0.7, 10);
    expect(Easing.easeInCubic(0.5)).toBeCloseTo(0.125, 10);
    expect(Easing.easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
    // easeInOutCubic: the 0.5 knot is exactly 0.5; point symmetry about it
    // (f(t) + f(1−t) = 1).
    expect(Easing.easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(Easing.easeInOutCubic(0.25) + Easing.easeInOutCubic(0.75)).toBeCloseTo(1, 10);
  });
});

describe("morph lane (the per-frame tween consumer)", () => {
  it("morphs two REAL d3 series across the demo's datasets", () => {
    // Same generators, same point count as ChartDemo's swap — the command
    // structures match by construction, which is what makes Interpolate a
    // valid per-frame tween output.
    const gen = (values: number[]) =>
      line<number>()
        .x((_, i) => i * 30)
        .y((v) => 100 - v)
        .curve(curveMonotoneX)(values) ?? "";
    const a = Skia.Path.MakeFromSVGString(
      gen([42, 55, 48, 71, 66, 89, 84, 102, 96, 118, 110, 131]),
    )!;
    const b = Skia.Path.MakeFromSVGString(gen([60, 58, 63, 55, 61, 57, 64, 60, 58, 66, 62, 59]))!;
    const mid = Skia.Path.Interpolate(a, b, 0.5);
    expect(mid).not.toBeNull();
    // The first y coordinate: a has 100−42=58, b has 100−60=40 → mid 49.
    const nums = (s: string) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const m = nums(mid!.toSVGString());
    expect(m[1]).toBeCloseTo(49, 6); // M's y after M's x (=0)
  });
});
