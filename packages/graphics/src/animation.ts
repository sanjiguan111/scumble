// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Animation specs → a nested FlatBuffer (`AnimationList`) carried as bytes.
 *
 * Same wire contract as {@link parsePath}/gradients: a friendly spec is
 * serialized with flatbuffers.js, the native side memcpy's the bytes verbatim
 * and parses the tracks ONCE (`ApplySetAnimation`); the render thread then
 * interpolates them per vsync into a per-node overlay — the base fields are
 * never touched (see packages/native/ANIMATION_DESIGN.md). The react layer
 * base64-encodes the bytes for Lynx's string prop channel.
 *
 * This module also normalizes the spec so native stays dumb: `from`/`to` sugar
 * expands into two keyframes, missing offsets are evened out, first/last
 * offsets are pinned to 0/1, and a keyframe without its own easing inherits
 * the track's (FlatBuffer defaults cannot express "inherit", so the fallback
 * resolves HERE — native takes keyframe easing as final).
 */

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { AnimatedProperty } from "./generated/skityrt/animated-property.js";
import { AnimationList } from "./generated/skityrt/animation-list.js";
import { AnimationTrack } from "./generated/skityrt/animation-track.js";
import { EasingKind } from "./generated/skityrt/easing-kind.js";
import { FillMode } from "./generated/skityrt/fill-mode.js";
import { Keyframe } from "./generated/skityrt/keyframe.js";
import { parseColor } from "./color.js";
import type { Color } from "./color.js";

/** Easing curve of a keyframe segment: a preset name or cubic-bezier points. */
export type EasingSpec =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step-start"
  | "step-end"
  | [number, number, number, number]; // cubic-bezier(x1, y1, x2, y2)

