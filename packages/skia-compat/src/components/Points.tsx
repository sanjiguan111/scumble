// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Points points mode>` — RN-Skia's point-cloud shape. `polygon` mode
 * chains the points into a closed polygon (stroked by default — the
 * upstream custom-drawing showcase draws stars this way); `circle` mode
 * fills one circle per point with radius `strokeWidth / 2` (RN-Skia treats
 * `strokeWidth` as the circle diameter there).
 */

import { Path2D } from "@scumble/graphics";
import { Path as ScumblePath } from "@scumble/react";

import { read, resolveShimPaint, type MaybeAnimated, type ShimShapeProps } from "./common.js";
import type { SkPoint } from "../types.js";

export interface ShimPointsProps extends ShimShapeProps {
  points: MaybeAnimated<SkPoint[]>;
  mode?: "circle" | "polygon";
}

/** The geometry, exported for tests: points → one Path2D in the given mode. */
export function buildPointsPath(
  pts: readonly SkPoint[],
  mode: "circle" | "polygon",
  circleRadius: number,
): Path2D {
  const p = new Path2D();
  if (mode === "polygon") {
    pts.forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)));
    if (pts.length > 2) p.close();
  } else {
    for (const pt of pts) p.addCircle(pt.x, pt.y, circleRadius);
  }
  return p;
}

/** The prop mapping, exported for tests — the component is a thin wrapper. */
export function pointsPropsToScumble(props: ShimPointsProps): Parameters<typeof ScumblePath>[0] {
  const mode = props.mode ?? "circle";
  const pts = read(props.points) ?? [];
  // RN-Skia defaults the paint stroke width to 1 — the circle-mode radius.
  const circleRadius = (read(props.strokeWidth) ?? 1) / 2;
  const { points: _points, mode: _mode, strokeWidth, ...rest } = props;
  const resolved = resolveShimPaint({
    ...rest,
    // circle fills by default, polygon strokes by default (RN-Skia behavior).
    style: props.style ?? (mode === "circle" ? "fill" : "stroke"),
  });
  return {
    path: buildPointsPath(pts, mode, circleRadius),
    ...resolved,
    ...(strokeWidth !== undefined ? { strokeWidth: read(strokeWidth) } : {}),
  };
}

export function Points(props: ShimPointsProps) {
  return <ScumblePath {...pointsPropsToScumble(props)} />;
}
