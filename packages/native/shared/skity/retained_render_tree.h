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
#include <unordered_set>
#include <vector>

#include "node_animation.h"               // RetainedAnimationState (native animation engine)
#include "render_tree_common_generated.h" // LineCap/LineJoin/FillRule/Display/Visibility
#include "render_tree_generated.h" // AspectRatioAlign/AspectRatioMeetOrSlice (RetainedViewport enums)

namespace skityrt {

// Owning immutable byte/string payloads for style deep fields (§15 P3: COW).
// The renderer's per-node inheritance merge copies the parent's style into a
// scratch every frame — with raw vectors that was ~12 heap allocations per
// styled node per frame; with shared_ptr<const> copies it is a refcount bump.
// null == empty everywhere; writes always allocate a fresh object (writes are
// rare — command-executor time), so no consumer can ever observe mutation.
using BytesPtr = std::shared_ptr<const std::vector<uint8_t>>;
using StringPtr = std::shared_ptr<const std::string>;
using FloatsPtr = std::shared_ptr<const std::vector<float>>;

// Mutable, owning counterpart of ResolvedPaint. type: 0=NONE, 1=COLOR,
// 2=GRADIENT, 3=IMAGE_SHADER. color is packed 0xAARRGGBB (valid for COLOR;
// opacity is applied by the renderer, not stored here). gradient_data holds a
// nested Gradient FlatBuffer (valid for GRADIENT; JS-built, memcpy'd verbatim
// like RetainedNode::path_data). The image_shader fields carry an image-as-
// texture paint (valid for IMAGE_SHADER): uri is the ImageStore key AND the
// platform loader request (fired by the TASM setter); fit/tx/ty are
// command_batch.fbs enum bytes (value order == skity); rect is [x, y, w, h]
// with w/h == 0 meaning identity (1:1 tiling at the bitmap's intrinsic size).
// The three filter slots hold JS-built Filter FlatBuffer bytes; null = no
// filter (the renderer builds skity filter objects from them at paint
// construction).
struct RetainedPaint {
  uint8_t type = 0;
  uint32_t color = 0;
  BytesPtr gradient_data;
  StringPtr image_shader_uri;
  uint8_t image_shader_fit = 1; // BoxFit CONTAIN
  uint8_t image_shader_tx = 0;  // TileMode CLAMP
  uint8_t image_shader_ty = 0;  // TileMode CLAMP
  float image_shader_rect[4] = {0.f, 0.f, 0.f, 0.f};
  BytesPtr color_filter_data;
  BytesPtr image_filter_data;
  BytesPtr mask_filter_data;
};

// Mutable, owning counterpart of ComputedStyle. Deep fields are COW payloads
// (BytesPtr/FloatsPtr — see RetainedPaint) so the per-frame inheritance
// scratch copy stays allocation-free.
struct RetainedComputedStyle {
  RetainedPaint fill;
  RetainedPaint stroke;
  float stroke_width = 1.f;
  LineCap stroke_cap = LineCap_BUTT;
  LineJoin stroke_join = LineJoin_MITER;
  float stroke_miter = 4.f;
  // Stroke dash pattern: [on, off, ...] intervals in px + phase offset into the
  // pattern. Null = solid stroke. Valid patterns have an even count ≥ 2 and a
  // positive sum (validated by the producer; MakeStrokePaint re-checks).
  FloatsPtr stroke_dash;
  float stroke_dashoffset = 0.f;
  FillRule fill_rule = FillRule_NONZERO;
  // Blend mode applied to both the fill and stroke paints (inheritable).
  BlendMode blend_mode = BlendMode_SRC_OVER;
  float opacity = 1.f;
  Display display = Display_INLINE;
  Visibility visibility = Visibility_VISIBLE;
  BytesPtr transform_data; // JS-built TransformOpList bytes

