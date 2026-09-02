// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "retained_render_tree.h"

#include <algorithm>
#include <cstdio>

#include "command_batch_generated.h"
#include "paragraph_runs_generated.h"
#include "render_tree_common_generated.h"

namespace skityrt {
namespace {

// Forward decl — defined below (after the Apply* helpers). ApplySetPaint uses
// it to copy the gradient bytes; the definition sits further down in this file.
void AssignOwnedBytes(const ::flatbuffers::Vector<uint8_t> *src, std::vector<uint8_t> *dst);
BytesPtr CloneBytes(const ::flatbuffers::Vector<uint8_t> *src); // same story (COW payloads)

// Apply a SetPaint command to a retained node. Only fields whose PaintField bit
// is set in fields_dirty are written; the rest are left untouched (FlatBuffer
// defaults make "field == 0" a valid value, so the bitmask is authoritative).
void ApplySetPaint(const SetPaint *p, RetainedNode *node) {
  uint32_t dirty = static_cast<uint32_t>(p->fields_dirty());
  // Remember which fields this node has ever authored — the inheritance
  // resolver (DrawNode) falls back to ancestor values for the rest.
  node->style.explicit_paint |= dirty;
  if (dirty & PaintField_FILL) {
    node->style.fill.type = 1; // COLOR
    node->style.fill.color = p->fill_color();
  }
  if (dirty & PaintField_STROKE) {
    node->style.stroke.type = 1; // COLOR
    node->style.stroke.color = p->stroke_color();
  }
  if (dirty & PaintField_FILL_GRADIENT) {
    node->style.fill.type = 2; // GRADIENT
    node->style.fill.gradient_data = CloneBytes(p->fill_gradient());
  }
  if (dirty & PaintField_STROKE_GRADIENT) {
    node->style.stroke.type = 2; // GRADIENT
    node->style.stroke.gradient_data = CloneBytes(p->stroke_gradient());
  }
  if (dirty & PaintField_FILL_IMAGE_SHADER) {
    const ::flatbuffers::String *uri = p->fill_image_uri();
    node->style.fill.type = (uri != nullptr && uri->size() > 0) ? 3 : 0; // IMAGE_SHADER : NONE
    node->style.fill.image_shader_uri = uri != nullptr && uri->size() > 0
                                            ? std::make_shared<const std::string>(uri->str())
                                            : nullptr;
    node->style.fill.image_shader_fit = static_cast<uint8_t>(p->fill_image_fit());
    node->style.fill.image_shader_tx = static_cast<uint8_t>(p->fill_image_tx());
    node->style.fill.image_shader_ty = static_cast<uint8_t>(p->fill_image_ty());
    const auto *rect = p->fill_image_rect();
    if (rect != nullptr && rect->size() == 4) {
      for (uint32_t i = 0; i < 4; i++)
        node->style.fill.image_shader_rect[i] = rect->Get(i);
    } else {
      node->style.fill.image_shader_rect[0] = node->style.fill.image_shader_rect[1] =
          node->style.fill.image_shader_rect[2] = node->style.fill.image_shader_rect[3] = 0.f;
    }
  }
  if (dirty & PaintField_STROKE_IMAGE_SHADER) {
    const ::flatbuffers::String *uri = p->stroke_image_uri();
    node->style.stroke.type = (uri != nullptr && uri->size() > 0) ? 3 : 0;
    node->style.stroke.image_shader_uri = uri != nullptr && uri->size() > 0
                                              ? std::make_shared<const std::string>(uri->str())
                                              : nullptr;
    node->style.stroke.image_shader_fit = static_cast<uint8_t>(p->stroke_image_fit());
    node->style.stroke.image_shader_tx = static_cast<uint8_t>(p->stroke_image_tx());
    node->style.stroke.image_shader_ty = static_cast<uint8_t>(p->stroke_image_ty());
    const auto *rect = p->stroke_image_rect();
    if (rect != nullptr && rect->size() == 4) {
      for (uint32_t i = 0; i < 4; i++)
        node->style.stroke.image_shader_rect[i] = rect->Get(i);
    } else {
      node->style.stroke.image_shader_rect[0] = node->style.stroke.image_shader_rect[1] =
          node->style.stroke.image_shader_rect[2] = node->style.stroke.image_shader_rect[3] = 0.f;
    }
  }
  if (dirty & PaintField_STROKE_DASH) {
    // Null clears dashes (solid stroke); offset travels with it.
    auto owned = std::make_shared<std::vector<float>>();
    const auto *dash = p->stroke_dash();
    if (dash != nullptr) {
      owned->reserve(dash->size());
      for (uint32_t i = 0; i < dash->size(); i++)
        owned->push_back(dash->Get(i));
    }
    node->style.stroke_dash = owned->empty() ? nullptr : std::move(owned);
    node->style.stroke_dashoffset = p->stroke_dashoffset();
  }
  if (dirty & PaintField_STROKE_WIDTH) node->style.stroke_width = p->stroke_width();
  if (dirty & PaintField_STROKE_CAP) node->style.stroke_cap = p->stroke_cap();
  if (dirty & PaintField_STROKE_JOIN) node->style.stroke_join = p->stroke_join();
  if (dirty & PaintField_STROKE_MITER) node->style.stroke_miter = p->stroke_miter();
  if (dirty & PaintField_FILL_RULE) node->style.fill_rule = p->fill_rule();
  if (dirty & PaintField_BLEND_MODE) node->style.blend_mode = p->blend_mode();
  if (dirty & PaintField_OPACITY) node->style.opacity = p->opacity();
}

// Apply a SetGeometry command. Only fields whose GeometryField bit is set in
// fields_dirty are written (same bitmask rationale as ApplySetPaint — 0 is a
// valid geometry value, e.g. radius 0).
void ApplySetGeometry(const SetGeometry *g, RetainedNode *node) {
  uint32_t dirty = static_cast<uint32_t>(g->fields_dirty());
  if (dirty & GeometryField_X) node->x = g->x();
  if (dirty & GeometryField_Y) node->y = g->y();
  if (dirty & GeometryField_WIDTH) node->width = g->width();
  if (dirty & GeometryField_HEIGHT) node->height = g->height();
  if (dirty & GeometryField_CX) node->cx = g->cx();
  if (dirty & GeometryField_CY) node->cy = g->cy();
  if (dirty & GeometryField_R) node->r = g->r();
  if (dirty & GeometryField_RX) node->rx = g->rx();
  if (dirty & GeometryField_RY) node->ry = g->ry();
  if (dirty & GeometryField_X1) node->x1 = g->x1();
  if (dirty & GeometryField_Y1) node->y1 = g->y1();
  if (dirty & GeometryField_X2) node->x2 = g->x2();
  if (dirty & GeometryField_Y2) node->y2 = g->y2();
  if (dirty & GeometryField_PATH_START) node->path_start = g->path_start();
  if (dirty & GeometryField_PATH_END) node->path_end = g->path_end();
  if (dirty & GeometryField_POINTS) {
    // Mirror the dash handling in ApplySetPaint: empty/absent vector clears.
    node->points.clear();
    const auto *pts = g->points();
    if (pts != nullptr) {
      node->points.reserve(pts->size());
      for (uint32_t i = 0; i < pts->size(); i++)
        node->points.push_back(pts->Get(i));
    }
  }
}

// Apply a SetViewport command to the tree-level viewport (canvas viewBox).
// width<=0 || height<=0 disables the viewport, mirroring UpdateViewportFromFB.
// align / meet_or_slice keep their X_MID / MEET defaults (preserveAspectRatio is
// not yet command-driven; the snapshot path fixes these values too).
void ApplySetViewport(const SetViewport *v, RetainedViewport *out) {
  if (v->width() > 0.f && v->height() > 0.f) {
    out->enabled = true;
    out->x = v->x();
    out->y = v->y();
    out->width = v->width();
    out->height = v->height();
  } else {
    out->enabled = false;
  }
}

// memcpy a nested-flatbuffer byte vector ([ubyte]) into an owning std::vector.
void AssignOwnedBytes(const ::flatbuffers::Vector<uint8_t> *src, std::vector<uint8_t> *dst) {
  if (src != nullptr && src->size() > 0) {
    dst->assign(src->Data(), src->Data() + src->size());
  } else {
    dst->clear();
  }
}

// Same, but as an immutable COW payload for the style deep fields (§15 P3):
// writes are rare (command time), every consumer copies by refcount.
BytesPtr CloneBytes(const ::flatbuffers::Vector<uint8_t> *src) {
  if (src == nullptr || src->size() == 0) return nullptr;
  return std::make_shared<const std::vector<uint8_t>>(src->Data(), src->Data() + src->size());
}

} // namespace

RetainedNode *RetainedRenderTree::Find(int32_t id) const {
  auto it = node_map_.find(id);
  return it != node_map_.end() ? it->second.get() : nullptr;
}

// ---- Structural helpers (Step 2) ----

RetainedNode *RetainedRenderTree::CreateNode(int32_t id) {
  auto it = node_map_.find(id);
  if (it != node_map_.end()) return it->second.get(); // idempotent
  auto owned = std::make_unique<RetainedNode>();
  owned->id = id;
  RetainedNode *raw = owned.get();
  node_map_.emplace(id, std::move(owned));
  return raw;
}

void RetainedRenderTree::AttachChild(RetainedNode *parent, RetainedNode *child, uint32_t index) {
  if (parent == nullptr || child == nullptr) return;
  uint32_t clamped = std::min<uint32_t>(index, static_cast<uint32_t>(parent->children.size()));
  parent->children.insert(parent->children.begin() + clamped, child);
  child->parent = parent;
}

void RetainedRenderTree::DetachFromParent(RetainedNode *node) {
  if (node == nullptr) return;
  RetainedNode *p = node->parent;
  if (p == nullptr) return;
  auto &v = p->children;
  v.erase(std::remove(v.begin(), v.end(), node), v.end());
  node->parent = nullptr;
}

bool RetainedRenderTree::IsAncestor(RetainedNode *maybe_ancestor, RetainedNode *node) const {
  for (RetainedNode *p = node; p != nullptr; p = p->parent) {
    if (p == maybe_ancestor) return true;
  }
  return false;
}

void RetainedRenderTree::EraseSubtree(int32_t id) {
  auto it = node_map_.find(id);
  if (it == node_map_.end()) return;
  RetainedNode *node = it->second.get();
  DetachFromParent(node);
  if (node == root_) root_ = nullptr;
  // Collect the whole subtree's ids, then erase from node_map_ (unique_ptr
  // frees). Animation ids AND playback handles leave their sets in the same
  // walk — ids only, never pointers, so nothing dangles.
  std::vector<int32_t> ids;
  std::vector<RetainedNode *> stack{node};
  while (!stack.empty()) {
    RetainedNode *n = stack.back();
    stack.pop_back();
    ids.push_back(n->id);
    animated_ids_.erase(n->id);
    for (RetainedNode *c : n->children)
      stack.push_back(c);
  }
  for (int32_t i : ids) {
    node_map_.erase(i);
    for (auto it = anim_handles_.begin(); it != anim_handles_.end();) {
      it = it->second == i ? anim_handles_.erase(it) : std::next(it);
    }
  }
}

// ---- ApplyCommandBatch (Step 1b + Step 2) ----

void RetainedRenderTree::ApplyParagraphRuns(const uint8_t *data, std::size_t size) {
  if (data == nullptr || size == 0) return;
  const ParagraphRunList *list = ::flatbuffers::GetRoot<ParagraphRunList>(data);
  const auto *entries = list != nullptr ? list->entries() : nullptr;
  if (entries == nullptr) return;
  for (::flatbuffers::uoffset_t i = 0; i < entries->size(); i++) {
    const ParagraphLayout *entry = entries->Get(i);
    RetainedNode *node = Find(entry->node_id());
    if (node == nullptr) continue;
    node->paint_version++; // paragraph runs feed per-run paint/font builds
    node->has_paragraph = true;
    node->paragraph.height = entry->height();
    node->paragraph.line_count = entry->line_count();
    node->paragraph.runs.clear();
    const auto *runs = entry->runs(); // null only for pre-decoration payloads
    if (runs != nullptr) {
      node->paragraph.runs.reserve(runs->size());
      for (::flatbuffers::uoffset_t r = 0; r < runs->size(); r++) {
        const ParagraphGlyphRun *src = runs->Get(r);
        const auto *glyphs = src->glyphs();
        const auto *px = src->pos_x();
        const auto *py = src->pos_y();
        if (glyphs == nullptr || px == nullptr || py == nullptr) continue;
        if (glyphs->size() == 0 || glyphs->size() != px->size() || glyphs->size() != py->size())
          continue;
        RetainedNode::GlyphRun run;
        run.font_id = src->font_id();
        run.color = src->color();
        run.glyphs.assign(glyphs->data(), glyphs->data() + glyphs->size());
        run.pos_x.assign(px->data(), px->data() + px->size());
        run.pos_y.assign(py->data(), py->data() + py->size());
        node->paragraph.runs.push_back(std::move(run));
      }
    }
    node->paragraph.decorations.clear();
    const auto *decs = entry->decorations();
    if (decs != nullptr) {
      node->paragraph.decorations.reserve(decs->size());
      for (::flatbuffers::uoffset_t d = 0; d < decs->size(); d++) {
        const TextDecorationRun *src = decs->Get(d);
        if (src == nullptr || !(src->width() > 0.f) || !(src->thickness() > 0.f)) continue;
        RetainedNode::Paragraph::Decoration dec;
        dec.x = src->x();
        dec.width = src->width();
        dec.y = src->y();
        dec.thickness = src->thickness();
        dec.color = src->color();
        dec.style = static_cast<uint8_t>(src->style());
        node->paragraph.decorations.push_back(dec);
      }
    }
  }
}

void RetainedRenderTree::ApplyCommandBatch(const uint8_t *data, std::size_t size) {
  if (data == nullptr || size == 0) return;
  const CommandBatch *batch = GetCommandBatch(data);
  if (batch == nullptr) return;
  const auto *cmds = batch->commands();
  const auto *types = batch->commands_type();
  if (cmds == nullptr || types == nullptr) return;
  auto count = cmds->size();
  for (::flatbuffers::uoffset_t i = 0; i < count && i < types->size(); i++) {
    Command type = types->GetEnum<Command>(i);
    const void *obj = cmds->Get(i);
    if (obj == nullptr) continue;
    switch (type) {
    case Command_SetPaint: {
      const auto *p = static_cast<const SetPaint *>(obj);
      RetainedNode *node = Find(p->node_id());
      if (node != nullptr) {
        ApplySetPaint(p, node);
        node->paint_version++; // build-cache invalidation (§15)
        // Animated tracks on the fields this command writes are conflicted —
        // cancel them so the command value takes over (ANIMATION_DESIGN.md D2).
        CancelAnimationsFor(node, PaintDirtyToAnimBits(static_cast<uint32_t>(p->fields_dirty())),
                            &animated_ids_);
      }
      break;
    }
    case Command_SetPathData: {
      const auto *pd = static_cast<const SetPathData *>(obj);
      RetainedNode *node = Find(pd->node_id());
      if (node != nullptr) {
        AssignOwnedBytes(pd->data(), &node->path_data);
        node->geom_version++;
      }
      break;
    }
    case Command_SetPathOpData: {
      const auto *po = static_cast<const SetPathOpData *>(obj);
      RetainedNode *node = Find(po->node_id());
      // Empty/absent vector clears the op payload — the node falls back to its
      // plain path_data.
      if (node != nullptr) {
        AssignOwnedBytes(po->data(), &node->path_op_data);
        node->geom_version++;
      }
      break;
    }
    case Command_SetPaintFilter: {
      const auto *pf = static_cast<const SetPaintFilter *>(obj);
      RetainedNode *node = Find(pf->node_id());
      if (node == nullptr) break;
      RetainedPaint &paint = pf->slot() == PaintSlot_STROKE ? node->style.stroke : node->style.fill;
      // Mark the slot authored (or clear the mark when the payload is empty —
      // a removed filter falls back to inheritance again). These bits live
      // above the schema's PaintField range (no fields_dirty rides the
      // SetPaintFilter command).
      const bool stroke = pf->slot() == PaintSlot_STROKE;
      uint32_t bit;
      switch (pf->kind()) {
      case FilterSlot_IMAGE:
        bit = stroke ? RetainedComputedStyle::kBitStrokeImageFilter
                     : RetainedComputedStyle::kBitFillImageFilter;
        paint.image_filter_data = CloneBytes(pf->data());
        break;
      case FilterSlot_MASK:
        bit = stroke ? RetainedComputedStyle::kBitStrokeMaskFilter
                     : RetainedComputedStyle::kBitFillMaskFilter;
        paint.mask_filter_data = CloneBytes(pf->data());
        break;
      default: // COLOR
        bit = stroke ? RetainedComputedStyle::kBitStrokeColorFilter
                     : RetainedComputedStyle::kBitFillColorFilter;
        paint.color_filter_data = CloneBytes(pf->data());
        break;
      }
      if (pf->data() != nullptr && pf->data()->size() > 0) {
        node->style.explicit_paint |= bit;
      } else {
        node->style.explicit_paint &= ~bit;
      }
      node->paint_version++;
      break;
    }
    case Command_SetTransform: {
      const auto *td = static_cast<const SetTransform *>(obj);
      RetainedNode *node = Find(td->node_id());
      if (node != nullptr) {
        node->style.transform_data = CloneBytes(td->data());
        node->paint_version++; // transform bytes feed the cached base matrix
        // The whole op list is replaced — every transform track conflicts.
        CancelAnimationsFor(node, kTransformAnimBits, &animated_ids_);
      }
      break;
    }
    case Command_SetClip: {
      const auto *sc = static_cast<const SetClip *>(obj);
      RetainedNode *node = Find(sc->node_id());
      if (node != nullptr) {
        AssignOwnedBytes(sc->data(), &node->clip_data);
        node->geom_version++;
      }
      break;
    }
    case Command_SetLayerEffect: {
      // Full-state: force + all three slots (absent vector = clear, via
      // CloneBytes returning null). paint_version must bump — the layer bytes
      // feed the render-thread filter interns (§15); the tree stays
      // structurally identical, so geom_version is untouched.
      const auto *le = static_cast<const SetLayerEffect *>(obj);
      RetainedNode *node = Find(le->node_id());
      if (node != nullptr) {
        node->layer_force = le->force();
        node->layer_color_filter_data = CloneBytes(le->color_filter());
        node->layer_image_filter_data = CloneBytes(le->image_filter());
        node->layer_mask_filter_data = CloneBytes(le->mask_filter());
        node->paint_version++;
      }
      break;
    }
    case Command_SetImageSource: {
      const auto *si = static_cast<const SetImageSource *>(obj);
      RetainedNode *node = Find(si->node_id());
      if (node != nullptr) {
        // Empty/absent uri clears the source (node draws nothing).
        const ::flatbuffers::String *uri = si->uri();
        node->image_uri = uri != nullptr ? uri->str() : std::string();
        node->image_fit = static_cast<uint8_t>(si->fit());
        node->image_filter_mode = static_cast<uint8_t>(si->filter_mode());
        node->image_mipmap_mode = static_cast<uint8_t>(si->mipmap_mode());
        node->image_cubic_b = si->cubic_b();
        node->image_cubic_c = si->cubic_c();
        node->paint_version++;
      }
      break;
    }
    case Command_InsertNode: {
      const auto *ins = static_cast<const InsertNode *>(obj);
      RetainedNode *node = CreateNode(ins->node_id());
      const ::flatbuffers::String *tag = ins->tag_name();
      node->tag_name = tag != nullptr ? tag->str() : std::string();
      if (ins->parent_id() < 0) {
        // Root insert (the canvas itself).
        root_ = node;
        node->parent = nullptr;
      } else {
        RetainedNode *parent = Find(ins->parent_id());
        if (parent != nullptr) AttachChild(parent, node, ins->index());
        // Parent not yet present (out-of-order): node created but unattached;
        // a later batch's Insert/Move will place it.
      }
      structure_epoch_++;
      break;
    }
    case Command_RemoveNode: {
      const auto *rm = static_cast<const RemoveNode *>(obj);
      EraseSubtree(rm->node_id());
      structure_epoch_++;
      break;
    }
    case Command_MoveNode: {
      const auto *mv = static_cast<const MoveNode *>(obj);
      RetainedNode *node = Find(mv->node_id());
      if (node == nullptr) break;
      if (mv->new_parent_id() < 0) {
        DetachFromParent(node);
        root_ = node;
        node->parent = nullptr;
      } else {
        RetainedNode *newParent = Find(mv->new_parent_id());
        if (newParent == nullptr) break;
        if (IsAncestor(node, newParent)) break; // reject cycle (move into own subtree)
        DetachFromParent(node);
        AttachChild(newParent, node, mv->index());
      }
      structure_epoch_++;
      break;
    }
    case Command_SetGeometry: {
      const auto *g = static_cast<const SetGeometry *>(obj);
      RetainedNode *node = Find(g->node_id());
      if (node != nullptr) {
        ApplySetGeometry(g, node);
        node->geom_version++;
        CancelAnimationsFor(node, GeometryDirtyToAnimBits(static_cast<uint32_t>(g->fields_dirty())),
                            &animated_ids_);
      }
      break;
    }
    case Command_SetAnimation: {
      const auto *sa = static_cast<const SetAnimation *>(obj);
      RetainedNode *node = Find(sa->node_id());
      if (node != nullptr) ApplySetAnimation(sa, node, &animated_ids_, &anim_handles_);
      break;
    }
    case Command_SetViewport: {
      const auto *v = static_cast<const SetViewport *>(obj);
      ApplySetViewport(v, &viewport_); // canvas-level, not a node field
      break;
    }
    default:
      break;
    }
  }
}

void RetainedRenderTree::set_render_cache(void *cache, void (*deleter)(void *)) const {
  render_cache_ = {cache, deleter != nullptr ? deleter : +[](void *) {}};
}

} // namespace skityrt
