// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Unit tests for the native animation engine core (ANIMATION_DESIGN.md):
// SetAnimation application, per-tick evaluation (delay freeze, iteration
// folding, auto-reverse, fill modes), conflict cancellation, replace/clear
// semantics and RemoveNode cleanup — all through the public tree API, with
// synthetic frame timestamps. Host-side GoogleTest binary.

#include "../shared/skity/retained_render_tree.h"

#include <cstdint>
#include <vector>

#include <flatbuffers/flatbuffers.h>
#include <gtest/gtest.h>

#include "command_batch_generated.h"
#include "render_tree_style_generated.h"

namespace {

using namespace skityrt; // enum constants (Command_*, AnimatedProperty_*) come along

constexpr uint64_t kMs = 1000000ull; // ms → ns

// Keyframe spec shortcut: {offset, value}.
struct KF {
  float offset, value;
};

// Serialize an AnimationList with the given per-track settings.
std::vector<uint8_t> BuildList(std::vector<KF> keys, AnimatedProperty property,
                               uint32_t duration_ms, uint32_t delay_ms = 0, int32_t iterations = 1,
                               bool auto_reverse = false, FillMode fill = FillMode_NONE,
                               EasingKind easing = EasingKind_LINEAR) {
  ::flatbuffers::FlatBufferBuilder nb;
  std::vector<::flatbuffers::Offset<Keyframe>> kfs;
  kfs.reserve(keys.size());
  for (const KF &k : keys) {
    kfs.push_back(skityrt::CreateKeyframe(nb, k.offset, k.value));
  }
  auto track = skityrt::CreateAnimationTrack(nb, property, duration_ms, delay_ms, iterations,
                                             auto_reverse, fill, easing, nb.CreateVector(kfs));
  std::vector<::flatbuffers::Offset<skityrt::AnimationTrack>> tv{track};
  auto list = skityrt::CreateAnimationList(nb, nb.CreateVector(tv));
  nb.Finish(list); // AnimationList is not any .fbs root_type — no generated helper
  return std::vector<uint8_t>(nb.GetBufferPointer(), nb.GetBufferPointer() + nb.GetSize());
}

// Serialize a batch: root insert (canvas) + child insert + SetAnimation.
// `handle` (optional) rides the command for playback-control addressing.
std::vector<uint8_t> BuildBatchWithAnimation(std::vector<uint8_t> anim_bytes,
                                             const char *handle = nullptr) {
  ::flatbuffers::FlatBufferBuilder fbb;
  auto tag = fbb.CreateString("path");
  auto insRoot = skityrt::CreateInsertNode(fbb, 1, -1, 0, fbb.CreateString("canvas"));
  auto insChild = skityrt::CreateInsertNode(fbb, 2, 1, 0, tag);
  auto data = fbb.CreateVector(anim_bytes);
  auto handleOff = handle != nullptr ? fbb.CreateString(handle) : 0;
  auto sa = skityrt::CreateSetAnimation(fbb, 2, data, handleOff);
  std::vector<::flatbuffers::Offset<void>> cmds{insRoot.Union(), insChild.Union(), sa.Union()};
  std::vector<uint8_t> types{Command_InsertNode, Command_InsertNode, Command_SetAnimation};
  auto batch = skityrt::CreateCommandBatch(fbb, 0, fbb.CreateVector(types), fbb.CreateVector(cmds));
  skityrt::FinishCommandBatchBuffer(fbb, batch);
  return std::vector<uint8_t>(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());
}

// Serialize a one-command batch. `make` builds the command Offset ON THE
// GIVEN builder — offsets are builder-local, so creating the command on a
// different FlatBufferBuilder than the batch trips ReferTo's bounds assert.
template <typename Fn> std::vector<uint8_t> BuildSingleCommand(Command type, Fn make) {
  ::flatbuffers::FlatBufferBuilder fbb;
  auto cmd = make(fbb);
  std::vector<::flatbuffers::Offset<void>> cmds{cmd.Union()};
  std::vector<uint8_t> types{static_cast<uint8_t>(type)};
  auto batch = skityrt::CreateCommandBatch(fbb, 0, fbb.CreateVector(types), fbb.CreateVector(cmds));
  skityrt::FinishCommandBatchBuffer(fbb, batch);
  return std::vector<uint8_t>(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());
}

std::vector<uint8_t> MakeSetPaint(int32_t node, uint32_t dirty, float opacity) {
  return BuildSingleCommand(Command_SetPaint, [&](::flatbuffers::FlatBufferBuilder &fbb) {
    return skityrt::CreateSetPaint(fbb, node, static_cast<skityrt::PaintField>(dirty), 0, 0, 0, 0,
                                   1.f, skityrt::LineCap_BUTT, skityrt::LineJoin_MITER, 4.f,
                                   skityrt::FillRule_NONZERO, opacity);
  });
}

std::vector<uint8_t> MakeRemoveNode(int32_t node) {
  return BuildSingleCommand(Command_RemoveNode, [&](::flatbuffers::FlatBufferBuilder &fbb) {
    return skityrt::CreateRemoveNode(fbb, node);
  });
}

class AnimationTest : public ::testing::Test {
protected:
  RetainedRenderTree tree;
  // T0: the timestamp of the first tick after apply (start_ns origin).
  static constexpr uint64_t kT0 = 16 * kMs;

