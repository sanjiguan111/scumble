// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, it } from "vitest";

import { multiply4, rect, rotate, rrect, scale, translate, vec } from "../math.js";
import { FillType, PaintStyle } from "../types.js";
import { Skia } from "../Skia.js";
import { SkPath } from "../SkPath.js";

// @lat: [[tests#Skia compat layer#Skia namespace and path shims]]
describe("math helpers", () => {
  it("vec/rect build the RN-Skia shapes", () => {
    expect(vec(3, 4)).toEqual({ x: 3, y: 4 });
    expect(Skia.XYWHRect(1, 2, 3, 4)).toEqual([1, 2, 3, 4]);
    expect(rect(1, 2, 3, 4)).toEqual([1, 2, 3, 4]);
  });

  it("rrect caps corner radii at half the shorter side", () => {
    const r = rrect(0, 0, 8, 40, 10);
    expect(r.topLeft).toEqual({ x: 4, y: 4 }); // capped from 10
    expect(r.rect).toEqual({ x: 0, y: 0, width: 8, height: 40 });
    const uniform = rrect(0, 0, 20, 20, 3);
    expect([uniform.topLeft, uniform.topRight, uniform.bottomRight, uniform.bottomLeft]).toEqual(
      Array(4).fill({ x: 3, y: 3 }),
    );
  });

  it("multiplies column-major matrices (b applied first)", () => {
    // translate(10,0) ∘ scale(2,2): a point p maps to 2p + (10,0).
    const m = multiply4(translate(10, 0), scale(2, 2));
    // Column-major: out[col*4+row]; x' = m0*x + m4*y + m12.
    const px = (x: number, y: number) => m[0]! * x + m[4]! * y + m[12]!;
    const py = (x: number, y: number) => m[1]! * x + m[5]! * y + m[13]!;
    expect(px(1, 1)).toBe(12);
    expect(py(1, 1)).toBe(2);
  });

  it("rotate is column-major too", () => {
    const m = rotate(Math.PI / 2);
    const px = (x: number, y: number) => m[0]! * x + m[4]! * y + m[12]!;
    const py = (x: number, y: number) => m[1]! * x + m[5]! * y + m[13]!;
    expect(px(1, 0)).toBeCloseTo(0, 10);
    expect(py(1, 0)).toBeCloseTo(1, 10); // +90° in y-down screen space
  });
});

