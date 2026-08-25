// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// skity renderer for the retained render tree (skityrt::RetainedRenderTree).
// Mirrors lynx-native-svg's TreeRenderer.kt (node traversal, paint, path,
// transform). Phase 2: the tree is reconciled from RenderTree snapshots +
// CommandBatch mutations on the render thread; this file no longer decodes a
// FlatBuffer snapshot per frame. skity uses PascalCase method names + Skia-style
// k-prefixed enum values.

#include "SkityRenderer.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>
#include <vector>

#include <skity/effect/color_filter.hpp>
#include <skity/effect/image_filter.hpp>
#include <skity/effect/mask_filter.hpp>
#include <skity/effect/path_effect.hpp>
#include <skity/effect/shader.hpp>
#include <skity/graphic/path_op.hpp>

#include "command_batch_generated.h" // PaintField_* (inheritance explicit markers)
#include "font_registry.h"           // FontRegistry (paragraph glyph runs)
#include "image_store.h"             // ImageStore (image nodes)
#include "render_cache.h"            // build cache (RENDER_ARCHITECTURE.md §15)
#include "render_tree_common_generated.h"
#include "render_tree_style_generated.h"

namespace skityrt {
namespace {

// Frame-local build cache (per-tree, attached by Draw below). Render-thread
// only, and Draw is never re-entrant on that thread (Android's shared
// SkityRenderThread serializes every canvas; iOS serializes on the render
// queue), so a thread-local beats threading a parameter through the whole
// DrawNode/DrawShape/MakePaint call graph. Null = cache disabled (kill
// switch or allocation failure) — every consumer falls back to the uncached
// build path.
thread_local RenderCache *t_frame_cache = nullptr;

// Intern-or-build: lookup by content hash (collision-verified), call `build`
// only on a miss and insert the product. Hits/misses feed the stats counters.
template <typename T, typename Build>
std::shared_ptr<T> InternOrBuild(LRUInternTable<T> &table, uint64_t *hits, uint64_t *misses,
                                 const uint8_t *data, std::size_t size, Build build) {
  uint64_t h = HashBytes(data, size);
  if (auto v = table.Lookup(h, data, size)) {
    if (hits != nullptr) (*hits)++;
    return v;
  }
  if (misses != nullptr) (*misses)++;
  auto v = build();
  if (v != nullptr) table.Insert(h, data, size, v);
  return v;
}

using skity::Canvas;
using skity::ColorFilter;
using skity::ColorFilters;
using skity::ImageFilter;
using skity::ImageFilters;
using skity::MaskFilter;
using skity::Matrix;
using skity::Paint;
using skity::Path;
using skity::PathEffect;
using skity::PathMeasure;
using skity::PathOp;
using skity::Rect;
using skity::Shader;

// Degrees → radians (avoid relying on platform M_PI).
constexpr float kDegToRad = 0.01745329251994329577f;

// Packed 0xAARRGGBB (alpha = raw 0-255) → skity color, alpha scaled by opacity.
uint32_t ColorFromARGB(uint32_t argb, float opacity = 1.f) {
  uint32_t a = (argb >> 24) & 0xffu;
  a = static_cast<uint32_t>(std::lround(a * opacity));
  if (a > 255u) a = 255u;
  return (a << 24) | (argb & 0x00ffffffu);
}

Paint::Cap ToCap(LineCap cap) {
  switch (cap) {
  case LineCap_ROUND:
    return Paint::kRound_Cap;
  case LineCap_SQUARE:
    return Paint::kSquare_Cap;
  default:
    return Paint::kButt_Cap;
  }
}

Paint::Join ToJoin(LineJoin join) {
  switch (join) {
  case LineJoin_ROUND:
    return Paint::kRound_Join;
  case LineJoin_BEVEL:
    return Paint::kBevel_Join;
  default:
    return Paint::kMiter_Join;
  }
}

// Read a float arg from a flatbuffers Vector<float> by index.
float VecArg(const ::flatbuffers::Vector<float> *v, size_t idx, float def = 0.f) {
  return (v != nullptr && idx < v->size()) ? v->Get(idx) : def;
}

// Build a skity Path from nested PathCommandList bytes (a FlatBuffer built on
// the JS side, memcpy'd verbatim) — shared by path/polyline drawing and the
// group clip PATH branch.
Path BuildPathFromBytes(const std::vector<uint8_t> &data, bool force_close) {
  Path path;
  const PathCommandList *list = nullptr;
  if (!data.empty()) {
    list = ::flatbuffers::GetRoot<PathCommandList>(data.data());
  }
  const auto *cmds = list != nullptr ? list->commands() : nullptr;
  auto clen = cmds != nullptr ? cmds->size() : 0u;
  for (size_t i = 0; i < clen; i++) {
    const PathCommand *cmd = cmds->Get(i);
    if (cmd == nullptr) continue;
    const auto *args = cmd->args();
    switch (cmd->type()) {
    case PathCommandType_MOVE_TO:
      path.MoveTo(VecArg(args, 0), VecArg(args, 1));
      break;
    case PathCommandType_LINE_TO:
      path.LineTo(VecArg(args, 0), VecArg(args, 1));
      break;
    case PathCommandType_CUBIC_TO:
      path.CubicTo(VecArg(args, 0), VecArg(args, 1), VecArg(args, 2), VecArg(args, 3),
                   VecArg(args, 4), VecArg(args, 5));
      break;
    case PathCommandType_QUAD_TO:
      path.QuadTo(VecArg(args, 0), VecArg(args, 1), VecArg(args, 2), VecArg(args, 3));
      break;
    case PathCommandType_ARC_TO:
      // skity ArcTo(rx, ry, rotation, ArcSize, Direction, x, y). SVG's
      // largeArcFlag/sweepFlag map to ArcSize / Direction enums.
      path.ArcTo(VecArg(args, 0), VecArg(args, 1), VecArg(args, 2),
                 VecArg(args, 3) != 0.f ? Path::ArcSize::kLarge : Path::ArcSize::kSmall,
                 VecArg(args, 4) != 0.f ? Path::Direction::kCW : Path::Direction::kCCW,
                 VecArg(args, 5), VecArg(args, 6));
      break;
    case PathCommandType_CLOSE:
      path.Close();
      break;
    }
  }
  if (force_close) path.Close();
  return path;
}

// skityrt PathOpKind → skity PathOp::Op (same value order, spelled out).
PathOp::Op ToPathOp(PathOpKind kind) {
  switch (kind) {
  case PathOpKind_DIFFERENCE:
    return PathOp::Op::kDifference;
  case PathOpKind_INTERSECT:
    return PathOp::Op::kIntersect;
  case PathOpKind_XOR:
    return PathOp::Op::kXor;
  default:
    return PathOp::Op::kUnion;
  }
}

// Evaluate a JS-built PathOpList (boolean composition) into a skity Path.
// Left fold: operands[0] is the base; each following operand combines into the
// accumulated result with its own op. A leaf operand carries nested
// PathCommandList bytes; a right-nested composition carries a sub-PathOpList
// (recursed here). PathOp::Execute may fail on degenerate input — the operand
// is then skipped and the accumulated result stands (a failed op simply
// yields no path; without a channel back we degrade gracefully instead).
//
// TODO(perf): like the plain path channel, this re-evaluates every frame; a
// RetainedNode-level cache keyed on payload identity would avoid it.
Path BuildOpPath(const std::vector<uint8_t> &data) {
  const PathOpList *list = nullptr;
  if (!data.empty()) {
    list = ::flatbuffers::GetRoot<PathOpList>(data.data());
  }
  const auto *operands = list != nullptr ? list->operands() : nullptr;
  auto count = operands != nullptr ? operands->size() : 0u;
  if (count == 0u) return Path{};

  // Resolve one operand's geometry: nested sub-tree when present, else the
  // leaf's PathCommandList bytes (an absent payload is an empty path).
  auto operandPath = [](const PathOperand *operand) {
    const auto *nested = operand->nested();
    if (nested != nullptr && nested->size() > 0) {
      return BuildOpPath(std::vector<uint8_t>(nested->Data(), nested->Data() + nested->size()));
    }
    const auto *cmds = operand->commands();
    if (cmds == nullptr || cmds->size() == 0) return Path{};
    return BuildPathFromBytes(std::vector<uint8_t>(cmds->Data(), cmds->Data() + cmds->size()),
                              false);
  };

  Path acc = operandPath(operands->Get(0));
  for (uint32_t i = 1; i < count; i++) {
    const PathOperand *operand = operands->Get(i);
    if (operand == nullptr) continue;
    Path next;
    if (PathOp::Execute(acc, operandPath(operand), ToPathOp(operand->op()), &next)) {
      acc = next;
    }
  }
  return acc;
}

// Build a skity Path from the node's path_data; falls back to the points
// vector (polyline/polygon) when no commands are present.
Path BuildPath(const RetainedNode *node, bool force_close) {
  // A boolean-op payload (PathOpList) wins over the plain path data — the
  // component layer sends one or the other, never both.
  if (!node->path_op_data.empty()) return BuildOpPath(node->path_op_data);
  if (node->path_data.empty() && node->points.size() >= 4) {
    Path path;
    const auto &pts = node->points;
    path.MoveTo(pts[0], pts[1]);
    for (size_t i = 2; i + 1 < pts.size(); i += 2) {
      path.LineTo(pts[i], pts[i + 1]);
    }
    if (force_close) path.Close();
    return path;
  }
  return BuildPathFromBytes(node->path_data, force_close);
}

// Trim a path to the normalized length window [start, end] via skity
// PathMeasure (start/end in [0,1], clamped, start<end, else left untouched).
// In-place: on success `path` is replaced by the sub-segment. Skia trim
// semantics (SkTrimPathEffect): each contour is trimmed independently
// against its own length, so one PathMeasure walked with NextContour +
// GetSegment (append-only) yields the exact curve segments for every
// contour — no resampling. ContourMeasure::getSegment is const and never
// touches the contour iterator, so sharing one measure across the loop is
// safe (verified against skity src/graphic/contour_measure.cc).
void TrimPath(Path &path, float start, float end) {
  if (start <= 0.f && end >= 1.f) return;
  float s = std::clamp(start, 0.f, 1.f);
  float e = std::clamp(end, 0.f, 1.f);
  if (s >= e) return;
  PathMeasure pm(path, /*forceClosed=*/false);
  Path trimmed;
  do {
    float len = pm.GetLength();
    pm.GetSegment(s * len, e * len, &trimmed, /*startWithMoveTo=*/true);
  } while (pm.NextContour());
  if (!trimmed.IsEmpty()) path = trimmed;
}

// Defined below (after the filter/shader builders they consume).
bool MakeFillPaint(const RetainedComputedStyle *style, float opacity, skity::GPUContext *gpu,
                   Paint *out);
bool MakeStrokePaint(const RetainedComputedStyle *style, float opacity, skity::GPUContext *gpu,
                     Paint *out);

// Cached path draw (RENDER_ARCHITECTURE.md §15) for path/polyline/polygon/
// circle/ellipse shapes. The base Path (fill type baked in) is cached per
// node id and validated by the (geom_version, paint_version, epoch) stamp;
// oval shapes additionally key on their scalar geometry (cx,cy,rx,ry) —
// animated radii rewrite those values without bumping geom_version, so the
// values themselves join the hit check. Animated trims split the base into
// per-contour paths with resident PathMeasures so a moving trim window costs
// only GetSegment per frame. An untrimmed cache hit feeds the canvas by
// const& — zero per-frame path work. With the cache disabled this is the
// original build+trim lane, unchanged (rollback path).
void DrawCachedPath(const RetainedNode *node, Canvas *canvas, const RetainedComputedStyle *style,
                    float opacity, skity::GPUContext *gpu_context, bool force_close, bool oval,
                    const float *geom_key = nullptr, uint32_t geom_key_len = 0) {
  const FillRule fill_rule = style != nullptr ? style->fill_rule : FillRule_NONZERO;
  RenderCache *rc = t_frame_cache;
  Path local; // uncached lane / trim output
  const Path *draw_path = nullptr;
  auto build_oval = [&geom_key](Path *p) {
    p->AddOval(Rect::MakeXYWH(geom_key[0] - geom_key[3], geom_key[1] - geom_key[2],
                              geom_key[3] * 2.f, geom_key[2] * 2.f));
  };
  if (rc == nullptr) {
    local = Path{};
    if (oval) {
      build_oval(&local);
    } else {
      local = BuildPath(node, force_close);
    }
    TrimPath(local, AnimPathStart(node), AnimPathEnd(node));
    if (style != nullptr && fill_rule == FillRule_EVENODD) {
      local.SetFillType(Path::PathFillType::kEvenOdd);
    }
    draw_path = &local;
  } else {
    RenderCache::PathCacheEntry &e = rc->paths[node->id];
    bool key_ok =
        e.geom_key_len == geom_key_len &&
        (geom_key_len == 0 || std::memcmp(e.geom_key, geom_key, geom_key_len * sizeof(float)) == 0);
    if (!key_ok || e.fill_rule != fill_rule ||
        !e.stamp.Matches(node->geom_version, node->paint_version, rc->current_epoch)) {
      e.base = Path{};
      if (oval) {
        build_oval(&e.base);
      } else {
        e.base = BuildPath(node, force_close);
      }
      e.base.SetFillType(fill_rule == FillRule_EVENODD ? Path::PathFillType::kEvenOdd
                                                       : Path::PathFillType::kWinding);
      e.fill_rule = fill_rule;
      e.geom_key_len = geom_key_len;
      for (uint32_t k = 0; k < geom_key_len && k < 4; k++)
        e.geom_key[k] = geom_key[k];
      e.stamp = CacheStamp{node->geom_version, node->paint_version, rc->current_epoch};
      e.contours.clear();
      e.contours_built = false;
      rc->stats.path_misses++;
      rc->EvictPathEntriesIfNeeded();
    } else {
      rc->stats.path_hits++;
    }
    e.lru_tick = ++rc->lru_tick;
    // Trim-window semantics mirror TrimPath exactly: full window / s>=e leave
    // the path untouched; a degenerate result falls back to the base path.
    float s = std::clamp(AnimPathStart(node), 0.f, 1.f);
    float t = std::clamp(AnimPathEnd(node), 0.f, 1.f);
    if ((s <= 0.f && t >= 1.f) || s >= t) {
      draw_path = &e.base;
    } else {
      if (!e.contours_built) {
        RenderCache::SplitContours(e.base, &e.contours);
        e.contours_built = true;
        rc->stats.trim_misses++;
      } else {
        rc->stats.trim_hits++;
      }
      RenderCache::TrimFromContours(e.contours, s, t, &local);
      if (local.IsEmpty()) {
        draw_path = &e.base;
      } else {
        local.SetFillType(e.base.GetFillType());
        draw_path = &local;
      }
    }
  }
  Paint fillPaint;
  if (MakeFillPaint(style, opacity, gpu_context, &fillPaint))
    canvas->DrawPath(*draw_path, fillPaint);
  Paint strokePaint;
  if (MakeStrokePaint(style, opacity, gpu_context, &strokePaint))
    canvas->DrawPath(*draw_path, strokePaint);
}

// Transform ops come as a nested FlatBuffer (TransformOpList) built on the JS
// side; native only memcpys the bytes. See RENDER_ARCHITECTURE.md §5. Both
// lanes below must stay op-for-op equivalent: the uncached one replays ops on
// the canvas, the folded one post-multiplies them into a single Matrix
// (skity Matrix post* methods are exactly the canvas primitive semantics,
// including the pivot-rotate variant).

void ApplyTransformOpsUncached(const RetainedComputedStyle *style, Canvas *canvas) {
  const TransformOpList *tlist = nullptr;
  if (style->transform_data != nullptr) {
    tlist = ::flatbuffers::GetRoot<TransformOpList>(style->transform_data->data());
  }
  const auto *ops = tlist != nullptr ? tlist->ops() : nullptr;
  auto len = ops != nullptr ? ops->size() : 0u;
  for (size_t i = 0; i < len; i++) {
    const TransformOp *op = ops->Get(i);
    if (op == nullptr) continue;
    const auto *args = op->args();
    switch (op->type()) {
    case TransformType_TRANSLATE:
      canvas->Translate(VecArg(args, 0), VecArg(args, 1));
      break;
    case TransformType_SCALE: {
      float sx = VecArg(args, 0, 1.f);
      canvas->Scale(sx, VecArg(args, 1, sx));
      break;
    }
    case TransformType_ROTATE: {
      float deg = VecArg(args, 0);
      size_t n = args != nullptr ? args->size() : 0;
      if (n >= 3) { // rotate around (cx, cy)
        canvas->Translate(VecArg(args, 1), VecArg(args, 2));
        canvas->Rotate(deg);
        canvas->Translate(-VecArg(args, 1), -VecArg(args, 2));
      } else {
        canvas->Rotate(deg);
      }
      break;
    }
    case TransformType_MATRIX: {
      // SVG matrix(a,b,c,d,e,f): x' = a·x + c·y + e ; y' = b·x + d·y + f.
      // skity uses a row-vector Matrix; the Set* mapping below is the
      // transpose-correct one (SetSkewX ↔ c, SetSkewY ↔ b).
      if (args != nullptr && args->size() >= 6) {
        Matrix m;
        m.SetScaleX(VecArg(args, 0));
        m.SetSkewY(VecArg(args, 1));
        m.SetSkewX(VecArg(args, 2));
        m.SetScaleY(VecArg(args, 3));
        m.SetTranslateX(VecArg(args, 4));
        m.SetTranslateY(VecArg(args, 5));
        canvas->Concat(m);
      }
      break;
    }
    case TransformType_SKEW_X:
      // Stored as degrees; skity Skew takes tangents.
      canvas->Skew(std::tan(VecArg(args, 0) * kDegToRad), 0.f);
      break;
    case TransformType_SKEW_Y:
      canvas->Skew(0.f, std::tan(VecArg(args, 0) * kDegToRad));
      break;
    default:
      break;
    }
  }
}

Matrix FoldTransformOps(const BytesPtr &transform_data) {
  Matrix m; // identity (constexpr default ctor)
  if (transform_data == nullptr) return m;
  const TransformOpList *tlist = ::flatbuffers::GetRoot<TransformOpList>(transform_data->data());
  const auto *ops = tlist != nullptr ? tlist->ops() : nullptr;
  auto len = ops != nullptr ? ops->size() : 0u;
  for (size_t i = 0; i < len; i++) {
    const TransformOp *op = ops->Get(i);
    if (op == nullptr) continue;
    const auto *args = op->args();
    switch (op->type()) {
    case TransformType_TRANSLATE:
      m.PostTranslate(VecArg(args, 0), VecArg(args, 1));
      break;
    case TransformType_SCALE: {
      float sx = VecArg(args, 0, 1.f);
      m.PostScale(sx, VecArg(args, 1, sx));
      break;
    }
    case TransformType_ROTATE: {
      float deg = VecArg(args, 0);
      size_t n = args != nullptr ? args->size() : 0;
      if (n >= 3) {
        m.PostRotate(deg, VecArg(args, 1), VecArg(args, 2));
      } else {
        m.PostRotate(deg);
      }
      break;
    }
    case TransformType_MATRIX: {
      if (args != nullptr && args->size() >= 6) {
        Matrix mm; // same field mapping as the uncached lane
        mm.SetScaleX(VecArg(args, 0));
        mm.SetSkewY(VecArg(args, 1));
        mm.SetSkewX(VecArg(args, 2));
        mm.SetScaleY(VecArg(args, 3));
        mm.SetTranslateX(VecArg(args, 4));
        mm.SetTranslateY(VecArg(args, 5));
        m.PostConcat(mm);
      }
      break;
    }
    case TransformType_SKEW_X:
      m.PostSkew(std::tan(VecArg(args, 0) * kDegToRad), 0.f);
      break;
    case TransformType_SKEW_Y:
      m.PostSkew(0.f, std::tan(VecArg(args, 0) * kDegToRad));
      break;
    default:
      break;
    }
  }
  return m;
}

void ApplyTransform(const RetainedNode *node, Canvas *canvas) {
  if (node == nullptr) return;
  const RetainedComputedStyle *style = &node->style;
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr) {
    // Uncached lane: replay the ops straight onto the canvas each frame.
    ApplyTransformOpsUncached(style, canvas);
  } else {
    // Cached lane: fold the op list into ONE matrix on miss; each frame is a
    // single Concat (the per-frame FlatBuffer re-parse disappears).
    RenderCache::TransformCacheEntry &e = rc->xforms[node->id];
    if (!e.valid || !e.stamp.Matches(node->geom_version, node->paint_version, rc->current_epoch)) {
      e.base = FoldTransformOps(style->transform_data);
      e.stamp = CacheStamp{node->geom_version, node->paint_version, rc->current_epoch};
      e.valid = true;
      rc->stats.transform_misses++;
    } else {
      rc->stats.transform_hits++;
    }
    canvas->Concat(e.base);
  }
  // Animated transform components APPEND after the base ops (post-multiply,
  // D1): the overlay holds resolved scalars, so the JS-built TransformOpList
  // bytes are never rebuilt per frame.
  const AnimationOverlay &ov = node->anim.overlay;
  if (ov.mask & (AnimationOverlay::kBitTranslateX | AnimationOverlay::kBitTranslateY)) {
    canvas->Translate((ov.mask & AnimationOverlay::kBitTranslateX) ? ov.tx : 0.f,
                      (ov.mask & AnimationOverlay::kBitTranslateY) ? ov.ty : 0.f);
  }
  if (ov.mask & AnimationOverlay::kBitRotate) {
    canvas->Translate(ov.pivot_x, ov.pivot_y);
    canvas->Rotate(ov.rotate);
    canvas->Translate(-ov.pivot_x, -ov.pivot_y);
  }
  if (ov.mask & AnimationOverlay::kBitScaleXY) {
    canvas->Translate(ov.pivot_x, ov.pivot_y);
    canvas->Scale(ov.sx, ov.sy);
    canvas->Translate(-ov.pivot_x, -ov.pivot_y);
  }
}

// Build a skity Shader from a nested Gradient FlatBuffer (USER_SPACE coords, so
// no bbox lookup is needed). LINEAR/RADIAL/SWEEP/TWO_POINT_CONICAL are
// dispatched on the type byte. Returns nullptr on empty/invalid data so the
// paint is treated as inactive (draws nothing), matching the COLOR-inactive
// behavior.
std::shared_ptr<Shader> BuildGradientShader(const std::vector<uint8_t> &data) {
  if (data.empty()) return nullptr;
  const Gradient *g = ::flatbuffers::GetRoot<Gradient>(data.data());
  if (g == nullptr) return nullptr;
  const auto *stops = g->stops();
  auto count = stops != nullptr ? stops->size() : 0u;
  if (count < 2) return nullptr;

  std::vector<skity::Vec4> colors(count);
  std::vector<float> pos(count);
  for (::flatbuffers::uoffset_t i = 0; i < count; i++) {
    const GradientStop *s = stops->Get(i);
    const RGBAColor *c = s != nullptr ? s->color() : nullptr;
    if (c != nullptr) {
      colors[i] = skity::Vec4(c->r() / 255.f, c->g() / 255.f, c->b() / 255.f, c->a() / 255.f);
    } else {
      colors[i] = skity::Vec4(0.f, 0.f, 0.f, 1.f);
    }
    pos[i] = s != nullptr ? s->offset() : static_cast<float>(i) / (count - 1);
  }

  // SpreadMethod → skity TileMode (PAD→kClamp, REPEAT→kRepeat, REFLECT→kMirror).
  skity::TileMode tile = skity::TileMode::kClamp;
  switch (g->spread_method()) {
  case SpreadMethod_REPEAT:
    tile = skity::TileMode::kRepeat;
    break;
  case SpreadMethod_REFLECT:
    tile = skity::TileMode::kMirror;
    break;
  default:
    break;
  }

  // skity::Point is an alias for Vec4; gradient geometry uses only x/y (z=w=0).
  switch (g->type()) {
  case 0: { // LINEAR
    skity::Point pts[2];
    pts[0] = skity::Vec4(g->x1(), g->y1(), 0.f, 0.f);
    pts[1] = skity::Vec4(g->x2(), g->y2(), 0.f, 0.f);
    return Shader::MakeLinear(pts, colors.data(), pos.data(), static_cast<int>(count), tile);
  }
  case 1: { // RADIAL (center + radius; fx/fy/fr focal fields unused)
    if (g->r() <= 0.f) return nullptr;
    skity::Vec4 center(g->cx(), g->cy(), 0.f, 0.f);
    return Shader::MakeRadial(center, g->r(), colors.data(), pos.data(), static_cast<int>(count),
                              tile);
  }
  case 2: { // SWEEP (angles in degrees; start/end map to pos 0/1)
    if (g->end_angle() <= g->start_angle()) return nullptr;
    return Shader::MakeSweep(g->cx(), g->cy(), g->start_angle(), g->end_angle(), colors.data(),
                             pos.data(), static_cast<int>(count), tile);
  }
  case 3: { // TWO_POINT_CONICAL (start circle fx/fy/fr → end circle cx/cy/r)
    if (g->r() <= 0.f || g->fr() < 0.f) return nullptr;
    if (g->fx() == g->cx() && g->fy() == g->cy() && g->fr() == g->r()) return nullptr;
    skity::Vec4 start(g->fx(), g->fy(), 0.f, 0.f);
    skity::Vec4 end(g->cx(), g->cy(), 0.f, 0.f);
    return Shader::MakeTwoPointConical(start, g->fr(), end, g->r(), colors.data(), pos.data(),
                                       static_cast<int>(count), tile);
  }
  default:
    return nullptr;
  }
}

// Apply a gradient shader to `out` (shared by fill + stroke). opacity is folded
// in via SetAlphaF (approximate — skity premultiplies per-stop, this scales the
// whole paint alpha). Returns false (inactive paint) if no valid shader builds.
// The shader payload is interned by descriptor hash when the frame cache is
// live — the FlatBuffer re-parse + double vector copy was a per-shape (and
// per-paragraph-run) per-frame cost.
bool ApplyGradient(const BytesPtr &data, float opacity, Paint *out) {
  if (data == nullptr) return false;
  std::shared_ptr<Shader> shader;
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr || data->empty()) {
    shader = BuildGradientShader(*data);
  } else {
    uint64_t h = HashBytes(data->data(), data->size());
    shader = rc->gradient_intern.Lookup(h, data->data(), data->size());
    if (shader != nullptr) {
      rc->stats.gradient_hits++;
    } else {
      rc->stats.gradient_misses++;
      shader = BuildGradientShader(*data);
      if (shader != nullptr) rc->gradient_intern.Insert(h, data->data(), data->size(), shader);
    }
  }
  if (shader == nullptr) return false;
  out->SetShader(shader);
  out->SetAlphaF(opacity);
  return true;
}

