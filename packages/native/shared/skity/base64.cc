// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "base64.h"

namespace skityrt {

namespace {

// -1 = invalid; '=' handled separately. A..Z a..z 0..9 + /
int8_t DecodeChar(char c) {
  if (c >= 'A' && c <= 'Z') return (int8_t)(c - 'A');
  if (c >= 'a' && c <= 'z') return (int8_t)(c - 'a' + 26);
  if (c >= '0' && c <= '9') return (int8_t)(c - '0' + 52);
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

bool IsSpace(char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

} // namespace

bool Base64Decode(std::string_view in, std::vector<uint8_t> *out) {
  // Collect 6-bit groups; emit on every full 4-group quantum.
  uint32_t acc = 0;
  int bits = 0; // 6-bit values accumulated so far in this quantum
  int pad = 0;  // '=' seen (only valid at the very end)
  std::vector<uint8_t> decoded;
  decoded.reserve(in.size() / 4 * 3);

  for (char c : in) {
    if (IsSpace(c)) continue;
    if (c == '=') {
      pad++;
      continue;
    }
    if (pad > 0) return false; // data after '=' — malformed
    const int8_t v = DecodeChar(c);
    if (v < 0) return false;
    acc = (acc << 6) | (uint32_t)v;
    bits++;
    if (bits == 4) {
      decoded.push_back((uint8_t)(acc >> 16));
      decoded.push_back((uint8_t)(acc >> 8));
      decoded.push_back((uint8_t)acc);
      acc = 0;
      bits = 0;
    }
  }
  if (pad > 2) return false;
  if (bits == 1) return false; // a dangling 6-bit group is 6 mod 8 bits — invalid
  if (bits == 2) {
    // 12 bits → 1 byte
    decoded.push_back((uint8_t)(acc >> 4));
  } else if (bits == 3) {
    // 18 bits → 2 bytes
    decoded.push_back((uint8_t)(acc >> 10));
    decoded.push_back((uint8_t)(acc >> 2));
  }
  *out = std::move(decoded);
  return true;
}

} // namespace skityrt
