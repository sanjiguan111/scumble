// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { bytesToBase64, buildAnimationList } from "@lynx-skity/graphics";

import { resolveAnimation } from "../internal/animation";
import {
  animationHandleOf,
  createAnimation,
  fireAnimationFinish,
  registerControlHost,
  unregisterControlHost,
} from "../internal/animation-control";
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
    expect(circle.props.animationHandle).toBeUndefined(); // plain spec: uncontrolled
    const path = Path({ path: "M0 0 L10 10", animate: [track, null] });
    expect(path.props.animationData).toBe(expected);
    expect(path.props.animationHandle).toBeUndefined();
  });

  it("threads a createAnimation() handle through the components", () => {
    const spin = createAnimation({
      property: "rotate" as const,
      from: 0,
      to: 360,
      duration: 3000,
      iterations: Infinity,
    });
    const circle = Circle({ cx: 0, cy: 0, radius: 5, animate: spin });
    expect(circle.props.animationHandle).toBe(spin.controller.handle);
    // The controlled spec serializes like the plain one (the controller field
    // is ignored by the track builder).
    const expected = bytesToBase64(
      buildAnimationList([
        { property: "rotate", from: 0, to: 360, duration: 3000, iterations: Infinity },
      ]),
    );
    expect(circle.props.animationData).toBe(expected);
    // Mixed arrays route by the FIRST controlled entry.
    const path = Path({ path: "M0 0 L10 10", animate: [null, spin, false] });
    expect(path.props.animationHandle).toBe(spin.controller.handle);
  });
});

describe("createAnimation playback control", () => {
  it("mints distinct handles and dispatches through registered hosts", () => {
    const a = createAnimation({ property: "opacity", from: 1, to: 0, duration: 100 });
    const b = createAnimation({ property: "opacity", from: 0, to: 1, duration: 100 });
    expect(a.controller.handle).not.toBe(b.controller.handle);
    expect(animationHandleOf(a)).toBe(a.controller.handle);
    expect(
      animationHandleOf({ property: "opacity", from: 1, to: 0, duration: 100 }),
    ).toBeUndefined();

    const commands: Array<{ handle: string; action: string; time?: number }> = [];
    const host = {
      invokeAnimateControl: (p: { handle: string; action: string; time?: number }) =>
        commands.push(p),
    };
    registerControlHost(host);
    try {
      a.controller.pause();
      a.controller.seekTo(42);
      b.controller.play();
      a.controller.cancel();
    } finally {
      unregisterControlHost(host);
    }
    expect(commands).toEqual([
      { handle: a.controller.handle, action: "pause", time: undefined },
      { handle: a.controller.handle, action: "seek", time: 42 },
      { handle: b.controller.handle, action: "play", time: undefined },
      { handle: a.controller.handle, action: "cancel", time: undefined },
    ]);
    // Unregistered hosts receive nothing.
    a.controller.play();
    expect(commands).toHaveLength(4);
  });

  it("routes finish events by handle through onFinish", () => {
    const a = createAnimation({ property: "opacity", from: 1, to: 0, duration: 100 });
    const b = createAnimation({ property: "opacity", from: 0, to: 1, duration: 100 });
    const fired: string[] = [];
    a.controller.onFinish(() => fired.push("a"));
    fireAnimationFinish(a.controller.handle);
    fireAnimationFinish(b.controller.handle); // no handler: no-op
    expect(fired).toEqual(["a"]);
    a.controller.onFinish(null); // clear
    fireAnimationFinish(a.controller.handle);
    expect(fired).toEqual(["a"]);
  });
});
