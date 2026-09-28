// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// The reactive shim's global animation ticker: all concurrent tweens share
// ONE interval and subscribers are notified ONCE per frame — the per-tween-
// interval + per-write-bump shape re-rendered every subscriber dozens of
// times per frame on Victory pages (a candlestick window alone runs ~36
// tweens), which is what made taps feel slow on device.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelAnimation,
  makeMutable,
  reanimatedEpoch,
  resetTickerForTests,
  withTiming,
} from "../shims/reanimated.js";

// The ticker's tick interval (32ms — see the shim); tests step by exactly one
// tick so the assertions stay pinned to the coalescing semantics, not the rate.
const TICK_MS = 32;

// Tweens read wall-clock time via Date.now(); fake it together with the
// timer APIs so advanceTimersByTime also advances the tween progress.
beforeEach(() =>
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  }),
);
afterEach(() => {
  // The ticker's interval belongs to THIS test's clock; drop it or the next
  // test's clock will never fire it.
  resetTickerForTests();
  vi.useRealTimers();
});

// @lat: [[tests#Skia compat layer#Reanimated shim ticker]]
describe("reanimated shim animation ticker", () => {
  it("coalesces concurrent tweens into one notification per frame", () => {
    const tweens = Array.from({ length: 12 }, () => makeMutable(0));
    for (const sv of tweens) sv.value = withTiming(1, { duration: 100 });
    const before = reanimatedEpoch();
    vi.advanceTimersByTime(TICK_MS);
    expect(reanimatedEpoch()).toBe(before + 1); // not +12
    vi.advanceTimersByTime(TICK_MS);
    expect(reanimatedEpoch()).toBe(before + 2);
  });

  it("lands the final value and fires the completion callback", () => {
    const sv = makeMutable(0);
    let finished: boolean | undefined;
    sv.value = withTiming(1, { duration: 50 }, (f) => (finished = f));
    vi.advanceTimersByTime(64);
    expect(sv.value).toBe(1);
    expect(finished).toBe(true);
  });

  it("cancelAnimation freezes the value mid-flight", () => {
    const sv = makeMutable(0);
    sv.value = withTiming(1, { duration: 1000 });
    vi.advanceTimersByTime(48);
    const frozen = sv.value;
    expect(frozen).toBeGreaterThan(0);
    expect(frozen).toBeLessThan(1);
    cancelAnimation(sv);
    vi.advanceTimersByTime(500);
    expect(sv.value).toBe(frozen);
  });

  it("a new assignment supersedes the running tween", () => {
    const sv = makeMutable(0);
    sv.value = withTiming(1, { duration: 1000 });
    vi.advanceTimersByTime(32);
    sv.value = withTiming(0.5, { duration: 100 });
    vi.advanceTimersByTime(200);
    expect(sv.value).toBe(0.5);
  });

  it("stops ticking once idle", () => {
    const sv = makeMutable(0);
    sv.value = withTiming(1, { duration: 32 });
    vi.advanceTimersByTime(64);
    const settled = reanimatedEpoch();
    vi.advanceTimersByTime(200);
    expect(reanimatedEpoch()).toBe(settled);
  });
});
