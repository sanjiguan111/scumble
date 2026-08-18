import { describe, it, expect } from "vitest";

import { resolvePaint } from "../internal/paint";
import { Paint } from "../Paint";
import { LinearGradient } from "../shaders/LinearGradient";
import { ImageShader } from "../shaders/ImageShader";
import { Blur, ColorMatrix, DropShadow } from "../filters/filters";
import { pointsToVerticesProp } from "../shapes/Polyline";
import { pointsToPathBytes } from "../shapes/Points";
import { parsePath } from "@lynx-skity/graphics";
import { findClipSpecs } from "../internal/clip";
import { ClipPath } from "../clips/ClipPath";
import { ClipRect } from "../clips/ClipRect";
import { ClipRRect } from "../clips/ClipRRect";
import type { ReactNode } from "@lynx-js/react";

/** A data-only gradient child (findShaderChild only reads {type, props}). */
function shaderChild(): ReactNode {
  return {
    type: LinearGradient,
    props: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, colors: ["#fff", "#000"] },
  } as never;
}

/** A data-only ImageShader child (same {type, props} contract). */
function imageShaderChild(props: Record<string, unknown>): ReactNode {
  return { type: ImageShader, props } as never;
}

/** A data-only filter child (findFilterSpecs only reads {type, props}). */
function blurChild(blur: number | { x: number; y: number }): ReactNode {
  return { type: Blur, props: { blur } } as never;
}

/** Decode base64 → raw LE float32s (mirror of graphics floatsToBase64). */
function floatsFromBase64(s: string | undefined): number[] {
  if (s === undefined) return [];
  const b = atob(s);
  const view = new DataView(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) view.setUint8(i, b.charCodeAt(i));
  const out: number[] = [];
  for (let i = 0; i + 4 <= b.length; i += 4) out.push(view.getFloat32(i, true));
  return out;
}

describe("resolvePaint defaultStyle", () => {
  it("routes color to stroke when the shape defaults to stroke (Line/Polyline)", () => {
    expect(resolvePaint({ color: "red" }, undefined, "stroke")).toEqual({ stroke: 0xffff0000 });
  });

  it("an explicit style still wins over defaultStyle", () => {
    expect(resolvePaint({ color: "red", style: "fill" }, undefined, "stroke")).toEqual({
      fill: 0xffff0000,
    });
  });

  it("routes a direct gradient child to strokeGradient on stroke-default shapes", () => {
    const r = resolvePaint({ color: "red" }, shaderChild(), "stroke");
    expect(r.strokeGradient).toBeTypeOf("string");
    expect(r.fillGradient).toBeUndefined();
  });
});

describe("resolvePaint image shader", () => {
  it("flattens a direct ImageShader child to the fill slot's intrinsic props", () => {
    const r = resolvePaint(
      {},
      imageShaderChild({
        image: "https://x/t.png",
        fit: "cover",
        rect: { x: 10, y: 20, width: 30, height: 40 },
        tx: "decal",
        ty: "repeat",
      }),
    );
    expect(r.fillImageUri).toBe("https://x/t.png");
    expect(r.fillImageFit).toBe(2); // BoxFit COVER
    expect(r.fillImageTx).toBe(3); // TileMode DECAL
    expect(r.fillImageTy).toBe(1); // TileMode REPEAT
    expect(r.fillImageRect).toBe("10,20,30,40");
    expect(r.strokeImageUri).toBeUndefined();
  });

  it("accepts an ImageHandle and defaults fit/tx/ty; rect omitted stays undefined", () => {
    const r = resolvePaint(
      {},
      imageShaderChild({ image: { __kind: "skity-image", uri: "data:image/png;base64,AAA" } }),
    );
    expect(r.fillImageUri).toBe("data:image/png;base64,AAA");
    expect(r.fillImageFit).toBe(1); // CONTAIN
    expect(r.fillImageTx).toBe(0); // CLAMP
    expect(r.fillImageTy).toBe(0); // CLAMP
    expect(r.fillImageRect).toBeUndefined();
  });

  it('routes to the stroke slot on stroke shapes (style="stroke")', () => {
    const r = resolvePaint({ style: "stroke" }, imageShaderChild({ image: "https://x/t.png" }));
    expect(r.strokeImageUri).toBe("https://x/t.png");
    expect(r.fillImageUri).toBeUndefined();
  });

  it('an empty image string clears the slot (uri "")', () => {
    const r = resolvePaint({}, imageShaderChild({ image: "" }));
    expect(r.fillImageUri).toBe("");
  });

  it('an ImageShader inside <Paint style="stroke"> routes to that paint', () => {
    const paintChild = {
      type: Paint,
      props: { style: "stroke", children: imageShaderChild({ image: "u" }) },
    } as never;
    const r = resolvePaint({}, paintChild);
    expect(r.strokeImageUri).toBe("u");
    expect(r.fillImageUri).toBeUndefined();
  });
});

