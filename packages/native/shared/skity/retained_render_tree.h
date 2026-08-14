// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Phase 2 retained render tree. The render thread owns a mutable in-memory tree
// driven entirely by the CommandBatch stream (structural Insert/Remove/Move +
// paint/path/transform/geometry/viewport setters). Step 3b retired the snapshot
// channel — the tree is the single source of truth. See RENDER_ARCHITECTURE.md §11.
#ifndef SKITY_RETAINED_RENDER_TREE_H_
#define SKITY_RETAINED_RENDER_TREE_H_

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "render_tree_common_generated.h" // LineCap/LineJoin/FillRule/Display/Visibility
#include "render_tree_generated.h" // AspectRatioAlign/AspectRatioMeetOrSlice (RetainedViewport enums)

namespace skityrt {

// Mutable, owning counterpart of ResolvedPaint. type: 0=NONE, 1=COLOR, 2=GRADIENT.
// color is packed 0xAARRGGBB (valid for COLOR; opacity is applied by the renderer,
// not stored here). gradient_data holds a nested Gradient FlatBuffer (valid for
// GRADIENT; JS-built, memcpy'd verbatim like RetainedNode::path_data).
struct RetainedPaint {
  uint8_t type = 0;
  uint32_t color = 0;
  std::vector<uint8_t> gradient_data;
};

// Mutable, owning counterpart of ComputedStyle. Variable-length fields are owned
// as std::vector copies (the FlatBuffer source is transient).
struct RetainedComputedStyle {
  RetainedPaint fill;
  RetainedPaint stroke;
  float stroke_width = 1.f;
  LineCap stroke_cap = LineCap_BUTT;
  LineJoin stroke_join = LineJoin_MITER;
  float stroke_miter = 4.f;
  FillRule fill_rule = FillRule_NONZERO;
  float opacity = 1.f;
  Display display = Display_INLINE;
  Visibility visibility = Visibility_VISIBLE;
  std::vector<uint8_t> transform_data; // JS-built TransformOpList bytes
};

// Mutable, owning counterpart of RenderNode. Lifetime is owned exclusively by
// RetainedRenderTree's id→node map; `children` holds non-owning pointers into
// that map so reparenting/reorder does not free nodes (stable pointers).
struct RetainedNode {
  int32_t id = -1;
  std::string tag_name;
  RetainedComputedStyle style;

  // Geometry in the canvas logical coordinate space (logical px).
  float x = 0, y = 0, width = 0, height = 0;
  float cx = 0, cy = 0, r = 0, rx = 0, ry = 0;
  float x1 = 0, y1 = 0, x2 = 0, y2 = 0;

  // Path trim window (normalized [0,1] length fraction; applied via skity
  // PathMeasure in DrawShape). Default 0–1 = no trim.
  float path_start = 0, path_end = 1;

  std::vector<uint8_t> path_data; // JS-built PathCommandList bytes (owned)
  std::vector<float> points;      // polyline/polygon [x0,y0,x1,y1,...]

  std::vector<RetainedNode *> children; // non-owning; owned by RetainedRenderTree
  RetainedNode *parent = nullptr;
};

// In-memory viewport state (decoupled from the FlatBuffer ViewBox table).
struct RetainedViewport {
  bool enabled = false;
  float x = 0, y = 0, width = 0, height = 0;
  AspectRatioAlign align = AspectRatioAlign_X_MID;
  AspectRatioMeetOrSlice meet_or_slice = AspectRatioMeetOrSlice_MEET;
};

// The retained tree. Owned by the render thread and touched only there
// (Android AppRenderer / iOS SkityMetalContext per-layer map). Single-threaded.
class RetainedRenderTree {
public:
  RetainedRenderTree() = default;
  ~RetainedRenderTree() = default;

  // O(1) lookup by node id.
  RetainedNode *Find(int32_t id) const;

  // Apply an incremental CommandBatch: Step 1b paint/path/transform + Step 2
  // structural Insert/Remove/Move. Topology commands are authoritative.
  void ApplyCommandBatch(const uint8_t *data, std::size_t size);

  const RetainedNode *root() const { return root_; }
  const RetainedViewport &viewport() const { return viewport_; }

private:
  // Structural helpers (Step 2).
  RetainedNode *CreateNode(int32_t id);
  void AttachChild(RetainedNode *parent, RetainedNode *child, uint32_t index);
  void DetachFromParent(RetainedNode *node);
  void EraseSubtree(int32_t id);
  // True if `maybe_ancestor` is `node` or an ancestor of it (cycle guard).
  bool IsAncestor(RetainedNode *maybe_ancestor, RetainedNode *node) const;

  // id → owning node. Owns every RetainedNode; `children`/`root_` are raw
  // pointers into these.
  std::unordered_map<int32_t, std::unique_ptr<RetainedNode>> node_map_;
  RetainedNode *root_ = nullptr;
  RetainedViewport viewport_;
};

} // namespace skityrt

#endif // SKITY_RETAINED_RENDER_TREE_H_