// Apply an image shader to `out` (shared by fill + stroke). Defined after
// ApplyBoxFit (which it reuses for the fit semantics); returns false (inactive
// paint) while the bitmap is pending/failed in the ImageStore — the store
// write triggers another draw, so the shape just appears late.
bool ApplyImageShader(const RetainedPaint &paint, float opacity, skity::GPUContext *gpu_context,
                      Paint *out);

// ---- Paint filters (JS-built Filter bytes → skity filter objects) ----
// The HW canvas chains a paint's filters mask → image → color
// (hw_filters.cc ConvertPaintToHWFilter); each slot holds one Filter tree,
// with IMAGE_COMPOSE folding children in declaration order ([0] innermost —
// each later declaration wraps the accumulated one, Compose(outer, inner)).

std::shared_ptr<ImageFilter> BuildImageFilterNode(const skityrt::Filter *f) {
  if (f == nullptr) return nullptr;
  switch (f->kind()) {
  case skityrt::FilterKind_IMAGE_BLUR:
    return ImageFilters::Blur(f->fx(), f->fy());
  case skityrt::FilterKind_IMAGE_DROP_SHADOW:
    // fx/fy = offset, fz = sigma (uniform), color = 0xAARRGGBB.
    return ImageFilters::DropShadow(f->fx(), f->fy(), f->fz(), f->fz(),
                                    ColorFromARGB(f->color(), 1.f), nullptr);
  case skityrt::FilterKind_IMAGE_COMPOSE: {
    std::shared_ptr<ImageFilter> acc;
    const auto *kids = f->children();
    for (uint32_t i = 0; kids != nullptr && i < kids->size(); i++) {
      auto cur = BuildImageFilterNode(kids->Get(i));
      if (cur == nullptr) continue;
      acc = acc == nullptr ? cur : ImageFilters::Compose(cur /*outer=later*/, acc /*inner*/);
    }
    return acc;
  }
  default:
    return nullptr;
  }
}

