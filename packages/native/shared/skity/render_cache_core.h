// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Skity-agnostic core of the render build cache (see the plan that became
// RENDER_ARCHITECTURE.md §15). Header-only and dependency-free so the host
// test binary can cover it without linking skity: hashing, a bounded
// intern table, the per-entry validity stamp and the hit/miss counters.
// The skity-typed layer lives in render_cache.{h,cc}.
#ifndef SKITY_RENDER_CACHE_CORE_H_
#define SKITY_RENDER_CACHE_CORE_H_

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <list>
#include <memory>
#include <unordered_map>
#include <vector>

namespace skityrt {

// FNV-1a 64. Used only as a bucket key — LRUInternTable verifies real hits
// with a full content compare, so collisions can't produce a wrong object.
inline uint64_t HashBytes(const uint8_t *data, std::size_t size) {
  uint64_t h = 1469598103934665603ull;
  for (std::size_t i = 0; i < size; i++) {
    h ^= data[i];
    h *= 1099511628211ull;
  }
  return h;
}

// Per-cache-entry validity stamp. Two counters live on the RetainedNode
// (bumped by the command executor when it writes the corresponding fields)
// plus the tree-wide structure epoch (bumped by Insert/Remove/Move so a
// Remove→Insert reusing the same id can never hit a stale entry). Animation
// ticks NEVER bump any of these — animated nodes keep hitting the cache and
// only their per-frame scalars (color/alpha) are composed fresh.
struct CacheStamp {
  uint32_t geom_version = 0;
  uint32_t paint_version = 0;
  uint64_t structure_epoch = 0;

  bool Matches(uint32_t node_geom, uint32_t node_paint, uint64_t tree_epoch) const {
    return geom_version == node_geom && paint_version == node_paint &&
           structure_epoch == tree_epoch;
  }
};

// Bounded hash→shared_ptr intern table (LRU eviction). Lookup carries the
// source bytes and re-verifies with a full compare, so a 64-bit hash
// collision degrades to a miss instead of returning the wrong object.
// Render-thread only (like everything in the cache).
template <typename T> class LRUInternTable {
public:
  explicit LRUInternTable(std::size_t capacity) : capacity_(capacity) {}

  // Returns the interned object for (hash, bytes), or null on miss.
  std::shared_ptr<T> Lookup(uint64_t hash, const uint8_t *bytes, std::size_t size) {
    auto it = entries_.find(hash);
    if (it == entries_.end()) return nullptr;
    const Entry &e = it->second;
    if (e.bytes.size() != size || std::memcmp(e.bytes.data(), bytes, size) != 0) {
      return nullptr; // hash collision — treat as miss
    }
    lru_.splice(lru_.begin(), lru_, e.iter); // promote
    return e.value;
  }

  void Insert(uint64_t hash, const uint8_t *bytes, std::size_t size, std::shared_ptr<T> value) {
    if (capacity_ == 0) return;
    auto it = entries_.find(hash);
    if (it != entries_.end()) {
      it->second.value = std::move(value);
      lru_.splice(lru_.begin(), lru_, it->second.iter);
      return;
    }
    if (entries_.size() >= capacity_) EvictOne();
    lru_.push_front(hash);
    Entry e;
    e.bytes.assign(bytes, bytes + size);
    e.value = std::move(value);
    e.iter = lru_.begin();
    entries_.emplace(hash, std::move(e));
  }

  std::size_t size() const { return entries_.size(); }

private:
  struct Entry {
    std::vector<uint8_t> bytes; // verification copy (small descriptors)
    std::shared_ptr<T> value;
    std::list<uint64_t>::iterator iter;
  };

  void EvictOne() {
    if (lru_.empty()) return;
    entries_.erase(lru_.back());
    lru_.pop_back();
  }

  std::size_t capacity_;
  std::unordered_map<uint64_t, Entry> entries_;
  std::list<uint64_t> lru_; // front = most recent
};

// Hit/miss counters per cache layer. Compiled-in unconditionally (a few
// uint64s); dumping is gated behind SKITYRT_CACHE_STATS.
struct RenderCacheStats {
  uint64_t path_hits = 0, path_misses = 0;
  uint64_t trim_hits = 0, trim_misses = 0; // contour-split builds (lazy)
  uint64_t gradient_hits = 0, gradient_misses = 0;
  uint64_t filter_hits = 0, filter_misses = 0;
  uint64_t dash_hits = 0, dash_misses = 0;
  uint64_t transform_hits = 0, transform_misses = 0;
  uint64_t clip_hits = 0, clip_misses = 0;

  void Reset() { *this = RenderCacheStats{}; }
};

} // namespace skityrt

#endif // SKITY_RENDER_CACHE_CORE_H_
