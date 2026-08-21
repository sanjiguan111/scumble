// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { CornerRadius, RRectProps } from "../types";

function resolveRadii(radii: RRectProps["radii"]): { rx?: number; ry?: number } {
  if (radii === undefined) return {};
  if (typeof radii === "number") return { rx: radii, ry: radii };
  if (Array.isArray(radii)) {
    // Native only supports uniform rx/ry; per-corner radii collapse to top-left (caveat).
    const tl: CornerRadius = radii[0];
    return { rx: tl.x, ry: tl.y };
  }
  return { rx: radii.x, ry: radii.y };
}

/**
 * Rounded rectangle — a `<Rect>` with corner radii. `radii` is a `number`
 * (uniform), a `{x, y}` (uniform per-axis), or a 4-corner array (native only
 * supports uniform rx/ry, so per-corner collapses to top-left — caveat).
 *
 * @example
 * <RRect x={10} y={10} width={80} height={80} radii={16} color="red" />
 * <RRect width={100} height={100} radii={{ x: 10, y: 20 }} color="blue" />
 */
export function RRect({ x, y, width, height, radii, transform, children, ...rest }: RRectProps) {
  return (
    <skity-rect
      x={x ?? 0}
      y={y ?? 0}
      width={width}
      height={height}
      {...resolveRadii(radii)}
      transform={resolveTransform(transform)}
      {...resolvePaint(rest, children)}
    />
  );
}
