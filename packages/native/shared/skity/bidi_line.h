// Licensed in the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Visual-order mapping for one laid-out bidi line (Android <Paragraph>
// backend). SheenBidi's SBLine applies UAX #9 L1+L2 and reports the line's
// runs already in visual order; this helper maps that onto the shaper's glyph
// stream. Pure std so the host-side tests (tests/) cover it without
// SheenBidi.

#ifndef SKITYRT_BIDI_LINE_H
#define SKITYRT_BIDI_LINE_H

#include <cstddef>
#include <cstdint>
#include <vector>

namespace skityrt {

// One UAX #9 run as SBLine reports it: [offset, offset+length) is a
// full-text code-point range, `level` its embedding level. Runs arrive in
// VISUAL order — run[0] is the line's left edge on screen.
struct BidiRun {
  uint32_t offset;
  uint32_t length;
  uint8_t level;
};

// Map one line's glyphs to visual (left-to-right) order.
//
// `glyphCp` holds each glyph's full-text code-point index (its cluster's
// first code point); [glyphStart, glyphEnd) selects the line's slice of the
// glyph stream, which is in LOGICAL order. Each glyph lands in the visual-
// order run its code point belongs to, keeping stream order within the run:
// HarfBuzz emits even-level runs logically (= visually) and odd-level runs
// already reversed into visual order, and SBLine's runs cover the line's full
// code-point range in visual sequence — so stream order IS visual order inside
// every run. Returns glyph-stream indices, leftmost glyph first.
//
// A glyph whose code point falls outside every run (only possible when line
// breaking split a ligature cluster across lines) is appended at the tail
// rather than dropped.
std::vector<uint32_t> BuildLineVisualOrder(const std::vector<uint32_t> &glyphCp,
                                           uint32_t glyphStart, uint32_t glyphEnd,
                                           const BidiRun *runs, size_t runCount);

} // namespace skityrt

#endif // SKITYRT_BIDI_LINE_H
