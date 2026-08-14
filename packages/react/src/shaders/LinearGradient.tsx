// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { LinearGradientProps } from "../types";

/**
 * Linear gradient shader — a declarative **child** of a shape, in the
 * react-native-skia style:
 *
 * ```tsx
 * <Rect x={0} y={0} width={100} height={100}>
 *   <LinearGradient start={vec(0, 0)} end={vec(100, 0)} colors={["#f00", "#00f"]} />
 * </Rect>
 * ```
 *
 * This component renders nothing itself. The parent shape reads its props (via
 * `Children`) and serializes them into the native `fillGradient` prop. Because
 * the parent consumes and drops this child, this component is never mounted —
 * so returning `null` is safe regardless of host support for null renders.
 *
 * `start`/`end` are absolute user-space pixels (NOT 0–1 normalized). Spike:
 * fill only; stroke gradients and the radial focal point (Conic) are TODO.
 */
export function LinearGradient(_props: LinearGradientProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