std::shared_ptr<ColorFilter> BuildColorFilterNode(const skityrt::Filter *f) {
  if (f == nullptr) return nullptr;
  switch (f->kind()) {
  case skityrt::FilterKind_COLOR_MATRIX: {
    const auto *m = f->matrix();
    if (m == nullptr || m->size() != 20) return nullptr;
    float row_major[20];
    for (uint32_t i = 0; i < 20; i++)
      row_major[i] = m->Get(i);
    return ColorFilters::Matrix(row_major);
  }
  case skityrt::FilterKind_COLOR_BLEND:
    return ColorFilters::Blend(ColorFromARGB(f->color(), 1.f),
                               static_cast<skity::BlendMode>(f->mode()));
  case skityrt::FilterKind_IMAGE_COMPOSE: {
    std::shared_ptr<ColorFilter> acc;
    const auto *kids = f->children();
    for (uint32_t i = 0; kids != nullptr && i < kids->size(); i++) {
      auto cur = BuildColorFilterNode(kids->Get(i));
      if (cur == nullptr) continue;
      acc = acc == nullptr ? cur : ColorFilters::Compose(cur /*outer=later*/, acc /*inner*/);
    }
    return acc;
  }
  default:
    return nullptr;
  }
}

std::shared_ptr<ImageFilter> BuildImageFilter(const BytesPtr &data) {
  if (data == nullptr || data->empty()) return nullptr;
  const skityrt::Filter *f = ::flatbuffers::GetRoot<skityrt::Filter>(data->data());
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr) return BuildImageFilterNode(f);
  return InternOrBuild(rc->image_filter_intern, &rc->stats.filter_hits, &rc->stats.filter_misses,
                       data->data(), data->size(), [&] { return BuildImageFilterNode(f); });
}

