// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Unit tests for the shared v1 line breaker (Task 16) — the Android layout
// backend's break engine (iOS never uses it; CoreText breaks by itself).
// Host-side GoogleTest binary, built by scripts/tests/CMakeLists.txt and run
// via `pnpm --filter @lynx-skity/native test:native`.

#include "../shared/skity/line_breaker.h"

#include <utility>
#include <vector>

#include <gtest/gtest.h>

using skityrt::BreakChar;
using skityrt::BreakClass;
using skityrt::BreakLines;
using skityrt::ClassifyBreakChar;

using Lines = std::vector<std::pair<uint32_t, uint32_t>>;

// Build BreakChars from a UTF-8 literal, every char at `advance` px — width
// then equals the char count, which keeps the expectations below readable.
// (Per-char advances are covered by the dedicated variable-width case.)
static std::vector<BreakChar> Chars(const char *s, float advance = 1.f) {
  std::vector<BreakChar> out;
  for (const unsigned char *p = (const unsigned char *)s; *p;) {
    uint32_t cp;
    int len;
    if (*p < 0x80) {
      cp = *p;
      len = 1;
    } else if ((*p & 0xE0) == 0xC0) {
      cp = *p & 0x1F;
      len = 2;
    } else if ((*p & 0xF0) == 0xE0) {
      cp = *p & 0x0F;
      len = 3;
    } else {
      cp = *p & 0x07;
      len = 4;
    }
    for (int k = 1; k < len && p[k]; k++)
      cp = (cp << 6) | (p[k] & 0x3F);
    p += len;
    out.push_back({cp, advance, ClassifyBreakChar(cp)});
  }
  return out;
}

TEST(ClassifyBreakChar, WhitespaceAndPlainChars) {
  EXPECT_EQ(ClassifyBreakChar(' '), BreakClass::kSpace);
  EXPECT_EQ(ClassifyBreakChar(0x3000), BreakClass::kSpace); // ideographic space
  EXPECT_EQ(ClassifyBreakChar('a'), BreakClass::kAlnum);
  EXPECT_EQ(ClassifyBreakChar('5'), BreakClass::kAlnum);
  EXPECT_EQ(ClassifyBreakChar(0x1F600), BreakClass::kAlnum); // emoji: not CJK
}

TEST(ClassifyBreakChar, CjkIdeographs) {
  EXPECT_EQ(ClassifyBreakChar(0x4E00), BreakClass::kCjk); // 一
  EXPECT_EQ(ClassifyBreakChar(0x3042), BreakClass::kCjk); // あ
}

TEST(ClassifyBreakChar, KinsokuPunctuation) {
  EXPECT_EQ(ClassifyBreakChar('('), BreakClass::kOpenPunct);
  EXPECT_EQ(ClassifyBreakChar(0x300C), BreakClass::kOpenPunct);     // 「
  EXPECT_EQ(ClassifyBreakChar(0x3002), BreakClass::kClosePunctCjk); // 。
  EXPECT_EQ(ClassifyBreakChar(0xFF0C), BreakClass::kClosePunctCjk); // ，
  EXPECT_EQ(ClassifyBreakChar('.'), BreakClass::kClosePunctLatin);
  EXPECT_EQ(ClassifyBreakChar(','), BreakClass::kClosePunctLatin);
}

TEST(BreakLines, EmptyInputYieldsNoLines) {
  EXPECT_TRUE(BreakLines({}, 100.f).empty());
}

TEST(BreakLines, FitsOnOneLineAtTheExactBoundary) {
  // Overflow is strictly `width > max_width` — a line exactly at max stays.
  EXPECT_EQ(BreakLines(Chars("ab"), 2.f), (Lines{{0, 2}}));
  EXPECT_EQ(BreakLines(Chars("abcd"), 100.f), (Lines{{0, 4}}));
}

TEST(BreakLines, LoneCharAlwaysProducesOneLine) {
  // Guards the loop against an infinite spin at max_width 0.
  EXPECT_EQ(BreakLines(Chars("a"), 0.f), (Lines{{0, 1}}));
}

TEST(BreakLines, GreedySpaceBreaking) {
  // Spaces are the Latin break points; the greedy line keeps "aa bb" and the
  // break index lands AFTER the space (trailing space of line 1 / leading
  // space of line 2 — the line assembler trims those when aligning).
  EXPECT_EQ(BreakLines(Chars("aa bb cc"), 5.f), (Lines{{0, 3}, {3, 8}}));
}

TEST(BreakLines, CjkIdeographsBreakFreely) {
  EXPECT_EQ(BreakLines(Chars("一二三四"), 2.f), (Lines{{0, 2}, {2, 4}}));
}

TEST(BreakLines, OverlongWordHardBreaks) {
  // A word longer than the line hard-breaks at the overflow char (v1: the
  // hard break ignores kinsoku — a line may still end with an open bracket).
  EXPECT_EQ(BreakLines(Chars("aaaa"), 2.f), (Lines{{0, 2}, {2, 4}}));
}

TEST(BreakLines, WidthAccumulatesPerCharAdvances) {
  // Not char counts: a 10px 'b' alone overflows a 5px line in one char.
  std::vector<BreakChar> wide = Chars("ab");
  wide[1].advance = 10.f;
  EXPECT_EQ(BreakLines(wide, 5.f), (Lines{{0, 1}, {1, 2}}));
}

TEST(BreakLines, KinsokuClosePunctCjkNeverStartsALine) {
  // The break before 。 is illegal, so the breaker backs up — "一" alone,
  // then "二。" (breaking AFTER 。 into a fresh ideograph is legal — that is
  // what separates it from the Latin rule below).
  EXPECT_EQ(BreakLines(Chars("一二。三"), 2.f), (Lines{{0, 1}, {1, 3}, {3, 4}}));
}

TEST(BreakLines, KinsokuClosePunctLatinIsStickier) {
  // kClosePunctLatin never starts a line AND does not allow a break after it
  // either. In "一.二" the CJK-side break "一" | ".二" would put '.' at a
  // line start — illegal — so the line hard-breaks as "一.".
  EXPECT_EQ(BreakLines(Chars("一.二"), 2.f), (Lines{{0, 2}, {2, 3}}));
}

TEST(BreakLines, KinsokuOpenPunctNeverEndsALine) {
  // The CJK break after "字" wins over breaking after '(' (CanBreakBefore
  // with prev = open punct is illegal), so the bracket travels to line 2
  // with its content.
  EXPECT_EQ(BreakLines(Chars("字(字"), 2.f), (Lines{{0, 1}, {1, 3}}));
}
