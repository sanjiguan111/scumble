// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { RectProps } from "../types";

/**
 * Axis-aligned rectangle. `x`/`y` default to 0.
 *
 * @example
 * <Rect x={10} y={10} width={80} height={50} color="#ff0000" />
 * <Rect width={100} height={100} color="#000" style="stroke" strokeWidth={2} />
 */
export function Rect({ x, y, width, height, transform, children, ...rest }: RectProps) {
  return (
    <skity-rect
      x={x ?? 0}
      y={y ?? 0}
      width={width}
      height={height}
      transform={resolveTransform(transform)}
      {...resolvePaint(rest, children)}
    />
  );
}
