// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// scumble's replacement for upstream victory-native's useAnimatedPath — the
// low-end-device bottleneck fix. Upstream tweens a progress SharedValue 0→1
// and derives an interpolated path every frame; under the reactive shim (no
// worklets) each frame is a full React render + Lynx patch+layout round,
// which on 2017-era Android (MI6) costs ~280ms/commit and throttles
// data-driven morphs to ~3fps.
//
// The NATIVE lane: when the config is a timing OR spring tween and the two
// geometries are command-interpolatable, the hook's value becomes a
// PathMorphSpec descriptor — <Path> renders it as ONE `pathD` animation
// track (base d = terminal geometry). The track rides a single prop
// commit; the render thread lerps per vsync with zero JS and zero patch
// rounds until it settles. Springs ride it too (the shim's withSpring is
// itself an easeOutCubic approximation — same fidelity, no per-frame JS).
// Fallbacks keep the upstream JS lane unchanged: decay configs,
// non-interpolatable pairs (structure mismatch), and equal-geometry
// settles (no tween at all — the mount-tween skip, generalized to every
// data switch).
//
// This file is vendored OVER upstream's hooks/useAnimatedPath.ts wholesale
// (scripts/vendor.mjs `overrides`), so it must keep the upstream export
// surface: useAnimatedPath + PathAnimationConfig.

import * as React from "@lynx-js/react";
import { Skia, pathMorph, type PathMorphSpec, type SkPath } from "@scumble/skia-compat";

import {
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
  type WithDecayConfig,
  type WithSpringConfig,
  type WithTimingConfig,
} from "./reanimated";

export type PathAnimationConfig =
  | ({ type: "timing" } & WithTimingConfig)
  | ({ type: "spring" } & WithSpringConfig)
  | ({ type: "decay" } & WithDecayConfig);

function isWithDecayConfig(
  config: PathAnimationConfig,
): config is WithDecayConfig & { type: "decay" } {
  return config.type === "decay";
}

function isWithTimingConfig(
  config: PathAnimationConfig,
): config is WithTimingConfig & { type: "timing" } {
  return config.type === "timing";
}

function isWithSpringConfig(
  config: PathAnimationConfig,
): config is WithSpringConfig & { type: "spring" } {
  return config.type === "spring";
}

/** The hook's runtime value: a concrete path (JS lane / settled) or a native
 *  morph descriptor. */
export type AnimatedPathValue = SkPath | PathMorphSpec;

/** Path2D.interpolate throws on op-composed operands — guard the lane check. */
function interpolatable(to: SkPath, from: SkPath): boolean {
  try {
    return to.isInterpolatable(from);
  } catch {
    return false;
  }
}

/** The JS lane's per-frame interpolation (upstream semantics, verbatim):
 * direct interpolate, then precision-normalized retry, then a 0.5 snap. */
function interpolateProgress(from: SkPath, to: SkPath, t: number): SkPath {
  if (t === 0) {
    return from;
  }
  if (t === 1) {
    return to;
  }

  if (to && from && interpolatable(to, from)) {
    // Skia weights the first path by t; victory's interpolatePath passes
    // (to, from, t) — morphing from → to as t goes 0 → 1.
    const interpolated = Skia.Path.Interpolate(to, from, t);
    if (interpolated) {
      return interpolated;
    }
  }

  const normalizePrecision = (svgPathStr: string): string =>
    svgPathStr.replace(/(\d+\.\d+)/g, (match) => parseFloat(match).toFixed(3));

  const toSVG = to?.toSVGString();
  const fromSVG = from?.toSVGString();

  if (toSVG && fromSVG) {
    const toNormalized = Skia.Path.MakeFromSVGString(normalizePrecision(toSVG));
    const fromNormalized = Skia.Path.MakeFromSVGString(normalizePrecision(fromSVG));

    if (toNormalized && fromNormalized && toNormalized.isInterpolatable(fromNormalized)) {
      const interpolatedNormalized = Skia.Path.Interpolate(toNormalized, fromNormalized, t);
      if (interpolatedNormalized) {
        return interpolatedNormalized;
      }
    }
  }

  return t > 0.5 ? to : from;
}

