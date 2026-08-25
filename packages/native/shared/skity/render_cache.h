// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Skity-typed layer of the render build cache (RENDER_ARCHITECTURE.md §15).
// One RenderCache per retained tree, attached as the tree's type-erased
// render_cache blob (retained_render_tree.h stays skity-free) — per-tree by
// construction, so node ids from different canvases can never collide.
// Render-thread only, like the tree itself; lifetime = tree lifetime.
//
// What is cached (and what deliberately is NOT):
// - path/polyline/polygon/ellipse geometry → skity::Path (+ fill type baked),
//   keyed by CacheStamp; trims split the cached path into per-contour
//   single-contour paths with a resident PathMeasure each, so an animated
//   trim window costs only GetLength/GetSegment per frame.
// - gradient/filter/dash descriptors → interned shared_ptr payloads
//   (hash-verified LRU). Paints themselves are NEVER cached — they are cheap
//   to construct and animation composes per-frame scalars (color/alpha) on
//   fresh ones.
#ifndef SKITY_RENDER_CACHE_H_
#define SKITY_RENDER_CACHE_H_

#include <cstdint>
#include <memory>
#include <unordered_map>
#include <vector>

#include <skity/geometry/matrix.hpp>
#include <skity/graphic/path.hpp>
#include <skity/graphic/path_measure.hpp>
#include <skity/text/font.hpp>

#include "render_cache_core.h"            // CacheStamp / LRUInternTable / stats
#include "render_tree_common_generated.h" // FillRule

namespace skity {

class Shader;
class PathEffect;
class ColorFilter;
class ImageFilter;
class MaskFilter;

} // namespace skity

namespace skityrt {

class RetainedRenderTree;

// Global kill switch (default ON). Used for A/B measurement and as the
// one-line rollback if a cache bug ever surfaces.
void SetRenderCacheEnabled(bool enabled);
bool RenderCacheEnabled();

// Attach (lazily, first Draw) / fetch the tree's cache. DeleteRenderCache is
// the blob deleter handed to RetainedRenderTree::set_render_cache.
class RenderCache;
RenderCache *GetRenderCache(const RetainedRenderTree *tree);
void DeleteRenderCache(void *cache);

class RenderCache final {
public:
  // One cached geometry per node id (path/polyline/polygon/ellipse shapes).
  struct TrimContour {
    skity::Path single;                          // one contour only
    std::unique_ptr<skity::PathMeasure> measure; // built once per contour
  };
  struct PathCacheEntry {
    CacheStamp stamp;
    skity::Path base;                      // force_close + fill type already applied
    FillRule fill_rule = FillRule_NONZERO; // participates in validation
    // Scalar geometry the base was built from (circle: cx,cy,r; ellipse:
    // cx,cy,rx,ry). Animation tracks rewrite these values WITHOUT bumping
    // geom_version (that's the whole point), so the values themselves join
    // the hit check — an animated radius must miss, a static one must not.
    float geom_key[4] = {0.f, 0.f, 0.f, 0.f};
    uint32_t geom_key_len = 0;
    std::vector<TrimContour> contours; // lazy — built on first trim
    bool contours_built = false;
    uint64_t lru_tick = 0;
  };

  // Cached folded transform per node: the JS-built TransformOpList bytes
  // collapse into ONE matrix on miss; the animation overlay still appends on
  // the canvas afterwards (per-frame scalars, never cached).
  struct TransformCacheEntry {
    CacheStamp stamp;
    skity::Matrix base;
    bool valid = false;
  };

  // Cached group-clip list per node: parsed once into items (nested path
  // bytes decoded at build time — the per-frame heap copy of today's lane
  // disappears); each frame just replays ClipRect/RRect/Path.
  struct ClipCacheItem {
    enum class Kind : uint8_t { kRect, kRRect, kPath };
    Kind kind = Kind::kRect;
    skity::Rect rect{};
    float rx = 0.f, ry = 0.f;
    skity::Path path;
    // skity::Canvas::ClipOp stored as the renderer's enum — avoids pulling
    // canvas.hpp into this header; the renderer casts on replay.
    uint8_t op = 0; // 0 = kIntersect, 1 = kDifference
  };
  struct ClipCacheEntry {
    CacheStamp stamp;
    std::vector<ClipCacheItem> items;
    bool built = false; // an empty-but-parsed list is a valid cached state
    uint64_t lru_tick = 0;
  };

  // Interned shared_ptr payloads, hash-of-bytes keyed (content-verified).
  LRUInternTable<skity::Shader> gradient_intern{256};
  LRUInternTable<skity::ColorFilter> color_filter_intern{128};
  LRUInternTable<skity::ImageFilter> image_filter_intern{128};
  LRUInternTable<skity::MaskFilter> mask_filter_intern{128};
  LRUInternTable<skity::PathEffect> dash_intern{128};

  std::unordered_map<int32_t, PathCacheEntry> paths;
  std::unordered_map<int32_t, TransformCacheEntry> xforms;
  std::unordered_map<int32_t, ClipCacheEntry> clips;
  // Paragraph fonts by id — FontRegistry::Find takes a mutex (TASM writers
  // vs render readers); a per-tree map pays it once per id, then lock-free.
  // Font is a cheap value type (typeface shared_ptr + scalars).
  std::unordered_map<uint32_t, skity::Font> fonts;
  uint64_t lru_tick = 0;
  // Refreshed by Draw at frame start — entry stamps validate against it
  // (structural commands bump the tree epoch, not per-node counters).
  uint64_t current_epoch = 0;
  RenderCacheStats stats;

  // Split `base` into per-contour single-contour paths (skity's PathMeasure
  // rebuilds its segment tables on SetPath, so a resident measure per contour
  // is the only way to reuse the subdivision work across frames). Conics are
  // replayed with their weight; close-synthesized lines are skipped.
  static void SplitContours(const skity::Path &base, std::vector<TrimContour> *out);

  // Per-frame trim: GetSegment on each contour's resident measure, appending
  // into `out` (same append-only semantics as the original TrimPath).
  static void TrimFromContours(const std::vector<TrimContour> &contours, float start, float end,
                               skity::Path *out);

private:
  static constexpr std::size_t kMaxPathEntries = 512;

public:
  // Called by the renderer's miss lane — keep the map bounded (LRU eviction).
  void EvictPathEntriesIfNeeded();
};

} // namespace skityrt

#endif // SKITY_RENDER_CACHE_H_
