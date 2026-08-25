// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { bytesToBase64, buildAnimationList } from "@lynx-skity/graphics";

import { resolveAnimation } from "../internal/animation";
import { Path } from "../shapes/Path";
import { Circle } from "../shapes/Circle";
import type { AnimationSpec } from "../types";

// resolveAnimation returns a base64-encoded AnimationList (nested FlatBuffer
// bytes for Lynx's string prop channel). Serialization itself is covered by
// @lynx-skity/graphics' round-trip tests; here we assert the resolve
// semantics (undefined / filtering / clearing) against the same builder.
function expectBytes(actual: string | undefined, expected: AnimationSpec[]) {
  expect(actual).toBe(bytesToBase64(buildAnimationList(expected)));
}

describe("resolveAnimation", () => {
  it("returns undefined when animate is undefined (no command)", () => {
    expect(resolveAnimation(undefined)).toBeUndefined();
  });

  it("serializes a single track", () => {
    const track = { property: "pathEnd" as const, from: 0, to: 1, duration: 800 };
    expectBytes(resolveAnimation(track), [track]);
  });

  it("filters null/false holes out of arrays", () => {
    const track = { property: "opacity" as const, from: 1, to: 0.5, duration: 300 };
    expectBytes(resolveAnimation([null, track, false]), [track]);
  });

  it("an empty result clears all animations on the node (empty string)", () => {
    expect(resolveAnimation(null)).toBe("");
    expect(resolveAnimation([])).toBe("");
    expect(resolveAnimation([false, null])).toBe("");
  });

  it("threads through shape components (Circle/Path forward the prop)", () => {
    const track = { property: "opacity" as const, from: 1, to: 0.5, duration: 300 };
    const expected = bytesToBase64(buildAnimationList([track]));
    // Component functions return the intrinsic element; props carry the
    // resolved base64 (same call-the-function style as shapes.test.ts).
    const circle = Circle({ cx: 0, cy: 0, radius: 5, animate: track });
    expect(circle.props.animationData).toBe(expected);
    const path = Path({ path: "M0 0 L10 10", animate: [track, null] });
    expect(path.props.animationData).toBe(expected);
  });
});