  // Which PaintField bits were ever set by a SetPaint command — the
  // "explicitly authored" markers driving group→child paint inheritance.
  // Fields whose bit is 0 fall back to the nearest ancestor's explicit value
  // (resolved at render time in DrawNode; nothing is stored per child).
  //
  // The filter slots (below) ride the SEPARATE SetPaintFilter command, whose
  // schema has no fields_dirty bits — so these retained-local bits (above the
  // schema's PaintField range) record that the node authored a filter. The
  // resolver then merges just the filter bytes into the inherited paint slot
  // (field-level, NOT the whole-slot takeover of the fill/stroke bits — a
  // filter-only node keeps inheriting the ancestor's fill color/gradient).
  uint32_t explicit_paint = 0;

  static constexpr uint32_t kBitFillColorFilter = 1u << 14;
  static constexpr uint32_t kBitFillImageFilter = 1u << 15;
  static constexpr uint32_t kBitFillMaskFilter = 1u << 16;
  static constexpr uint32_t kBitStrokeColorFilter = 1u << 17;
  static constexpr uint32_t kBitStrokeImageFilter = 1u << 18;
  static constexpr uint32_t kBitStrokeMaskFilter = 1u << 19;
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

  // Native animation state (SetAnimation command; ANIMATION_DESIGN.md).
  // Tracks are parsed once at apply time; the overlay is rewritten per tick.
  // Base fields above are NEVER touched by the engine.
  RetainedAnimationState anim;

  // ---- Render build-cache invalidation counters (RENDER_ARCHITECTURE §15).
  // Bumped by the command executor whenever a write touches the corresponding
  // field family; the render-side cache stamps entries with the values it was
  // built against (CacheStamp). Animation ticks never bump these — animated
  // nodes keep hitting the cache while their per-frame scalars compose fresh.
  uint32_t geom_version = 0;  // path/path_op/points/geometry/clip writes
  uint32_t paint_version = 0; // paint/filter/transform/image/paragraph writes

  std::vector<RetainedNode *> children; // non-owning; owned by RetainedRenderTree
  RetainedNode *parent = nullptr;
};

// ---- Animation overlay read accessors (renderer side) ----
// Overlay value when the slot is set, else the base field. Inline + branch:
// called once per field per frame on the render thread.

inline float AnimOpacity(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitOpacity) ? n->anim.overlay.opacity
                                                                : n->style.opacity;
}
inline float AnimX(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitX) ? n->anim.overlay.x : n->x;
}
inline float AnimY(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitY) ? n->anim.overlay.y : n->y;
}
inline float AnimWidth(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitWidth) ? n->anim.overlay.w : n->width;
}
inline float AnimHeight(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitHeight) ? n->anim.overlay.h : n->height;
}
inline float AnimCX(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitCX) ? n->anim.overlay.cx : n->cx;
}
inline float AnimCY(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitCY) ? n->anim.overlay.cy : n->cy;
}
inline float AnimR(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitR) ? n->anim.overlay.r : n->r;
}
inline float AnimPathStart(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitPathStart) ? n->anim.overlay.path_start
                                                                  : n->path_start;
}
inline float AnimPathEnd(const RetainedNode *n) {
  return (n->anim.overlay.mask & AnimationOverlay::kBitPathEnd) ? n->anim.overlay.path_end
                                                                : n->path_end;
}

// ---- Animation application entry points (animation.cc; called from
// ApplyCommandBatch's SetAnimation case and the conflict-cancellation hooks) ----

struct SetAnimation; // generated (command_batch_generated.h)

// Install/replace/clear a node's animation tracks (empty data = clear all).
// Registers the node id in `animated_ids` while any track is live, and the
// command's playback handle (if any) in `anim_handles` (invoke lane).
void ApplySetAnimation(const SetAnimation *cmd, RetainedNode *node,
                       std::unordered_set<int32_t> *animated_ids,
                       std::unordered_map<std::string, int32_t> *anim_handles);