  void Apply(std::vector<uint8_t> anim_bytes, const char *handle = nullptr) {
    auto batch = BuildBatchWithAnimation(std::move(anim_bytes), handle);
    tree.ApplyCommandBatch(batch.data(), batch.size());
  }

  // Playback tests seek()/pause() with ms-scale timeline offsets; the default
  // kT0 (16ms) would clamp seek's frame-domain anchor (start_ns ≥ 0). A late
  // anchor stands in for a real device's boot-relative frame timestamps.
  static constexpr uint64_t kLateT0 = 60ull * 1000 * kMs; // 60s after boot
};

// @lat: [[tests#Native C++ core#Animation engine]]
TEST_F(AnimationTest, LinearInterpolationMidpoint) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100));
  EXPECT_TRUE(tree.TickAnimations(kT0)); // started, active
  EXPECT_TRUE(tree.TickAnimations(kT0 + 50 * kMs));
  const skityrt::RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, DelayFreezesAtBase) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, /*delay=*/100));
  EXPECT_TRUE(tree.TickAnimations(kT0)); // before delay: live, slot untouched
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_EQ(n->anim.overlay.mask & AnimationOverlay::kBitOpacity, 0u);
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);            // base opacity
  EXPECT_TRUE(tree.TickAnimations(kT0 + 150 * kMs)); // 50ms into the animation
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, IterationsFoldAndFinishReturnsToBase) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, /*iterations=*/2));
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 150 * kMs)); // second pass midpoint
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // Final frame: terminal value, then the slot clears (fill=none).
  EXPECT_TRUE(tree.TickAnimations(kT0 + 200 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);
  // Fully idle afterwards.
  EXPECT_FALSE(tree.TickAnimations(kT0 + 216 * kMs));
  EXPECT_EQ(n->anim.overlay.mask, 0u);
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6); // back to base
}

TEST_F(AnimationTest, InfiniteLoopNeverFinishes) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, /*iterations=*/-1));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 350 * kMs)); // pass 3, phase 0.5
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, AutoReversePlaysOddPassesBackwards) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0,
                  /*iterations=*/2, /*auto_reverse=*/true));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 100 * kMs)); // pass 1 starts: reversed → 1.0
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-4);
  EXPECT_TRUE(tree.TickAnimations(kT0 + 175 * kMs)); // pass 1, phase 0.75 → 0.25
  EXPECT_NEAR(AnimOpacity(n), 0.25f, 1e-4);
}

TEST_F(AnimationTest, FillForwardsPinsTerminalValue) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 0.f}}, AnimatedProperty_OPACITY, 100, 0, 1, false,
                  FillMode_FORWARDS));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 100 * kMs)); // finish frame
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-6);
  EXPECT_NE(n->anim.overlay.mask & AnimationOverlay::kBitOpacity, 0u); // pinned
  EXPECT_FALSE(tree.TickAnimations(kT0 + 116 * kMs));                  // idle, but pinned stays
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-6);
}

