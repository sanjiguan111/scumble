// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Text decoration geometry shared by the two paragraph layout backends
// (Android paragraph_shaper.cc / iOS ScumbleParagraphShadowNode.mm) and the
// renderer's decoration painter. The Span bitfield and the DecorationStyle
// value order live in schema/paragraph_runs.fbs (RN-Skia parity).

#pragma once

#include <algorithm>
#include <cstdint>

#include <skity/text/font.hpp>

namespace skityrt {

// Span.decoration bits (paragraph_runs.fbs).
enum : uint8_t {
  kDecorationUnderline = 1,
  kDecorationOverline = 2,
  kDecorationLineThrough = 4,
};

// Resolve the stroke thickness and the baseline-relative y of one decoration
// line from the font's metrics, honoring an explicit absolute-px thickness
// override (Span.decorationThickness; <= 0 = metric default).
//
// Sign conventions (verified in skity's scalers, y-down like the screen):
//   - underline_position_  > 0, the CENTER of the stroke, below the baseline
//     (FreeType: -(post.pos + thickness/2)/upem; darwin: -CTFontGetUnderlinePosition)
//   - strikeout_position_  < 0, above the baseline (OS/2 yStrikeoutPosition;
//     0 when the table is missing — common for CFF fonts on darwin)
//   - ascent_              < 0
// So every case is `y = baseline + value`. Fallbacks cover fonts with no
// usable metrics (SkParagraph's defaults): thickness max(1, fontSize/14),
// underline at +thickness, strikeout at -x_height/2 (else -0.55 * ascent).
inline void ResolveDecorationMetrics(const skity::FontMetrics &m, float fontSize,
                                     float thicknessOverride, uint8_t bit, float *outThickness,
                                     float *outY) {
  const float fallback = std::max(1.f, fontSize / 14.f);
  const float ascentUp = -m.ascent_ > 0.f ? -m.ascent_ : fontSize * 0.8f;
  float thickness = thicknessOverride > 0.f
                        ? thicknessOverride
                        : (m.underline_thickness_ > 0.f ? m.underline_thickness_ : fallback);
  float y = 0.f;
  switch (bit) {
  case kDecorationUnderline:
    y = m.underline_position_ > 0.f ? m.underline_position_ : thickness;
    break;
  case kDecorationOverline:
    y = -ascentUp;
    break;
  default: // kDecorationLineThrough — strikeout position is the line center
    if (m.strikeout_position_ < 0.f) {
      y = m.strikeout_position_;
      if (thicknessOverride <= 0.f && m.strikeout_thickness_ > 0.f)
        thickness = m.strikeout_thickness_;
    } else {
      y = m.x_height_ > 0.f ? -m.x_height_ * 0.5f : -(ascentUp * 0.55f);
    }
    break;
  }
  *outThickness = thickness;
  *outY = y;
}

} // namespace skityrt
