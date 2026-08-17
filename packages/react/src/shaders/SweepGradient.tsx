// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { SweepGradientProps } from "../types";

/**
 * Sweep (angular) gradient shader — a declarative **child** of a shape:
 *
 * ```tsx
 * <Rect x={0} y={0} width={100} height={100}>
 *   <SweepGradient c={vec(50, 50)} colors={["#f00", "#0f0", "#00f"]} />
 * </Rect>
 * ```
 *
 * Like {@link LinearGradient}, this component renders nothing itself: the
 * parent shape reads its props and serializes them into the native
 * `fillGradient` prop, so it is never mounted.
 *
 * `c` is absolute user-space pixels; `start`/`end` are degrees (0–360 by
 * default, a full turn). Spike: fill only; stroke gradients are TODO.
 */
export function SweepGradient(_props: SweepGradientProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
