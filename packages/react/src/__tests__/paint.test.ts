import { describe, it, expect } from "vitest";

import { buildColorFilter, buildImageFilter, bytesToBase64 } from "@scumble/graphics";
import type { FilterSpec } from "@scumble/graphics";

import { Blur, ColorMatrix } from "../filters/filters";
import { Paint } from "../Paint";
import { Circle } from "../shapes/Circle";
import { resolveLayerEffect, resolvePaint } from "../internal/paint";
import type { GroupLayer } from "../types";

// @lat: [[tests#React component layer#Paint resolution]]
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
      strokeCap: 1,
      strokeJoin: 2,
      strokeMiter: 5,
      opacity: 0.5,
    });
  });

  it("maps blendMode to a byte, drops zIndex (not a paint concern)", () => {
    expect(resolvePaint({ color: "red", blendMode: "multiply", zIndex: 3 })).toEqual({
      fill: 0xffff0000,
      blendMode: 24,
    });
  });
});

describe("resolveLayerEffect", () => {
  // The resolvers consume {type, props} only — hand-built elements stand in
  // for JSX without a renderer.
  const el = (type: unknown, props: unknown) => ({ type, props }) as unknown as GroupLayer;
  const GRAYSCALE = [
    0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0,
    0, 1, 0,
  ];

  it("returns no props when layer is undefined (never set)", () => {
    expect(resolveLayerEffect(undefined)).toEqual({});
  });

  it("true → force only (offscreen composite, no effects)", () => {
    expect(resolveLayerEffect(true)).toEqual({ layerForce: true });
  });

  it("false → explicit full clear (force off + empty slots)", () => {
    expect(resolveLayerEffect(false)).toEqual({
      layerForce: false,
      layerColorFilter: "",
      layerImageFilter: "",
      layerMaskFilter: "",
    });
  });

  it("Paint with blur + colorMatrix → force + both layer slots", () => {
    const specs: FilterSpec[] = [
      { kind: "blur", blur: 8 },
      { kind: "colorMatrix", matrix: GRAYSCALE },
    ];
    const layer = el(Paint, {
      children: [el(Blur, { blur: 8 }), el(ColorMatrix, { matrix: GRAYSCALE })],
    });
    expect(resolveLayerEffect(layer)).toEqual({
      layerForce: true,
      layerImageFilter: bytesToBase64(buildImageFilter(specs)!),
      layerColorFilter: bytesToBase64(buildColorFilter(specs)!),
    });
  });

  it("Paint with no filter children → force only", () => {
    const layer = el(Paint, { color: "red" });
    expect(resolveLayerEffect(layer)).toEqual({ layerForce: true });
  });

  it("non-Paint element → ignored", () => {
    expect(resolveLayerEffect(el(Circle, { cx: 0, cy: 0, radius: 1 }))).toEqual({});
  });
});
