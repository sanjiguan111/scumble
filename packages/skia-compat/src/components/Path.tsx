// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Path>` — RN-Skia's Path component over scumble's. `path` takes an
 * {@link SkPath} (this package's) or a raw `d` string; the wrapped scumble
 * `Path2D` is forwarded, `fillType` becomes `fillRule`, and the paint props
 * (`color`/`style`/`strokeWidth`/`paint`/DashPathEffect children) go through
 * {@link resolveShimPaint}.
 */

import { Path as ScumblePath } from "@scumble/react";

import type { SkPath } from "../SkPath.js";
import { FillType } from "../types.js";
import { read, resolveShimPaint, type ShimShapeProps } from "./common.js";

/**
 * A native path-morph instruction (scumble extension): when passed as a
 * `<Path path={…}>` value, the geometry tweens `from` → `to` on the RENDER
 * THREAD via a `pathD` animation track — one prop commit installs the track,
 * then zero JS and zero patch rounds until it settles. `to` doubles as the
 * base geometry (`fill: "none"` settles on it exactly when the track ends).
 * Build one with {@link pathMorph} (identity-stable per from/to pair — see
 * its doc); the JS reactive lane (`useTween` + per-frame commits) remains
 * the fallback for non-timing or non-interpolatable pairs.
 */
export interface PathMorphSpec {
  /** Discriminant — a plain SkPath/string never carries this. */
  readonly __scumblePathMorph: true;
  /** Terminal geometry; also the base `d` the track settles on. */
  readonly to: SkPath | string;
  /** Start geometry. */
  readonly from: SkPath | string;
  /** Track duration in ms (default 300). */
  readonly duration?: number;
  /** Track easing preset (default "ease-in-out", the reactive shim's timing default). */
  readonly easing?: import("@scumble/graphics").EasingSpec;
}

/** Build a {@link PathMorphSpec}. Memoize the result (or hold it in a
 *  SharedValue) — a fresh identity per render would restart the track. */
export function pathMorph(
  from: SkPath | string,
  to: SkPath | string,
  opts?: { duration?: number; easing?: import("@scumble/graphics").EasingSpec },
): PathMorphSpec {
  return {
    __scumblePathMorph: true,
    from,
    to,
    ...(opts?.duration !== undefined ? { duration: opts.duration } : {}),
    ...(opts?.easing !== undefined ? { easing: opts.easing } : {}),
  };
}

export function isPathMorphSpec(v: unknown): v is PathMorphSpec {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __scumblePathMorph?: unknown }).__scumblePathMorph === true
  );
}

export interface ShimPathProps extends ShimShapeProps {
  path: import("./common.js").MaybeAnimated<SkPath | string | PathMorphSpec>;
  start?: number;
  end?: number;
  /**
   * scumble EXTENSION (no RN-Skia counterpart): a declarative animation spec
   * from `createAnimation` — rides the render thread (zero JS per frame).
   * Animatable path lanes there: `pathStart`/`pathEnd` (trim draw-in),
   * stroke/fill color, and whole-path MORPH (`pathD` — see
   * {@link PathMorphSpec}). Victory passes its OWN animate config here
   * ({type: "timing"|"spring"|...}) — consumed by its useAnimatedPath,
   * ignored by the shim (shape-detected at runtime).
   */
  animate?: unknown;
}

/** fillType byte → scumble fillRule string ("nonzero" default omitted). */
export function fillTypeToFillRule(t: FillType | undefined): "even-odd" | undefined {
  return t === FillType.EvenOdd ? "even-odd" : undefined;
}

/** The prop mapping, exported for tests — the component is a thin wrapper. */
export function pathPropsToScumble(props: ShimPathProps): Parameters<typeof ScumblePath>[0] {
  const rawPath = read(props.path);
  if (isPathMorphSpec(rawPath)) {
    // Native morph lane: base `d` = the terminal geometry, one `pathD` track
    // carries from → to (fill "none": the overlay clears exactly when the
    // track ends, and base == terminal by construction — no jump).
    const { path: _p, start, end, animate: _a, ...rest } = props;
    const resolved = resolveShimPaint(rest);
    const to = typeof rawPath.to === "string" ? rawPath.to : rawPath.to.p2d;
    const from = typeof rawPath.from === "string" ? rawPath.from : rawPath.from.p2d;
    const fillRule =
      typeof rawPath.to === "string" ? undefined : fillTypeToFillRule(rawPath.to.fillType);
    return {
      path: to,
      ...(fillRule !== undefined ? { fillRule } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      animate: [
        {
          property: "pathD" as const,
          from,
          to,
          duration: rawPath.duration ?? 300,
          easing: rawPath.easing ?? ("ease-in-out" as const),
          fill: "none" as const,
        },
      ],
      ...resolved,
    };
  }
  const { path, start, end, animate, ...rest } = { ...props, path: rawPath };
  const resolved = resolveShimPaint(rest);
  // Pass through only scumble-shaped specs ({property, from, to} keyframes);
  // foreign animate configs (Victory's) are the caller's own lane.
  const looksLikeScumbleSpec =
    typeof animate === "object" &&
    animate !== null &&
    "property" in animate &&
    "from" in animate &&
    "to" in animate;
  const fillRule = typeof rawPath === "string" ? undefined : fillTypeToFillRule(rawPath?.fillType);
  const scumblePath = typeof rawPath === "string" ? rawPath : (rawPath?.p2d ?? "");
  return {
    path: scumblePath,
    ...(fillRule !== undefined ? { fillRule } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(looksLikeScumbleSpec ? { animate: animate as never } : {}),
    ...resolved,
  };
}

export function Path(props: ShimPathProps) {
  return <ScumblePath {...pathPropsToScumble(props)} />;
}
