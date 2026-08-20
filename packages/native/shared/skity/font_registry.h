// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Process-wide skity::Font registry backing the <Paragraph> component. Layout
// runs on the TASM thread (inside measure) and needs to hand the RESOLVED
// font — the real post-fallback typeface CoreText/HarfBuzz picked — to the
// render thread, where DrawGlyphs reconstructs a Font for each glyph run.
//
// The bridge is an id: the TASM side creates the skity::Font (typeface +
// size), registers it here, and serializes the id into the ParagraphGlyphRun
// (paragraph_runs.fbs); the render thread looks the id up at draw time.
//
// Threading: unlike the ImageStore (render-thread-only, lock-free), this
// registry is written on the TASM thread and read on the render thread — a
// plain mutex guards the map. Traffic is tiny (one register per distinct
// typeface+size actually used; lookups happen once per run per layout, and
// callers are expected to cache the resolved run fonts on the retained node).
// Entries stay resident for the process lifetime (same v1 stance as the
// ImageStore; fonts are small in count).
#ifndef SKITY_FONT_REGISTRY_H_
#define SKITY_FONT_REGISTRY_H_

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <utility>

#include <skity/text/font.hpp>

namespace skityrt {

class FontRegistry {
public:
  static FontRegistry &Instance();

  // TASM thread (layout). Registers a font and returns its id. Ids are
  // process-unique and never reused. The same (typeface, size) registers
  // idempotently — repeated layouts don't grow the registry (the iOS backend
  // re-registers every CTRun on each layout; Android relied on a caller-side
  // dedupe map before this moved in).
  uint32_t Register(std::shared_ptr<skity::Typeface> typeface, float size);

  // Any thread. Returns nullptr for an unknown id (the run is skipped).
  skity::Font Find(uint32_t font_id) const;

private:
  FontRegistry() = default;

  using DedupeKey = std::pair<skity::Typeface *, float>;
  struct KeyHash {
    size_t operator()(const DedupeKey &k) const noexcept {
      return std::hash<void *>{}(k.first) ^ (std::hash<float>{}(k.second) << 1);
    }
  };

  mutable std::mutex mutex_;
  std::unordered_map<uint32_t, std::shared_ptr<skity::Typeface>> typefaces_;
  std::unordered_map<uint32_t, float> sizes_;
  std::unordered_map<DedupeKey, uint32_t, KeyHash> dedupe_;
  uint32_t next_id_ = 1; // 0 = invalid
};

} // namespace skityrt

#endif // SKITY_FONT_REGISTRY_H_