interface ResolvedEasing {
  kind: EasingKind;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

const EASE_IN_OUT_POINTS: ResolvedEasing = {
  kind: EasingKind.CUBIC_BEZIER,
  p1x: 0.42,
  p1y: 0,
  p2x: 0.58,
  p2y: 1,
};

function resolveEasing(spec: EasingSpec | undefined): ResolvedEasing {
  switch (spec) {
    case undefined:
    case "linear":
      return { kind: EasingKind.LINEAR, p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };
    case "ease-in":
      return { kind: EasingKind.CUBIC_BEZIER, p1x: 0.42, p1y: 0, p2x: 1, p2y: 1 };
    case "ease-out":
      return { kind: EasingKind.CUBIC_BEZIER, p1x: 0, p1y: 0, p2x: 0.58, p2y: 1 };
    case "ease-in-out":
      return EASE_IN_OUT_POINTS;
    case "step-start":
      return { kind: EasingKind.STEP_START, p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };
    case "step-end":
      return { kind: EasingKind.STEP_END, p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };
    default: {
      const [x1, y1, x2, y2] = spec;
      return { kind: EasingKind.CUBIC_BEZIER, p1x: x1, p1y: y1, p2x: x2, p2y: y2 };
    }
  }
}

/** Animatable node properties (render_tree_style.fbs `AnimatedProperty`). */
export type AnimatedPropertyName =
  | "opacity"
  | "translateX"
  | "translateY"
  | "rotate"
  | "scale"
  | "pathStart"
  | "pathEnd"
  | "fillColor"
  | "strokeColor"
  | "x"
  | "y"
  | "width"
  | "height"
  | "cx"
  | "cy"
  | "r";

export const ANIMATED_PROPERTY: Record<AnimatedPropertyName, AnimatedProperty> = {
  opacity: AnimatedProperty.OPACITY,
  translateX: AnimatedProperty.TRANSLATE_X,
  translateY: AnimatedProperty.TRANSLATE_Y,
  rotate: AnimatedProperty.ROTATE,
  scale: AnimatedProperty.SCALE_XY,
  pathStart: AnimatedProperty.PATH_START,
  pathEnd: AnimatedProperty.PATH_END,
  fillColor: AnimatedProperty.FILL_COLOR,
  strokeColor: AnimatedProperty.STROKE_COLOR,
  x: AnimatedProperty.X,
  y: AnimatedProperty.Y,
  width: AnimatedProperty.WIDTH,
  height: AnimatedProperty.HEIGHT,
  cx: AnimatedProperty.CX,
  cy: AnimatedProperty.CY,
  r: AnimatedProperty.R,
};

/**
 * One keyframe. `value`/`value2` cover the scalar slots (value2 = `scale`'s
 * sy); `color` covers the color slots (either may be used per property).
 */
export interface KeyframeSpec {
  /** Position within one iteration, [0,1]. Omitted → evened out; the first/last are pinned to 0/1. */
  offset?: number;
  value?: number;
  value2?: number;
  color?: Color;
  /** Easing of the segment STARTING at this keyframe; omitted → the track's. */
  easing?: EasingSpec;
}

/** One animated property. */
export interface AnimationTrackSpec {
  property: AnimatedPropertyName;
  /** Keyframe values; `from`/`to` is sugar for a two-keyframe track. */
  from?: number | Color | [number, number];
  to?: number | Color | [number, number];
  keyframes?: KeyframeSpec[];
  /** Milliseconds per iteration (default 300). */
  duration?: number;
  /** Milliseconds before the first iteration (default 0). */
  delay?: number;
  /** Iteration count; `Infinity`/negative = infinite (default 1). */
  iterations?: number;
  /** Even iterations forward, odd reversed — CSS alternate (default false). */
  autoReverse?: boolean;
  /** What happens after the last iteration: back to base, or pin the end value. */
  fill?: "none" | "forwards";
  /** Track-default easing (keyframes without their own inherit it). */
  easing?: EasingSpec;
  /** `rotate`/`scale` pivot center (default 0,0). */
  cx?: number;
  cy?: number;
}

interface NormalizedKeyframe {
  offset: number;
  value: number;
  value2: number;
  color: number;
  easing: ResolvedEasing;
}

const COLOR_PROPERTIES = new Set<string>(["fillColor", "strokeColor"]);

// `from`/`to`/keyframe values → scalar slots (+ color for the color slots).
// `scale` accepts [sx, sy]; color properties accept any Color.
function normalizeValue(
  property: string,
  v: number | Color | [number, number] | undefined,
): { value: number; value2: number; color: number } {
  if (v === undefined) return { value: 0, value2: 0, color: 0xff000000 };
  if (COLOR_PROPERTIES.has(property)) {
    return { value: 0, value2: 0, color: parseColor(v as Color) };
  }
  if (Array.isArray(v) && v.length === 2 && property === "scale") {
    return { value: v[0]!, value2: v[1]!, color: 0xff000000 };
  }
  return { value: v as number, value2: v as number, color: 0xff000000 };
}

function normalizeTrack(spec: AnimationTrackSpec): NormalizedKeyframe[] {
  const trackEasing = resolveEasing(spec.easing);
  let raw: { offset?: number; v: ReturnType<typeof normalizeValue>; easing?: EasingSpec }[] = [];
  if (spec.keyframes && spec.keyframes.length > 0) {
    raw = spec.keyframes.map((k) => ({
      offset: k.offset,
      v: {
        value: k.value ?? 0,
        value2: k.value2 ?? k.value ?? 0,
        color: k.color !== undefined ? parseColor(k.color) : 0xff000000,
      },
      easing: k.easing,
    }));
  } else {
    // from/to sugar (values may be Color / [sx, sy] — normalizeValue handles).
    raw = [
      { offset: 0, v: normalizeValue(spec.property, spec.from), easing: undefined },
      { offset: 1, v: normalizeValue(spec.property, spec.to), easing: undefined },
    ];
  }
  const n = raw.length;
  if (n < 2) throw new Error(`buildAnimationList: track "${spec.property}" needs >= 2 keyframes`);
  // Even out missing offsets, then pin first/last to 0/1 (native segment
  // search expects the [0,1] span covered).
  const keys: NormalizedKeyframe[] = raw.map((k, i) => ({
    offset: k.offset !== undefined ? k.offset : i / (n - 1),
    value: k.v.value,
    value2: k.v.value2,
    color: k.v.color,
    easing: resolveEasing(k.easing),
  }));
  keys[0]!.offset = 0;
  keys[n - 1]!.offset = 1;
  for (let i = 0; i < n; i++) {
    if (keys[i]!.easing.kind === EasingKind.LINEAR && !raw[i]!.easing) {
      // No explicit per-keyframe easing → inherit the track default.
      keys[i]!.easing = trackEasing;
    }
  }
  return keys;
}

/**
 * Serialize animation tracks into a nested `AnimationList` FlatBuffer. The
 * react layer base64-encodes this for the native `animation` prop.
 *
 * @throws if a track has fewer than 2 effective keyframes.
 *
 * @example
 * buildAnimationList([
 *   { property: "pathEnd", from: 0, to: 1, duration: 1500, iterations: Infinity },
 * ]);
 */
export function buildAnimationList(tracks: AnimationTrackSpec[]): ArrayBuffer {
  if (tracks.length === 0) throw new Error("buildAnimationList: needs at least one track");
  const builder = new flatbuffers.Builder(256);
  const trackOffsets: flatbuffers.Offset[] = [];
  for (const spec of tracks) {
    const keys = normalizeTrack(spec);
    const kfOffsets: flatbuffers.Offset[] = [];
    for (const k of keys) {
      kfOffsets.push(
        Keyframe.createKeyframe(
          builder,
          k.offset,
          k.value,
          k.value2,
          k.color,
          k.easing.kind,
          k.easing.p1x,
          k.easing.p1y,
          k.easing.p2x,
          k.easing.p2y,
        ),
      );
    }
    const kfsOff = AnimationTrack.createKeyframesVector(builder, kfOffsets);
    const iterations =
      spec.iterations === Infinity || (spec.iterations !== undefined && spec.iterations < 0)
        ? -1
        : (spec.iterations ?? 1);
    trackOffsets.push(
      AnimationTrack.createAnimationTrack(
        builder,
        ANIMATED_PROPERTY[spec.property],
        spec.duration ?? 300,
        spec.delay ?? 0,
        iterations,
        spec.autoReverse ?? false,
        spec.fill === "forwards" ? FillMode.FORWARDS : FillMode.NONE,
        EasingKind.LINEAR, // track-level easing resolved into keyframes above
        kfsOff,
        spec.cx ?? 0,
        spec.cy ?? 0,
      ),
    );
  }
  const tracksOff = AnimationList.createTracksVector(builder, trackOffsets);
  const root = AnimationList.createAnimationList(builder, tracksOff);
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}
