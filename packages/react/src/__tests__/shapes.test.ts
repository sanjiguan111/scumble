import { describe, it, expect } from "vitest";

import { resolvePaint } from "../internal/paint";
import { LinearGradient } from "../shaders/LinearGradient";
import { pointsToPathProp } from "../shapes/Polyline";
import type { ReactNode } from "@lynx-js/react";

/** A data-only gradient child (findShaderChild only reads {type, props}). */
function shaderChild(): ReactNode {
  return {
    type: LinearGradient,
    props: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, colors: ["#fff", "#000"] },
  } as never;
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

describe("pointsToPathProp", () => {
  const TRIANGLE = "0,0 50,100 100,0";

  it("returns undefined for no vertices", () => {
    expect(pointsToPathProp("", false)).toBeUndefined();
    expect(pointsToPathProp([], false)).toBeUndefined();
  });

  it("emits base64 PathCommandList bytes for a points string or Vec[]", () => {
    expect(pointsToPathProp(TRIANGLE, false)).toBeTypeOf("string");
    expect(
      pointsToPathProp(
        [
          { x: 0, y: 0 },
          { x: 50, y: 100 },
          { x: 100, y: 0 },
        ],
        false,
      ),
    ).toBe(pointsToPathProp(TRIANGLE, false));
  });

  it("polygon appends a Close command (longer payload than the same polyline)", () => {
    expect(pointsToPathProp(TRIANGLE, true)!.length).toBeGreaterThan(
      pointsToPathProp(TRIANGLE, false)!.length,
    );
  });
});
