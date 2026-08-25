// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolveAnimation } from "../internal/animation";
import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { EllipseProps } from "../types";

/**
 * Axis-aligned ellipse. `cx`/`cy` default to 0; a circle is the `rx === ry`
 * special case (see {@link Circle}).
 *
 * @example
 * <Ellipse cx={100} cy={50} rx={80} ry={40} color="#3b82f6" />
 */
export function Ellipse({ cx, cy, rx, ry, animate, transform, children, ...rest }: EllipseProps) {
  return (
    <skity-ellipse
      cx={cx ?? 0}
      cy={cy ?? 0}
      rx={rx}
      ry={ry}
      transform={resolveTransform(transform)}
      animationData={resolveAnimation(animate)}
      {...resolvePaint(rest, children)}
    />
  );
}
