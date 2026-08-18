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

// Mutable, owning counterpart of ResolvedPaint. type: 0=NONE, 1=COLOR,
// 2=GRADIENT, 3=IMAGE_SHADER. color is packed 0xAARRGGBB (valid for COLOR;
// opacity is applied by the renderer, not stored here). gradient_data holds a
// nested Gradient FlatBuffer (valid for GRADIENT; JS-built, memcpy'd verbatim
// like RetainedNode::path_data). The image_shader fields carry an image-as-
// texture paint (valid for IMAGE_SHADER): uri is the ImageStore key AND the
// platform loader request (fired by the TASM setter); fit/tx/ty are
// command_batch.fbs enum bytes (value order == skity); rect is [x, y, w, h]
// with w/h == 0 meaning identity (1:1 tiling at the bitmap's intrinsic size).
// The three filter slots hold JS-built Filter FlatBuffer bytes; empty = no
// filter (the renderer builds skity filter objects from them at paint
// construction).
struct RetainedPaint {
  uint8_t type = 0;
  uint32_t color = 0;
  std::vector<uint8_t> gradient_data;
  std::string image_shader_uri;
  uint8_t image_shader_fit = 1; // BoxFit CONTAIN
  uint8_t image_shader_tx = 0;  // TileMode CLAMP
  uint8_t image_shader_ty = 0;  // TileMode CLAMP
  float image_shader_rect[4] = {0.f, 0.f, 0.f, 0.f};
  std::vector<uint8_t> color_filter_data;
  std::vector<uint8_t> image_filter_data;
  std::vector<uint8_t> mask_filter_data;
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
  // Stroke dash pattern: [on, off, ...] intervals in px + phase offset into the
  // pattern. Empty = solid stroke. Valid patterns have an even count ≥ 2 and a
  // positive sum (validated by the producer; MakeStrokePaint re-checks).
  std::vector<float> stroke_dash;
  float stroke_dashoffset = 0.f;
  FillRule fill_rule = FillRule_NONZERO;
  // Blend mode applied to both the fill and stroke paints (inheritable).
  BlendMode blend_mode = BlendMode_SRC_OVER;
  float opacity = 1.f;
  Display display = Display_INLINE;
  Visibility visibility = Visibility_VISIBLE;
  std::vector<uint8_t> transform_data; // JS-built TransformOpList bytes

  // Which PaintField bits were ever set by a SetPaint command — the
  // "explicitly authored" markers driving group→child paint inheritance.
  // Fields whose bit is 0 fall back to the nearest ancestor's explicit value
  // (resolved at render time in DrawNode; nothing is stored per child).
  uint32_t explicit_paint = 0;
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
  // JS-built PathOpList bytes (owned) — a boolean composition evaluated at
  // render time by BuildOpPath. Mutually exclusive with path_data in practice
  // (the component layer sends one or the other); non-empty path_op_data wins.
  std::vector<uint8_t> path_op_data;
  std::vector<float> points; // polyline/polygon [x0,y0,x1,y1,...]
  // JS-built ClipList bytes (owned). Group nodes only: the clip sequence
  // applied after the node's transform, before its subtree.
  std::vector<uint8_t> clip_data;

  // Image node source. image_uri doubles as the ImageStore key and the
  // platform loader request (http(s) URL / data URI); the TASM setter fires
  // the load on first sight. Empty = no source (node draws nothing). The
  // destination rect rides the regular x/y/width/height fields; fit is
  // resolved at render time against the bitmap's intrinsic size.
  std::string image_uri;
  uint8_t image_fit = 1; // BoxFit::CONTAIN (command_batch.fbs value order)
  // Sampling (command_batch.fbs value order == skity::FilterMode/MipmapMode);
  // defaults reproduce the pre-sampling hardcoded behavior. cubic B/C both
  // zero = cubic resampling off.
  uint8_t image_filter_mode = 1; // ImageFilterMode::LINEAR
  uint8_t image_mipmap_mode = 0; // ImageMipmapMode::NONE
  float image_cubic_b = 0.f;
  float image_cubic_c = 0.f;

  // Paragraph layout product (paragraph_runs.fbs side channel; laid out on
  // the TASM thread, stored here for drawing). Positions are relative to the
  // paragraph box origin — the node's x/y translate at draw time. Fonts are
  // referenced through the shared FontRegistry (post-fallback typefaces).
  struct GlyphRun {
    std::vector<uint16_t> glyphs;
    std::vector<float> pos_x;
    std::vector<float> pos_y;
    uint32_t font_id = 0;
    uint32_t color = 0xFF000000u; // 0xAARRGGBB (span color)
  };
  struct Paragraph {
    float height = 0.f;
    int line_count = 0;
    std::vector<GlyphRun> runs;
  };
  bool has_paragraph = false;
  Paragraph paragraph;

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

  // Apply a ParagraphRunList (paragraph_runs.fbs side channel, delivered in
  // the same extra-bundle flush as the command batch): stores each entry's
  // glyph runs on the retained node by id. Nodes without an entry keep their
  // previous layout (a missing entry is not a clear).
  void ApplyParagraphRuns(const uint8_t *data, std::size_t size);

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