TEST_F(AnimationTest, ConflictingSetPaintCancelsTrack) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 50 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // A SetPaint writing opacity takes over — the track dies, base updates.
  auto paint = MakeSetPaint(2, skityrt::PaintField_OPACITY, 0.25f);
  tree.ApplyCommandBatch(paint.data(), paint.size());
  EXPECT_EQ(n->anim.overlay.mask, 0u);
  EXPECT_TRUE(n->anim.tracks.empty());
  EXPECT_NEAR(n->style.opacity, 0.25f, 1e-6);
  EXPECT_FALSE(tree.TickAnimations(kT0 + 66 * kMs)); // idle
}

TEST_F(AnimationTest, ReplaceRestartsClock) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 50 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // A new SetAnimation replaces the track and resets the runtime state.
  Apply(BuildList({{0.f, 1.f}, {1.f, 0.f}}, AnimatedProperty_OPACITY, 200, 0, -1));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 60 * kMs)); // new origin
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-4);           // back at its from-value
  EXPECT_TRUE(tree.TickAnimations(kT0 + 160 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, EmptyDataClearsAll) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1));
  EXPECT_TRUE(tree.TickAnimations(kT0));
  Apply({}); // empty payload = clear
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(n->anim.tracks.empty());
  EXPECT_EQ(n->anim.overlay.mask, 0u);
  EXPECT_FALSE(tree.TickAnimations(kT0 + 32 * kMs));
}

TEST_F(AnimationTest, RemoveNodeDuringAnimationIsSafe) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1));
  EXPECT_TRUE(tree.TickAnimations(kT0));
  auto rm = MakeRemoveNode(2);
  tree.ApplyCommandBatch(rm.data(), rm.size());
  EXPECT_EQ(tree.Find(2), nullptr);
  EXPECT_FALSE(tree.TickAnimations(kT0 + 16 * kMs)); // no dangling id, no crash
}

TEST_F(AnimationTest, MultiTrackAnimatesTogether) {
  // Two tracks on one node: opacity 0→1 and pathEnd 0→1, same timing.
  ::flatbuffers::FlatBufferBuilder nb;
  std::vector<::flatbuffers::Offset<Keyframe>> kfsA{skityrt::CreateKeyframe(nb, 0.f, 0.f),
                                                    skityrt::CreateKeyframe(nb, 1.f, 1.f)};
  std::vector<::flatbuffers::Offset<Keyframe>> kfsB{skityrt::CreateKeyframe(nb, 0.f, 0.f),
                                                    skityrt::CreateKeyframe(nb, 1.f, 1.f)};
  auto tA = skityrt::CreateAnimationTrack(nb, AnimatedProperty_OPACITY, 100, 0, 1, false,
                                          FillMode_NONE, EasingKind_LINEAR, nb.CreateVector(kfsA));
  auto tB = skityrt::CreateAnimationTrack(nb, AnimatedProperty_PATH_END, 100, 0, 1, false,
                                          FillMode_NONE, EasingKind_LINEAR, nb.CreateVector(kfsB));
  std::vector<::flatbuffers::Offset<AnimationTrack>> ts{tA, tB};
  auto list = skityrt::CreateAnimationList(nb, nb.CreateVector(ts));
  nb.Finish(list);
  Apply(std::vector<uint8_t>(nb.GetBufferPointer(), nb.GetBufferPointer() + nb.GetSize()));

  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 50 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  EXPECT_NEAR(AnimPathEnd(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, MultiKeyframeSegmentsPiecewiseLinear) {
  // Three keyframes: offsets 0 / 0.5 / 1, values 0 / 10 / 20.
  Apply(BuildList({{0.f, 0.f}, {0.5f, 10.f}, {1.f, 20.f}}, AnimatedProperty_OPACITY, 100));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 25 * kMs)); // p=0.25 → segment 1 local 0.5
  EXPECT_NEAR(AnimOpacity(n), 5.f, 1e-3);
  EXPECT_TRUE(tree.TickAnimations(kT0 + 75 * kMs)); // p=0.75 → segment 2 local 0.5
  EXPECT_NEAR(AnimOpacity(n), 15.f, 1e-3);
}

