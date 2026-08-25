// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Unit tests for the animation engine's easing curves (ANIMATION_DESIGN.md
// D6). Host-side GoogleTest binary, built by tests/CMakeLists.txt.

#include "../shared/skity/easing.h"

#include <gtest/gtest.h>

using namespace skityrt; // enum constants (EasingKind_*) come along

namespace {
// Convenience: cubic-bezier with the schema-default (ease-in-out) points.
float Bez(float t, float x1, float y1, float x2, float y2) {
  return ApplyEasing(EasingKind_CUBIC_BEZIER, t, x1, y1, x2, y2);
}
} // namespace

TEST(Easing, EndpointsAreExactForEveryKind) {
  const EasingKind kinds[] = {
      EasingKind_LINEAR,       EasingKind_EASE_IN,    EasingKind_EASE_OUT, EasingKind_EASE_IN_OUT,
      EasingKind_CUBIC_BEZIER, EasingKind_STEP_START, EasingKind_STEP_END};
  for (EasingKind k : kinds) {
    EXPECT_EQ(ApplyEasing(k, 0.f, 0.42f, 0.f, 0.58f, 1.f), 0.f);
    EXPECT_EQ(ApplyEasing(k, 1.f, 0.42f, 0.f, 0.58f, 1.f), 1.f);
    EXPECT_EQ(ApplyEasing(k, -0.5f, 0.42f, 0.f, 0.58f, 1.f), 0.f); // clamped
    EXPECT_EQ(ApplyEasing(k, 1.5f, 0.42f, 0.f, 0.58f, 1.f), 1.f);
  }
}

TEST(Easing, LinearIsIdentity) {
  EXPECT_NEAR(ApplyEasing(EasingKind_LINEAR, 0.25f, 0, 0, 1, 1), 0.25f, 1e-6);
  EXPECT_NEAR(ApplyEasing(EasingKind_LINEAR, 0.5f, 0, 0, 1, 1), 0.5f, 1e-6);
}

TEST(Easing, StepSemantics) {
  // STEP_START jumps to the target immediately (inside the open interval);
  // STEP_END holds the source until the very end.
  EXPECT_EQ(ApplyEasing(EasingKind_STEP_START, 0.001f, 0, 0, 1, 1), 1.f);
  EXPECT_EQ(ApplyEasing(EasingKind_STEP_END, 0.999f, 0, 0, 1, 1), 0.f);
}

TEST(Easing, PresetsShapeAsExpected) {
  float mid = ApplyEasing(EasingKind_EASE_IN_OUT, 0.5f, 0, 0, 1, 1);
  EXPECT_NEAR(mid, 0.5f, 1e-3); // symmetric preset crosses at the midpoint
  EXPECT_LT(ApplyEasing(EasingKind_EASE_IN, 0.5f, 0, 0, 1, 1), 0.5f);
  EXPECT_GT(ApplyEasing(EasingKind_EASE_OUT, 0.5f, 0, 0, 1, 1), 0.5f);
}

TEST(Easing, CubicBezierIdentityControlPointsMatchLinear) {
  for (float t = 0.f; t <= 1.001f; t += 0.1f) {
    EXPECT_NEAR(Bez(t, 0.f, 0.f, 1.f, 1.f), t, 1e-4); // x(s)=y(s)=s
  }
}

TEST(Easing, CubicBezierPresetMatchesHandwritten) {
  // The EASE_IN_OUT preset IS cubic-bezier(0.42, 0, 0.58, 1).
  for (float t = 0.f; t <= 1.001f; t += 0.1f) {
    float preset = ApplyEasing(EasingKind_EASE_IN_OUT, t, 0, 0, 1, 1);
    float manual = Bez(t, 0.42f, 0.f, 0.58f, 1.f);
    EXPECT_NEAR(preset, manual, 1e-4);
  }
}

TEST(Easing, CubicBezierMonotoneInOut) {
  // ease-in-out rises monotonically (no dips from a mis-solved inverse).
  float prev = 0.f;
  for (float t = 0.05f; t <= 1.001f; t += 0.05f) {
    float y = Bez(t, 0.42f, 0.f, 0.58f, 1.f);
    EXPECT_GE(y, prev - 1e-6);
    prev = y;
  }
}
