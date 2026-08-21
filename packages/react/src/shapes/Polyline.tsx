// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { floatsToBase64, parsePoints } from "@lynx-skity/graphics";

import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { PointsProp, PolylineProps } from "../types";

/**
 * Flatten polyline/polygon vertices (SVG `points` string or `{x,y}` pairs)
 * into base64 little-endian float32 `[x0,y0,x1,y1,...]` for the native
 * `points` prop — a plain float vector (no path recompilation), so a points
 * update ships only the vertices via the SetGeometry channel.
 */
export function pointsToVerticesProp(points: PointsProp): string | undefined {
  const pairs = typeof points === "string" ? parsePoints(points) : points;
  if (pairs.length === 0) return undefined;
  const flat: number[] = [];
  for (const p of pairs) flat.push(p.x, p.y);
  return floatsToBase64(flat);
}

/**
 * Open polyline through the given vertices. Stroked by default (an open
 * polyline has no interior); pass `style="fill"` to fill it as if closed.
 *
 * @example
 * <Polyline points="10,10 60,80 110,20 160,90" color="#3b82f6" strokeWidth={4} />
 * <Polyline points={[vec(10, 10), vec(60, 80)]} color="#f00" />
 */
export function Polyline({ points, transform, children, ...rest }: PolylineProps) {
  return (
    <skity-polyline
      points={pointsToVerticesProp(points)}
      transform={resolveTransform(transform)}
      {...resolvePaint(rest, children, "stroke")}
    />
  );
}
