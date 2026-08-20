// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Minimal standard base64 decoder (encode stays in JS — bytesToBase64; only
// the native side needs decode). Padding is optional and whitespace inside
// the payload is skipped; any other character outside the alphabet fails the
// whole decode (no partial output).

#ifndef SKITYRT_BASE64_H_
#define SKITYRT_BASE64_H_

#include <cstdint>
#include <string_view>
#include <vector>

namespace skityrt {

// Decode `in` into `out`. Returns false (out untouched) on malformed input.
bool Base64Decode(std::string_view in, std::vector<uint8_t> *out);

} // namespace skityrt

#endif // SKITYRT_BASE64_H_
