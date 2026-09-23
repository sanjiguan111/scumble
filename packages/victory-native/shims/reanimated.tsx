// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// react-native-reanimated → REACTIVE, worklet-free shim. Reanimated runs
// worklets on the UI thread so `.value` writes take effect without React;
// Lynx has no worklet runtime, so this shim inverts the model: every
// `.value` write bumps a global epoch and re-renders every mounted component
// that uses a reanimated hook ("over-render but correct" — one React render
// per animation/gesture frame, the per-frame-flush pattern validated by
// scumble's ChartDemo morph). Timing functions drive REAL JS tweens
// (@scumble/skia-compat's easing math): `sv.value = withTiming(1, …)` is
// intercepted by the setter and animated frame by frame.
//
// Known divergences from Reanimated (documented for port debugging):
// - no worklet-threads: everything runs on the JS thread, one render/frame;
// - `withSpring` approximates with an eased tween (no true spring integrator);
// - useAnimatedReaction fires from an effect (post-render), not synchronously.

import { useEffect, useRef, useState } from "@lynx-js/react";
import type { ReactNode } from "@lynx-js/react";

import { Easing as ScumbleEasing } from "@scumble/skia-compat";

import { normalizeStyle } from "@scumble/skia-compat";
import type { StyleProp, ViewStyle } from "./react-native.js";

export interface SharedValue<T> {
  value: T;
}

// ---- The global epoch: any write re-renders every subscriber. ----

let epoch = 0;
const subscribers = new Set<() => void>();

function bump(): void {
  epoch++;
  for (const notify of subscribers) notify();
}

/** Internal (test) access to the current epoch. */
export function reanimatedEpoch(): number {
  return epoch;
}

/** Subscribe to any SharedValue write; returns an unsubscribe function. */
export function subscribeReanimated(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

// ---- withTiming/withSpring: deferred descriptors the setter animates. ----

interface AnimationDescriptor<T> {
  readonly __animation: true;
  readonly to: T;
  readonly duration: number;
  readonly easing: (t: number) => number;
  readonly callback?: (finished: boolean) => void;
}

/** Spring config surface (mass/stiffness/damping accepted, unused by the tween approximation). */
export interface WithSpringConfig extends WithTimingConfig {
  mass?: number;
  stiffness?: number;
  damping?: number;
}

export interface WithTimingConfig {
  duration?: number;
  easing?: unknown; // Reanimated Easing.* objects — mapped best-effort below
  reduceMotion?: unknown;
}

/** Map a Reanimated Easing factory result onto a plain easing function. */
function toEasingFn(e: unknown): (t: number) => number {
  if (typeof e === "function") return e as (t: number) => number;
  return ScumbleEasing.easeInOutCubic; // opaque Easing.* objects → default
}

function isAnimationDescriptor<T>(v: unknown): v is AnimationDescriptor<T> {
  return (
    typeof v === "object" && v !== null && (v as { __animation?: boolean }).__animation === true
  );
}

const TICK_MS = 16;

// ---- The reactive SharedValue. ----

class ReactiveSharedValue<T> implements SharedValue<T> {
  private current: T;

  constructor(initial: T) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  set value(next: T) {
    if (isAnimationDescriptor<T>(next)) {
      const descriptor = next;
      if (typeof descriptor.to === "number") {
        // Numeric target: tween frame by frame, writing primitive values.
        const { to, duration, easing, callback } = descriptor as AnimationDescriptor<number>;
        if (duration <= 0) {
          this.current = descriptor.to;
          bump();
          if (callback) setTimeout(() => callback(true), 0);
          return;
        }
        const t0 = Date.now();
        const timer = setInterval(() => {
          const raw = Math.min(Math.max((Date.now() - t0) / duration, 0), 1);
          if (raw >= 1) {
            clearInterval(timer);
            this.current = to as unknown as T;
            bump();
            if (callback) callback(true);
          } else {
            this.current = easing(raw) as unknown as T;
            bump();
          }
        }, TICK_MS);
        return;
      }
      // Non-numeric target (a path, a color string): land it when the tween
      // duration elapses — per-frame interpolation is the caller's derived
      // lane (useDerivedValue over a numeric progress), which is how Victory
      // animates paths anyway.
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - t0 >= descriptor.duration) {
          clearInterval(timer);
          this.current = descriptor.to;
          bump();
          if (descriptor.callback) descriptor.callback(true);
        }
      }, TICK_MS);
      return;
    }
    if (Object.is(this.current, next)) return;
    this.current = next;
    bump();
  }
}

