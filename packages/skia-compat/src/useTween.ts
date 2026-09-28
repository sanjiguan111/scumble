// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `useTween` — the Reanimated `withTiming` replacement for ports. Reanimated
 * worklets have no Lynx counterpart, so a port drives its transitions from
 * the JS thread: this hook tweens a 0→1 progress value with an easing, one
 * setState per tick, and the caller derives per-frame outputs from it
 * (e.g. `Skia.Path.Interpolate(prev, next, t)` — the ChartDemo morph lane).
 *
 * Ticks ride `setInterval`, NOT `requestAnimationFrame`: on the iOS Lynx JS
 * runtime rAF does not drive canvas redraws (canvases stay blank — the
 * InteractiveDemo finding), while setInterval flushes once per layout pass.
 *
 * The pure core ({@link tweenValue} + {@link Easing}) is exported for tests
 * and for non-React callers.
 */

import { useEffect, useRef, useState } from "@lynx-js/react";

/** Easing functions over normalized progress `t` ∈ [0, 1]. */
export const Easing = {
  linear: (t: number): number => t,
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
} as const;

export type TweenEasing = (t: number) => number;

export interface TweenOptions {
  /** Duration in ms. 0/negative completes immediately. Default 300. */
  duration?: number;
  /** Default {@link Easing.easeInOutCubic}. */
  easing?: TweenEasing;
}

/**
 * The pure progression: eased progress for `elapsed` ms into a `duration` ms
 * tween. Clamped to [0, 1]; a non-positive duration is instantly complete.
 */
export function tweenValue(
  elapsed: number,
  duration: number,
  easing: TweenEasing = Easing.easeInOutCubic,
): number {
  if (duration <= 0 || !Number.isFinite(duration)) return 1;
  return easing(Math.min(Math.max(elapsed / duration, 0), 1));
}

export interface TweenController {
  /** Current eased progress. Starts at 1 (settled) unless told otherwise. */
  value: number;
  /** True while a tween is ticking. */
  animating: boolean;
  /** (Re)start the 0→1 tween; safe to call repeatedly — it resets cleanly. */
  start(options?: TweenOptions): void;
}

// 32ms (≈30fps) — every tick re-renders the caller's whole component tree
// through a full Lynx commit (device-measured ~280ms for a chart page); 16ms
// ticks halve the wall time of a morph for no visible gain at this cost.
const TICK_MS = 32;

export function useTween(initial = 1): TweenController {
  const [state, setState] = useState<{ value: number; animating: boolean }>({
    value: initial,
    animating: false,
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const start = (options: TweenOptions = {}) => {
    const duration = options.duration ?? 300;
    const easing = options.easing ?? Easing.easeInOutCubic;
    stop();
    const t0 = Date.now();
    setState({ value: tweenValue(0, duration, easing), animating: duration > 0 });
    if (duration <= 0) return;
    timer.current = setInterval(() => {
      const value = tweenValue(Date.now() - t0, duration, easing);
      if (value >= 1) {
        stop();
        setState({ value: 1, animating: false });
      } else {
        setState({ value, animating: true });
      }
    }, TICK_MS);
  };

  // Clear the interval on unmount — a ticking timer past the component's
  // life would leak and setState on an unmounted tree.
  useEffect(() => stop, []);

  return { value: state.value, animating: state.animating, start };
}
