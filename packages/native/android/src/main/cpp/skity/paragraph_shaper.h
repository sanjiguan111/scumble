// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// <skity-paragraph> Android layout backend: skity's FontManager resolves
// fonts (system fonts.xml + per-character fallback via
// MatchFamilyStyleCharacter — the same walk TextBlobBuilder does), HarfBuzz
// shapes each fallback-homogeneous segment against the VERY SAME Typeface
// object (hb_face built from Typeface::GetData(), so glyph IDs match
// DrawGlyphs by construction), and the shared line breaker wraps lines.
// Output is the ParagraphRunList FlatBuffer the render thread consumes.

#ifndef SKITYRT_PARAGRAPH_SHAPER_H
#define SKITYRT_PARAGRAPH_SHAPER_H

#include <cstdint>
#include <vector>

namespace skityrt {

struct ParagraphShapeResult {
  // One-entry ParagraphRunList FlatBuffer (paragraph_runs.fbs) keyed by
  // node_id; height/line_count mirror the entry so callers don't re-parse.
  std::vector<uint8_t> runsBytes;
  float height = 0.f;
  int32_t lineCount = 0;
};

// Shapes + wraps the SpanList (paragraph_runs.fbs input, base64-decoded by
// the Kotlin setter) at the given constraints. Called on the TASM thread
// from the paragraph ShadowNode's layout pass. Returns empty bytes when the
// input has no renderable content.
ParagraphShapeResult ShapeParagraph(const uint8_t *spanListData, size_t spanListSize,
                                    uint32_t nodeId, float width, uint8_t align, float lineHeight,
                                    int32_t maxLines);

} // namespace skityrt

#endif // SKITYRT_PARAGRAPH_SHAPER_H
