// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, it, vi } from "vitest";

import {
  Gesture,
  GestureState,
  PanRecognizer,
  PinchRecognizer,
  outsideWindow,
} from "../gesture.js";
import { buildRuntime, toPointers } from "../components/GestureDetector.js";

const P = (x: number, y: number, identifier = 0) => ({ identifier, x, y });

describe("offset windows (RNGH semantics)", () => {
  it("number form is the [−V, V] window; array form is explicit", () => {
    expect(outsideWindow(5, 10)).toBe(false);
    expect(outsideWindow(-10, 10)).toBe(false); // boundary is inclusive
    expect(outsideWindow(-10.1, 10)).toBe(true);
    expect(outsideWindow(10.1, 10)).toBe(true);
    expect(outsideWindow(4, [5, 20])).toBe(true); // below the window
    expect(outsideWindow(-4, [-20, -5])).toBe(true); // above a one-sided window
    expect(outsideWindow(999, undefined)).toBe(false); // axis not configured
  });
});

// @lat: [[tests#Skia compat layer#Pan recognizer state machine]]
describe("pan recognizer state machine", () => {
  it("activates past activeOffsetX and streams onUpdate/onEnd/onFinalize", () => {
    const onUpdate = vi.fn();
    const onEnd = vi.fn();
    const onFinalize = vi.fn();
    const r = new PanRecognizer(
      { activeOffsetX: [-6, 6], failOffsetY: [-24, 24] },
      { onUpdate, onEnd, onFinalize },
    );

    r.touchBegin([P(100, 100)]);
    r.touchMove([P(104, 100)]); // still inside the window
    expect(r.getState()).toBe(GestureState.BEGAN);
    expect(onUpdate).not.toHaveBeenCalled();

    r.touchMove([P(110, 100)]); // dx=10 → ACTIVE (|dy|=0 keeps the fail axis quiet)
    expect(r.getState()).toBe(GestureState.ACTIVE);
    expect(onUpdate).toHaveBeenCalledTimes(1); // activation emits exactly one
    expect(onUpdate.mock.calls.at(-1)![0]).toMatchObject({
      translationX: 10,
      translationY: 0,
      x: 110,
      numberOfPointers: 1,
    });

    r.touchMove([P(120, 104)]);
    expect(onUpdate.mock.calls.at(-1)![0]).toMatchObject({ translationX: 20, translationY: 4 });

    r.touchEnd();
    expect(r.getState()).toBe(GestureState.UNDETERMINED);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0]![0].state).toBe(GestureState.END);
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });

  it("failOffsetY fails a mostly-vertical drag before X activation", () => {
    const onFinalize = vi.fn();
    const onStart = vi.fn();
    const r = new PanRecognizer(
      { activeOffsetX: [-6, 6], failOffsetY: [-24, 24] },
      { onFinalize, onStart },
    );
    r.touchBegin([P(100, 100)]);
    r.touchMove([P(108, 140)]); // dy=40 over the fail window → FAILED (fail beats activate)
    expect(r.getState()).toBe(GestureState.UNDETERMINED); // failed resets to undetermined
    expect(onStart).not.toHaveBeenCalled();
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(onFinalize.mock.calls[0]![0].state).toBe(GestureState.FAILED);
  });

  it("activateAfterLongPress arms a timer; slop movement fails it", () => {
    vi.useFakeTimers();
    const onStart = vi.fn();
    const onFinalize = vi.fn();
    const r = new PanRecognizer({ activateAfterLongPress: 300 }, { onStart, onFinalize });
    r.touchBegin([P(50, 50)]);
    vi.advanceTimersByTime(300); // elapsed within the slop → ACTIVE
    expect(r.getState()).toBe(GestureState.ACTIVE);
    expect(onStart).toHaveBeenCalledTimes(1);

    // A second gesture: moving past the slop BEFORE the timer fails it.
    const r2 = new PanRecognizer({ activateAfterLongPress: 300 }, { onStart, onFinalize });
    r2.touchBegin([P(50, 50)]);
    r2.touchMove([P(70, 50)]); // 20px > 10px slop
    expect(onFinalize.mock.calls.at(-1)![0].state).toBe(GestureState.FAILED);
    vi.advanceTimersByTime(300); // timer fires into a dead gesture — no-op
    expect(r2.getState()).toBe(GestureState.UNDETERMINED);
    vi.useRealTimers();
  });

  it("without active offsets, default 10px min-distance activates", () => {
    const onStart = vi.fn();
    const r = new PanRecognizer({}, { onStart });
    r.touchBegin([P(0, 0)]);
    r.touchMove([P(7, 5)]); // hypot(7,5) ≈ 8.6 < 10
    expect(r.getState()).toBe(GestureState.BEGAN);
    r.touchMove([P(9, 6)]); // ≈ 10.8 ≥ 10
    expect(r.getState()).toBe(GestureState.ACTIVE);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("a tap (no activation) finalizes as FAILED without onEnd", () => {
    const onEnd = vi.fn();
    const onFinalize = vi.fn();
    const r = new PanRecognizer({ activeOffsetX: [-6, 6] }, { onEnd, onFinalize });
    r.touchBegin([P(0, 0)]);
    r.touchMove([P(2, 1)]);
    r.touchEnd();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(onFinalize.mock.calls[0]![0].state).toBe(GestureState.FAILED);
  });
});

