// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "node_animation.h"

#include <algorithm>

#include "command_batch_generated.h" // SetAnimation
#include "easing.h"
#include "retained_render_tree.h"

namespace skityrt {
namespace {

constexpr uint64_t kMsToNs = 1000000ull;

// Per-channel ARGB lerp (both endpoints packed 0xAARRGGBB).
uint32_t LerpColor(uint32_t a, uint32_t b, float t) {
  auto ch = [&](uint32_t ca, uint32_t cb, int shift) -> uint32_t {
    float va = static_cast<float>((ca >> shift) & 0xFFu);
    float vb = static_cast<float>((cb >> shift) & 0xFFu);
    return static_cast<uint32_t>(va + (vb - va) * t) & 0xFFu;
  };
  return (ch(a, b, 24) << 24) | (ch(a, b, 16) << 16) | (ch(a, b, 8) << 8) | ch(a, b, 0);
}

} // namespace

// ---- Slot helpers ----

uint32_t AnimationPropertyBit(AnimatedProperty p) {
  auto v = static_cast<uint32_t>(p);
  return v < 16 ? (1u << v) : 0u;
}

uint32_t PaintDirtyToAnimBits(uint32_t paint_dirty) {
  uint32_t bits = 0;
  // A gradient / image-shader write changes the paint TYPE — the color track
  // is as conflicted as by an explicit color write (D2).
  if (paint_dirty & (PaintField_FILL | PaintField_FILL_GRADIENT | PaintField_FILL_IMAGE_SHADER))
    bits |= AnimationOverlay::kBitFillColor;
  if (paint_dirty &
      (PaintField_STROKE | PaintField_STROKE_GRADIENT | PaintField_STROKE_IMAGE_SHADER))
    bits |= AnimationOverlay::kBitStrokeColor;
  if (paint_dirty & PaintField_OPACITY) bits |= AnimationOverlay::kBitOpacity;
  return bits;
}

uint32_t GeometryDirtyToAnimBits(uint32_t geom_dirty) {
  uint32_t bits = 0;
  if (geom_dirty & GeometryField_X) bits |= AnimationOverlay::kBitX;
  if (geom_dirty & GeometryField_Y) bits |= AnimationOverlay::kBitY;
  if (geom_dirty & GeometryField_WIDTH) bits |= AnimationOverlay::kBitWidth;
  if (geom_dirty & GeometryField_HEIGHT) bits |= AnimationOverlay::kBitHeight;
  if (geom_dirty & GeometryField_CX) bits |= AnimationOverlay::kBitCX;
  if (geom_dirty & GeometryField_CY) bits |= AnimationOverlay::kBitCY;
  if (geom_dirty & GeometryField_R) bits |= AnimationOverlay::kBitR;
  if (geom_dirty & GeometryField_PATH_START) bits |= AnimationOverlay::kBitPathStart;
  if (geom_dirty & GeometryField_PATH_END) bits |= AnimationOverlay::kBitPathEnd;
  return bits;
}

// ---- Track evaluation ----

AnimPhase EvaluateTrack(const RetainedAnimation &track, uint64_t now_ns, float out[2],
                        uint32_t *out_color) {
  out[0] = out[1] = 0.f;
  const uint64_t delay_ns = static_cast<uint64_t>(track.delay_ms) * kMsToNs;
  const uint64_t dur_ns = static_cast<uint64_t>(track.duration_ms) * kMsToNs;
  const uint64_t elapsed = now_ns - track.start_ns; // start_ns set at/below now
  if (elapsed < delay_ns) return AnimPhase::BeforeDelay;

  const uint64_t active = elapsed - delay_ns;
  const bool infinite = track.iterations < 0;
  const uint64_t iters =
      infinite ? 1u : static_cast<uint64_t>(std::max<int32_t>(track.iterations, 1));
  const uint64_t total = dur_ns * iters;

  // Pass progress p ∈ [0,1] within one iteration; the final frame pins to the
  // terminal keyframe exactly (float drift never lands past the end).
  bool last_frame = false;
  float p;
  if (!infinite && active >= total) {
    p = 1.f;
    last_frame = true;
  } else {
    p = dur_ns > 0 ? static_cast<float>(static_cast<double>(active % dur_ns) / dur_ns) : 1.f;
  }
  if (track.auto_reverse) {
    uint64_t pass = last_frame ? (iters - 1) : (dur_ns > 0 ? active / dur_ns : 0);
    if (pass & 1ull) p = 1.f - p; // odd passes play backwards (CSS alternate)
  }

  // Locate the segment [k_i, k_i+1] containing p (the last segment absorbs
  // p == 1). Offsets are ascending per the producer contract.
  const auto &keys = track.keys;
  size_t i = 0;
  while (i + 2 < keys.size() && p > keys[i + 1].offset)
    i++;
  const AnimKeyframe &k0 = keys[i];
  const AnimKeyframe &k1 = keys[i + 1];
  const float span = k1.offset - k0.offset;
  float local = span > 0.f ? (p - k0.offset) / span : 1.f;
  if (last_frame) local = 1.f;
  const float eased = ApplyEasing(k0.easing, local, k0.p1x, k0.p1y, k0.p2x, k0.p2y);

  out[0] = k0.value + (k1.value - k0.value) * eased;
  out[1] = k0.value2 + (k1.value2 - k0.value2) * eased;
  if (out_color != nullptr) *out_color = LerpColor(k0.color, k1.color, eased);
  return last_frame ? AnimPhase::FinishedThisFrame : AnimPhase::Active;
}

// ---- Overlay mutation ----

void WriteOverlaySlot(AnimationOverlay &o, AnimatedProperty p, const float v[2], uint32_t color) {
  o.mask |= AnimationPropertyBit(p);
  switch (p) {
  case AnimatedProperty_OPACITY:
    o.opacity = v[0];
    break;
  case AnimatedProperty_TRANSLATE_X:
    o.tx = v[0];
    break;
  case AnimatedProperty_TRANSLATE_Y:
    o.ty = v[0];
    break;
  case AnimatedProperty_ROTATE:
    o.rotate = v[0];
    break;
  case AnimatedProperty_SCALE_XY:
    o.sx = v[0];
    o.sy = v[1];
    break;
  case AnimatedProperty_PATH_START:
    o.path_start = v[0];
    break;
  case AnimatedProperty_PATH_END:
    o.path_end = v[0];
    break;
  case AnimatedProperty_FILL_COLOR:
    o.fill = color;
    break;
  case AnimatedProperty_STROKE_COLOR:
    o.stroke = color;
    break;
  case AnimatedProperty_X:
    o.x = v[0];
    break;
  case AnimatedProperty_Y:
    o.y = v[0];
    break;
  case AnimatedProperty_WIDTH:
    o.w = v[0];
    break;
  case AnimatedProperty_HEIGHT:
    o.h = v[0];
    break;
  case AnimatedProperty_CX:
    o.cx = v[0];
    break;
  case AnimatedProperty_CY:
    o.cy = v[0];
    break;
  case AnimatedProperty_R:
    o.r = v[0];
    break;
  default:
    break;
  }
}

void ClearOverlaySlot(AnimationOverlay &o, AnimatedProperty p) {
  o.mask &= ~AnimationPropertyBit(p);
}

// ---- Command application (called from ApplyCommandBatch, render thread) ----

void ApplySetAnimation(const SetAnimation *cmd, RetainedNode *node,
                       std::unordered_set<int32_t> *animated_ids) {
  // Whole-list replace semantics (D2): the React producer serializes every
  // track of the node in one payload, so a new list replaces the old set.
  node->anim.tracks.clear();
  node->anim.overlay = AnimationOverlay{}; // fresh; next tick rewrites
  const auto *bytes = cmd->data();
  if (bytes != nullptr && bytes->size() > 0) {
    const AnimationList *list = ::flatbuffers::GetRoot<AnimationList>(bytes->Data());
    const auto *tracks = list != nullptr ? list->tracks() : nullptr;
    if (tracks != nullptr) {
      for (::flatbuffers::uoffset_t i = 0; i < tracks->size(); i++) {
        const AnimationTrack *t = tracks->Get(i);
        const auto *keys = t != nullptr ? t->keyframes() : nullptr;
        if (keys == nullptr || keys->size() < 2) continue; // producer contract
        RetainedAnimation track;
        track.property = t->property();
        track.duration_ms = t->duration();
        track.delay_ms = t->delay();
        track.iterations = t->iterations();
        track.auto_reverse = t->auto_reverse();
        track.fill_forwards = t->fill() == FillMode_FORWARDS;
        track.pivot_x = t->cx();
        track.pivot_y = t->cy();
        track.keys.reserve(keys->size());
        for (::flatbuffers::uoffset_t k = 0; k < keys->size(); k++) {
          const Keyframe *kf = keys->Get(k);
          if (kf == nullptr) continue;
          // Keyframe easing is FINAL here: FlatBuffer defaults cannot express
          // "inherit the track default", so the JS builder resolves the
          // fallback (undefined → track default) before serializing.
          AnimKeyframe out;
          out.offset = kf->offset();
          out.value = kf->value();
          out.value2 = kf->value2();
          out.color = kf->color();
          out.easing = kf->easing();
          out.p1x = kf->p1x();
          out.p1y = kf->p1y();
          out.p2x = kf->p2x();
          out.p2y = kf->p2y();
          track.keys.push_back(out);
        }
        if (track.keys.size() >= 2) node->anim.tracks.push_back(std::move(track));
      }
    }
  }
  if (!node->anim.tracks.empty()) {
    animated_ids->insert(node->id);
  } else {
    animated_ids->erase(node->id);
  }
}

void CancelAnimationsFor(RetainedNode *node, uint32_t property_bits,
                         std::unordered_set<int32_t> *animated_ids) {
  if (node == nullptr || node->anim.tracks.empty() || property_bits == 0) return;
  auto &tracks = node->anim.tracks;
  tracks.erase(std::remove_if(tracks.begin(), tracks.end(),
                              [&](const RetainedAnimation &t) {
                                bool hit = (property_bits & AnimationPropertyBit(t.property)) != 0;
                                if (hit) ClearOverlaySlot(node->anim.overlay, t.property);
                                return hit;
                              }),
               tracks.end());
  if (tracks.empty()) animated_ids->erase(node->id);
}

// ---- Per-frame tick (the driver calls this on the render thread) ----

bool RetainedRenderTree::TickAnimations(uint64_t now_ns) {
  if (animated_ids_.empty()) return false;
  bool any_live = false;
  // Iterate a copy: finished-and-idle ids leave the set mid-loop.
  std::vector<int32_t> ids(animated_ids_.begin(), animated_ids_.end());
  for (int32_t id : ids) {
    RetainedNode *node = Find(id);
    if (node == nullptr) { // raced a RemoveNode inside the same queue — drop
      animated_ids_.erase(id);
      continue;
    }
    bool live = false;
    for (RetainedAnimation &track : node->anim.tracks) {
      if (track.finished) continue; // holding pins already sit in the overlay
      if (!track.started) {         // first sighting stamps the clock origin
        track.started = true;
        track.start_ns = now_ns;
      }
      float v[2] = {0.f, 0.f};
      uint32_t color = 0u;
      AnimPhase phase = EvaluateTrack(track, now_ns, v, &color);
      if (phase == AnimPhase::BeforeDelay) { // slot stays base; clock runs
        live = true;
        continue;
      }
      WriteOverlaySlot(node->anim.overlay, track.property, v, color);
      if (track.property == AnimatedProperty_ROTATE ||
          track.property == AnimatedProperty_SCALE_XY) {
        node->anim.overlay.pivot_x = track.pivot_x;
        node->anim.overlay.pivot_y = track.pivot_y;
      }
      if (phase == AnimPhase::Active) {
        live = true;
      } else { // FinishedThisFrame — paint this frame, then stop unless pinned
        track.finished = true;
        if (track.fill_forwards) {
          track.holding = true; // terminal value stays in the overlay
        } else {
          ClearOverlaySlot(node->anim.overlay, track.property);
        }
        live = true; // the final frame still needs a draw
      }
    }
    if (!live) animated_ids_.erase(id);
    any_live |= live;
  }
  return any_live;
}

} // namespace skityrt
