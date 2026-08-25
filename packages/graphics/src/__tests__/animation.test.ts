import { describe, it, expect } from "vitest";

import { buildAnimationList } from "../animation.js";
import { AnimationList } from "../generated/skityrt/animation-list.js";
import { AnimationTrack } from "../generated/skityrt/animation-track.js";
import { AnimatedProperty } from "../generated/skityrt/animated-property.js";
import { EasingKind } from "../generated/skityrt/easing-kind.js";
import { FillMode } from "../generated/skityrt/fill-mode.js";
import { Keyframe } from "../generated/skityrt/keyframe.js";
import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";

function readBack(bytes: ArrayBuffer): AnimationList {
  return AnimationList.getRootAsAnimationList(new flatbuffers.ByteBuffer(new Uint8Array(bytes)));
}

describe("buildAnimationList", () => {
  it("serializes from/to sugar into two keyframes pinned to 0/1", () => {
    const list = readBack(
      buildAnimationList([{ property: "opacity", from: 0.25, to: 0.75, duration: 500 }]),
    );
    expect(list.tracksLength()).toBe(1);
    const t = list.tracks(0, new AnimationTrack())!;
    expect(t.property()).toBe(AnimatedProperty.OPACITY);
    expect(t.duration()).toBe(500);
    expect(t.delay()).toBe(0);
    expect(t.iterations()).toBe(1);
    expect(t.fill()).toBe(FillMode.NONE);
    expect(t.keyframesLength()).toBe(2);
    const k0 = t.keyframes(0, new Keyframe())!;
    const k1 = t.keyframes(1, new Keyframe())!;
    expect(k0.offset()).toBe(0);
    expect(k0.value()).toBe(0.25);
    expect(k1.offset()).toBe(1);
    expect(k1.value()).toBe(0.75);
  });

  it("maps iterations: Infinity → -1 (infinite), carries delay/autoReverse/fill", () => {
    const list = readBack(
      buildAnimationList([
        {
          property: "pathEnd",
          from: 0,
          to: 1,
          duration: 2000,
          delay: 100,
          iterations: Infinity,
          autoReverse: true,
          fill: "forwards",
        },
      ]),
    );
    const t = list.tracks(0, new AnimationTrack())!;
    expect(t.property()).toBe(AnimatedProperty.PATH_END);
    expect(t.delay()).toBe(100);
    expect(t.iterations()).toBe(-1);
    expect(t.autoReverse()).toBe(true);
    expect(t.fill()).toBe(FillMode.FORWARDS);
  });

  it("resolves preset easings into cubic-bezier kinds with the right points", () => {
    const list = readBack(
      buildAnimationList([{ property: "x", from: 0, to: 10, duration: 100, easing: "ease-in" }]),
    );
    const k = list.tracks(0, new AnimationTrack())!.keyframes(0, new Keyframe())!;
    expect(k.easing()).toBe(EasingKind.CUBIC_BEZIER);
    expect(k.p1x()).toBeCloseTo(0.42, 5);
    expect(k.p2x()).toBeCloseTo(1, 5);
  });

  it("passes custom cubic-bezier control points through", () => {
    const list = readBack(
      buildAnimationList([
        {
          property: "y",
          from: 0,
          to: 10,
          duration: 100,
          easing: [0.34, 1.56, 0.64, 1],
        },
      ]),
    );
    const k = list.tracks(0, new AnimationTrack())!.keyframes(0, new Keyframe())!;
    expect(k.easing()).toBe(EasingKind.CUBIC_BEZIER);
    expect(k.p1x()).toBeCloseTo(0.34, 5);
    expect(k.p1y()).toBeCloseTo(1.56, 5);
    expect(k.p2x()).toBeCloseTo(0.64, 5);
    expect(k.p2y()).toBeCloseTo(1, 5);
  });

  it("resolves keyframe easing fallback: unset keyframes inherit the track default", () => {
    const list = readBack(
      buildAnimationList([
        {
          property: "opacity",
          keyframes: [
            { value: 0, easing: "linear" }, // explicit linear stays linear
            { value: 1 }, // inherits the track's step-end
          ],
          duration: 100,
          easing: "step-end",
        },
      ]),
    );
    const t = list.tracks(0, new AnimationTrack())!;
    expect(t.keyframes(0, new Keyframe())!.easing()).toBe(EasingKind.LINEAR);
    expect(t.keyframes(1, new Keyframe())!.easing()).toBe(EasingKind.STEP_END);
  });

  it("evens out missing keyframe offsets and carries per-property extras", () => {
    const list = readBack(
      buildAnimationList([
        {
          property: "scale",
          keyframes: [{ value: 0.5 }, { value: 1 }, { value: 1.5 }],
          duration: 100,
          cx: 20,
          cy: 30,
        },
      ]),
    );
    const t = list.tracks(0, new AnimationTrack())!;
    expect(t.property()).toBe(AnimatedProperty.SCALE_XY);
    expect(t.cx()).toBe(20);
    expect(t.cy()).toBe(30);
    expect(t.keyframesLength()).toBe(3);
    expect(t.keyframes(1, new Keyframe())!.offset()).toBeCloseTo(0.5, 5);
    // scale's value2 mirrors value when unspecified (uniform scale).
    expect(t.keyframes(1, new Keyframe())!.value2()).toBeCloseTo(1, 5);
  });

  it("packs colors for the color slots (fillColor/strokeColor)", () => {
    const list = readBack(
      buildAnimationList([
        { property: "fillColor", from: "#3b82f6", to: "#ec4899", duration: 100 },
      ]),
    );
    const t = list.tracks(0, new AnimationTrack())!;
    expect(t.property()).toBe(AnimatedProperty.FILL_COLOR);
    expect(t.keyframes(0, new Keyframe())!.color()).toBe(0xff3b82f6);
    expect(t.keyframes(1, new Keyframe())!.color()).toBe(0xffec4899);
  });

  it("serializes several tracks in order", () => {
    const list = readBack(
      buildAnimationList([
        { property: "opacity", from: 1, to: 0.4, duration: 900 },
        { property: "pathEnd", from: 0, to: 1, duration: 1800 },
      ]),
    );
    expect(list.tracksLength()).toBe(2);
    expect(list.tracks(0, new AnimationTrack())!.property()).toBe(AnimatedProperty.OPACITY);
    expect(list.tracks(1, new AnimationTrack())!.property()).toBe(AnimatedProperty.PATH_END);
  });

  it("throws for zero tracks or a track with < 2 keyframes", () => {
    expect(() => buildAnimationList([])).toThrow();
    expect(() =>
      buildAnimationList([{ property: "opacity", keyframes: [{ value: 1 }], duration: 100 }]),
    ).toThrow();
  });
});
