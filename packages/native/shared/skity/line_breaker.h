// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// v1 line breaker (Task 16): greedy width-constrained breaking with a
// space + CJK kinsoku rule table. NOT a full UAX #14 implementation — Latin
// words stay unbroken (no intra-word breaks), CJK ideographs break freely
// between each other, and a small kinsoku table keeps closing punctuation
// off line starts and opening punctuation off line ends. iOS never uses
// this (CoreText does breaking); Android's HarfBuzz backend does.

#ifndef SKITYRT_LINE_BREAKER_H
#define SKITYRT_LINE_BREAKER_H

#include <cstdint>
#include <utility>
#include <vector>

namespace skityrt {

// Break-time classification of one UTF-32 code point.
enum class BreakClass : uint8_t {
  kAlnum,           // letters/digits/most punctuation — intra-word, sticks
  kSpace,           // whitespace — the position after it is a preferred break
  kCjk,             // CJK ideographs/kana/fullwidth forms — break around
  kOpenPunct,       // kinsoku: never the last char of a line
  kClosePunctCjk,   // kinsoku: never first on a line; break AFTER is allowed
  kClosePunctLatin, // kinsoku: never first on a line; sticks to what follows
                    // (so "1.5" / URLs don't break after '.')
};

struct BreakChar {
  uint32_t codepoint;
  float advance; // this char's step (letterSpacing already folded in)
  BreakClass cls;
};

// Classify a UTF-32 code point (the v1 rule table). Shared so the shaper can
// pre-classify while it accumulates advances.
BreakClass ClassifyBreakChar(uint32_t cp);

// Greedy breaking: each line takes the longest prefix within max_width,
// falling back to the latest legal break position when it overflows, and
// hard-breaking when there is none (a word longer than the line). Returns
// [start, end) character-index ranges; trailing spaces stay in the range —
// the caller excludes them when measuring the line for alignment.
std::vector<std::pair<uint32_t, uint32_t>> BreakLines(const std::vector<BreakChar> &chars,
                                                      float max_width);

} // namespace skityrt

#endif // SKITYRT_LINE_BREAKER_H
