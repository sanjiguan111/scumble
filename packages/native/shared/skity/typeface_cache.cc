// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "typeface_cache.h"

#include <cstdlib>
#include <cstring>

#include "base64.h"

namespace skityrt {

namespace {

// "data:<mime>[;base64],<payload>" → the base64 payload. Returns an empty
// view unless the URI explicitly marks base64 (percent-encoded or plain-text
// data URIs are out of scope — fonts always ride base64).
std::string_view Base64Payload(const std::string &uri) {
  const size_t comma = uri.find(',');
  if (comma == std::string::npos) return {};
  const std::string_view meta = std::string_view(uri).substr(0, comma);
  if (meta.find(";base64") == std::string::npos) return {};
  return std::string_view(uri).substr(comma + 1);
}

} // namespace

TypefaceCache &TypefaceCache::Instance() {
  static TypefaceCache cache;
  return cache;
}

std::shared_ptr<skity::Typeface> TypefaceCache::FindOrLoad(const std::string &data_uri) {
  if (!IsDataUri(data_uri)) return nullptr;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    auto hit = cache_.find(data_uri);
    if (hit != cache_.end()) return hit->second; // may be nullptr (known bad)
  }

  std::vector<uint8_t> bytes;
  std::shared_ptr<skity::Typeface> typeface;
  if (Base64Decode(Base64Payload(data_uri), &bytes) && !bytes.empty()) {
    // MakeFromData keeps a reference to the Data; hand it an owned malloc'd
    // copy (decoded bytes die at the end of this scope).
    void *raw = std::malloc(bytes.size());
    if (raw != nullptr) {
      std::memcpy(raw, bytes.data(), bytes.size());
      auto data = skity::Data::MakeFromMalloc(raw, bytes.size());
      typeface = skity::Typeface::MakeFromData(data);
    }
  }

  std::lock_guard<std::mutex> lock(mutex_);
  cache_[data_uri] = typeface; // sticky failure: a nullptr decodes once
  return typeface;
}

} // namespace skityrt
