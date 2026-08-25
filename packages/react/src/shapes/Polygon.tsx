// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { pointsToVerticesProp } from "./Polyline";
import { resolveAnimation } from "../internal/animation";
import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { PolygonProps } from "../types";

/**
 * Closed polygon through the given vertices — a closing segment from the last
 * vertex back to the first is appended automatically (implied by the
 * `skity-polygon` tag natively). Filled by default (like the other closed
 * shapes).
 *
 * @example
 * <Polygon points="50,0 100,90 0,90" color="#22c55e" />
 * <Polygon points={[vec(50, 0), vec(100, 90), vec(0, 90)]} color="#22c55e" style="stroke" />
 */
export function Polygon({ points, animate, transform, children, ...rest }: PolygonProps) {
  return (
    <skity-polygon
      points={pointsToVerticesProp(points)}
      transform={resolveTransform(transform)}
      animationData={resolveAnimation(animate)}
      {...resolvePaint(rest, children)}
    />
  );
}
