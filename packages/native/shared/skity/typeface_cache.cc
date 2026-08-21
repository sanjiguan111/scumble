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

bool TypefaceCache::IsLoadableUri(const std::string &family) {
  return !IsDataUri(family) && family.find("://") != std::string::npos;
}

TypefaceCache::Lookup TypefaceCache::LookupUri(const std::string &uri,
                                               std::shared_ptr<skity::Typeface> *out) {
  TypefaceCache &self = Instance();
  std::lock_guard<std::mutex> lock(self.mutex_);
  auto hit = self.cache_.find(uri);
  if (hit == self.cache_.end()) return Lookup::kMiss;
  if (hit->second == nullptr) return Lookup::kFailed;
  if (out != nullptr) *out = hit->second;
  return Lookup::kReady;
}

std::shared_ptr<skity::Typeface> TypefaceCache::FindOrLoad(const std::string &data_uri) {
  if (!IsDataUri(data_uri)) return nullptr;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    auto hit = cache_.find(data_uri);
    if (hit != cache_.end()) return hit->second; // may be nullptr (known bad)
  }

  std::vector<uint8_t> bytes;
  if (!Base64Decode(Base64Payload(data_uri), &bytes) || bytes.empty()) {
    std::lock_guard<std::mutex> lock(mutex_);
    cache_[data_uri] = nullptr; // sticky failure: a bad payload decodes once
    return nullptr;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  return DecodeAndCacheLocked(data_uri, bytes);
}

void TypefaceCache::StoreBytes(const std::string &uri, const void *data, size_t length) {
  std::vector<uint8_t> bytes;
  if (data != nullptr && length > 0) {
    bytes.resize(length);
    std::memcpy(bytes.data(), data, length);
  }
  std::lock_guard<std::mutex> lock(mutex_);
  if (bytes.empty()) {
    // Load failure → sticky nullptr (never re-request); the entry now exists,
    // so lookups stop reporting kMiss.
    cache_[uri] = nullptr;
    return;
  }
  DecodeAndCacheLocked(uri, bytes);
}

std::shared_ptr<skity::Typeface>
TypefaceCache::DecodeAndCacheLocked(const std::string &uri, const std::vector<uint8_t> &bytes) {
  // MakeFromData keeps a reference to the Data; hand it an owned malloc'd
  // copy (the decoded vector dies with the caller). MakeFromMalloc's Data
  // owns the free — even if MakeFromData rejects the bytes, no manual free.
  void *raw = std::malloc(bytes.size());
  std::shared_ptr<skity::Typeface> typeface;
  if (raw != nullptr) {
    std::memcpy(raw, bytes.data(), bytes.size());
    auto data = skity::Data::MakeFromMalloc(raw, bytes.size());
    typeface = skity::Typeface::MakeFromData(data);
  }
  cache_[uri] = typeface; // sticky failure on a nullptr
  return typeface;
}

} // namespace skityrt
