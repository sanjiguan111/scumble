// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "retained_render_tree.h"

#include <algorithm>

#include "command_batch_generated.h"
#include "render_tree_common_generated.h"
#include "render_tree_generated.h"
#include "render_tree_style_generated.h"

namespace skityrt {
namespace {

// ResolvedPaint (FlatBuffer) → RetainedPaint. color packed to 0xAARRGGBB.
void CopyPaint(const ResolvedPaint* src, RetainedPaint* dst) {
  if (src == nullptr || src->type() == 0 /*NONE*/) {
    dst->type = 0;
    return;
  }
  dst->type = src->type();
  if (src->type() == 1 /*COLOR*/) {
    const RGBAColor* c = src->color();
    if (c != nullptr) {
      uint32_t a = c->a() & 0xffu;
      uint32_t r = c->r() & 0xffu;
      uint32_t g = c->g() & 0xffu;
      uint32_t b = c->b() & 0xffu;
      dst->color = (a << 24) | (r << 16) | (g << 8) | b;
    } else {
      dst->color = 0;
    }
  }
  // GRADIENT (type==2) is carried over as type only for now; shader wiring is a
  // later step.
}

void CopyBytes(const ::flatbuffers::Vector<uint8_t>* src, std::vector<uint8_t>* dst) {
  if (src != nullptr && src->size() > 0) {
    dst->assign(src->Data(), src->Data() + src->size());
  } else {
    dst->clear();
  }
}

// RenderNode (FlatBuffer) → existing RetainedNode (in-place FIELD update only;
// topology is owned by commands, never touched here).
void UpdateNodeFromFB(RetainedNode* node, const RenderNode* fb) {
  const ::flatbuffers::String* tag = fb->tag_name();
  node->tag_name = tag != nullptr ? tag->str() : std::string();

  const ComputedStyle* s = fb->style();
  if (s != nullptr) {
    CopyPaint(s->fill(), &node->style.fill);
    CopyPaint(s->stroke(), &node->style.stroke);
    node->style.stroke_width = s->stroke_width();
    node->style.stroke_cap = s->stroke_linecap();
    node->style.stroke_join = s->stroke_linejoin();
    node->style.stroke_miter = s->stroke_miterlimit();
    node->style.fill_rule = s->fill_rule();
    node->style.opacity = s->opacity();
    node->style.display = s->display();
    node->style.visibility = s->visibility();
    CopyBytes(s->transform_data(), &node->style.transform_data);
  } else {
    node->style = RetainedComputedStyle{};
  }

  node->x = fb->x();
  node->y = fb->y();
  node->width = fb->width();
  node->height = fb->height();
  node->cx = fb->cx();
  node->cy = fb->cy();
  node->r = fb->r();
  node->rx = fb->rx();
  node->ry = fb->ry();
  node->x1 = fb->x1();
  node->y1 = fb->y1();
  node->x2 = fb->x2();
  node->y2 = fb->y2();

  CopyBytes(fb->path_data(), &node->path_data);
  const ::flatbuffers::Vector<float>* pts = fb->points();
  if (pts != nullptr) {
    node->points.assign(pts->begin(), pts->end());
  } else {
    node->points.clear();
  }
}

void UpdateViewportFromFB(const RenderTree* fb, RetainedViewport* out) {
  const ViewBox* vp = fb->viewport();
  if (vp != nullptr && vp->width() > 0.f && vp->height() > 0.f) {
    out->enabled = true;
    out->x = vp->x();
    out->y = vp->y();
    out->width = vp->width();
    out->height = vp->height();
    const PreserveAspectRatio* pa = fb->preserve_aspect();
    out->align = pa != nullptr ? pa->align() : AspectRatioAlign_X_MID;
    out->meet_or_slice = pa != nullptr ? pa->meet_or_slice() : AspectRatioMeetOrSlice_MEET;
  } else {
    out->enabled = false;
  }
}

// Apply a SetPaint command to a retained node. Only fields whose PaintField bit
// is set in fields_dirty are written; the rest are left untouched (FlatBuffer
// defaults make "field == 0" a valid value, so the bitmask is authoritative).
void ApplySetPaint(const SetPaint* p, RetainedNode* node) {
  uint32_t dirty = static_cast<uint32_t>(p->fields_dirty());
  if (dirty & PaintField_FILL) {
    node->style.fill.type = 1; // COLOR
    node->style.fill.color = p->fill_color();
  }
  if (dirty & PaintField_STROKE) {
    node->style.stroke.type = 1; // COLOR
    node->style.stroke.color = p->stroke_color();
  }
  if (dirty & PaintField_STROKE_WIDTH) node->style.stroke_width = p->stroke_width();
  if (dirty & PaintField_STROKE_CAP) node->style.stroke_cap = p->stroke_cap();
  if (dirty & PaintField_STROKE_JOIN) node->style.stroke_join = p->stroke_join();
  if (dirty & PaintField_STROKE_MITER) node->style.stroke_miter = p->stroke_miter();
  if (dirty & PaintField_FILL_RULE) node->style.fill_rule = p->fill_rule();
  if (dirty & PaintField_OPACITY) node->style.opacity = p->opacity();
}

// memcpy a nested-flatbuffer byte vector ([ubyte]) into an owning std::vector.
void AssignOwnedBytes(const ::flatbuffers::Vector<uint8_t>* src, std::vector<uint8_t>* dst) {
  if (src != nullptr && src->size() > 0) {
    dst->assign(src->Data(), src->Data() + src->size());
  } else {
    dst->clear();
  }
}

}  // namespace

RetainedNode* RetainedRenderTree::Find(int32_t id) const {
  auto it = node_map_.find(id);
  return it != node_map_.end() ? it->second.get() : nullptr;
}

// ---- Structural helpers (Step 2) ----

RetainedNode* RetainedRenderTree::CreateNode(int32_t id) {
  auto it = node_map_.find(id);
  if (it != node_map_.end()) return it->second.get(); // idempotent
  auto owned = std::make_unique<RetainedNode>();
  owned->id = id;
  RetainedNode* raw = owned.get();
  node_map_.emplace(id, std::move(owned));
  return raw;
}

void RetainedRenderTree::AttachChild(RetainedNode* parent, RetainedNode* child, uint32_t index) {
  if (parent == nullptr || child == nullptr) return;
  uint32_t clamped = std::min<uint32_t>(index, static_cast<uint32_t>(parent->children.size()));
  parent->children.insert(parent->children.begin() + clamped, child);
  child->parent = parent;
}

void RetainedRenderTree::DetachFromParent(RetainedNode* node) {
  if (node == nullptr) return;
  RetainedNode* p = node->parent;
  if (p == nullptr) return;
  auto& v = p->children;
  v.erase(std::remove(v.begin(), v.end(), node), v.end());
  node->parent = nullptr;
}

bool RetainedRenderTree::IsAncestor(RetainedNode* maybe_ancestor, RetainedNode* node) const {
  for (RetainedNode* p = node; p != nullptr; p = p->parent) {
    if (p == maybe_ancestor) return true;
  }
  return false;
}

void RetainedRenderTree::EraseSubtree(int32_t id) {
  auto it = node_map_.find(id);
  if (it == node_map_.end()) return;
  RetainedNode* node = it->second.get();
  DetachFromParent(node);
  if (node == root_) root_ = nullptr;
  // Collect the whole subtree's ids, then erase from node_map_ (unique_ptr frees).
  std::vector<int32_t> ids;
  std::vector<RetainedNode*> stack{node};
  while (!stack.empty()) {
    RetainedNode* n = stack.back();
    stack.pop_back();
    ids.push_back(n->id);
    for (RetainedNode* c : n->children) stack.push_back(c);
  }
  for (int32_t i : ids) node_map_.erase(i);
}

// ---- ApplyCommandBatch (Step 1b + Step 2) ----

void RetainedRenderTree::ApplyCommandBatch(const uint8_t* data, std::size_t size) {
  if (data == nullptr || size == 0) return;
  const CommandBatch* batch = GetCommandBatch(data);
  if (batch == nullptr) return;
  const auto* cmds = batch->commands();
  const auto* types = batch->commands_type();
  if (cmds == nullptr || types == nullptr) return;
  auto count = cmds->size();
  for (::flatbuffers::uoffset_t i = 0; i < count && i < types->size(); i++) {
    Command type = types->GetEnum<Command>(i);
    const void* obj = cmds->Get(i);
    if (obj == nullptr) continue;
    switch (type) {
    case Command_SetPaint: {
      const auto* p = static_cast<const SetPaint*>(obj);
      RetainedNode* node = Find(p->node_id());
      if (node != nullptr) ApplySetPaint(p, node);
      break;
    }
    case Command_SetPathData: {
      const auto* pd = static_cast<const SetPathData*>(obj);
      RetainedNode* node = Find(pd->node_id());
      if (node != nullptr) AssignOwnedBytes(pd->data(), &node->path_data);
      break;
    }
    case Command_SetTransform: {
      const auto* td = static_cast<const SetTransform*>(obj);
      RetainedNode* node = Find(td->node_id());
      if (node != nullptr) AssignOwnedBytes(td->data(), &node->style.transform_data);
      break;
    }
    case Command_InsertNode: {
      const auto* ins = static_cast<const InsertNode*>(obj);
      RetainedNode* node = CreateNode(ins->node_id());
      const ::flatbuffers::String* tag = ins->tag_name();
      node->tag_name = tag != nullptr ? tag->str() : std::string();
      if (ins->parent_id() < 0) {
        // Root insert (the canvas itself).
        root_ = node;
        node->parent = nullptr;
      } else {
        RetainedNode* parent = Find(ins->parent_id());
        if (parent != nullptr) AttachChild(parent, node, ins->index());
        // Parent not yet present (out-of-order): node created but unattached;
        // a later batch or the snapshot root fallback will place it.
      }
      break;
    }
    case Command_RemoveNode: {
      const auto* rm = static_cast<const RemoveNode*>(obj);
      EraseSubtree(rm->node_id());
      break;
    }
    case Command_MoveNode: {
      const auto* mv = static_cast<const MoveNode*>(obj);
      RetainedNode* node = Find(mv->node_id());
      if (node == nullptr) break;
      if (mv->new_parent_id() < 0) {
        DetachFromParent(node);
        root_ = node;
        node->parent = nullptr;
      } else {
        RetainedNode* newParent = Find(mv->new_parent_id());
        if (newParent == nullptr) break;
        if (IsAncestor(node, newParent)) break; // reject cycle (move into own subtree)
        DetachFromParent(node);
        AttachChild(newParent, node, mv->index());
      }
      break;
    }
    default:
      break;
    }
  }
}

// ---- Snapshot field sync (no topology) ----

void RetainedRenderTree::SyncNodeFields(const RenderNode* fb, RetainedNode* parent) {
  if (fb == nullptr) return;
  int32_t id = fb->id();
  if (id < 0) return;

  RetainedNode* node = Find(id);
  if (node == nullptr) {
    // Only the snapshot root is created here (canvas has no InsertNode of its
    // own; measure synthesizes one, but this is the safety net). Non-root
    // unknown ids are skipped — topology is owned by commands.
    if (parent == nullptr) {
      node = CreateNode(id);
      root_ = node;
      node->parent = nullptr;
    } else {
      return;
    }
  }
  UpdateNodeFromFB(node, fb); // field-only
  // Do NOT touch node->children / node->parent — commands own topology.

  const ::flatbuffers::Vector<::flatbuffers::Offset<RenderNode>>* kids = fb->children();
  auto n = kids != nullptr ? kids->size() : 0u;
  for (size_t i = 0; i < n; i++) {
    SyncNodeFields(kids->Get(i), node);
  }
}

void RetainedRenderTree::SyncFromSnapshot(const RenderTree* fb) {
  if (fb == nullptr) {
    viewport_ = RetainedViewport{};
    return; // topology persists; explicit Remove clears nodes
  }
  UpdateViewportFromFB(fb, &viewport_);
  const RenderNode* fb_root = fb->root();
  if (fb_root != nullptr) {
    SyncNodeFields(fb_root, nullptr);
  }
}

}  // namespace skityrt
