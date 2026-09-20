// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "paragraph_justify.h"

namespace skityrt {

float JustifyLineSlack(bool last_line, bool has_ellipsis, float line_width, float box_width,
                       uint32_t interior_spaces) {
  if (last_line || has_ellipsis || interior_spaces == 0) return 0.f;
  const float slack = box_width - line_width;
  if (slack <= 0.f) return 0.f; // an overflowing line is never compressed
  return slack / (float)interior_spaces;
}

} // namespace skityrt