std::shared_ptr<ColorFilter> BuildColorFilter(const BytesPtr &data) {
  if (data == nullptr || data->empty()) return nullptr;
  const skityrt::Filter *f = ::flatbuffers::GetRoot<skityrt::Filter>(data->data());
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr) return BuildColorFilterNode(f);
  return InternOrBuild(rc->color_filter_intern, &rc->stats.filter_hits, &rc->stats.filter_misses,
                       data->data(), data->size(), [&] { return BuildColorFilterNode(f); });
}

std::shared_ptr<MaskFilter> BuildMaskFilter(const BytesPtr &data) {
  if (data == nullptr || data->empty()) return nullptr;
  const skityrt::Filter *f = ::flatbuffers::GetRoot<skityrt::Filter>(data->data());
  auto build = [&]() -> std::shared_ptr<MaskFilter> {
    if (f == nullptr || f->kind() != skityrt::FilterKind_MASK_BLUR) return nullptr;
    // skityrt::BlurStyle value order == skity::BlurStyle (1-based, kNormal..kInner).
    return MaskFilter::MakeBlur(static_cast<skity::BlurStyle>(f->style()), f->fx());
  };
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr) return build();
  return InternOrBuild(rc->mask_filter_intern, &rc->stats.filter_hits, &rc->stats.filter_misses,
                       data->data(), data->size(), build);
}

