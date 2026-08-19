// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "line_breaker.h"

namespace skityrt {

namespace {

// Is a break legal immediately before index i (i > 0)?
bool CanBreakBefore(const std::vector<BreakChar> &chars, uint32_t i) {
  const BreakClass next = chars[i].cls;
  const BreakClass prev = chars[i - 1].cls;
  // Kinsoku: closing punctuation never starts a line.
  if (next == BreakClass::kClosePunctCjk || next == BreakClass::kClosePunctLatin) {
    return false;
  }
  // Kinsoku: opening punctuation never ends a line.
  if (prev == BreakClass::kOpenPunct) {
    return false;
  }
  if (prev == BreakClass::kSpace) {
    return true;
  }
  // A CJK stop followed by anything non-closing is a normal CJK break
  // ("文。" | "字" breaks after the period).
  if (prev == BreakClass::kClosePunctCjk) {
    return true;
  }
  // CJK ideographs break against neighbors of any word-ish class.
  if (next == BreakClass::kCjk || prev == BreakClass::kCjk) {
    return true;
  }
  return false;
}

bool IsSpace(uint32_t cp) {
  return (cp >= 0x09 && cp <= 0x0D) || cp == 0x20 || cp == 0x3000 || (cp >= 0x2000 && cp <= 0x200A);
}

bool IsCjkIdeograph(uint32_t cp) {
  return (cp >= 0x3040 && cp <= 0x30FF)    // hiragana + katakana
         || (cp >= 0x31F0 && cp <= 0x31FF) // katakana phonetic extensions
         || (cp >= 0x3400 && cp <= 0x4DBF) // CJK ext A
         || (cp >= 0x4E00 && cp <= 0x9FFF) // CJK unified
         || (cp >= 0xA000 && cp <= 0xA4CF) // yi
         || (cp >= 0xAC00 && cp <= 0xD7AF) // hangul (composing blocks)
         || (cp >= 0xF900 && cp <= 0xFAFF) // CJK compat ideographs
         || (cp >= 0xFF66 && cp <= 0xFF9D) // halfwidth katakana
         || (cp >= 0x20000 && cp <= 0x2FFFD) || (cp >= 0x30000 && cp <= 0x3FFFD);
}

} // namespace

BreakClass ClassifyBreakChar(uint32_t cp) {
  if (IsSpace(cp)) return BreakClass::kSpace;

  // Kinsoku tables (v1 scope — the punctuation that actually matters in
  // CJK typesetting plus their ASCII counterparts).
  switch (cp) {
  // Opening: must not END a line.
  case 0x28:
  case 0x5B:
  case 0x7B:
  case 0x3C: // ( [ { <
  case 0xFF08:
  case 0xFF3B:
  case 0xFF5B: // （［｛
  case 0x3008:
  case 0x300A:
  case 0x300C:
  case 0x300E: // 〈《「『
  case 0x3010: // 【
    return BreakClass::kOpenPunct;
  // CJK closing: must not START a line; breaking AFTER it is fine.
  case 0x3001:
  case 0x3002: // 、。
  case 0x3009:
  case 0x300B:
  case 0x300D:
  case 0x300F: // 〉》」』
  case 0x3011: // 】
  case 0xFF0C:
  case 0xFF1A:
  case 0xFF1B: // ，：；
  case 0xFF1F:
  case 0xFF01: // ！？
  case 0x2026:
  case 0x2025: // … ‥
    return BreakClass::kClosePunctCjk;
  // Latin closing: must not START a line; also sticks to what follows so
  // "1.5", "e.g." or URLs do not break after the period/comma.
  case 0x21:
  case 0x22:
  case 0x27:
  case 0x29: // ! " ' )
  case 0x2C:
  case 0x2E:
  case 0x3A:
  case 0x3B:
  case 0x3F: // , . : ; ?
  case 0x5D:
  case 0x7D:
  case 0x2019:
  case 0x201D: // ] } ' "
    return BreakClass::kClosePunctLatin;
  default:
    break;
  }

  if (IsCjkIdeograph(cp)) return BreakClass::kCjk;
  return BreakClass::kAlnum;
}

std::vector<std::pair<uint32_t, uint32_t>> BreakLines(const std::vector<BreakChar> &chars,
                                                      float max_width) {
  std::vector<std::pair<uint32_t, uint32_t>> lines;
  const uint32_t n = (uint32_t)chars.size();
  if (n == 0) return lines;

  uint32_t start = 0;
  while (start < n) {
    float width = 0.f;
    // Latest legal break position within the current line (absolute index).
    int64_t last_break = -1;
    uint32_t end = n;
    uint32_t i = start;
    while (i < n) {
      if (i > start && CanBreakBefore(chars, i)) last_break = i;
      width += chars[i].advance;
      if (width > max_width && i > start) {
        end = last_break > start ? (uint32_t)last_break : i;
        break;
      }
      i++;
    }
    if (i >= n) end = n; // natural end of text
    lines.emplace_back(start, end);
    start = end;
  }
  return lines;
}

} // namespace skityrt
