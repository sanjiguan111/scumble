// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { PaintProps } from "./types";

/**
 * Declarative paint override — a **child** of a shape, in the declarative
 * style:
 *
 * ```tsx
 * <Circle cx={100} cy={100} r={70}>
 *   <LinearGradient ... />
 *   <Paint style="stroke" strokeWidth={8}>
 *     <SweepGradient ... />
 *   </Paint>
 * </Circle>
 * ```
 *
 * Here the `<LinearGradient>` (placed directly under the shape) fills the
 * circle, while the `<SweepGradient>` inside the `<Paint style="stroke">`
 * strokes it.
 *
 * Like the gradient shaders, this component renders nothing itself: the parent
 * shape reads its props (and its shader children) and merges them into its
 * native paint props, so it is never mounted.
 *
 * Properties given here **override** the shape-level ones (`color`,
 * `strokeWidth`, …); properties omitted fall back to the shape level. Shaders
 * placed *inside* the `<Paint>` apply to that paint (`style="stroke"` → stroke
 * gradient), while shaders placed directly under the shape apply to fill.
 *
 * Channel limits: at most one fill paint + one stroke paint ride the shared
 * single-slot channel (a later `<Paint>` of the same style wins there).
 * Declaring several paints of the same style — or giving any `<Paint>` its own
 * `opacity` — switches the shape to the multi-pass channel, where the geometry
 * draws once per paint with fully independent state (per-paint
 * `opacity`/`blendMode` included).
 */
export function Paint(_props: PaintProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