// Attach the paint's three filter slots. Called on every successful paint
// construction; empty slots leave the paint untouched.
void ApplyPaintFilters(const RetainedPaint &paint, Paint *out) {
  auto cf = BuildColorFilter(paint.color_filter_data);
  if (cf != nullptr) out->SetColorFilter(cf);
  auto imf = BuildImageFilter(paint.image_filter_data);
  if (imf != nullptr) out->SetImageFilter(imf);
  auto mf = BuildMaskFilter(paint.mask_filter_data);
  if (mf != nullptr) out->SetMaskFilter(mf);
}

bool MakeFillPaint(const RetainedComputedStyle *style, float opacity,
                   skity::GPUContext *gpu_context, Paint *out) {
  if (style == nullptr) return false;
  const RetainedPaint &fill = style->fill;
  if (fill.type == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kFill_Style);
  out->SetAntiAlias(true);
  out->SetBlendMode(static_cast<skity::BlendMode>(style->blend_mode));
  if (fill.type == 1 /*COLOR*/) {
    out->SetColor(ColorFromARGB(fill.color, opacity));
    ApplyPaintFilters(fill, out);
    return true;
  }
  if (fill.type == 3 /*IMAGE_SHADER*/) {
    bool ok = ApplyImageShader(fill, opacity, gpu_context, out);
    if (ok) ApplyPaintFilters(fill, out);
    return ok;
  }
  // GRADIENT
  bool ok = ApplyGradient(fill.gradient_data, opacity, out);
  if (ok) ApplyPaintFilters(fill, out);
  return ok;
}

// Apply the style's dash pattern as the paint's path effect. Valid patterns:
// even count ≥ 2, non-negative intervals, positive sum (skity requires the
// same); anything else is skipped (solid stroke). The effect object is
// interned on (intervals + phase) — the canvas-side FilterPath expansion
// still runs per draw (upstream behavior; caching the EXPANDED path is the
// P4 follow-up).
void ApplyDashIfAny(const RetainedComputedStyle *style, Paint *out) {
  const FloatsPtr &dash = style->stroke_dash;
  if (dash == nullptr || dash->size() < 2 || dash->size() % 2 != 0) return;
  float sum = 0.f;
  for (float v : *dash) {
    if (v < 0.f) return;
    sum += v;
  }
  if (sum <= 0.f) return;
  float offset = style->stroke_dashoffset;
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr || dash->size() > 64) {
    // Uncached lane (or absurd pattern): build directly.
    auto effect =
        PathEffect::MakeDashPathEffect(dash->data(), static_cast<int>(dash->size()), offset);
    if (effect != nullptr) out->SetPathEffect(effect);
    return;
  }
  // Intern key = float bits of (intervals…, phase) — stack buffer, no alloc.
  float key[65];
  std::memcpy(key, dash->data(), dash->size() * sizeof(float));
  key[dash->size()] = offset;
  auto effect = InternOrBuild(
      rc->dash_intern, &rc->stats.dash_hits, &rc->stats.dash_misses,
      reinterpret_cast<const uint8_t *>(key), (dash->size() + 1) * sizeof(float), [&] {
        return PathEffect::MakeDashPathEffect(dash->data(), static_cast<int>(dash->size()), offset);
      });
  if (effect != nullptr) out->SetPathEffect(effect);
}

bool MakeStrokePaint(const RetainedComputedStyle *style, float opacity,
                     skity::GPUContext *gpu_context, Paint *out) {
  if (style == nullptr) return false;
  const RetainedPaint &stroke = style->stroke;
  if (stroke.type == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kStroke_Style);
  out->SetAntiAlias(true);
  out->SetBlendMode(static_cast<skity::BlendMode>(style->blend_mode));
  out->SetStrokeWidth(style->stroke_width);
  out->SetStrokeCap(ToCap(style->stroke_cap));
  out->SetStrokeJoin(ToJoin(style->stroke_join));
  out->SetStrokeMiter(style->stroke_miter);
  ApplyDashIfAny(style, out);
  if (stroke.type == 1 /*COLOR*/) {
    out->SetColor(ColorFromARGB(stroke.color, opacity));
    ApplyPaintFilters(stroke, out);
    return true;
  }
  if (stroke.type == 3 /*IMAGE_SHADER*/) {
    bool ok = ApplyImageShader(stroke, opacity, gpu_context, out);
    if (ok) ApplyPaintFilters(stroke, out);
    return ok;
  }
  // GRADIENT.
  bool ok = ApplyGradient(stroke.gradient_data, opacity, out);
  if (ok) ApplyPaintFilters(stroke, out);
  return ok;
}

// Box-fit port (CSS object-fit family; command_batch.fbs BoxFit order).
// Computes the source sub-rect (of the bitmap, in pixel space) and the
// destination sub-rect (of the user rect) for each fit mode; both are then
// centered within their full rects ("inscribe"). Empty output rects mean
// "nothing to draw".
void ApplyBoxFit(uint8_t fit, float iw, float ih, const Rect &dstFull, Rect *src, Rect *dst) {
  if (iw <= 0.f || ih <= 0.f) {
    *src = Rect::MakeEmpty();
    *dst = Rect::MakeEmpty();
    return;
  }
  const float dw = dstFull.Width();
  const float dh = dstFull.Height();
  float sw = iw, sh = ih; // fitted source size
  float tw = dw, th = dh; // fitted destination size
  const bool outWider = dw / dh > iw / ih;
  switch (fit) {
  case 0: // FILL: stretch, source untouched
    break;
  case 1: // CONTAIN: whole bitmap, letterbox
    if (outWider) {
      tw = iw * dh / ih;
      th = dh;
    } else {
      tw = dw;
      th = ih * dw / iw;
    }
    break;
  case 2: // COVER: fill dst, center-crop the source
    if (outWider) {
      sh = iw * dh / dw;
    } else {
      sw = ih * dw / dh;
    }
    break;
  case 3: // FIT_WIDTH: width == dst, height overflows/underflows
    th = ih * dw / iw;
    break;
  case 4: // FIT_HEIGHT: height == dst, width overflows/underflows
    tw = iw * dh / ih;
    break;
  case 5: // NONE: 1:1, center crop to the smaller of src/dst per axis
    if (dw < iw || dh < ih) {
      sw = std::min(iw, dw);
      sh = std::min(ih, dh);
    }
    tw = sw;
    th = sh;
    break;
  case 6: // SCALE_DOWN: like CONTAIN, but never upscale
    if (dw < iw || dh < ih) {
      ApplyBoxFit(1 /*CONTAIN*/, iw, ih, dstFull, src, dst);
    } else {
      ApplyBoxFit(5 /*NONE*/, iw, ih, dstFull, src, dst);
    }
    return;
  default: // unknown: CONTAIN
    ApplyBoxFit(1, iw, ih, dstFull, src, dst);
    return;
  }
  src->SetLTRB((iw - sw) * 0.5f, (ih - sh) * 0.5f, (iw + sw) * 0.5f, (ih + sh) * 0.5f);
  dst->SetLTRB(dstFull.X() + (dw - tw) * 0.5f, dstFull.Y() + (dh - th) * 0.5f,
               dstFull.X() + (dw + tw) * 0.5f, dstFull.Y() + (dh + th) * 0.5f);
}

