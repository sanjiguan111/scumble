// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Policy matrix for inter-word justification (textAlign=3): which lines fall
// back to left alignment, and how the slack splits across interior spaces.
// Host-side GoogleTest binary, built by tests/CMakeLists.txt and run via
// `pnpm --filter @scumble/native test:native`.

#include "../shared/skity/paragraph_justify.h"

#include <gtest/gtest.h>

using skityrt::JustifyLineSlack;

// @lat: [[tests#Native C++ core#Paragraph justification slack]]

TEST(JustifyLineSlack, SplitsSlackEvenlyAcrossInteriorSpaces) {
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, false, 90.f, 100.f, 2), 5.f);
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, false, 100.f, 100.f, 4), 0.f);
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, false, 97.5f, 100.f, 1), 2.5f);
}

TEST(JustifyLineSlack, LastLineAndEllipsizedLinesStayLeft) {
  EXPECT_FLOAT_EQ(JustifyLineSlack(true, false, 50.f, 100.f, 3), 0.f);
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, true, 50.f, 100.f, 3), 0.f);
}

TEST(JustifyLineSlack, NoSpacesOrNoSlackStaysLeft) {
  // No interior spaces — a pure-CJK line has nothing to stretch.
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, false, 50.f, 100.f, 0), 0.f);
  // Overflowing / exactly-full lines are never compressed.
  EXPECT_FLOAT_EQ(JustifyLineSlack(false, false, 101.f, 100.f, 2), 0.f);
}
