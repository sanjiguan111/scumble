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
import { resolveShimPaint, type ShimShapeProps } from "./common.js";

export interface ShimPathProps extends ShimShapeProps {
  path: SkPath | string;
  start?: number;
  end?: number;
}

/** fillType byte → scumble fillRule string ("nonzero" default omitted). */
export function fillTypeToFillRule(t: FillType | undefined): "even-odd" | undefined {
  return t === FillType.EvenOdd ? "even-odd" : undefined;
}

/** The prop mapping, exported for tests — the component is a thin wrapper. */
export function pathPropsToScumble(props: ShimPathProps): Parameters<typeof ScumblePath>[0] {
  const { path, start, end, ...rest } = props;
  const resolved = resolveShimPaint(rest);
  const fillRule = typeof path === "string" ? undefined : fillTypeToFillRule(path.fillType);
  return {
    path: typeof path === "string" ? path : path.p2d,
    ...(fillRule !== undefined ? { fillRule } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...resolved,
  };
}

export function Path(props: ShimPathProps) {
  return <ScumblePath {...pathPropsToScumble(props)} />;
}