// Image shader (an image as a paint's texture). uri is the ImageStore key
// (pixels arrive via the platform loader; the TASM setter fired the request);
// a null/before-pixels image means "draw nothing this frame" — the store
// write triggers another draw, so the shape appears late. With a rect, fit
// resolves at render time against the bitmap's intrinsic size (same math as
// the image node) and the local matrix maps the fitted source sub-rect into
// the fitted destination; without one the bitmap tiles 1:1. Tiling outside
// the fitted area follows tx/ty (skity TileMode value order).
bool ApplyImageShader(const RetainedPaint &paint, float opacity, skity::GPUContext *gpu_context,
                      Paint *out) {
  if (gpu_context == nullptr || paint.image_shader_uri == nullptr) return false;
  std::shared_ptr<skity::Image> image =
      ImageStore::Instance().FindImage(*paint.image_shader_uri, gpu_context);
  if (image == nullptr) return false;
  const float iw = static_cast<float>(image->Width());
  const float ih = static_cast<float>(image->Height());
  Rect src, dst;
  if (paint.image_shader_rect[2] > 0.f && paint.image_shader_rect[3] > 0.f) {
    ApplyBoxFit(paint.image_shader_fit, iw, ih,
                Rect::MakeXYWH(paint.image_shader_rect[0], paint.image_shader_rect[1],
                               paint.image_shader_rect[2], paint.image_shader_rect[3]),
                &src, &dst);
  } else {
    // identity: the whole bitmap, 1:1 from the origin
    src = Rect::MakeXYWH(0.f, 0.f, iw, ih);
    dst = Rect::MakeXYWH(0.f, 0.f, iw, ih);
  }
  if (src.IsEmpty() || dst.IsEmpty() || src.Width() <= 0.f || src.Height() <= 0.f) return false;
  // local matrix: map src (pixel space) → dst (user space)
  skity::Matrix m = skity::Matrix::Scale(dst.Width() / src.Width(), dst.Height() / src.Height());
  m.PreTranslate(-src.X(), -src.Y());
  m.PostTranslate(dst.X(), dst.Y());
  auto shader = skity::Shader::MakeShader(
      image, skity::SamplingOptions{skity::FilterMode::kLinear, skity::MipmapMode::kNone},
      static_cast<skity::TileMode>(paint.image_shader_tx),
      static_cast<skity::TileMode>(paint.image_shader_ty), m);
  if (shader == nullptr) return false;
  out->SetShader(shader);
  out->SetAlphaF(opacity);
  return true;
}

// Image nodes carry no fill/stroke slots of their own. The inherited (or
// node-authored) opacity and blend mode apply, plus the fill slot's filters;
// fill color/gradient are ignored — the bitmap supplies the color, so the
// modulate color is white at the effective opacity (a non-white color would
// tint the bitmap).
void MakeImagePaint(const RetainedComputedStyle *style, float opacity, Paint *out) {
  if (style == nullptr) return;
  out->SetAntiAlias(true);
  out->SetBlendMode(static_cast<skity::BlendMode>(style->blend_mode));
  out->SetColor(ColorFromARGB(0xFFFFFFFFu, opacity));
  ApplyPaintFilters(style->fill, out);
}

void DrawShape(const RetainedNode *node, Canvas *canvas, const RetainedComputedStyle *style,
               skity::GPUContext *gpu_context) {
  const std::string &tag = node->tag_name;
  if (tag.empty()) return;
  float opacity = style != nullptr ? style->opacity : 1.f;

  if (tag == "rect") {
    float w = AnimWidth(node);
    float h = AnimHeight(node);
    if (w <= 0.f || h <= 0.f) return;
    Rect rect = Rect::MakeXYWH(AnimX(node), AnimY(node), w, h);
    float rx = node->rx;
    float ry = node->ry;
    bool round = rx > 0.f || ry > 0.f;
    // Each pass gets its own Paint: reusing one would leak the fill pass's
    // gradient shader into the stroke pass (a shader overrides SetColor), so a
    // gradient fill would repaint the stroke with the fill's shader.
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, gpu_context, &fillPaint)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, fillPaint) : canvas->DrawRect(rect, fillPaint);
    }
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, gpu_context, &strokePaint)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, strokePaint)
            : canvas->DrawRect(rect, strokePaint);
    }
  } else if (tag == "circle") {
    float r = AnimR(node);
    if (r <= 0.f) return;
    // {cx, cy, rx, ry} — the animated scalars join the cache key so an
    // animated radius misses while a static circle keeps hitting.
    float key[4] = {AnimCX(node), AnimCY(node), r, r};
    DrawCachedPath(node, canvas, style, opacity, gpu_context, /*force_close=*/false,
                   /*oval=*/true, key, 4);
  } else if (tag == "ellipse") {
    if (node->rx <= 0.f || node->ry <= 0.f) return;
    float key[4] = {node->cx, node->cy, node->rx, node->ry};
    DrawCachedPath(node, canvas, style, opacity, gpu_context, /*force_close=*/false,
                   /*oval=*/true, key, 4);
  } else if (tag == "line") {
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, gpu_context, &strokePaint)) {
      canvas->DrawLine(node->x1, node->y1, node->x2, node->y2, strokePaint);
    }
  } else if (tag == "path") {
    DrawCachedPath(node, canvas, style, opacity, gpu_context, /*force_close=*/false,
                   /*oval=*/false);
  } else if (tag == "polyline" || tag == "polygon") {
    DrawCachedPath(node, canvas, style, opacity, gpu_context, tag == "polygon", /*oval=*/false);
  } else if (tag == "image") {
    // Bitmap node. Pixels arrive asynchronously in the ImageStore (keyed by
    // uri); pending/failed/missing all mean "draw nothing this frame" — the
    // store write triggers another draw, so the image just appears late.
    if (gpu_context == nullptr || node->image_uri.empty()) return;
    if (AnimWidth(node) <= 0.f || AnimHeight(node) <= 0.f) return;
    std::shared_ptr<skity::Image> image =
        ImageStore::Instance().FindImage(node->image_uri, gpu_context);
    if (image == nullptr) return;
    Rect src, dst;
    ApplyBoxFit(
        node->image_fit, static_cast<float>(image->Width()), static_cast<float>(image->Height()),
        Rect::MakeXYWH(AnimX(node), AnimY(node), AnimWidth(node), AnimHeight(node)), &src, &dst);
    if (src.IsEmpty() || dst.IsEmpty()) return;
    Paint paint;
    MakeImagePaint(style, opacity, &paint);
    // Sampling rides the SetImageSource command (value order == skity).
    // Cubic B/C are transported but not consumed yet: the released
    // skity-native (1.1.0-alpha.3) SamplingOptions has no cubic member —
    // wire up `sampling.cubic.B/C = node->image_cubic_b/c` once a skity
    // build with CubicResampler ships (non-zero B/C then ignores filter,
    // Skia semantics).
    skity::SamplingOptions sampling;
    sampling.filter = static_cast<skity::FilterMode>(node->image_filter_mode);
    sampling.mipmap = static_cast<skity::MipmapMode>(node->image_mipmap_mode);
    canvas->DrawImageRect(image, src, dst, sampling, &paint);
  } else if (tag == "paragraph") {
    if (!node->has_paragraph) return;
    if (node->paragraph.runs.empty()) return;
    canvas->Save();
    canvas->Translate(AnimX(node), AnimY(node));
    // Node-level fill (explicit or inherited) rides every run: skity's glyph
    // atlas path natively renders gradient shaders and color filters through
    // the A8 mask. Image-shader fills (type 3) and image/mask filters are
    // ignored by skity's text pipeline — they ride along harmlessly or the
    // run falls back to its span color.
    const RetainedPaint *fill = style != nullptr ? &style->fill : nullptr;
    for (const auto &run : node->paragraph.runs) {
      // Font lookup through the per-tree cache: FontRegistry::Find takes a
      // mutex (TASM writers vs render readers); the cache pays it once per id.
      skity::Font font;
      RenderCache *rc = t_frame_cache;
      if (rc != nullptr) {
        auto it = rc->fonts.find(run.font_id);
        if (it != rc->fonts.end()) {
          font = it->second;
        } else {
          font = FontRegistry::Instance().Find(run.font_id);
          rc->fonts.emplace(run.font_id, font);
        }
      } else {
        font = FontRegistry::Instance().Find(run.font_id);
      }
      if (font.GetTypefaceOrDefault() == nullptr) continue;
      Paint paint;
      paint.SetAntiAlias(true);
      paint.SetBlendMode(
          static_cast<skity::BlendMode>(style != nullptr ? style->blend_mode : BlendMode_SRC_OVER));
      bool styled = false;
      if (fill != nullptr && fill->type == 2 /*GRADIENT*/) {
        // The shader supplies the hue; the span color survives only as alpha
        // modulation (a transparent span stays invisible under a gradient).
        const float spanAlpha = opacity * (float)((run.color >> 24) & 0xFF) / 255.f;
        styled = ApplyGradient(fill->gradient_data, spanAlpha, &paint);
      } else if (fill != nullptr && fill->type == 1 /*COLOR*/) {
        paint.SetColor(ColorFromARGB(fill->color, opacity));
        styled = true;
      }
      if (!styled) paint.SetColor(ColorFromARGB(run.color, opacity));
      if (fill != nullptr) ApplyPaintFilters(*fill, &paint);
      canvas->DrawGlyphs(static_cast<int>(run.glyphs.size()), run.glyphs.data(), run.pos_x.data(),
                         run.pos_y.data(), font, paint);
    }
    canvas->Restore();
  }
}

