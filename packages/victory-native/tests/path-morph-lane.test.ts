import { describe, expect, it } from "vitest";

import { Skia, isPathMorphSpec, type SkPath } from "@scumble/skia-compat";

import { resolvePathMorph } from "../shims/useAnimatedPath.js";

// Two d3-shaped line paths with the same command structure (M + L + L + Z).
const FROM_D = "M0 100 L10 40 L20 60 Z";
const TO_D = "M0 100 L12 30 L24 55 Z";

function paths(fromD: string, toD: string): { from: SkPath; to: SkPath } {
  const from = Skia.Path.MakeFromSVGString(fromD);
  const to = Skia.Path.MakeFromSVGString(toD);
  if (!from || !to) throw new Error("fixture paths must parse");
  return { from, to };
}

// @lat: [[tests#Skia compat layer#Path morph native lane]]
describe("useAnimatedPath lane decision (resolvePathMorph)", () => {
  it("equal geometry settles without tweening (the generalized mount skip)", () => {
    const { from, to } = paths(FROM_D, FROM_D);
    const out = resolvePathMorph(from, to, { type: "timing", duration: 300 });
    expect(out.lane).toBe("settled");
    if (out.lane === "settled") expect(out.value).toBe(to);
  });

  it("timing over interpolatable geometry rides the native pathD track", () => {
    const { from, to } = paths(FROM_D, TO_D);
    const out = resolvePathMorph(from, to, { type: "timing", duration: 350 });
    expect(out.lane).toBe("native");
    if (out.lane === "native") {
      expect(isPathMorphSpec(out.value)).toBe(true);
      expect(out.value.from).toBe(from);
      expect(out.value.to).toBe(to);
      expect(out.value.duration).toBe(350);
    }
  });

  it("spring configs ride the native lane with the shim's easeOutCubic approximation", () => {
    const { from, to } = paths(FROM_D, TO_D);
    const out = resolvePathMorph(from, to, { type: "spring" });
    expect(out.lane).toBe("native");
    if (out.lane === "native") {
      expect(out.value.duration).toBe(500); // the shim's withSpring default
      expect(out.value.easing).toEqual([0.215, 0.61, 0.355, 1]);
    }
    // Explicit spring duration passes through.
    const tuned = resolvePathMorph(from, to, { type: "spring", duration: 800 });
    expect(tuned.lane).toBe("native");
    if (tuned.lane === "native") expect(tuned.value.duration).toBe(800);
  });

  it("decay configs and zero durations stay on the JS tween lane", () => {
    const { from, to } = paths(FROM_D, TO_D);
    expect(resolvePathMorph(from, to, { type: "decay" }).lane).toBe("js");
    expect(resolvePathMorph(from, to, { type: "timing", duration: 0 }).lane).toBe("js");
    expect(resolvePathMorph(from, to, { type: "spring", duration: 0 }).lane).toBe("js");
  });

  it("structure-mismatched pairs stay on the JS lane (snap fallback there)", () => {
    // Same verb count, different verbs → Path2D.interpolate null.
    const line = Skia.Path.MakeFromSVGString("M0 0 L10 10 L20 0");
    const quad = Skia.Path.MakeFromSVGString("M0 0 Q10 10 20 0");
    if (!line || !quad) throw new Error("fixture paths must parse");
    expect(resolvePathMorph(line, quad, { type: "timing", duration: 300 }).lane).toBe("js");
    // Different command counts (data length change) likewise.
    const short = Skia.Path.MakeFromSVGString("M0 0 L5 5");
    if (!short) throw new Error("fixture paths must parse");
    expect(resolvePathMorph(short, line, { type: "timing", duration: 300 }).lane).toBe("js");
  });
});