export function useSharedValue<T>(initial: T): SharedValue<T> {
  // Re-render this component on ANY shared-value write (the reactive model).
  const [, force] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeReanimated(() => force((n) => n + 1));
    return unsubscribe;
  }, []);
  const ref = useRef<SharedValue<T> | null>(null);
  if (ref.current === null) ref.current = new ReactiveSharedValue(initial);
  return ref.current;
}

export function useDerivedValue<T>(derive: () => T, _deps?: unknown[]): SharedValue<T> {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeReanimated(() => force((n) => n + 1));
    return unsubscribe;
  }, []);
  const ref = useRef<SharedValue<T> | null>(null);
  if (ref.current === null) ref.current = { value: derive() };
  else ref.current.value = derive();
  return ref.current;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  }
  return true;
}

export function useAnimatedReaction<T>(
  prepare: () => T,
  react: (current: T, previous: T | null) => void,
): void {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeReanimated(() => force((n) => n + 1));
    return unsubscribe;
  }, []);
  const prev = useRef<{ v: T; initialized: boolean } | null>(null);
  const current = prepare();
  useEffect(() => {
    if (prev.current === null) {
      prev.current = { v: current, initialized: true };
      return;
    }
    // Shallow-equal guard: prepare() commonly rebuilds objects every render
    // (fresh object identity); firing react() on identity churn alone can
    // pair with a shared-value write into an infinite re-render loop.
    if (!shallowEqual(prev.current.v, current)) {
      const previous = prev.current.v;
      prev.current.v = current;
      react(current, previous);
    }
  }, [current]);
}

export function runOnJS<F extends (...args: never[]) => unknown>(fn: F): F {
  return ((...args: Parameters<F>) => fn(...args)) as F;
}

export function withTiming<T>(
  to: T,
  config?: WithTimingConfig,
  callback?: (finished: boolean) => void,
): T {
  return {
    __animation: true,
    to,
    duration: config?.duration ?? 300,
    easing: toEasingFn(config?.easing),
    callback,
  } as unknown as T;
}

export function withSpring<T>(
  to: T,
  config?: WithTimingConfig,
  callback?: (finished: boolean) => void,
): T {
  // Spring approximated by a long-ish eased tween (module doc).
  return {
    __animation: true,
    to,
    duration: config?.duration ?? 500,
    easing: ScumbleEasing.easeOutCubic,
    callback,
  } as unknown as T;
}

export function useAnimatedStyle(fn: () => ViewStyle): StyleProp<ViewStyle> {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeReanimated(() => force((n) => n + 1));
    return unsubscribe;
  }, []);
  return fn();
}

export function isSharedValue(v: unknown): v is SharedValue<unknown> {
  return typeof v === "object" && v !== null && "value" in v;
}

export function makeMutable<T>(v: T): SharedValue<T> {
  return new ReactiveSharedValue(v);
}

export function cancelAnimation(_sv: SharedValue<unknown>): void {
  // Tween timers are per-assignment and self-terminating; a new assignment
  // supersedes the running one's writes, so there is nothing to cancel.
}

// Animated.View — Victory's GestureHandler renders into it. The style is
// already JS-computed each render; a Lynx view passthrough.
export const Animated = {
  View: (props: { style?: StyleProp<ViewStyle>; children?: ReactNode; [key: string]: unknown }) => {
    const { style, children, ...rest } = props;
    const flat = Array.isArray(style)
      ? style.filter(Boolean).reduce<ViewStyle>((a, s) => ({ ...a, ...s }), {})
      : (style ?? {});
    return (
      <view style={normalizeStyle(flat)} {...rest}>
        {children}
      </view>
    );
  },
};

export interface WithDecayConfig {
  deceleration?: number;
  velocity?: number;
  rubberBandEffect?: boolean;
}

/** Decay approximated by a long eased tween (module doc). RNGH's withDecay
 * takes ONLY a config (no target — the value settles from velocity); the
 * tween settles at 1, which is how Victory uses it for path progress. */
export function withDecay(
  config?: WithDecayConfig & { type?: string },
  callback?: (finished: boolean) => void,
): number {
  return {
    __animation: true,
    to: 1,
    duration: 700,
    easing: ScumbleEasing.easeOutCubic,
    callback,
  } as unknown as number;
}

export default Animated;