describe("SkPath / PathBuilder", () => {
  it("builds the Victory bar lane: addRRect with per-corner radii", () => {
    const builder = Skia.PathBuilder.Make();
    builder.addRRect(rrect(0, 0, 10, 10, { topLeft: 2, bottomRight: 4 }));
    const d = builder.build().toSVGString();
    // Walk: start after the TL radius; zero-radius corners (TR/BL) skip their
    // arcs entirely; BR carries its elliptical arc; closed.
    expect(d).toBe("M2 0 L10 0 L10 6 A4 4 0 0 1 6 10 L0 10 L0 2 A2 2 0 0 1 2 0 Z");
  });

  it("converts Canvas-style oval arcs to SVG endpoint arcs", () => {
    const p = new SkPath().arcToOval([0, 0, 10, 10], 0, 90, true);
    // Oval center (5,5), r=5: 0°→(10,5), 90°→(5,10), sweep CW.
    expect(p.toSVGString()).toBe("M10 5 A5 5 0 0 1 5 10");
    // Large-sweep flag when |sweep| > 180°.
    const half = new SkPath().arcToOval([0, 0, 10, 10], 0, 270, true);
    expect(half.toSVGString()).toContain("A5 5 0 1 1 ");
  });

  it("continues an arc from the current point unless forceMoveTo", () => {
    // Canvas semantics: the current point connects to the arc's start with a
    // straight line before the arc runs (an SVG A alone would instead start
    // the arc AT the current point — different geometry).
    const joined = new SkPath().moveTo(0, 5).arcToOval([0, 0, 10, 10], 0, 90, false);
    expect(joined.toSVGString()).toBe("M0 5 L10 5 A5 5 0 0 1 5 10");
  });

  it("connects outer and inner donut arcs with a radial edge (Victory Pie.Slice)", () => {
    // Exact shape of upstream useSlicePath for one slice: center (100,100),
    // R=100, innerR=50, sweep 0°→72°. The inner arc's start sits on the inner
    // circle while the current point sits on the outer one — without the
    // connecting line the inner arc bulges into a near-semicircle and the
    // donut renders as pinwheel blades.
    const builder = Skia.PathBuilder.Make();
    builder.arcToOval(Skia.XYWHRect(0, 0, 200, 200), 0, 72, false);
    builder.arcToOval(Skia.XYWHRect(50, 50, 100, 100), 72, -72, false);
    builder.close();
    expect(builder.build().toSVGString()).toBe(
      "M200 100 A100 100 0 0 1 130.901699 195.105652 " +
        "L115.45085 147.552826 A50 50 0 0 0 150 100 Z",
    );
  });

  it("splits a full-revolution oval arc into two SVG arcs", () => {
    // SVG A cannot express 360° (start == end degenerates to a line).
    const full = new SkPath().arcToOval([0, 0, 10, 10], 30, 360, true);
    expect(full.toSVGString()).toBe(
      "M9.330127 7.5 A5 5 0 0 1 0.669873 2.5 A5 5 0 0 1 9.330127 7.5",
    );
    // addOval rides the same path — a full ellipse, not a collapsed contour.
    const oval = new SkPath().addOval([0, 0, 10, 10]);
    expect(oval.toSVGString()).toBe("M10 5 A5 5 0 0 1 0 5 A5 5 0 0 1 10 5 Z");
  });

  it("round-trips d strings through MakeFromSVGString", () => {
    const p = Skia.Path.MakeFromSVGString("M0 0 L10 10 z")!;
    expect(p).not.toBeNull();
    expect(p.toSVGString()).toBe("M0 0 L10 10 Z");
    expect(Skia.Path.MakeFromSVGString("   ")).toBeNull();
  });

  it("round-trips REAL d3-shape output (the Victory data lane)", async () => {
    // d3's curveMonotoneX emits absolute M/C cubics — exactly what a ported
    // chart feeds <Path> every render. d3 comma-glues args where toDString
    // spaces them, so the round-trip is asserted SEMANTICALLY: same command
    // sequence, same number stream.
    const { line, curveMonotoneX } = await import("d3-shape");
    const d =
      line<number>()
        .x((_, i) => i * 30)
        .y((v) => 100 - v)
        .curve(curveMonotoneX)([42, 55, 48, 71, 66]) ?? "";
    const p = Skia.Path.MakeFromSVGString(d);
    expect(p).not.toBeNull();
    const out = p!.toSVGString();
    const cmds = (s: string) => (s.match(/[MLCQAZ]/g) ?? []).join("");
    const nums = (s: string) =>
      (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    expect(cmds(out)).toBe(cmds(d));
    expect(nums(out)).toEqual(nums(d));
  });

  it("interpolates matching structures and rejects mismatches", () => {
    const a = Skia.Path.Rect([0, 0, 10, 10]);
    const b = Skia.Path.Rect([10, 10, 10, 10]);
    const mid = Skia.Path.Interpolate(a, b, 0.5)!;
    expect(mid.toSVGString()).toBe(Skia.Path.Rect([5, 5, 10, 10]).toSVGString());
    const tri = Skia.Path.MakeFromSVGString("M0 0 L10 0 L5 8 Z")!;
    expect(Skia.Path.Interpolate(a, tri, 0.5)).toBeNull();
  });

  it("carries fillType from the builder to the built path", () => {
    const builder = Skia.PathBuilder.Make();
    builder.addRect([0, 0, 1, 1]).setFillType(FillType.EvenOdd);
    expect(builder.build().fillType).toBe(FillType.EvenOdd);
  });

  it("Skia.Color parses CSS colors to packed ints", () => {
    expect(Skia.Color("#ff0000")).toBe(0xffff0000);
    expect(Skia.Color(0x11223344)).toBe(0x11223344);
  });

  it("SkPaint setters feed resolveShimPaint-style reads", () => {
    const paint = Skia.Paint();
    paint.setColor("#123456");
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(2.5);
    expect(paint.color).toBe("#123456");
    expect(paint.style).toBe(PaintStyle.Stroke);
    expect(paint.strokeWidth).toBe(2.5);
  });
});