// Apply the canvas viewport (SVG viewBox + preserveAspectRatio semantics).
// Maps the logical coordinate space declared by ViewBox onto the canvas's
// physical size. Applied in dp space (after the density scale), so child
// geometry authored in logical pixels lands at the correct physical pixels.
//
// NOTE: AspectRatioAlign has only NONE/X_MIN/X_MID/X_MAX (no independent Y
// alignment) — Y placement is coupled to X (MVP trade-off, render_tree.fbs).
// SLICE overflow is clipped naturally by the surface, no explicit ClipRect.
void ApplyViewport(const RetainedViewport &vp, Canvas *canvas, float canvasWidthPx,
                   float canvasHeightPx, float density) {
  if (density <= 0.f) return;
  if (!vp.enabled || vp.width <= 0.f || vp.height <= 0.f) return;

  float canvasDpW = canvasWidthPx / density;
  float canvasDpH = canvasHeightPx / density;
  float vx = vp.x, vy = vp.y, vw = vp.width, vh = vp.height;

  auto align = vp.align;
  auto mos = vp.meet_or_slice;

  float scaleX = canvasDpW / vw;
  float scaleY = canvasDpH / vh;
  float sx, sy, tx, ty;
  if (align == AspectRatioAlign_NONE) {
    sx = scaleX;
    sy = scaleY;
    tx = ty = 0.f;
  } else {
    float s =
        (mos == AspectRatioMeetOrSlice_MEET) ? std::min(scaleX, scaleY) : std::max(scaleX, scaleY);
    sx = sy = s;
    float freeW = canvasDpW - vw * s;
    float freeH = canvasDpH - vh * s;
    switch (align) {
    case AspectRatioAlign_X_MIN:
      tx = 0.f;
      ty = 0.f;
      break;
    case AspectRatioAlign_X_MAX:
      tx = freeW;
      ty = freeH;
      break;
    default: // X_MID
      tx = freeW / 2.f;
      ty = freeH / 2.f;
      break;
    }
  }
  canvas->Translate(tx, ty);
  canvas->Scale(sx, sy);
  canvas->Translate(-vx, -vy);
}

// Apply the node's clip sequence (group nodes), in the group's local
// coordinate space (after its own transform, before its subtree). The canvas
// accumulates intersect/difference ops natively, so a ClipList is just applied
// in order.
// Uncached clip lane: re-parse the ClipList every frame (kept verbatim from
// the pre-cache implementation — the rollback path).
void ApplyClipUncached(const std::vector<uint8_t> &clip_data, Canvas *canvas) {
  const ClipList *list = ::flatbuffers::GetRoot<ClipList>(clip_data.data());
  const auto *clips = list != nullptr ? list->clips() : nullptr;
  if (clips == nullptr) return;
  for (uint32_t i = 0; i < clips->size(); i++) {
    const Clip *c = clips->Get(i);
    if (c == nullptr) continue;
    auto op =
        c->op() == ClipOp_DIFFERENCE ? Canvas::ClipOp::kDifference : Canvas::ClipOp::kIntersect;
    switch (c->type()) {
    case ClipType_RECT:
      canvas->ClipRect(Rect::MakeXYWH(c->x(), c->y(), c->width(), c->height()), op);
      break;
    case ClipType_RRECT:
      canvas->ClipRRect(
          skity::RRect::MakeRectXY(Rect::MakeXYWH(c->x(), c->y(), c->width(), c->height()), c->rx(),
                                   c->ry()),
          op);
      break;
    case ClipType_PATH: {
      // The nested PathCommandList bytes travel as a [ubyte] vector; copy into
      // an owning buffer so BuildPathFromBytes can GetRoot it.
      const auto *bytes = c->path();
      if (bytes == nullptr || bytes->size() == 0) break;
      std::vector<uint8_t> data(bytes->Data(), bytes->Data() + bytes->size());
      canvas->ClipPath(BuildPathFromBytes(data, false), op);
      break;
    }
    }
  }
}

void ApplyClipIfAny(const RetainedNode *node, Canvas *canvas) {
  if (node->clip_data.empty()) return;
  RenderCache *rc = t_frame_cache;
  if (rc == nullptr) {
    ApplyClipUncached(node->clip_data, canvas);
    return;
  }
  // Cached lane: parse the ClipList (and decode nested path bytes) once per
  // change; each frame replays the resolved items — the per-frame nested-
  // bytes heap copy of the uncached lane disappears.
  RenderCache::ClipCacheEntry &e = rc->clips[node->id];
  if (!e.built || !e.stamp.Matches(node->geom_version, node->paint_version, rc->current_epoch)) {
    e.items.clear();
    const ClipList *list = ::flatbuffers::GetRoot<ClipList>(node->clip_data.data());
    const auto *clips = list != nullptr ? list->clips() : nullptr;
    if (clips != nullptr) {
      for (uint32_t i = 0; i < clips->size(); i++) {
        const Clip *c = clips->Get(i);
        if (c == nullptr) continue;
        RenderCache::ClipCacheItem item;
        item.op = c->op() == ClipOp_DIFFERENCE ? 1 : 0;
        switch (c->type()) {
        case ClipType_RECT:
          item.kind = RenderCache::ClipCacheItem::Kind::kRect;
          item.rect = Rect::MakeXYWH(c->x(), c->y(), c->width(), c->height());
          break;
        case ClipType_RRECT:
          item.kind = RenderCache::ClipCacheItem::Kind::kRRect;
          item.rect = Rect::MakeXYWH(c->x(), c->y(), c->width(), c->height());
          item.rx = c->rx();
          item.ry = c->ry();
          break;
        case ClipType_PATH: {
          const auto *bytes = c->path();
          if (bytes == nullptr || bytes->size() == 0) continue;
          std::vector<uint8_t> data(bytes->Data(), bytes->Data() + bytes->size());
          item.kind = RenderCache::ClipCacheItem::Kind::kPath;
          item.path = BuildPathFromBytes(data, false);
          break;
        }
        }
        e.items.push_back(std::move(item));
      }
    }
    e.stamp = CacheStamp{node->geom_version, node->paint_version, rc->current_epoch};
    e.built = true;
    rc->stats.clip_misses++;
  } else {
    rc->stats.clip_hits++;
  }
  e.lru_tick = ++rc->lru_tick;
  for (const RenderCache::ClipCacheItem &item : e.items) {
    Canvas::ClipOp op = item.op == 1 ? Canvas::ClipOp::kDifference : Canvas::ClipOp::kIntersect;
    switch (item.kind) {
    case RenderCache::ClipCacheItem::Kind::kRect:
      canvas->ClipRect(item.rect, op);
      break;
    case RenderCache::ClipCacheItem::Kind::kRRect:
      canvas->ClipRRect(skity::RRect::MakeRectXY(item.rect, item.rx, item.ry), op);
      break;
    case RenderCache::ClipCacheItem::Kind::kPath:
      canvas->ClipPath(item.path, op);
      break;
    }
  }
}