// Cancel tracks whose property bits intersect `property_bits` (built via
// PaintDirtyToAnimBits / GeometryDirtyToAnimBits / kTransformAnimBits) and
// clear their overlay slots — a conflicting command takes over the value.
void CancelAnimationsFor(RetainedNode *node, uint32_t property_bits,
                         std::unordered_set<int32_t> *animated_ids);

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

  // Interpolate every live animation track to `now_ns` (a vsync frame
  // timestamp; the driver owns the clock). Returns true when anything is
  // still live OR finished on this very frame — i.e. "draw this frame". A
  // false return means the tree is fully idle (the driver stops). Render
  // thread only. Implemented in animation.cc.
  bool TickAnimations(uint64_t now_ns);

  // ---- Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md) ----
  // Called by the platform UI-method forward (render thread). `time_ms` is
  // only read by kSeek (the animation-timeline position to jump to, ms,
  // clamped ≥ 0 — the delay counts, WAAPI currentTime semantics). Returns
  // false when the handle is unknown/stale (the caller reports an error to
  // JS; never a crash). Implemented in animation.cc.
  bool ControlAnimation(const std::string &handle, AnimControlAction action, double time_ms);

  // Latest frame timestamp TickAnimations saw (frame-callback domain; 0
  // before the first tick). seek() anchors against it — the only frame-domain
  // "now" available off-vsync.
  uint64_t last_frame_ns() const { return last_frame_ns_; }

  // Drain the handles whose animations completed since the last call (D5):
  // the platform layer turns each into a `skityAnimationFinish` event. One
  // entry per natural completion (replace/cancel fire nothing; seek/play
  // re-arm). Render thread only — call right after TickAnimations (or a
  // seeking ControlAnimation) on the same thread.
  std::vector<std::string> TakeFinishedHandles();

  const RetainedNode *root() const { return root_; }
  const RetainedViewport &viewport() const { return viewport_; }

  // Bumped by every structural command (Insert/Remove/Move). Cache entries
  // carry the epoch they were built under so a Remove→Insert reusing the same
  // node id can never validate a stale entry.
  uint64_t structure_epoch() const { return structure_epoch_; }

  // ---- Render build-cache blob (type-erased so this header stays skity-free;
  // the typed owner is render_cache.h's RenderCache). Render-thread only;
  // lifetime = tree lifetime (freed by the custom deleter on destruction).
  // const: the cache attaches lazily from Draw, which sees the tree as const.
  void *render_cache() const { return render_cache_.get(); }
  void set_render_cache(void *cache, void (*deleter)(void *)) const;

private:
  // Structural helpers (Step 2).
  RetainedNode *CreateNode(int32_t id);
  void AttachChild(RetainedNode *parent, RetainedNode *child, uint32_t index);
  void DetachFromParent(RetainedNode *node);
  void EraseSubtree(int32_t id);
  // True if `maybe_ancestor` is `node` or an ancestor of it (cycle guard).
  bool IsAncestor(RetainedNode *maybe_ancestor, RetainedNode *node) const;
  // Finish-event collector (D5): fires when a node goes idle with tracks.
  void MaybeReportFinish(RetainedNode *node);

  // id → owning node. Owns every RetainedNode; `children`/`root_` are raw
  // pointers into these.
  std::unordered_map<int32_t, std::unique_ptr<RetainedNode>> node_map_;
  // Nodes carrying live animation tracks (ids, never pointers — EraseSubtree
  // removes them in the same walk that frees the nodes). Render thread only.
  std::unordered_set<int32_t> animated_ids_;
  // Playback-control addresses: JS-minted handle → node id (invoke lane,
  // ANIMATION_CONTROL_DESIGN.md D1). Survives animation clears (a re-set
  // re-registers), dropped with the node in EraseSubtree's walk.
  std::unordered_map<std::string, int32_t> anim_handles_;
  // Completed-animation handles awaiting TakeFinishedHandles (render thread).
  std::vector<std::string> finished_handles_;
  uint64_t last_frame_ns_ = 0;
  uint64_t structure_epoch_ = 0;
  // Type-erased RenderCache (render_cache.cc owns the deleter). mutable: the
  // cache attaches lazily from Draw, which sees the tree as const.
  mutable std::unique_ptr<void, void (*)(void *)> render_cache_{nullptr, nullptr};
  RetainedNode *root_ = nullptr;
  RetainedViewport viewport_;
};

} // namespace skityrt

#endif // SKITY_RETAINED_RENDER_TREE_H_
