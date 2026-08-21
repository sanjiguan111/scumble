// Licensed in the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Host-side tests for the bidi visual-order mapping (bidi_line.cc). The runs
// here are what SheenBidi's SBLine would report — already in visual order,
// L1+L2 applied — so these tests pin the glyph-stream ↔ run composition
// without linking SheenBidi itself.

#include "../shared/skity/bidi_line.h"

#include <gtest/gtest.h>

#include <vector>

namespace {

using skityrt::BidiRun;
using skityrt::BuildLineVisualOrder;

// Convenience: glyphs identified by their full-text code-point index.
std::vector<uint32_t> OrderFor(const std::vector<uint32_t> &glyphCp, uint32_t start,
                               uint32_t end, std::vector<BidiRun> runs) {
  return BuildLineVisualOrder(glyphCp, start, end, runs.data(), runs.size());
}

TEST(BidiLine, PureLTRIsStreamOrder) {
  // "abc" one L0 run — the no-bidi degenerate case.
  std::vector<uint32_t> cp = {0, 1, 2};
  auto order = OrderFor(cp, 0, 3, {{0, 3, 0}});
  EXPECT_EQ(order, (std::vector<uint32_t>{0, 1, 2}));
}

TEST(BidiLine, RTLSegmentInsideLTRBaseStaysInPlace) {
  // LTR base, "abc אבג def": an embedded RTL run does NOT move — L2 only
  // reverses its interior, which shaping already delivered visual. The glyph
  // stream below mirrors the real shaper output: the RTL run's code points
  // arrive in hb's visual (left-to-right) order, i.e. reversed cp indices.
  std::vector<uint32_t> cp = {0, 1, 2, 3, 6, 5, 4, 7, 8, 9, 10};
  //              a  b  c  ␣  ג  ב  א  ␣  d  e  f
  auto order = OrderFor(cp, 0, 11, {{0, 4, 0}, {4, 3, 1}, {7, 4, 0}});
  EXPECT_EQ(order, (std::vector<uint32_t>{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10}));
}

TEST(BidiLine, RTLBaseNumbersStayLTR) {
  // RTL base, "אבג 123 def": levels אבג=1, space=1, 123=2, space=1, def=2.
  // Visual (L2): def ␣ 123 ␣ גבא. Stream mirrors the shaper: level-1 runs
  // arrive with reversed cps (hb RTL), level-2 runs in logical order (hb
  // LTR). Expected output is glyph-stream indices in visual order.
  std::vector<uint32_t> cp = {2, 1, 0, 3, 4, 5, 6, 7, 8, 9, 10};
  //              ג  ב  א  ␣  1  2  3  ␣  d  e  f
  auto order = OrderFor(cp, 0, 11, {{8, 3, 2}, {7, 1, 1}, {4, 3, 2}, {3, 1, 1}, {0, 3, 1}});
  EXPECT_EQ(order, (std::vector<uint32_t>{8, 9, 10, 7, 4, 5, 6, 3, 0, 1, 2}));
}

TEST(BidiLine, RunInteriorKeepsStreamOrder) {
  // Inside one run the glyph stream order is already visual (HarfBuzz emits
  // RTL segments reversed) — the mapper must NOT reverse run interiors, even
  // for odd levels. RTL run over cp 2..6; the line's glyph slice starts at
  // stream index 1, so the cp-0 glyph (a PRIOR line's) is never picked up.
  std::vector<uint32_t> cp = {0, 1, 6, 5, 4, 3, 2};
  auto order = OrderFor(cp, 1, 7, {{0, 2, 0}, {2, 5, 1}});
  EXPECT_EQ(order, (std::vector<uint32_t>{1, 2, 3, 4, 5, 6}));
}

TEST(BidiLine, LineSliceOnlyCoversOwnGlyphs) {
  // Two lines: glyphs 0..2 line one, 3..5 line two. A run may span the break;
  // each line only orders ITS slice.
  std::vector<uint32_t> cp = {0, 1, 2, 3, 4, 5};
  auto l1 = OrderFor(cp, 0, 3, {{0, 3, 0}});
  auto l2 = OrderFor(cp, 3, 6, {{2, 4, 1}});
  EXPECT_EQ(l1, (std::vector<uint32_t>{0, 1, 2}));
  EXPECT_EQ(l2, (std::vector<uint32_t>{3, 4, 5}));
}

TEST(BidiLine, ClusterSplitStragglerAppendedNotDropped) {
  // A glyph whose code point falls outside every run (line break split a
  // ligature cluster) lands at the tail instead of vanishing.
  std::vector<uint32_t> cp = {0, 1, 99};
  auto order = OrderFor(cp, 0, 3, {{0, 2, 0}});
  EXPECT_EQ(order, (std::vector<uint32_t>{0, 1, 2}));
}

TEST(BidiLine, EmptyRangeGivesEmptyOrder) {
  std::vector<uint32_t> cp;
  auto order = OrderFor(cp, 0, 0, {});
  EXPECT_TRUE(order.empty());
}

} // namespace
