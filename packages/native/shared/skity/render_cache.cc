// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "render_cache.h"

#include <algorithm>
#include <atomic>
#include <new>

#include "retained_render_tree.h"

namespace skityrt {
namespace {
std::atomic<bool> g_cache_enabled{true};
} // namespace

void SetRenderCacheEnabled(bool enabled) {
  g_cache_enabled.store(enabled, std::memory_order_relaxed);
}
bool RenderCacheEnabled() {
  return g_cache_enabled.load(std::memory_order_relaxed);
}

RenderCache *GetRenderCache(const RetainedRenderTree *tree) {
  if (tree == nullptr || !RenderCacheEnabled()) return nullptr;
  if (tree->render_cache() == nullptr) {
    auto *cache = new (std::nothrow) RenderCache();
    if (cache == nullptr) return nullptr;
    tree->set_render_cache(cache, &DeleteRenderCache);
  }
  return static_cast<RenderCache *>(tree->render_cache());
}

void DeleteRenderCache(void *cache) {
  delete static_cast<RenderCache *>(cache);
}

void RenderCache::EvictPathEntriesIfNeeded() {
  if (paths.size() <= kMaxPathEntries) return;
  // Evict the least-recently-used quarter — keeps the amortized cost of a
  // miss burst bounded without paying a full sort per insert.
  std::vector<uint64_t> ticks;
  ticks.reserve(paths.size());
  for (const auto &kv : paths)
    ticks.push_back(kv.second.lru_tick);
  std::nth_element(ticks.begin(), ticks.end() - ticks.size() / 4, ticks.end());
  uint64_t cutoff = *(ticks.end() - ticks.size() / 4);
  for (auto it = paths.begin(); it != paths.end();) {
    it = it->second.lru_tick <= cutoff && paths.size() > kMaxPathEntries * 3 / 4 ? paths.erase(it)
                                                                                 : std::next(it);
  }
}

// Rebuild the base path's contours as N single-contour paths, each with a
// resident PathMeasure. skity's PathMeasure reconstructs its segment tables
// on every construction (and on SetPath), so a per-contour measure built once
// is the only way an animated trim window avoids re-subdividing the whole
// path each frame. Verb replay notes:
// - kConic must be replayed via ConicTo with the iterated weight (a LineTo
//   approximation would visibly change ovals/arcs).
// - a kLine that IsCloseLine() is the close verb's synthesized back-line —
//   replaying it would duplicate the contour's implicit closure, so it is
//   skipped and the kClose (or the contour switch) emits the Close instead.
void RenderCache::SplitContours(const skity::Path &base, std::vector<TrimContour> *out) {
  out->clear();
  skity::Path::Iter iter(base, /*forceClose=*/false);
  skity::Point pts[4];
  skity::Path::Verb verb = iter.Next(pts);
  TrimContour *cur = nullptr;
  while (verb != skity::Path::Verb::kDone) {
    switch (verb) {
    case skity::Path::Verb::kMove:
      out->emplace_back();
      cur = &out->back();
      cur->single.MoveTo(pts[0]);
      break;
    case skity::Path::Verb::kLine:
      if (cur != nullptr && !iter.IsCloseLine()) cur->single.LineTo(pts[1]);
      break;
    case skity::Path::Verb::kQuad:
      if (cur != nullptr) cur->single.QuadTo(pts[1], pts[2]);
      break;
    case skity::Path::Verb::kConic:
      if (cur != nullptr) cur->single.ConicTo(pts[1], pts[2], iter.ConicWeight());
      break;
    case skity::Path::Verb::kCubic:
      if (cur != nullptr) cur->single.CubicTo(pts[1], pts[2], pts[3]);
      break;
    case skity::Path::Verb::kClose:
      if (cur != nullptr) cur->single.Close();
      break;
    case skity::Path::Verb::kDone:
      break;
    }
    verb = iter.Next(pts);
  }
  // A path that never moved (empty) leaves no contours; measures attach now.
  for (TrimContour &c : *out) {
    c.measure = std::make_unique<skity::PathMeasure>(c.single, /*forceClosed=*/false);
  }
}

void RenderCache::TrimFromContours(const std::vector<TrimContour> &contours, float start, float end,
                                   skity::Path *out) {
  for (const TrimContour &c : contours) {
    if (c.measure == nullptr) continue;
    float len = c.measure->GetLength();
    c.measure->GetSegment(start * len, end * len, out, /*startWithMoveTo=*/true);
  }
}

} // namespace skityrt
