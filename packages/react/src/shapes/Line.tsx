// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import type { LineProps } from "../types";

/**
 * Straight line from `(x1, y1)` to `(x2, y2)` (defaults 0). Always stroked —
 * a line has no interior — so `style` defaults to `"stroke"` and explicit
 * `style="fill"` is ignored natively.
 *
 * @example
 * <Line x1={0} y1={0} x2={100} y2={80} color="#3b82f6" strokeWidth={4} />
 */
export function Line({ x1, y1, x2, y2, children, ...rest }: LineProps) {
  return (
    <skity-line
      x1={x1 ?? 0}
      y1={y1 ?? 0}
      x2={x2 ?? 0}
      y2={y2 ?? 0}
      {...resolvePaint(rest, children, "stroke")}
    />
  );
}
