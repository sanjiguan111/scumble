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

export interface ShimPathProps extends ShimShapeProps {
  path: import("./common.js").MaybeAnimated<SkPath | string>;
  start?: number;
  end?: number;
  /**
   * scumble EXTENSION (no RN-Skia counterpart): a declarative animation spec
   * from `createAnimation` — rides the render thread (zero JS per frame).
   * Animatable path lanes there: `pathStart`/`pathEnd` (trim draw-in) and
   * stroke/fill color; path MORPH has no track and stays JS-driven
   * (`useTween` + `Skia.Path.Interpolate`). Victory passes its OWN animate
   * config here ({type: "timing"|"spring"|...}) — consumed by its
   * useAnimatedPath, ignored by the shim (shape-detected at runtime).
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