// ---- Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D3/D4) ----

TEST_F(AnimationTest, UnknownHandleIsAnErrorNotACrash) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_FALSE(tree.ControlAnimation("nope", AnimControlAction::kPause, 0.0));
}

TEST_F(AnimationTest, PauseFreezesOverlayAndDriverGoesIdle) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 50 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // Pause: the overlay freezes; time advances underneath but nothing moves,
  // and an all-paused tree reports idle (driver stops — D4).
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPause, 0.0));
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 500 * kMs));
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 1000 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-6); // frozen exactly at the pause point
}

TEST_F(AnimationTest, PlayResumesFromThePausePoint) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 50 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPause, 0.0));
  // Rewind the pause stamp to fake a 100ms real-world pause (the gap is a
  // steady-clock delta; sleeping in a unit test is not an option). The frame
  // clock crosses the same 100ms — the next timestamp is pausePoint+gap+16.
  skityrt::RetainedNode *mutable_n = tree.Find(2);
  mutable_n->anim.pause_steady_ns -= 100 * kMs;
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPlay, 0.0));
  // The pause gap is cut out of start_ns: elapsed = 50 (freeze) + 16 (frame).
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 166 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.66f, 1e-3);
}

TEST_F(AnimationTest, PlayOnFinishedNodeRestartsFromZero) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, 1, false,
                  FillMode_FORWARDS),
        "h1");
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 100 * kMs));  // finish, holding 1
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 116 * kMs)); // idle
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);
  // play() on an idle node restarts (WAAPI play semantics): fresh clock,
  // holding pin dropped.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPlay, 0.0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 132 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-6);                // restart from the from-value
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 182 * kMs)); // 50ms in
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-3);
}

TEST_F(AnimationTest, SeekEvaluatesImmediately) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0)); // stamps the frame-domain anchor
  // seek(50ms) rewrites the overlay synchronously — no tick in between.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 50.0));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
}

TEST_F(AnimationTest, SeekRevivesAFinishedTrack) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, 1, false,
                  FillMode_FORWARDS),
        "h1");
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 100 * kMs)); // finished, holding 1
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 116 * kMs));
  // Seek back into the interval: the track revives and keeps playing.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 50.0));
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // The seek anchored t=50 at last_frame (116); 16ms later → t=66.
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 132 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.66f, 1e-3);
}

TEST_F(AnimationTest, SeekIntoDelayReturnsSlotToBase) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, /*delay=*/100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 150 * kMs)); // mid-animation
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-4);
  // Seek back before the delay: WAAPI liveness — slot clears, clock continues.
  // The seek anchored t=50 at last_frame (150): the delay has 50ms left.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 50.0));
  EXPECT_EQ(n->anim.overlay.mask & AnimationOverlay::kBitOpacity, 0u);
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);                // base
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 166 * kMs)); // t=66: still in delay
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 200 * kMs)); // t=100: delay ends
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-3);
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 250 * kMs)); // t=150: 50ms into pass
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-3);
}

TEST_F(AnimationTest, CancelReturnsToBaseAndKeepsTheHandle) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 50 * kMs));
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kCancel, 0.0));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_FALSE(n->anim.tracks.empty()); // a cancel resets, it does not delete
  EXPECT_EQ(n->anim.overlay.mask, 0u);
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6); // base
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 66 * kMs));
  // play() after cancel restarts from t=0 (WAAPI cancel+play semantics).
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPlay, 0.0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 82 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-4);                // fresh clock: from-value
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 132 * kMs)); // 50ms in
  EXPECT_NEAR(AnimOpacity(n), 0.5f, 1e-3);
  // D1: the handle survives — a later SetAnimation re-attaches too.
  Apply(BuildList({{0.f, 1.f}, {1.f, 0.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 148 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 1.f, 1e-6);
}

TEST_F(AnimationTest, HandleSurvivesAnimationClear) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  Apply({}, "h1"); // clear all animations, handle re-registered
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 0.0)); // still known
}

