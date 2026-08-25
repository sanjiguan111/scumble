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
std::vector<uint8_t> BuildBatchWithAnimation(std::vector<uint8_t> anim_bytes) {
  ::flatbuffers::FlatBufferBuilder fbb;
  auto tag = fbb.CreateString("path");
  auto insRoot = skityrt::CreateInsertNode(fbb, 1, -1, 0, fbb.CreateString("canvas"));
  auto insChild = skityrt::CreateInsertNode(fbb, 2, 1, 0, tag);
  auto data = fbb.CreateVector(anim_bytes);
  auto sa = skityrt::CreateSetAnimation(fbb, 2, data);
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

  void Apply(std::vector<uint8_t> anim_bytes) {
    auto batch = BuildBatchWithAnimation(std::move(anim_bytes));
    tree.ApplyCommandBatch(batch.data(), batch.size());
  }
};

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

} // namespace
