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
#include <string>

#include <skity/effect/path_effect.hpp>
#include <skity/effect/shader.hpp>

#include "command_batch_generated.h" // PaintField_* (inheritance explicit markers)
#include "render_tree_common_generated.h"
#include "render_tree_style_generated.h"

namespace skityrt {
namespace {

using skity::Canvas;
using skity::Matrix;
using skity::Paint;
using skity::Path;
using skity::PathEffect;
using skity::PathMeasure;
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

// Build a skity Path from the node's path_data; falls back to the points
// vector (polyline/polygon) when no commands are present.
Path BuildPath(const RetainedNode *node, bool force_close) {
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
// PathMeasure (start/end in [0,1], start<end, else left untouched). In-place:
// on success `path` is replaced by the sub-segment. NOTE: only the first
// contour is trimmed — PathMeasure operates on one contour at a time; a full
// multi-contour (cumulative-length) trim is a TODO.
void TrimPath(Path &path, float start, float end) {
  if (start <= 0.f && end >= 1.f) return;
  float s = std::clamp(start, 0.f, 1.f);
  float e = std::clamp(end, 0.f, 1.f);
  if (s >= e) return;
  PathMeasure pm(path, /*forceClosed=*/false);
  float len = pm.GetLength();
  if (len <= 0.f) return;
  Path trimmed;
  if (pm.GetSegment(s * len, e * len, &trimmed, /*startWithMoveTo=*/true)) {
    path = trimmed;
  }
}

void ApplyTransform(const RetainedComputedStyle *style, Canvas *canvas) {
  if (style == nullptr) return;
  // Transform ops come as a nested FlatBuffer (TransformOpList) built on the JS
  // side; native only memcpys the bytes. See RENDER_ARCHITECTURE.md §5.
  const TransformOpList *tlist = nullptr;
  if (!style->transform_data.empty()) {
    tlist = ::flatbuffers::GetRoot<TransformOpList>(style->transform_data.data());
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
bool ApplyGradient(const std::vector<uint8_t> &data, float opacity, Paint *out) {
  auto shader = BuildGradientShader(data);
  if (shader == nullptr) return false;
  out->SetShader(shader);
  out->SetAlphaF(opacity);
  return true;
}

bool MakeFillPaint(const RetainedComputedStyle *style, float opacity, Paint *out) {
  if (style == nullptr) return false;
  const RetainedPaint &fill = style->fill;
  if (fill.type == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kFill_Style);
  out->SetAntiAlias(true);
  if (fill.type == 1 /*COLOR*/) {
    out->SetColor(ColorFromARGB(fill.color, opacity));
    return true;
  }
  // GRADIENT
  return ApplyGradient(fill.gradient_data, opacity, out);
}

// Apply the style's dash pattern as the paint's path effect. Valid patterns:
// even count ≥ 2, non-negative intervals, positive sum (skity requires the
// same); anything else is skipped (solid stroke).
void ApplyDashIfAny(const RetainedComputedStyle *style, Paint *out) {
  const auto &dash = style->stroke_dash;
  if (dash.size() < 2 || dash.size() % 2 != 0) return;
  float sum = 0.f;
  for (float v : dash) {
    if (v < 0.f) return;
    sum += v;
  }
  if (sum <= 0.f) return;
  auto effect = PathEffect::MakeDashPathEffect(dash.data(), static_cast<int>(dash.size()),
                                               style->stroke_dashoffset);
  if (effect != nullptr) out->SetPathEffect(effect);
}

bool MakeStrokePaint(const RetainedComputedStyle *style, float opacity, Paint *out) {
  if (style == nullptr) return false;
  const RetainedPaint &stroke = style->stroke;
  if (stroke.type == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kStroke_Style);
  out->SetAntiAlias(true);
  out->SetStrokeWidth(style->stroke_width);
  out->SetStrokeCap(ToCap(style->stroke_cap));
  out->SetStrokeJoin(ToJoin(style->stroke_join));
  out->SetStrokeMiter(style->stroke_miter);
  ApplyDashIfAny(style, out);
  if (stroke.type == 1 /*COLOR*/) {
    out->SetColor(ColorFromARGB(stroke.color, opacity));
    return true;
  }
  // GRADIENT.
  return ApplyGradient(stroke.gradient_data, opacity, out);
}

void DrawShape(const RetainedNode *node, Canvas *canvas, const RetainedComputedStyle *style) {
  const std::string &tag = node->tag_name;
  if (tag.empty()) return;
  float opacity = style != nullptr ? style->opacity : 1.f;

  if (tag == "rect") {
    float w = node->width;
    float h = node->height;
    if (w <= 0.f || h <= 0.f) return;
    Rect rect = Rect::MakeXYWH(node->x, node->y, w, h);
    float rx = node->rx;
    float ry = node->ry;
    bool round = rx > 0.f || ry > 0.f;
    // Each pass gets its own Paint: reusing one would leak the fill pass's
    // gradient shader into the stroke pass (a shader overrides SetColor), so a
    // gradient fill would repaint the stroke with the fill's shader.
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, &fillPaint)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, fillPaint) : canvas->DrawRect(rect, fillPaint);
    }
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, strokePaint)
            : canvas->DrawRect(rect, strokePaint);
    }
  } else if (tag == "circle") {
    float r = node->r;
    if (r <= 0.f) return;
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, &fillPaint))
      canvas->DrawCircle(node->cx, node->cy, r, fillPaint);
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint))
      canvas->DrawCircle(node->cx, node->cy, r, strokePaint);
  } else if (tag == "ellipse") {
    float rx = node->rx;
    float ry = node->ry;
    if (rx <= 0.f || ry <= 0.f) return;
    Path path;
    path.AddOval(Rect::MakeXYWH(node->cx - rx, node->cy - ry, rx * 2.f, ry * 2.f));
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, &fillPaint)) canvas->DrawPath(path, fillPaint);
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint)) canvas->DrawPath(path, strokePaint);
  } else if (tag == "line") {
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint)) {
      canvas->DrawLine(node->x1, node->y1, node->x2, node->y2, strokePaint);
    }
  } else if (tag == "path") {
    Path path = BuildPath(node, false);
    TrimPath(path, node->path_start, node->path_end);
    if (style != nullptr && style->fill_rule == FillRule_EVENODD) {
      path.SetFillType(Path::PathFillType::kEvenOdd);
    }
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, &fillPaint)) canvas->DrawPath(path, fillPaint);
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint)) canvas->DrawPath(path, strokePaint);
  } else if (tag == "polyline" || tag == "polygon") {
    Path path = BuildPath(node, tag == "polygon");
    if (style != nullptr && style->fill_rule == FillRule_EVENODD) {
      path.SetFillType(Path::PathFillType::kEvenOdd);
    }
    Paint fillPaint;
    if (MakeFillPaint(style, opacity, &fillPaint)) canvas->DrawPath(path, fillPaint);
    Paint strokePaint;
    if (MakeStrokePaint(style, opacity, &strokePaint)) canvas->DrawPath(path, strokePaint);
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
void ApplyClipIfAny(const RetainedNode *node, Canvas *canvas) {
  if (node->clip_data.empty()) return;
  const ClipList *list = ::flatbuffers::GetRoot<ClipList>(node->clip_data.data());
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

// Draw a node with group→child paint inheritance. `inherited` carries the
// merged ancestor style — its fill/stroke paints, stroke attrs and fill_rule
// are the fallbacks for fields this node never authored (explicit_paint), and
// its opacity is the accumulated product down the tree. Transform, geometry,
// display and visibility are per-node (never inherited).
void DrawNode(const RetainedNode *node, Canvas *canvas, const RetainedComputedStyle &inherited) {
  if (node == nullptr) return;
  const RetainedComputedStyle &style = node->style;
  if (style.display == Display_NONE) return;
  if (style.visibility != Visibility_VISIBLE) return;

  canvas->Save();
  ApplyTransform(&style, canvas);
  // TODO(skity): precise group opacity via saveLayer; for now opacity is folded
  // into each paint's color alpha (approximate — fine for leaves, lossy for
  // groups with overlapping children).

  RetainedComputedStyle scratch; // eff storage when this node overrides anything
  const RetainedComputedStyle *eff = &inherited;
  uint32_t explicitPaint = style.explicit_paint;
  if (explicitPaint != 0) {
    scratch = inherited;
    if (explicitPaint & (PaintField_FILL | PaintField_FILL_GRADIENT)) scratch.fill = style.fill;
    if (explicitPaint & (PaintField_STROKE | PaintField_STROKE_GRADIENT))
      scratch.stroke = style.stroke;
    if (explicitPaint & PaintField_STROKE_WIDTH) scratch.stroke_width = style.stroke_width;
    if (explicitPaint & PaintField_STROKE_CAP) scratch.stroke_cap = style.stroke_cap;
    if (explicitPaint & PaintField_STROKE_JOIN) scratch.stroke_join = style.stroke_join;
    if (explicitPaint & PaintField_STROKE_MITER) scratch.stroke_miter = style.stroke_miter;
    if (explicitPaint & PaintField_STROKE_DASH) {
      scratch.stroke_dash = style.stroke_dash;
      scratch.stroke_dashoffset = style.stroke_dashoffset;
    }
    if (explicitPaint & PaintField_FILL_RULE) scratch.fill_rule = style.fill_rule;
    // Opacity multiplies down the tree (only when explicitly authored).
    if (explicitPaint & PaintField_OPACITY) scratch.opacity *= style.opacity;
    eff = &scratch;
  }

  const std::string &tag = node->tag_name;
  if (tag == "svg" || tag == "g" || tag == "symbol" || tag == "canvas") {
    ApplyClipIfAny(node, canvas);
    for (const RetainedNode *child : node->children) {
      DrawNode(child, canvas, *eff);
    }
    canvas->Restore();
    return;
  }
  DrawShape(node, canvas, eff);
  canvas->Restore();
}

} // namespace

void SkityRenderer::Draw(const RetainedRenderTree *tree, Canvas *canvas, float density,
                         float canvasWidth, float canvasHeight) {
  if (tree == nullptr || canvas == nullptr) return;
  const RetainedNode *root = tree->root();
  if (root == nullptr) return;
  canvas->Save();
  if (density != 1.f) canvas->Scale(density, density);
  ApplyViewport(tree->viewport(), canvas, canvasWidth, canvasHeight, density);
  // Root inherited style: all-default (no paint authored), opacity 1 — children
  // fall back to it for fields their ancestors never set.
  DrawNode(root, canvas, RetainedComputedStyle{});
  canvas->Restore();
}

} // namespace skityrt