// Draw a node with group→child paint inheritance. `inherited` carries the
// merged ancestor style — its fill/stroke paints, stroke attrs and fill_rule
// are the fallbacks for fields this node never authored (explicit_paint), and
// its opacity is the accumulated product down the tree. Transform, geometry,
// display and visibility are per-node (never inherited).
void DrawNode(const RetainedNode *node, Canvas *canvas, const RetainedComputedStyle &inherited,
              skity::GPUContext *gpu_context) {
  if (node == nullptr) return;
  const RetainedComputedStyle &style = node->style;
  if (style.display == Display_NONE) return;
  if (style.visibility != Visibility_VISIBLE) return;

  canvas->Save();
  ApplyTransform(node, canvas);
  // TODO(skity): precise group opacity via saveLayer; for now opacity is folded
  // into each paint's color alpha (approximate — fine for leaves, lossy for
  // groups with overlapping children).

  RetainedComputedStyle scratch; // eff storage when this node overrides anything
  const RetainedComputedStyle *eff = &inherited;
  uint32_t explicitPaint = style.explicit_paint;
  // Animated paint slots act as if explicitly authored (D1): they enter the
  // same inheritance merge below, so an animated fill under a styled group
  // wins instead of being overridden (the explicit_paint trap).
  const AnimationOverlay &ov = node->anim.overlay;
  if (ov.mask & AnimationOverlay::kBitFillColor) explicitPaint |= PaintField_FILL;
  if (ov.mask & AnimationOverlay::kBitStrokeColor) explicitPaint |= PaintField_STROKE;
  if (ov.mask & AnimationOverlay::kBitOpacity) explicitPaint |= PaintField_OPACITY;
  if (explicitPaint != 0) {
    scratch = inherited;
    if (explicitPaint & (PaintField_FILL | PaintField_FILL_GRADIENT | PaintField_FILL_IMAGE_SHADER))
      scratch.fill = style.fill;
    if (explicitPaint &
        (PaintField_STROKE | PaintField_STROKE_GRADIENT | PaintField_STROKE_IMAGE_SHADER))
      scratch.stroke = style.stroke;
    // Filter-only authorship merges at field level: the inherited fill or
    // stroke (type/color/gradient) survives, only the filter bytes override —
    // a node declaring e.g. a <ColorMatrix> still inherits the group's fill.
    if (explicitPaint &
        (RetainedComputedStyle::kBitFillColorFilter | RetainedComputedStyle::kBitFillImageFilter |
         RetainedComputedStyle::kBitFillMaskFilter)) {
      scratch.fill.color_filter_data = style.fill.color_filter_data;
      scratch.fill.image_filter_data = style.fill.image_filter_data;
      scratch.fill.mask_filter_data = style.fill.mask_filter_data;
    }
    if (explicitPaint & (RetainedComputedStyle::kBitStrokeColorFilter |
                         RetainedComputedStyle::kBitStrokeImageFilter |
                         RetainedComputedStyle::kBitStrokeMaskFilter)) {
      scratch.stroke.color_filter_data = style.stroke.color_filter_data;
      scratch.stroke.image_filter_data = style.stroke.image_filter_data;
      scratch.stroke.mask_filter_data = style.stroke.mask_filter_data;
    }
    if (explicitPaint & PaintField_STROKE_WIDTH) scratch.stroke_width = style.stroke_width;
    if (explicitPaint & PaintField_STROKE_CAP) scratch.stroke_cap = style.stroke_cap;
    if (explicitPaint & PaintField_STROKE_JOIN) scratch.stroke_join = style.stroke_join;
    if (explicitPaint & PaintField_STROKE_MITER) scratch.stroke_miter = style.stroke_miter;
    if (explicitPaint & PaintField_STROKE_DASH) {
      scratch.stroke_dash = style.stroke_dash;
      scratch.stroke_dashoffset = style.stroke_dashoffset;
    }
    if (explicitPaint & PaintField_FILL_RULE) scratch.fill_rule = style.fill_rule;
    if (explicitPaint & PaintField_BLEND_MODE) scratch.blend_mode = style.blend_mode;
    // Opacity multiplies down the tree (only when explicitly authored).
    if (explicitPaint & PaintField_OPACITY)
      scratch.opacity *= (ov.mask & AnimationOverlay::kBitOpacity) ? ov.opacity : style.opacity;
    // Animated colors override AFTER the inheritance merge: the base paint
    // (gradient bytes, filters) still comes from the node/inherited state,
    // only the color+type are animated.
    if (ov.mask & AnimationOverlay::kBitFillColor) {
      scratch.fill.type = 1; // COLOR
      scratch.fill.color = ov.fill;
    }
    if (ov.mask & AnimationOverlay::kBitStrokeColor) {
      scratch.stroke.type = 1;
      scratch.stroke.color = ov.stroke;
    }
    eff = &scratch;
  }

  const std::string &tag = node->tag_name;
  if (tag == "svg" || tag == "g" || tag == "symbol" || tag == "canvas") {
    ApplyClipIfAny(node, canvas);
    for (const RetainedNode *child : node->children) {
      DrawNode(child, canvas, *eff, gpu_context);
    }
    canvas->Restore();
    return;
  }
  DrawShape(node, canvas, eff, gpu_context);
  canvas->Restore();
}

} // namespace

void SkityRenderer::Draw(const RetainedRenderTree *tree, Canvas *canvas, float density,
                         float canvasWidth, float canvasHeight, ::skity::GPUContext *gpu_context) {
  if (tree == nullptr || canvas == nullptr) return;
  const RetainedNode *root = tree->root();
  if (root == nullptr) return;
  // Attach/refresh the frame cache: per-tree blob (id safety across canvases),
  // epoch snapshot for this frame's stamp validation. Null when the kill
  // switch is off — the whole frame then runs the original uncached lanes.
  RenderCache *rc = GetRenderCache(tree);
  if (rc != nullptr) rc->current_epoch = tree->structure_epoch();
  t_frame_cache = rc;
  canvas->Save();
  if (density != 1.f) canvas->Scale(density, density);
  ApplyViewport(tree->viewport(), canvas, canvasWidth, canvasHeight, density);
  // Root inherited style: all-default (no paint authored), opacity 1 — children
  // fall back to it for fields their ancestors never set.
  DrawNode(root, canvas, RetainedComputedStyle{}, gpu_context);
  canvas->Restore();
  t_frame_cache = nullptr;
}

} // namespace skityrt