describe("resolvePaint dash", () => {
  it("encodes even dash intervals as base64 LE float32", () => {
    const r = resolvePaint({ color: "red", style: "stroke", dash: [8, 4], dashOffset: 2 });
    expect(floatsFromBase64(r.strokeDash)).toEqual([8, 4]);
    expect(r.strokeDashOffset).toBe(2);
  });

  it("repeats an odd interval array once (SVG dasharray semantics)", () => {
    const r = resolvePaint({ color: "red", style: "stroke", dash: [10, 4, 6] });
    expect(floatsFromBase64(r.strokeDash)).toEqual([10, 4, 6, 10, 4, 6]);
  });

  it("drops an invalid pattern (empty / negative / zero sum) → clear dash", () => {
    expect(resolvePaint({ dash: [] }).strokeDash).toBe("");
    expect(resolvePaint({ dash: [-2, 4] }).strokeDash).toBe("");
    expect(resolvePaint({ dash: [0, 0] }).strokeDash).toBe("");
  });
});

describe("pointsToVerticesProp", () => {
  const TRIANGLE = "0,0 50,100 100,0";

  it("returns undefined for no vertices", () => {
    expect(pointsToVerticesProp("")).toBeUndefined();
    expect(pointsToVerticesProp([])).toBeUndefined();
  });

  it("flattens a points string or Vec[] to base64 LE float32 vertices", () => {
    expect(floatsFromBase64(pointsToVerticesProp(TRIANGLE))).toEqual([0, 0, 50, 100, 100, 0]);
    expect(
      pointsToVerticesProp([
        { x: 0, y: 0 },
        { x: 50, y: 100 },
        { x: 100, y: 0 },
      ]),
    ).toBe(pointsToVerticesProp(TRIANGLE));
  });
});

describe("pointsToPathBytes (Points modes)", () => {
  // The compiled bytes must be byte-identical to the equivalent d string, so
  // <Points> rides the path channel exactly like <Path>.
  function asBytes(s: string): ArrayBuffer {
    return parsePath(s) as ArrayBuffer;
  }

  it("points mode = one zero-length segment per vertex", () => {
    expect(pointsToPathBytes("0,0 50,100", "points")).toEqual(asBytes("M0 0 L0 0 M50 100 L50 100"));
  });

  it("lines mode = one segment per vertex pair; an unpaired tail vertex is dropped", () => {
    expect(pointsToPathBytes("0,0 50,100 100,0", "lines")).toEqual(asBytes("M0 0 L50 100"));
    expect(pointsToPathBytes("0,0 50,100 100,0 150,100", "lines")).toEqual(
      asBytes("M0 0 L50 100 M100 0 L150 100"),
    );
  });

  it("polygon mode = an open polyline through all vertices", () => {
    expect(pointsToPathBytes("0,0 50,100 100,0", "polygon")).toEqual(
      asBytes("M0 0 L50 100 L100 0"),
    );
  });

  it("returns null (renders nothing) for an empty vertex set", () => {
    expect(pointsToPathBytes("", "points")).toBeNull();
    expect(pointsToPathBytes([], "lines")).toBeNull();
  });
});

