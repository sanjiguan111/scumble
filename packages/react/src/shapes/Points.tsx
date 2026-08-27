// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Path2D, bytesToBase64, parsePoints } from "@scumble/graphics";

import { resolveAnimation } from "../internal/animation";
import { animationHandleOf } from "../internal/animation-control";
import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { PointsMode, PointsProp, PointsProps } from "../types";

/**
 * Compile draw-points vertices into PathCommandList bytes (skity exposes no
 * DrawPoints, so this rides the path channel — Skia's own drawPoints builds a
 * path the same way): `points` = one zero-length segment per vertex, whose
 * stroke caps render as dots of diameter `strokeWidth`; `lines` = one segment
 * per vertex pair; `polygon` = an open polyline through all vertices.
 */
export function pointsToPathBytes(points: PointsProp, mode: PointsMode): ArrayBuffer | null {
  const pairs = typeof points === "string" ? parsePoints(points) : points;
  if (pairs.length === 0) return null;
  const p = new Path2D();
  if (mode === "lines") {
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      p.moveTo(pairs[i]!.x, pairs[i]!.y).lineTo(pairs[i + 1]!.x, pairs[i + 1]!.y);
    }
  } else if (mode === "polygon") {
    p.moveTo(pairs[0]!.x, pairs[0]!.y);
    for (let i = 1; i < pairs.length; i++) p.lineTo(pairs[i]!.x, pairs[i]!.y);
  } else {
    for (const pt of pairs) p.moveTo(pt.x, pt.y).lineTo(pt.x, pt.y);
  }
  return p.toBytes();
}

/**
 * Draw a point set (Skia `drawPoints` semantics). `points` accepts an SVG
 * `points` string or `{x,y}` pairs; `mode` picks the interpretation:
 * `"points"` (default) draws a dot per vertex — diameter is `strokeWidth`,
 * `strokeCap` defaults to `"round"` (a butt cap would make a zero-length
 * segment invisible) — `"lines"` draws a segment per vertex pair, and
 * `"polygon"` strokes an open polyline. Stroked by default.
 *
 * @example
 * <Points points="10,10 60,80 110,20 160,90" color="#3b82f6" strokeWidth={8} />
 * <Points points={dots} mode="lines" color="#f00" strokeWidth={2} />
 * <Points points={samples} mode="polygon" color="#22c55e" strokeWidth={4} />
 */
export function Points({
  points,
  mode = "points",
  animate,
  transform,
  children,
  ...rest
}: PointsProps) {
  const bytes = pointsToPathBytes(points, mode);
  // Zero-length segments need a cap to be visible; default to round dots
  // unless the caller chose a cap explicitly.
  const withCap =
    rest.strokeCap === undefined && mode === "points"
      ? { ...rest, strokeCap: "round" as const }
      : rest;
  return (
    <scumble-path
      d={bytes ? bytesToBase64(bytes) : undefined}
      transform={resolveTransform(transform)}
      animationData={resolveAnimation(animate)}
      animationHandle={animationHandleOf(animate)}
      {...resolvePaint(withCap, children, "stroke")}
    />
  );
}
