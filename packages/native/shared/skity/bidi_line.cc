// Licensed in the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "bidi_line.h"

namespace skityrt {

std::vector<uint32_t> BuildLineVisualOrder(const std::vector<uint32_t> &glyphCp,
                                           uint32_t glyphStart, uint32_t glyphEnd,
                                           const BidiRun *runs, size_t runCount) {
  std::vector<uint32_t> order;
  if (glyphStart >= glyphEnd) return order;
  order.reserve(glyphEnd - glyphStart);

  std::vector<bool> covered(glyphEnd - glyphStart, false);
  for (size_t r = 0; r < runCount; r++) {
    const uint32_t lo = runs[r].offset;
    const uint32_t hi = runs[r].offset + runs[r].length;
    for (uint32_t i = glyphStart; i < glyphEnd; i++) {
      const uint32_t cp = glyphCp[i];
      if (cp >= lo && cp < hi) {
        order.push_back(i);
        covered[i - glyphStart] = true;
      }
    }
  }
  // Cluster-split stragglers: keep them (stream order) rather than dropping
  // glyphs — a wrong position beats a missing character.
  for (uint32_t i = glyphStart; i < glyphEnd; i++) {
    if (!covered[i - glyphStart]) order.push_back(i);
  }
  return order;
}

} // namespace skityrt