// @lat: [[tests#Skia compat layer#Pinch recognizer and detector wiring]]
describe("pinch recognizer", () => {
  it("tracks scale and focal across two-pointer moves", () => {
    const onUpdate = vi.fn();
    const p = new PinchRecognizer({ onUpdate });
    p.update([P(100, 100, 1), P(200, 100, 2)]); // begin: dist 100, focal 150
    expect(onUpdate.mock.calls[0]![0]).toMatchObject({ scale: 1, focalX: 150 });

    p.update([P(50, 100, 1), P(250, 100, 2)]); // dist 200 → scale 2
    const last = onUpdate.mock.calls.at(-1)![0];
    expect(last.scale).toBeCloseTo(2, 10);
    expect(last.focalX).toBeCloseTo(150, 10);

    p.update([P(120, 100, 1)]); // a finger lifts → END
    const end = onUpdate.mock.calls; // onEnd isn't wired; verify state via a fresh one
    expect(end.length).toBeGreaterThan(0);
    const p2 = new PinchRecognizer({});
    p2.update([P(0, 0, 1), P(10, 0, 2)]);
    expect(p2.getState()).toBe(GestureState.ACTIVE);
    p2.update([P(5, 0, 1)]);
    expect(p2.getState()).toBe(GestureState.UNDETERMINED);
  });
});

describe("detector runtime", () => {
  it("reads pointers from the TOP-LEVEL touches (the on-device Lynx shape)", () => {
    // Lynx TouchEvent carries touches/changedTouches as instance properties;
    // detail only holds the first finger's {x, y}. Reading detail.touches
    // starved every recognizer of pointers — the "drag did nothing" bug.
    const event = { touches: [P(12, 34, 7)], detail: { x: 12, y: 34 } };
    expect(toPointers(event)).toEqual([{ identifier: 7, x: 12, y: 34 }]);
    // detail.touches still works as a fallback (defensive), empty is empty.
    expect(toPointers({ detail: { touches: [P(1, 2)] } })).toEqual([{ identifier: 0, x: 1, y: 2 }]);
    expect(toPointers({})).toEqual([]);
  });

  it("flattens builders and compositions, flagging race", () => {
    const pan = Gesture.Pan();
    const pinch = Gesture.Pinch();
    const single = buildRuntime(pan);
    expect(single.pan).toHaveLength(1);
    expect(single.race).toBe(false);

    const race = buildRuntime(Gesture.Race(pan, pinch));
    expect(race.pan).toHaveLength(1);
    expect(race.pinch).toHaveLength(1);
    expect(race.race).toBe(true);

    const sim = buildRuntime(Gesture.Simultaneous(pan, pinch));
    expect(sim.race).toBe(false);

    const nested = buildRuntime(Gesture.Simultaneous(Gesture.Race(pan, pinch), pinch));
    expect(nested.pan).toHaveLength(1);
    expect(nested.pinch).toHaveLength(2);
    expect(nested.race).toBe(true); // a nested race still arbitrates
  });

  it("builders capture config and callbacks chainably", () => {
    const onUpdate = vi.fn();
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-30, 30])
      .minDistance(5)
      .onUpdate(onUpdate);
    expect(pan.config).toMatchObject({
      activeOffsetX: [-8, 8],
      failOffsetY: [-30, 30],
      minDistance: 5,
    });
    const r = new PanRecognizer(pan.config, pan.callbacks);
    r.touchBegin([P(0, 0)]);
    r.touchMove([P(12, 0)]); // minDistance is overridden by the active axis window
    expect(onUpdate).toHaveBeenCalled();
  });
});
