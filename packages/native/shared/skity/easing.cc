// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "easing.h"

#include <algorithm>

namespace skityrt {
namespace {

// Evaluate y(s) where the unit bezier B(x1,y1,x2,y2) has B_x(s) == t. B_x is
// monotonic on [0,1] for control x in [0,1] (clamped defensively), so a plain
// bisection converges: 24 iterations shrink the bracket below 1e-7, far under
// any frame-rate-visible error. This mirrors how Skia/Blink solve css beziers
// without pulling in a solver dependency.
float CubicBezierY(float x1, float y1, float x2, float y2, float t) {
  x1 = std::clamp(x1, 0.f, 1.f); // monotonicity guard (schema producers are
  x2 = std::clamp(x2, 0.f, 1.f); // expected to send in-range values anyway)
  auto x = [&](float s) {
    float u = 1.f - s;
    return 3.f * u * u * s * x1 + 3.f * u * s * s * x2 + s * s * s;
  };
  auto y = [&](float s) {
    float u = 1.f - s;
    return 3.f * u * u * s * y1 + 3.f * u * s * s * y2 + s * s * s;
  };
  float lo = 0.f, hi = 1.f;
  for (int i = 0; i < 24; i++) {
    float mid = 0.5f * (lo + hi);
    if (x(mid) < t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return y(0.5f * (lo + hi));
}

} // namespace

float ApplyEasing(EasingKind kind, float t, float p1x, float p1y, float p2x, float p2y) {
  if (t <= 0.f) return 0.f;
  if (t >= 1.f) return 1.f;
  switch (kind) {
  case EasingKind_EASE_IN:
    return CubicBezierY(0.42f, 0.f, 1.f, 1.f, t);
  case EasingKind_EASE_OUT:
    return CubicBezierY(0.f, 0.f, 0.58f, 1.f, t);
  case EasingKind_EASE_IN_OUT:
    return CubicBezierY(0.42f, 0.f, 0.58f, 1.f, t);
  case EasingKind_CUBIC_BEZIER:
    return CubicBezierY(p1x, p1y, p2x, p2y, t);
  case EasingKind_STEP_START:
    return 1.f;
  case EasingKind_STEP_END:
    return 0.f;
  case EasingKind_LINEAR:
  default:
    return t;
  }
}

} // namespace skityrt
