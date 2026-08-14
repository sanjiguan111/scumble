// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { Gradient } from "../generated/skityrt/gradient.js";
import { buildLinearGradient, buildRadialGradient, buildSweepGradient } from "../gradient.js";

// Read the nested-flatbuffer bytes back as a Gradient — exactly what the native
// render side does via GetRoot<Gradient>(). Proves the JS-built bytes round-trip.
function readBack(bytes: ArrayBuffer): Gradient {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return Gradient.getRootAsGradient(bb);
}

describe("buildLinearGradient → nested FlatBuffer round-trip", () => {
  it("serializes a 2-stop linear gradient in absolute user-space", () => {
    const bytes = buildLinearGradient({
      start: [0, 0],
      end: [100, 50],
      colors: ["#ff0000", "#0000ff"],
    });
    const g = readBack(bytes);

    expect(g.type()).toBe(0); // LINEAR
    expect(g.gradientUnits()).toBe(1); // USER_SPACE_ON_USE (schema default is 0 = bbox)
    expect(g.spreadMethod()).toBe(0); // PAD (clamp)
    expect(g.x1()).toBe(0);
    expect(g.y1()).toBe(0);
    expect(g.x2()).toBe(100);
    expect(g.y2()).toBe(50);

    expect(g.stopsLength()).toBe(2);
    const s0 = g.stops(0)!;
    expect(s0.offset()).toBeCloseTo(0);
    expect(s0.color()!.r()).toBe(255); // #ff0000
    expect(s0.color()!.g()).toBe(0);
    expect(s0.color()!.b()).toBe(0);
    expect(s0.color()!.a()).toBe(255);
    const s1 = g.stops(1)!;
    expect(s1.offset()).toBeCloseTo(1);
    expect(s1.color()!.b()).toBe(255); // #0000ff
  });

  it("accepts {x,y} points and maps mode → spread method", () => {
    const g = readBack(
      buildLinearGradient({
        start: { x: 10, y: 20 },
        end: { x: 30, y: 40 },
        colors: ["red", "green", "blue"],
        mode: "mirror",
      }),
    );
    expect(g.spreadMethod()).toBe(1); // REFLECT → mirror
    expect(g.x1()).toBe(10);
    expect(g.y2()).toBe(40);
    expect(g.stopsLength()).toBe(3);
    expect(g.stops(1)!.offset()).toBeCloseTo(0.5); // default even spacing
  });

  it("honors explicit positions", () => {
    const g = readBack(
      buildLinearGradient({
        start: [0, 0],
        end: [1, 1],
        colors: ["#000", "#fff"],
        positions: [0.25, 0.75],
      }),
    );
    expect(g.stops(0)!.offset()).toBeCloseTo(0.25);
    expect(g.stops(1)!.offset()).toBeCloseTo(0.75);
  });

  it("maps repeat → REPEAT", () => {
    const g = readBack(
      buildLinearGradient({ start: [0, 0], end: [1, 0], colors: ["#000", "#fff"], mode: "repeat" }),
    );
    expect(g.spreadMethod()).toBe(2); // REPEAT
  });

  it("throws on fewer than 2 colors", () => {
    expect(() => buildLinearGradient({ start: [0, 0], end: [1, 1], colors: ["#f00"] })).toThrow();
  });
});

describe("buildRadialGradient → nested FlatBuffer round-trip", () => {
  it("serializes center/radius in absolute user-space", () => {
    const g = readBack(
      buildRadialGradient({ c: [120, 80], r: 60, colors: ["#ffffff", "#000000"] }),
    );
    expect(g.type()).toBe(1); // RADIAL
    expect(g.gradientUnits()).toBe(1); // USER_SPACE_ON_USE
    expect(g.spreadMethod()).toBe(0); // PAD (clamp)
    expect(g.cx()).toBe(120);
    expect(g.cy()).toBe(80);
    expect(g.r()).toBe(60);
    expect(g.stopsLength()).toBe(2);
    expect(g.stops(0)!.color()!.r()).toBe(255); // #ffffff
    expect(g.stops(1)!.color()!.b()).toBe(0); // #000000
  });

  it("accepts {x,y} center and maps mode → spread method", () => {
    const g = readBack(
      buildRadialGradient({
        c: { x: 50, y: 50 },
        r: 40,
        colors: ["red", "green", "blue"],
        mode: "mirror",
      }),
    );
    expect(g.spreadMethod()).toBe(1); // REFLECT → mirror
    expect(g.cx()).toBe(50);
    expect(g.stops(1)!.offset()).toBeCloseTo(0.5); // default even spacing
  });

  it("throws on fewer than 2 colors or non-positive radius", () => {
    expect(() => buildRadialGradient({ c: [0, 0], r: 10, colors: ["#f00"] })).toThrow();
    expect(() => buildRadialGradient({ c: [0, 0], r: 0, colors: ["#f00", "#00f"] })).toThrow();
  });
});

describe("buildSweepGradient → nested FlatBuffer round-trip", () => {
  it("defaults to a full 0–360 turn", () => {
    const g = readBack(
      buildSweepGradient({ c: [90, 90], colors: ["#ff0000", "#00ff00", "#0000ff"] }),
    );
    expect(g.type()).toBe(2); // SWEEP
    expect(g.gradientUnits()).toBe(1); // USER_SPACE_ON_USE
    expect(g.cx()).toBe(90);
    expect(g.cy()).toBe(90);
    expect(g.startAngle()).toBe(0);
    expect(g.endAngle()).toBe(360);
    expect(g.stopsLength()).toBe(3);
    expect(g.stops(2)!.color()!.b()).toBe(255); // #0000ff
  });

  it("honors an explicit angular range and mode", () => {
    const g = readBack(
      buildSweepGradient({
        c: { x: 30, y: 40 },
        start: 90,
        end: 270,
        colors: ["#000", "#fff"],
        mode: "repeat",
      }),
    );
    expect(g.startAngle()).toBe(90);
    expect(g.endAngle()).toBe(270);
    expect(g.spreadMethod()).toBe(2); // REPEAT
  });

  it("throws on fewer than 2 colors or an empty angular range", () => {
    expect(() => buildSweepGradient({ c: [0, 0], colors: ["#f00"] })).toThrow();
    expect(() =>
      buildSweepGradient({ c: [0, 0], start: 90, end: 90, colors: ["#f00", "#00f"] }),
    ).toThrow();
  });
});