TEST_F(AnimationTest, RemoveNodeDropsTheHandle) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  auto rm = MakeRemoveNode(2);
  tree.ApplyCommandBatch(rm.data(), rm.size());
  EXPECT_FALSE(tree.ControlAnimation("h1", AnimControlAction::kPause, 0.0)); // stale → error
}

TEST_F(AnimationTest, ReplacedAnimationResetsPlayback) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kPause, 0.0));
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 16 * kMs)); // paused: idle
  // A new SetAnimation (React re-render) restarts unpaused (D3 conflict rule).
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100, 0, -1), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 32 * kMs));
  EXPECT_NEAR(AnimOpacity(n), 0.f, 1e-4); // fresh clock: from-value
}

TEST_F(AnimationTest, FinishReportedOncePerCompletion) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 100 * kMs));  // final frame: live
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 116 * kMs)); // drains → idle
  auto handles = tree.TakeFinishedHandles();
  ASSERT_EQ(handles.size(), 1u);
  EXPECT_EQ(handles[0], "h1");
  // Drained: subsequent ticks report nothing more.
  EXPECT_TRUE(tree.TakeFinishedHandles().empty());
}

TEST_F(AnimationTest, CancelAndReplaceFireNoFinish) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0));
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kCancel, 0.0));
  EXPECT_TRUE(tree.TakeFinishedHandles().empty()); // cancel is not a completion
  // Replace path: a fresh SetAnimation on a running node fires nothing.
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 16 * kMs));
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 200), "h1");
  EXPECT_TRUE(tree.TakeFinishedHandles().empty());
}

TEST_F(AnimationTest, SeekToEndTimeFiresFinishAndReArms) {
  Apply(BuildList({{0.f, 0.f}, {1.f, 1.f}}, AnimatedProperty_OPACITY, 100), "h1");
  EXPECT_TRUE(tree.TickAnimations(kLateT0)); // frame-domain anchor
  // Seek exactly to the end: the terminal frame is still "live" (it paints);
  // the drain on the NEXT tick reports the finish.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 100.0));
  EXPECT_TRUE(tree.TakeFinishedHandles().empty());
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 16 * kMs)); // drains → idle
  auto handles = tree.TakeFinishedHandles();
  ASSERT_EQ(handles.size(), 1u);
  EXPECT_EQ(handles[0], "h1");
  // Seek back mid-interval: re-armed — a later completion reports again.
  EXPECT_TRUE(tree.ControlAnimation("h1", AnimControlAction::kSeek, 50.0));
  EXPECT_TRUE(tree.TakeFinishedHandles().empty());
  // The seek anchored t=50 at last_frame (kLateT0+16); t reaches 100 at
  // kLateT0+66 — the terminal frame is live, the NEXT one drains.
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 50 * kMs));  // t=84: active
  EXPECT_TRUE(tree.TickAnimations(kLateT0 + 66 * kMs));  // t=100: terminal
  EXPECT_FALSE(tree.TickAnimations(kLateT0 + 82 * kMs)); // drains
  handles = tree.TakeFinishedHandles();
  EXPECT_EQ(handles.size(), 1u); // the second completion reported
}

} // namespace

