// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { pointsToPathProp } from "./Polyline";
import { resolvePaint } from "../internal/paint";
import type { PolygonProps } from "../types";

/**
 * Closed polygon through the given vertices — a closing segment from the last
 * vertex back to the first is appended automatically. Filled by default (like
 * the other closed shapes).
 *
 * @example
 * <Polygon points="50,0 100,90 0,90" color="#22c55e" />
 * <Polygon points={[vec(50, 0), vec(100, 90), vec(0, 90)]} color="#22c55e" style="stroke" />
 */
export function Polygon({ points, children, ...rest }: PolygonProps) {
  return <skity-path d={pointsToPathProp(points, true)} {...resolvePaint(rest, children)} />;
}
