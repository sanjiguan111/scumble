// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { TwoPointConicalGradientProps } from "../types";

/**
 * Two-point conical gradient shader — a declarative **child** of a shape:
 *
 * ```tsx
 * <Rect x={0} y={0} width={100} height={100}>
 *   <TwoPointConicalGradient
 *     start={vec(30, 30)} startR={0} end={vec(70, 70)} endR={60}
 *     colors={["#fff", "#000"]}
 *   />
 * </Rect>
 * ```
 *
 * Like {@link LinearGradient}, this component renders nothing itself: the
 * parent shape reads its props and serializes them into the native
 * `fillGradient` prop, so it is never mounted.
 *
 * Stop offset 0 sits on the start (focal) circle, offset 1 on the end circle.
 * All geometry is absolute user-space pixels (NOT 0–1 normalized). Spike: fill
 * only; stroke gradients are TODO.
 */
export function TwoPointConicalGradient(_props: TwoPointConicalGradientProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
