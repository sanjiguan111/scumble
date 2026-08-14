// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Path2D, bytesToBase64, parsePoints } from "@lynx-skity/graphics";

import { resolvePaint } from "../internal/paint";
import type { PointsProp, PolylineProps } from "../types";

/**
 * Compile polyline/polygon vertices (SVG `points` string or `{x,y}` pairs)
 * into base64 PathCommandList bytes — MoveTo + LineTo×n (+ Close for polygon).
 * Reuses the fully-plumbed `<skity-path>` channel: the native renderer has a
 * dedicated polyline/polygon branch keyed off a points vector, but that field
 * is not wired through the shadow nodes / command stream, and the compiled
 * path is semantically identical (the branch itself just builds the same path).
 */
export function pointsToPathProp(points: PointsProp, closed: boolean): string | undefined {
  const pairs = typeof points === "string" ? parsePoints(points) : points;
  if (pairs.length === 0) return undefined;
  const p = new Path2D().moveTo(pairs[0].x, pairs[0].y);
  for (let i = 1; i < pairs.length; i++) p.lineTo(pairs[i].x, pairs[i].y);
  if (closed) p.close();
  return bytesToBase64(p.toBytes());
}

/**
 * Open polyline through the given vertices. Stroked by default (an open
 * polyline has no interior); pass `style="fill"` to fill it as if closed.
 *
 * @example
 * <Polyline points="10,10 60,80 110,20 160,90" color="#3b82f6" strokeWidth={4} />
 * <Polyline points={[vec(10, 10), vec(60, 80)]} color="#f00" />
 */
export function Polyline({ points, children, ...rest }: PolylineProps) {
  return (
    <skity-path d={pointsToPathProp(points, false)} {...resolvePaint(rest, children, "stroke")} />
  );
}
