// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Inter-word justification policy (textAlign=3): a line's slack — the gap
// between its natural width and the layout box — is distributed evenly across
// the line's interior space characters. That is the SkParagraph / CoreText
// baseline semantics: lines without spaces (pure CJK) stay left-aligned, and
// justification only stretches, never compresses. iOS gets the same behavior
// from CoreText's kCTTextAlignmentJustified directly; Android's shaper calls
// this helper per line, keeping the policy host-testable in one place.

#ifndef SKITYRT_PARAGRAPH_JUSTIFY_H
#define SKITYRT_PARAGRAPH_JUSTIFY_H

#include <cstdint>

namespace skityrt {

// Extra x (px) to add after each interior space glyph of a justified line.
// Returns 0 — the line falls back to left alignment — when the line is the
// paragraph's last, carries the ellipsis, has no interior spaces, or already
// meets/exceeds the box. `line_width` is the line's natural width with the
// visual-edge trailing spaces already excluded (the caller's [head, tail)
// trim), so those off-margin spaces are never stretched.
float JustifyLineSlack(bool last_line, bool has_ellipsis, float line_width, float box_width,
                       uint32_t interior_spaces);

} // namespace skityrt

#endif // SKITYRT_PARAGRAPH_JUSTIFY_H
