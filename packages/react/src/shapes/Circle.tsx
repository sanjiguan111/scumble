// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { CircleProps } from "../types";

/**
 * Circle. `radius` maps to the native `r`; `cx`/`cy` default to 0.
 *
 * @example
 * <Circle cx={50} cy={50} radius={30} color="#3b82f6" />
 */
export function Circle({ cx, cy, radius, transform, children, ...rest }: CircleProps) {
  return (
    <skity-circle
      cx={cx ?? 0}
      cy={cy ?? 0}
      r={radius}
      transform={resolveTransform(transform)}
      {...resolvePaint(rest, children)}
    />
  );
}
