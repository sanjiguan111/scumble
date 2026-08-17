// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { RadialGradientProps } from "../types";

/**
 * Radial gradient shader — a declarative **child** of a shape:
 *
 * ```tsx
 * <Circle cx={50} cy={50} r={50}>
 *   <RadialGradient c={vec(50, 50)} r={50} colors={["#fff", "#000"]} />
 * </Circle>
 * ```
 *
 * Like {@link LinearGradient}, this component renders nothing itself: the
 * parent shape reads its props and serializes them into the native
 * `fillGradient` prop, so it is never mounted.
 *
 * `c`/`r` are absolute user-space pixels (NOT 0–1 normalized). Spike: fill
 * only; stroke gradients are TODO (a focal/two-circle gradient is a separate
 * {@link TwoPointConicalGradient}).
 */
export function RadialGradient(_props: RadialGradientProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
