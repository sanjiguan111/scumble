// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Easing curves for the native animation engine (ANIMATION_DESIGN.md D6).
// Pure functions over t ∈ [0,1]; the caller supplies the cubic-bezier
// control points only for EasingKind_CUBIC_BEZIER (schema defaults are the
// ease-in-out preset). Value kinds mirror skityrt::EasingKind exactly
// (render_tree_style.fbs).
#ifndef SKITY_EASING_H_
#define SKITY_EASING_H_

#include "render_tree_style_generated.h" // EasingKind

namespace skityrt {

// Map a normalized segment progress through an easing curve. Endpoints are
// exact: t<=0 → 0, t>=1 → 1. STEP_START jumps to the target inside the open
// interval; STEP_END holds the source (CSS steps(1, jump-start/end) analog).
float ApplyEasing(EasingKind kind, float t, float p1x, float p1y, float p2x, float p2y);

} // namespace skityrt

#endif // SKITY_EASING_H_
