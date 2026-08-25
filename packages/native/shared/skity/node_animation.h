// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Native animation engine core (ANIMATION_DESIGN.md §4 D1–D3). Everything
// here lives on the render thread next to the retained tree it animates —
// single-threaded by contract, no locks.
//
// Model: a SetAnimation command installs parsed C++ tracks (one property per
// track) on a node. Every tick interpolates the tracks and writes the sampled
// values into the node's AnimationOverlay — the BASE fields are never
// touched, so CSS-like semantics fall out naturally: fill=none ends by
// clearing the slot (value returns to base), a conflicting command cancels
// the track, fill=forwards pins the final value in the overlay. The renderer
// reads through the overlay accessors (retained_render_tree.h) with base
// fallback. This header deliberately does not depend on the tree types —
// retained_render_tree.h includes it.
#ifndef SKITY_ANIMATION_H_
#define SKITY_ANIMATION_H_

#include <cstddef>
#include <cstdint>
#include <vector>

#include "render_tree_style_generated.h" // AnimatedProperty / EasingKind / FillMode

namespace skityrt {

// ---- Overlay: the per-node animated-value layer (fixed size, no allocs) ----
// Slot bits are 1:1 with the AnimatedProperty enum value (SCALE_XY is one
// slot carrying two scalars). Unset bits mean "use the base field".
struct AnimationOverlay {
  static constexpr uint32_t kBitOpacity = 1u << 0;
  static constexpr uint32_t kBitTranslateX = 1u << 1;
  static constexpr uint32_t kBitTranslateY = 1u << 2;
  static constexpr uint32_t kBitRotate = 1u << 3;
  static constexpr uint32_t kBitScaleXY = 1u << 4;
  static constexpr uint32_t kBitPathStart = 1u << 5;
  static constexpr uint32_t kBitPathEnd = 1u << 6;
  static constexpr uint32_t kBitFillColor = 1u << 7;
  static constexpr uint32_t kBitStrokeColor = 1u << 8;
  static constexpr uint32_t kBitX = 1u << 9;
  static constexpr uint32_t kBitY = 1u << 10;
  static constexpr uint32_t kBitWidth = 1u << 11;
  static constexpr uint32_t kBitHeight = 1u << 12;
  static constexpr uint32_t kBitCX = 1u << 13;
  static constexpr uint32_t kBitCY = 1u << 14;
  static constexpr uint32_t kBitR = 1u << 15;

  uint32_t mask = 0;
  float opacity = 1.f;
  float tx = 0.f, ty = 0.f;
  float rotate = 0.f; // degrees
  float sx = 1.f, sy = 1.f;
  float pivot_x = 0.f, pivot_y = 0.f; // ROTATE / SCALE_XY center
  float path_start = 0.f, path_end = 1.f;
  float x = 0.f, y = 0.f, w = 0.f, h = 0.f;
  float cx = 0.f, cy = 0.f, r = 0.f;
  uint32_t fill = 0u, stroke = 0u; // 0xAARRGGBB
};

// One parsed keyframe (values are the FLAT template of the schema table —
// no bytes retained, no FlatBuffer access during ticks).
struct AnimKeyframe {
  float offset = 0.f; // within ONE pass, [0,1]; producer normalizes 0..1
  float value = 0.f;
  float value2 = 0.f; // SCALE_XY's sy
  uint32_t color = 0u;
  EasingKind easing = EasingKind_LINEAR; // segment STARTING here
  float p1x = 0.42f, p1y = 0.f, p2x = 0.58f, p2y = 1.f;
};

// One track = one animated property (runtime fields included; owned by the
// node, lives and dies with it).
struct RetainedAnimation {
  AnimatedProperty property = AnimatedProperty_OPACITY;
  uint32_t duration_ms = 300; // per iteration
  uint32_t delay_ms = 0;
  int32_t iterations = 1;    // -1 = infinite
  bool auto_reverse = false; // even passes forward, odd reversed (CSS alternate)
  bool fill_forwards = false;
  float pivot_x = 0.f, pivot_y = 0.f; // ROTATE / SCALE_XY
  std::vector<AnimKeyframe> keys;     // >= 2, offsets ascending; per-keyframe
                                      // easing is final (the JS builder resolves
                                      // the track-default fallback — FlatBuffer
                                      // defaults cannot express "inherit")

  // ---- Runtime (render-thread private) ----
  bool started = false;  // first tick stamps start_ns
  uint64_t start_ns = 0; // frame timestamp of the first tick
  bool finished = false; // played out (this frame or earlier)
  bool holding = false;  // fill=forwards: final value pinned in overlay
};

// Per-node animation state.
struct RetainedAnimationState {
  std::vector<RetainedAnimation> tracks;
  AnimationOverlay overlay;
};

// ---- Slot helpers ----

// 1:1 with the AnimatedProperty enum value (0..15).
uint32_t AnimationPropertyBit(AnimatedProperty p);

// PaintField dirty bits → cancellable overlay bits (SetPaint conflict map:
// gradient / image-shader writes change the paint TYPE, so they cancel the
// color tracks too).
uint32_t PaintDirtyToAnimBits(uint32_t paint_dirty);
// GeometryField dirty bits → cancellable overlay bits (SetGeometry conflict).
uint32_t GeometryDirtyToAnimBits(uint32_t geom_dirty);
// SetTransform replaces the whole op list → every transform track conflicts.
constexpr uint32_t kTransformAnimBits =
    AnimationOverlay::kBitTranslateX | AnimationOverlay::kBitTranslateY |
    AnimationOverlay::kBitRotate | AnimationOverlay::kBitScaleXY;

// ---- Track evaluation (pure; host-testable) ----

enum class AnimPhase { BeforeDelay, Active, FinishedThisFrame };

// Evaluate a track at `now_ns` (same clock domain as track.start_ns, i.e.
// the frame callback's timestamp). Writes the sampled scalars into out[2]
// (value, value2) and, for color properties, the packed color. The final
// frame evaluates to the exact terminal keyframe.
AnimPhase EvaluateTrack(const RetainedAnimation &track, uint64_t now_ns, float out[2],
                        uint32_t *out_color);

// ---- Overlay mutation (tick + conflict paths) ----

void WriteOverlaySlot(AnimationOverlay &o, AnimatedProperty p, const float v[2], uint32_t color);
void ClearOverlaySlot(AnimationOverlay &o, AnimatedProperty p);

} // namespace skityrt

#endif // SKITY_ANIMATION_H_
