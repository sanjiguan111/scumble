// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// skity renderer for the skityrt::RenderTree FlatBuffer. Mirrors
// lynx-native-svg's TreeRenderer.kt (node traversal, paint, path, transform).
// skity uses PascalCase method names + Skia-style k-prefixed enum values.

#include "SkityRenderer.h"

#include <algorithm>
#include <cmath>
#include <string>

#include "render_tree_common_generated.h"
#include "render_tree_style_generated.h"

namespace skityrt {
namespace {

using skity::Canvas;
using skity::Matrix;
using skity::Paint;
using skity::Path;
using skity::Rect;

// Degrees → radians (avoid relying on platform M_PI).
constexpr float kDegToRad = 0.01745329251994329577f;

// RGBAColor (0-255 channels) → skity ARGB uint32, alpha scaled by opacity.
uint32_t ColorFromRGBA(const RGBAColor *c, float opacity = 1.f) {
  if (c == nullptr) return 0;
  uint32_t a = static_cast<uint32_t>(std::lround(c->a() * opacity));
  if (a > 255u) a = 255u;
  return (a << 24) | ((c->r() & 0xffu) << 16) | ((c->g() & 0xffu) << 8) | (c->b() & 0xffu);
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

// Build a skity Path from the node's path_data (a nested PathCommandList
// FlatBuffer built on the JS side, memcpy'd verbatim by native measure). Falls
// back to the points vector (polyline/polygon) when no commands are present.
Path BuildPath(const RenderNode *node, bool force_close) {
  Path path;
  const auto *list = node->path_data_nested_root();
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

  const auto *pts = node->points();
  auto plen = pts != nullptr ? pts->size() : 0u;
  if (clen == 0 && plen >= 4) {
    path.MoveTo(pts->Get(0), pts->Get(1));
    for (size_t i = 2; i + 1 < plen; i += 2) {
      path.LineTo(pts->Get(i), pts->Get(i + 1));
    }
  }
  if (force_close) path.Close();
  return path;
}

void ApplyTransform(const ComputedStyle *style, Canvas *canvas) {
  if (style == nullptr) return;
  // Transform ops come as a nested FlatBuffer (TransformOpList) built on the JS
  // side; native only memcpys the bytes. See RENDER_ARCHITECTURE.md §5.
  const auto *tlist = style->transform_data_nested_root();
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

// TODO(skity): gradient shaders (linear/radial) — populate paint.SetShader(...)
// once the skity Shader creation API is confirmed. Until then only solid-color
// fill/stroke are emitted; gradient paints are treated as inactive.
bool MakeFillPaint(const ComputedStyle *style, float opacity, Paint *out) {
  if (style == nullptr) return false;
  const ResolvedPaint *fill = style->fill();
  if (fill == nullptr || fill->type() == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kFill_Style);
  out->SetAntiAlias(true);
  if (fill->type() == 1 /*COLOR*/) {
    out->SetColor(ColorFromRGBA(fill->color(), opacity));
    return true;
  }
  return false; // GRADIENT: TODO
}

bool MakeStrokePaint(const ComputedStyle *style, float opacity, Paint *out) {
  if (style == nullptr) return false;
  const ResolvedPaint *stroke = style->stroke();
  if (stroke == nullptr || stroke->type() == 0 /*NONE*/) return false;
  out->SetStyle(Paint::kStroke_Style);
  out->SetAntiAlias(true);
  out->SetStrokeWidth(style->stroke_width());
  out->SetStrokeCap(ToCap(style->stroke_linecap()));
  out->SetStrokeJoin(ToJoin(style->stroke_linejoin()));
  out->SetStrokeMiter(style->stroke_miterlimit());
  if (stroke->type() == 1 /*COLOR*/) {
    out->SetColor(ColorFromRGBA(stroke->color(), opacity));
    return true;
  }
  // TODO(skity): gradient stroke + dash path effect.
  return false;
}

void DrawShape(const RenderNode *node, Canvas *canvas, const ComputedStyle *style) {
  const ::flatbuffers::String *tag_s = node->tag_name();
  if (tag_s == nullptr) return;
  std::string tag = tag_s->str();
  float opacity = style != nullptr ? style->opacity() : 1.f;

  if (tag == "rect") {
    float w = node->width();
    float h = node->height();
    if (w <= 0.f || h <= 0.f) return;
    Rect rect = Rect::MakeXYWH(node->x(), node->y(), w, h);
    float rx = node->rx();
    float ry = node->ry();
    bool round = rx > 0.f || ry > 0.f;
    Paint p;
    if (MakeFillPaint(style, opacity, &p)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, p) : canvas->DrawRect(rect, p);
    }
    if (MakeStrokePaint(style, opacity, &p)) {
      round ? canvas->DrawRoundRect(rect, rx, ry, p) : canvas->DrawRect(rect, p);
    }
  } else if (tag == "circle") {
    float r = node->r();
    if (r <= 0.f) return;
    Paint p;
    if (MakeFillPaint(style, opacity, &p)) {
      canvas->DrawCircle(node->cx(), node->cy(), r, p);
    }
    if (MakeStrokePaint(style, opacity, &p)) {
      canvas->DrawCircle(node->cx(), node->cy(), r, p);
    }
  } else if (tag == "ellipse") {
    float rx = node->rx();
    float ry = node->ry();
    if (rx <= 0.f || ry <= 0.f) return;
    Path path;
    path.AddOval(Rect::MakeXYWH(node->cx() - rx, node->cy() - ry, rx * 2.f, ry * 2.f));
    Paint p;
    if (MakeFillPaint(style, opacity, &p)) canvas->DrawPath(path, p);
    if (MakeStrokePaint(style, opacity, &p)) canvas->DrawPath(path, p);
  } else if (tag == "line") {
    Paint p;
    if (MakeStrokePaint(style, opacity, &p)) {
      canvas->DrawLine(node->x1(), node->y1(), node->x2(), node->y2(), p);
    }
  } else if (tag == "path") {
    Path path = BuildPath(node, false);
    if (style != nullptr && style->fill_rule() == FillRule_EVENODD) {
      path.SetFillType(Path::PathFillType::kEvenOdd);
    }
    Paint p;
    if (MakeFillPaint(style, opacity, &p)) canvas->DrawPath(path, p);
    if (MakeStrokePaint(style, opacity, &p)) canvas->DrawPath(path, p);
  } else if (tag == "polyline" || tag == "polygon") {
    Path path = BuildPath(node, tag == "polygon");
    if (style != nullptr && style->fill_rule() == FillRule_EVENODD) {
      path.SetFillType(Path::PathFillType::kEvenOdd);
    }
    Paint p;
    if (MakeFillPaint(style, opacity, &p)) canvas->DrawPath(path, p);
    if (MakeStrokePaint(style, opacity, &p)) canvas->DrawPath(path, p);
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
void ApplyViewport(const RenderTree *tree, Canvas *canvas, float canvasWidthPx,
                   float canvasHeightPx, float density) {
  if (density <= 0.f) return;
  const ViewBox *vp = tree->viewport();
  if (vp == nullptr || vp->width() <= 0.f || vp->height() <= 0.f) return;

  float canvasDpW = canvasWidthPx / density;
  float canvasDpH = canvasHeightPx / density;
  float vx = vp->x(), vy = vp->y(), vw = vp->width(), vh = vp->height();

  const PreserveAspectRatio *pa = tree->preserve_aspect();
  auto align = pa != nullptr ? pa->align() : AspectRatioAlign_X_MID;
  auto mos = pa != nullptr ? pa->meet_or_slice() : AspectRatioMeetOrSlice_MEET;

  float scaleX = canvasDpW / vw;
  float scaleY = canvasDpH / vh;
  float sx, sy, tx, ty;
  if (align == AspectRatioAlign_NONE) {
    sx = scaleX;
    sy = scaleY;
    tx = ty = 0.f;
  } else {
    float s = (mos == AspectRatioMeetOrSlice_MEET) ? std::min(scaleX, scaleY)
                                                    : std::max(scaleX, scaleY);
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

void DrawNode(const RenderNode *node, Canvas *canvas) {
  if (node == nullptr) return;
  const ComputedStyle *style = node->style();
  if (style != nullptr) {
    if (style->display() == Display_NONE) return;
    if (style->visibility() != Visibility_VISIBLE) return;
  }

  canvas->Save();
  ApplyTransform(style, canvas);
  // TODO(skity): precise group opacity via saveLayer; for now opacity is folded
  // into each paint's color alpha (approximate — fine for leaves, lossy for
  // groups with overlapping children).

  const ::flatbuffers::String *tag_s = node->tag_name();
  if (tag_s != nullptr) {
    std::string tag = tag_s->str();
    if (tag == "svg" || tag == "g" || tag == "symbol" || tag == "canvas") {
      const auto *kids = node->children();
      auto n = kids != nullptr ? kids->size() : 0u;
      for (size_t i = 0; i < n; i++)
        DrawNode(kids->Get(i), canvas);
      canvas->Restore();
      return;
    }
  }
  DrawShape(node, canvas, style);
  canvas->Restore();
}

} // namespace

void SkityRenderer::Draw(const RenderTree *tree, Canvas *canvas, float density,
                         float canvasWidth, float canvasHeight) {
  if (tree == nullptr || canvas == nullptr) return;
  const RenderNode *root = tree->root();
  if (root == nullptr) return;
  canvas->Save();
  if (density != 1.f) canvas->Scale(density, density);
  ApplyViewport(tree, canvas, canvasWidth, canvasHeight, density);
  DrawNode(root, canvas);
  canvas->Restore();
}

} // namespace skityrt