namespace {

// ---- PATH_D: whole-path geometry morph (scumble perf lane) ----

// PathCommandList bytes from {type, args} pairs (the same wire form the JS
// producer serializes).
std::vector<uint8_t> BuildCmds(std::vector<std::pair<PathCommandType, std::vector<float>>> cmds) {
  ::flatbuffers::FlatBufferBuilder nb;
  std::vector<::flatbuffers::Offset<PathCommand>> offs;
  offs.reserve(cmds.size());
  for (auto &c : cmds) {
    offs.push_back(skityrt::CreatePathCommand(nb, c.first, nb.CreateVector(c.second)));
  }
  auto list = skityrt::CreatePathCommandList(nb, nb.CreateVector(offs));
  nb.Finish(list);
  return std::vector<uint8_t>(nb.GetBufferPointer(), nb.GetBufferPointer() + nb.GetSize());
}

// A PATH_D track: keyframes carry their geometry (PathCommandList bytes).
std::vector<uint8_t> BuildPathDList(std::vector<std::vector<uint8_t>> key_paths,
                                    uint32_t duration_ms, EasingKind easing = EasingKind_LINEAR) {
  ::flatbuffers::FlatBufferBuilder nb;
  std::vector<::flatbuffers::Offset<Keyframe>> kfs;
  const size_t n = key_paths.size();
  for (size_t i = 0; i < n; i++) {
    auto cmds = nb.CreateVector(key_paths[i]);
    kfs.push_back(skityrt::CreateKeyframe(nb, static_cast<float>(i) / (n - 1), 0.f, 0.f, 0u, easing,
                                          0.42f, 0.f, 0.58f, 1.f, cmds));
  }
  auto track = skityrt::CreateAnimationTrack(nb, AnimatedProperty_PATH_D, duration_ms, 0, 1, false,
                                             FillMode_NONE, easing, nb.CreateVector(kfs));
  std::vector<::flatbuffers::Offset<skityrt::AnimationTrack>> tv{track};
  auto list = skityrt::CreateAnimationList(nb, nb.CreateVector(tv));
  nb.Finish(list);
  return std::vector<uint8_t>(nb.GetBufferPointer(), nb.GetBufferPointer() + nb.GetSize());
}

// A SetPathData command batch for node 2.
std::vector<uint8_t> BuildPathDataBatch(std::vector<uint8_t> bytes) {
  return BuildSingleCommand(Command_SetPathData, [&](::flatbuffers::FlatBufferBuilder &fbb) {
    return skityrt::CreateSetPathData(fbb, 2, fbb.CreateVector(bytes));
  });
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST_F(AnimationTest, PathDTrackEvaluatesProgressAndSegment) {
  // Three keyframes: [M0,0 L0,10] → [M0,0 L10,10] → [M0,0 L20,20], 100ms.
  Apply(BuildPathDList(
      {BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {0.f, 10.f}}}),
       BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {10.f, 10.f}}}),
       BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {20.f, 20.f}}})},
      100));
  const skityrt::RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);

  EXPECT_TRUE(tree.TickAnimations(kT0)); // stamps origin
  EXPECT_TRUE(tree.TickAnimations(kT0 + 25 * kMs));
  EXPECT_NE(n->anim.overlay.mask & AnimationOverlay::kBitPathD, 0u);
  EXPECT_EQ(n->anim.overlay.path_seg, 0u);         // first segment [0, 0.5]
  EXPECT_NEAR(n->anim.overlay.path_t, 0.5f, 1e-4); // 25ms = 50% of segment 0

  EXPECT_TRUE(tree.TickAnimations(kT0 + 75 * kMs));
  EXPECT_EQ(n->anim.overlay.path_seg, 1u); // second segment [0.5, 1]
  EXPECT_NEAR(n->anim.overlay.path_t, 0.5f, 1e-4);

  // Terminal frame still paints, then fill=none clears the slot.
  EXPECT_TRUE(tree.TickAnimations(kT0 + 100 * kMs));
  EXPECT_NEAR(n->anim.overlay.path_t, 1.f, 1e-6);
  EXPECT_FALSE(tree.TickAnimations(kT0 + 116 * kMs));
  EXPECT_EQ(n->anim.overlay.mask, 0u);
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST_F(AnimationTest, PathDKeyframeBytesCarried) {
  auto from =
      BuildCmds({{PathCommandType_MOVE_TO, {1.f, 2.f}}, {PathCommandType_LINE_TO, {3.f, 4.f}}});
  auto to =
      BuildCmds({{PathCommandType_MOVE_TO, {5.f, 6.f}}, {PathCommandType_LINE_TO, {7.f, 8.f}}});
  Apply(BuildPathDList({from, to}, 100));
  const skityrt::RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);
  ASSERT_EQ(n->anim.tracks.size(), 1u);
  ASSERT_EQ(n->anim.tracks[0].keys.size(), 2u);
  EXPECT_EQ(n->anim.tracks[0].keys[0].path_data, from);
  EXPECT_EQ(n->anim.tracks[0].keys[1].path_data, to);
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST_F(AnimationTest, PathDataWriteCancelsPathDTrack) {
  auto bytes = BuildPathDList({BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}}),
                               BuildCmds({{PathCommandType_MOVE_TO, {10.f, 10.f}}})},
                              100);
  Apply(bytes); // [inserts..., SetAnimation]
  EXPECT_TRUE(tree.TickAnimations(kT0));
  const skityrt::RetainedNode *n = tree.Find(2);
  EXPECT_NE(n->anim.overlay.mask & AnimationOverlay::kBitPathD, 0u);

  // Same-batch [SetPathData BEFORE SetAnimation] (the TASM drain order): the
  // cancel hits the OLD track, the new one installs — still live.
  auto fresh = BuildCmds({{PathCommandType_MOVE_TO, {20.f, 20.f}}});
  {
    ::flatbuffers::FlatBufferBuilder fbb;
    auto data = fbb.CreateVector(fresh);
    auto pd = skityrt::CreateSetPathData(fbb, 2, data);
    auto anim = fbb.CreateVector(bytes);
    auto sa = skityrt::CreateSetAnimation(fbb, 2, anim, 0);
    std::vector<::flatbuffers::Offset<void>> cmds{pd.Union(), sa.Union()};
    std::vector<uint8_t> types{Command_SetPathData, Command_SetAnimation};
    auto batch =
        skityrt::CreateCommandBatch(fbb, 0, fbb.CreateVector(types), fbb.CreateVector(cmds));
    skityrt::FinishCommandBatchBuffer(fbb, batch);
    auto raw = std::vector<uint8_t>(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());
    tree.ApplyCommandBatch(raw.data(), raw.size());
  }
  EXPECT_TRUE(tree.TickAnimations(kT0 + 16 * kMs));
  EXPECT_NE(n->anim.overlay.mask & AnimationOverlay::kBitPathD, 0u);

  // SetPathData ALONE: the explicit geometry takes over — track cancelled,
  // node idles.
  auto clear = BuildPathDataBatch(fresh);
  tree.ApplyCommandBatch(clear.data(), clear.size());
  EXPECT_FALSE(tree.TickAnimations(kT0 + 32 * kMs));
  EXPECT_EQ(n->anim.overlay.mask & AnimationOverlay::kBitPathD, 0u);
  EXPECT_TRUE(n->anim.tracks.empty());
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST_F(AnimationTest, PathDTickLerpsIntoReusableScratch) {
  // Endpoints parse ONCE at install; ticks lerp in place into path_scratch.
  Apply(BuildPathDList(
      {BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {0.f, 10.f}}}),
       BuildCmds(
           {{PathCommandType_MOVE_TO, {10.f, 0.f}}, {PathCommandType_LINE_TO, {10.f, 20.f}}})},
      100));
  const skityrt::RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);
  ASSERT_EQ(n->anim.tracks.size(), 1u);
  const skityrt::RetainedAnimation &tr = n->anim.tracks[0];
  EXPECT_TRUE(tr.path_lerp_ok);
  ASSERT_EQ(tr.path_scratch.size(), 2u); // pre-sized at install

  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 50 * kMs));    // midpoint
  EXPECT_NEAR(tr.path_scratch[0].args[0], 5.f, 1e-5);  // M x: 0→10 at 0.5
  EXPECT_NEAR(tr.path_scratch[1].args[1], 15.f, 1e-5); // L y: 10→20 at 0.5
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST_F(AnimationTest, PathDStructureMismatchDegradesToSnap) {
  // LINE vs QUAD at the same position: install-time validation rejects
  // lerping; ticks snap to the nearer endpoint (upstream's fallback).
  Apply(BuildPathDList(
      {BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {5.f, 5.f}}}),
       BuildCmds({{PathCommandType_MOVE_TO, {10.f, 0.f}},
                  {PathCommandType_QUAD_TO, {15.f, 15.f, 20.f, 20.f}}})},
      100));
  const skityrt::RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);
  const skityrt::RetainedAnimation &tr = n->anim.tracks[0];
  EXPECT_FALSE(tr.path_lerp_ok);
  EXPECT_TRUE(tree.TickAnimations(kT0));
  EXPECT_TRUE(tree.TickAnimations(kT0 + 25 * kMs)); // eased < 0.5 → FROM
  ASSERT_EQ(tr.path_scratch.size(), 2u);
  EXPECT_EQ(tr.path_scratch[1].type, PathCommandType_LINE_TO);
  EXPECT_NEAR(tr.path_scratch[1].args[0], 5.f, 1e-6);
  EXPECT_TRUE(tree.TickAnimations(kT0 + 75 * kMs)); // eased > 0.5 → TO
  EXPECT_EQ(tr.path_scratch[1].type, PathCommandType_QUAD_TO);
  EXPECT_NEAR(tr.path_scratch[1].args[0], 15.f, 1e-6);
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST(LerpCommandLists, LerpsPerArgumentWeightedByT) {
  auto a = BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}},
                      {PathCommandType_CUBIC_TO, {10.f, 10.f, 10.f, 10.f, 10.f, 10.f}}});
  auto b = BuildCmds({{PathCommandType_MOVE_TO, {10.f, 0.f}},
                      {PathCommandType_CUBIC_TO, {30.f, 10.f, 10.f, 30.f, 10.f, 10.f}}});
  auto out = skityrt::LerpCommandLists(a, b, 0.25f); // a*0.25 + b*0.75
  ASSERT_TRUE(out.has_value());
  ASSERT_EQ(out->size(), 2u);
  EXPECT_EQ((*out)[0].type, PathCommandType_MOVE_TO);
  EXPECT_NEAR((*out)[0].args[0], 7.5f, 1e-5);
  EXPECT_NEAR((*out)[0].args[1], 0.f, 1e-5);
  EXPECT_NEAR((*out)[1].args[0], 25.f, 1e-5); // 10*0.25 + 30*0.75
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST(LerpCommandLists, ArcFlagsRoundToZeroOrOne) {
  auto a = BuildCmds({{PathCommandType_ARC_TO, {5.f, 5.f, 0.f, 0.f, 0.f, 10.f, 10.f}}});
  auto b = BuildCmds({{PathCommandType_ARC_TO, {5.f, 5.f, 0.f, 1.f, 1.f, 10.f, 10.f}}});
  auto quarter = skityrt::LerpCommandLists(a, b, 0.25f); // flags 0.75 → 1
  ASSERT_TRUE(quarter.has_value());
  EXPECT_EQ((*quarter)[0].args[3], 1.f);
  EXPECT_EQ((*quarter)[0].args[4], 1.f);
  auto mid = skityrt::LerpCommandLists(a, b, 0.75f); // flags 0.25 → 0
  ASSERT_TRUE(mid.has_value());
  EXPECT_EQ((*mid)[0].args[3], 0.f);
  EXPECT_EQ((*mid)[0].args[4], 0.f);
}

// @lat: [[tests#Native C++ core#Animation engine#Path morph track]]
TEST(LerpCommandLists, StructureMismatchReturnsNull) {
  auto two =
      BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_LINE_TO, {1.f, 1.f}}});
  auto one = BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}}});
  EXPECT_FALSE(skityrt::LerpCommandLists(two, one, 0.5f).has_value());
  auto line = BuildCmds(
      {{PathCommandType_MOVE_TO, {0.f, 0.f}}, {PathCommandType_QUAD_TO, {1.f, 1.f, 2.f, 2.f}}});
  auto cubic = BuildCmds({{PathCommandType_MOVE_TO, {0.f, 0.f}},
                          {PathCommandType_CUBIC_TO, {1.f, 1.f, 2.f, 2.f, 3.f, 3.f}}});
  EXPECT_FALSE(skityrt::LerpCommandLists(line, cubic, 0.5f).has_value());
  // Empty payloads never lerp (an empty morph target is a producer error).
  EXPECT_FALSE(skityrt::LerpCommandLists({}, {}, 0.5f).has_value());
  EXPECT_TRUE(skityrt::ParseCommandList({}).empty());
}

} // namespace