type Lane = "native" | "js" | "settled";

/** easeOutCubic (x → 1-(1-x)³) as a cubic-bezier tuple — the curve the
 *  reactive shim's withSpring approximation already uses. */
const EASE_OUT_CUBIC: [number, number, number, number] = [0.215, 0.61, 0.355, 1];

/** The per-data-switch lane decision (exported for tests): equal geometry
 *  settles outright; timing AND spring tweens over interpolatable geometries
 *  ride the native `pathD` track (the shim approximates springs as an eased
 *  tween anyway — withSpring is 500ms easeOutCubic with no overshoot and
 *  mass/stiffness/damping unused, so the native track is no less faithful
 *  while removing per-frame JS commits entirely); decay configs and
 *  non-interpolatable pairs fall back to the JS tween lane. */
export function resolvePathMorph(
  from: SkPath,
  to: SkPath,
  animConfig: PathAnimationConfig,
): { lane: "settled"; value: SkPath } | { lane: "native"; value: PathMorphSpec } | { lane: "js" } {
  if (to.toSVGString() === from.toSVGString()) {
    // Identical geometry — settle instead of tweening (either lane).
    return { lane: "settled", value: to };
  }
  if (!interpolatable(to, from)) {
    return { lane: "js" };
  }
  if (isWithTimingConfig(animConfig) && (animConfig.duration ?? 300) > 0) {
    // Easing "ease-in-out": parity with the shim's timing default for
    // opaque Reanimated Easing objects.
    return {
      lane: "native",
      value: pathMorph(from, to, { duration: animConfig.duration, easing: "ease-in-out" }),
    };
  }
  if (isWithSpringConfig(animConfig) && (animConfig.duration ?? 500) > 0) {
    return {
      lane: "native",
      value: pathMorph(from, to, {
        duration: animConfig.duration ?? 500, // the shim's withSpring default
        easing: EASE_OUT_CUBIC,
      }),
    };
  }
  return { lane: "js" };
}

export const useAnimatedPath = (
  currentPathProp: SkPath,
  animConfig: PathAnimationConfig = { type: "timing", duration: 300 },
) => {
  // Native-lane slot: a real shared value so each data switch notifies ONE
  // re-render (the descriptor / settled path must reach <Path> exactly once;
  // afterwards the lane runs entirely on the render thread).
  const morphSV = useSharedValue<AnimatedPathValue>(currentPathProp.copy());

  // JS-lane state (upstream, verbatim).
  const progressSV = useSharedValue(0);
  const fromPathSV = useSharedValue<SkPath>(currentPathProp.copy());
  const targetPathSV = useSharedValue<SkPath>(currentPathProp.copy());

  const lane = React.useRef<Lane>("settled");

  React.useEffect(() => {
    // The previous animation's target is the new starting point (.copy()
    // avoids shared mutable object issues).
    fromPathSV.value = targetPathSV.value.copy();
    targetPathSV.value = currentPathProp.copy();
    const resolved = resolvePathMorph(fromPathSV.value, targetPathSV.value, animConfig);
    lane.current = resolved.lane;
    if (resolved.lane !== "js") {
      morphSV.value = resolved.value;
      return;
    }
    // JS lane: reset progress and start the tween (spring/decay approximate
    // on the shim's global ticker).
    progressSV.value = 0;
    if (isWithTimingConfig(animConfig)) {
      progressSV.value = withTiming(1, animConfig);
    } else if (isWithSpringConfig(animConfig)) {
      progressSV.value = withSpring(1, animConfig);
    } else if (isWithDecayConfig(animConfig)) {
      progressSV.value = withDecay(animConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPathProp, animConfig]);

  // A plain shared-value-shaped wrapper: the JS lane interpolates on READ
  // (once per subscriber re-render, exactly like upstream's derived value),
  // the other lanes expose the settled path / descriptor.
  const api: SharedValue<AnimatedPathValue> = {
    get value(): AnimatedPathValue {
      return lane.current === "js"
        ? interpolateProgress(fromPathSV.value, targetPathSV.value, progressSV.value)
        : morphSV.value;
    },
  };
  return api;
};
