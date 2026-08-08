import { describe, it, expect } from "vitest";

import { resolvePaint } from "../internal/paint";

describe("resolvePaint", () => {
  it("parses a color string into fill by default (style=fill)", () => {
    expect(resolvePaint({ color: "red" })).toEqual({ fill: 0xffff0000 });
  });

  it("routes color to stroke when style=stroke", () => {
    const r = resolvePaint({ color: "#ffffff", style: "stroke" });
    expect(r.stroke).toBe(0xffffffff);
    expect(r.fill).toBeUndefined();
  });

  it("packs a 0xAARRGGBB number color as-is", () => {
    expect(resolvePaint({ color: 0xff00ff00 })).toEqual({ fill: 0xff00ff00 });
  });

  it("sets no fill/stroke when color is omitted (transparent)", () => {
    const r = resolvePaint({ strokeWidth: 2 });
    expect(r.fill).toBeUndefined();
    expect(r.stroke).toBeUndefined();
    expect(r.strokeWidth).toBe(2);
  });

  it("forwards stroke attributes and opacity", () => {
    expect(
      resolvePaint({
        color: "blue",
        style: "stroke",
        strokeWidth: 4,
        strokeCap: "round",
        strokeJoin: "bevel",
        strokeMiter: 5,
        opacity: 0.5,
      }),
    ).toEqual({
      stroke: 0xff0000ff,
      strokeWidth: 4,
      strokeCap: "round",
      strokeJoin: "bevel",
      strokeMiter: 5,
      opacity: 0.5,
    });
  });

  it("drops blendMode / zIndex (native caveat)", () => {
    expect(resolvePaint({ color: "red", blendMode: "multiply", zIndex: 3 })).toEqual({
      fill: 0xffff0000,
    });
  });
});
