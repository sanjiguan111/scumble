// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "retained_render_tree.h"

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

// RenderNode (FlatBuffer) → existing RetainedNode (in-place field update).
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

}  // namespace

RetainedNode* RetainedRenderTree::Find(int32_t id) const {
  auto it = node_map_.find(id);
  return it != node_map_.end() ? it->second.get() : nullptr;
}

RetainedNode* RetainedRenderTree::SyncNode(const RenderNode* fb, RetainedNode* parent,
                                           std::unordered_set<int32_t>* visited) {
  if (fb == nullptr) return nullptr;
  int32_t id = fb->id();
  // Step 1 contract: the snapshot carries a native-assigned id (>= 1) on every
  // node (assigned in measure() before serialization). A negative id here means
  // the contract was violated; drop the subtree rather than corrupt the map.
  if (id < 0) return nullptr;
  visited->insert(id);

  RetainedNode* node = nullptr;
  auto it = node_map_.find(id);
  if (it != node_map_.end()) {
    node = it->second.get();  // reuse: in-place update, stable pointer
  } else {
    auto owned = std::make_unique<RetainedNode>();
    node = owned.get();
    node->id = id;
    node_map_.emplace(id, std::move(owned));
  }

  UpdateNodeFromFB(node, fb);
  node->parent = parent;
  node->children.clear();  // rebuilt below from the snapshot's child order

  const ::flatbuffers::Vector<::flatbuffers::Offset<RenderNode>>* kids = fb->children();
  auto n = kids != nullptr ? kids->size() : 0u;
  for (size_t i = 0; i < n; i++) {
    RetainedNode* child = SyncNode(kids->Get(i), node, visited);
    if (child != nullptr) node->children.push_back(child);
  }
  return node;
}

void RetainedRenderTree::PruneUnvisited(const std::unordered_set<int32_t>& visited) {
  for (auto it = node_map_.begin(); it != node_map_.end();) {
    if (visited.find(it->first) == visited.end()) {
      it = node_map_.erase(it);
    } else {
      ++it;
    }
  }
}

void RetainedRenderTree::SyncFromSnapshot(const RenderTree* fb) {
  root_ = nullptr;
  if (fb == nullptr) {
    node_map_.clear();
    viewport_ = RetainedViewport{};
    return;
  }
  UpdateViewportFromFB(fb, &viewport_);
  std::unordered_set<int32_t> visited;
  const RenderNode* fb_root = fb->root();
  if (fb_root != nullptr) {
    root_ = SyncNode(fb_root, nullptr, &visited);
  }
  PruneUnvisited(visited);
}

}  // namespace skityrt
