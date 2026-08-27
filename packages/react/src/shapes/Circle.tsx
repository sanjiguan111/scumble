// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolveAnimation } from "../internal/animation";
import { animationHandleOf } from "../internal/animation-control";
import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { CircleProps } from "../types";

/**
 * Circle. `radius` maps to the native `r`; `cx`/`cy` default to 0.
 *
 * @example
 * <Circle cx={50} cy={50} radius={30} color="#3b82f6" />
 */
export function Circle({ cx, cy, radius, animate, transform, children, ...rest }: CircleProps) {
  return (
    <scumble-circle
      cx={cx ?? 0}
      cy={cy ?? 0}
      r={radius}
      transform={resolveTransform(transform)}
      animationData={resolveAnimation(animate)}
      animationHandle={animationHandleOf(animate)}
      {...resolvePaint(rest, children)}
    />
  );
}
