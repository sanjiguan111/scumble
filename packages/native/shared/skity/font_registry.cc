// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "font_registry.h"

namespace skityrt {

FontRegistry &FontRegistry::Instance() {
  static FontRegistry registry;
  return registry;
}

uint32_t FontRegistry::Register(std::shared_ptr<skity::Typeface> typeface, float size) {
  if (typeface == nullptr) return 0;
  std::lock_guard<std::mutex> lock(mutex_);
  // Same (typeface, size) → same id: re-layouts re-registering their runs'
  // fonts must not grow the registry. The pointer key stays valid because the
  // registry itself owns the typeface (entries are process-lifetime anyway).
  DedupeKey key{typeface.get(), size};
  auto hit = dedupe_.find(key);
  if (hit != dedupe_.end()) return hit->second;
  const uint32_t id = next_id_++;
  typefaces_[id] = std::move(typeface);
  sizes_[id] = size;
  dedupe_[key] = id;
  return id;
}

skity::Font FontRegistry::Find(uint32_t font_id) const {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = typefaces_.find(font_id);
  if (it == typefaces_.end()) return skity::Font{};
  return skity::Font(it->second, sizes_.at(font_id));
}

} // namespace skityrt