describe("findClipSpecs (Group clip children)", () => {
  /** A data-only clip child (findClipSpecs only reads {type, props}). */
  function el(type: unknown, props: object): ReactNode {
    return { type, props } as never;
  }

  it("collects ClipRect/ClipRRect/ClipPath children in order, ignoring others", () => {
    const specs = findClipSpecs([
      el(ClipRect, { x: 1, y: 2, width: 30, height: 40 }),
      { type: "not-a-clip", props: {} } as never,
      el(ClipRRect, { width: 10, height: 10, radii: 4, op: "difference" }),
      el(ClipPath, { path: "M0 0 L10 10 Z" }),
    ]);
    expect(specs).toEqual([
      { kind: "rect", op: undefined, x: 1, y: 2, width: 30, height: 40 },
      {
        kind: "rrect",
        op: "difference",
        x: undefined,
        y: undefined,
        width: 10,
        height: 10,
        rx: 4,
        ry: 4,
      },
      { kind: "path", op: undefined, path: "M0 0 L10 10 Z" },
    ]);
  });

  it("maps {x,y} radii per-axis on ClipRRect", () => {
    const specs = findClipSpecs([el(ClipRRect, { width: 10, height: 10, radii: { x: 8, y: 2 } })]);
    expect(specs[0]).toMatchObject({ kind: "rrect", rx: 8, ry: 2 });
  });

  it("returns [] when there are no clip children", () => {
    expect(findClipSpecs(undefined)).toEqual([]);
    expect(findClipSpecs([{ type: "x", props: {} } as never])).toEqual([]);
  });
});

describe("resolvePaint blendMode", () => {
  it("maps the blendMode literal to a byte (no longer dropped)", () => {
    expect(resolvePaint({ color: "red", blendMode: "multiply" })).toEqual({
      fill: 0xffff0000,
      blendMode: 24,
    });
  });

  it("a <Paint> blendMode overrides the shape's (last declaration wins)", () => {
    const r = resolvePaint({ color: "red", blendMode: "multiply" }, {
      type: Paint,
      props: { style: "stroke", blendMode: "screen" },
    } as never);
    expect(r.blendMode).toBe(14);
  });
});

describe("resolvePaint filters", () => {
  it("routes a direct filter child to the effective style's paint slot", () => {
    const r = resolvePaint({ color: "red" }, blurChild(4));
    expect(r.fillImageFilter).toBeTypeOf("string");
    expect(r.strokeImageFilter).toBeUndefined();
    // stroke-default shape → the same child lands on the stroke slot
    const s = resolvePaint({ color: "red" }, blurChild(4), "stroke");
    expect(s.strokeImageFilter).toBeTypeOf("string");
    expect(s.fillImageFilter).toBeUndefined();
  });

  it("composes several image filters in declaration order", () => {
    const r = resolvePaint({ color: "red" }, [
      blurChild(2),
      { type: DropShadow, props: { dx: 0, dy: 8, blur: 6, color: "#0003" } } as never,
    ]);
    expect(r.fillImageFilter).toBeTypeOf("string");
  });

  it("routes filters inside a <Paint> to that paint's slot", () => {
    const r = resolvePaint({ color: "red" }, {
      type: Paint,
      props: { style: "stroke", color: "blue", children: blurChild(3) },
    } as never);
    expect(r.strokeImageFilter).toBeTypeOf("string");
    expect(r.fillImageFilter).toBeUndefined();
  });

  it("drops an invalid colorMatrix (nothing serialized)", () => {
    const r = resolvePaint({ color: "red" }, {
      type: ColorMatrix,
      props: { matrix: [1, 2, 3] },
    } as never);
    expect(r.fillColorFilter).toBeUndefined();
  });
});
