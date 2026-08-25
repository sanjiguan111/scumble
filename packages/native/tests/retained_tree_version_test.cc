// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Host-side unit tests for the render build-cache invalidation contract
// (RENDER_ARCHITECTURE.md §15): which commands bump which node version, that
// structural commands bump the tree epoch, and — the invariant the whole
// cache rests on — that SetAnimation and animation ticks bump NOTHING.

#include "../shared/skity/retained_render_tree.h"

#include <cstdint>
#include <vector>

#include <flatbuffers/flatbuffers.h>
#include <gtest/gtest.h>

#include "command_batch_generated.h"
#include "render_tree_style_generated.h"

namespace {

using namespace skityrt;

constexpr uint64_t kMs = 1000000ull;

// Batch builder helpers (same手法 as animation_test.cc — offsets are
// builder-local, so each command must be created on the SAME builder as the
// batch that references it).
class BatchBuilder {
public:
  flatbuffers::FlatBufferBuilder fbb;
  std::vector<flatbuffers::Offset<void>> cmds;
  std::vector<uint8_t> types;

  template <typename Fn> void Add(Command type, Fn make) {
    cmds.push_back(make(fbb).Union());
    types.push_back(static_cast<uint8_t>(type));
  }

  std::vector<uint8_t> Finish() {
    auto batch =
        skityrt::CreateCommandBatch(fbb, 0, fbb.CreateVector(types), fbb.CreateVector(cmds));
    skityrt::FinishCommandBatchBuffer(fbb, batch);
    return std::vector<uint8_t>(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());
  }
};

std::vector<uint8_t> MakeInsertRoot() {
  BatchBuilder b;
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 1, -1, 0, f.CreateString("canvas"));
  });
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 2, 1, 0, f.CreateString("path"));
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetPaint(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetPaint, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateSetPaint(f, node,
                                   static_cast<skityrt::PaintField>(skityrt::PaintField_FILL),
                                   0xff112233, 0, 0, 0, 1.f);
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetGeometry(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetGeometry, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateSetGeometry(
        f, node, static_cast<skityrt::GeometryField>(skityrt::GeometryField_X), 5.f);
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetPathData(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetPathData, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateSetPathData(f, node, f.CreateVector(std::vector<uint8_t>{1, 2, 3}));
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetTransform(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetTransform, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateSetTransform(f, node, f.CreateVector(std::vector<uint8_t>{4, 5}));
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetClip(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetClip, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateSetClip(f, node, f.CreateVector(std::vector<uint8_t>{6, 7}));
  });
  return b.Finish();
}

std::vector<uint8_t> MakeSetAnimation(int32_t node) {
  BatchBuilder b;
  b.Add(Command_SetAnimation, [node](flatbuffers::FlatBufferBuilder &f) {
    // Two-keyframe opacity track (details irrelevant to the version contract).
    ::flatbuffers::FlatBufferBuilder nb;
    std::vector<flatbuffers::Offset<Keyframe>> kfs{skityrt::CreateKeyframe(nb, 0.f, 0.f),
                                                   skityrt::CreateKeyframe(nb, 1.f, 1.f)};
    auto track = skityrt::CreateAnimationTrack(nb, skityrt::AnimatedProperty_OPACITY, 100, 0, 1,
                                               false, skityrt::FillMode_NONE,
                                               skityrt::EasingKind_LINEAR, nb.CreateVector(kfs));
    std::vector<flatbuffers::Offset<AnimationTrack>> tv{track};
    auto list = skityrt::CreateAnimationList(nb, nb.CreateVector(tv));
    nb.Finish(list);
    auto bytes = nb.GetBufferPointer();
    auto size = nb.GetSize();
    return skityrt::CreateSetAnimation(f, node, f.CreateVector(bytes, size));
  });
  return b.Finish();
}

std::vector<uint8_t> MakeRemoveNode(int32_t node) {
  BatchBuilder b;
  b.Add(Command_RemoveNode,
        [node](flatbuffers::FlatBufferBuilder &f) { return skityrt::CreateRemoveNode(f, node); });
  return b.Finish();
}

std::vector<uint8_t> MakeMoveNode(int32_t node) {
  BatchBuilder b;
  b.Add(Command_MoveNode, [node](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateMoveNode(f, node, 1, 0);
  });
  return b.Finish();
}

class VersionTest : public ::testing::Test {
protected:
  RetainedRenderTree tree;
  void SetUp() override {
    auto ins = MakeInsertRoot();
    tree.ApplyCommandBatch(ins.data(), ins.size());
  }
  void Apply(std::vector<uint8_t> batch) { tree.ApplyCommandBatch(batch.data(), batch.size()); }
};

TEST_F(VersionTest, PaintCommandsBumpPaintVersionOnly) {
  const RetainedNode *n = tree.Find(2);
  uint32_t g0 = n->geom_version, p0 = n->paint_version;
  Apply(MakeSetPaint(2));
  EXPECT_EQ(n->paint_version, p0 + 1);
  EXPECT_EQ(n->geom_version, g0);
  Apply(MakeSetTransform(2));
  EXPECT_EQ(n->paint_version, p0 + 2);
  EXPECT_EQ(n->geom_version, g0);
}

TEST_F(VersionTest, GeometryCommandsBumpGeomVersionOnly) {
  const RetainedNode *n = tree.Find(2);
  uint32_t g0 = n->geom_version, p0 = n->paint_version;
  Apply(MakeSetGeometry(2));
  Apply(MakeSetPathData(2));
  Apply(MakeSetClip(2));
  EXPECT_EQ(n->geom_version, g0 + 3);
  EXPECT_EQ(n->paint_version, p0);
}

TEST_F(VersionTest, SetAnimationAndTicksBumpNothing) {
  const RetainedNode *n = tree.Find(2);
  uint32_t g0 = n->geom_version, p0 = n->paint_version;
  Apply(MakeSetAnimation(2));
  EXPECT_EQ(n->geom_version, g0);  // the load-bearing invariant: animated
  EXPECT_EQ(n->paint_version, p0); // nodes keep hitting the build cache
  EXPECT_TRUE(tree.TickAnimations(16 * kMs));
  EXPECT_TRUE(tree.TickAnimations(66 * kMs));
  EXPECT_EQ(n->geom_version, g0);
  EXPECT_EQ(n->paint_version, p0);
}

TEST_F(VersionTest, StructuralCommandsBumpTreeEpoch) {
  uint64_t e0 = tree.structure_epoch();
  Apply(MakeRemoveNode(2));
  EXPECT_GT(tree.structure_epoch(), e0);
  Apply(MakeInsertRoot()); // re-insert id 2 (root+child pair again)
  EXPECT_GT(tree.structure_epoch(), e0 + 1);
}

TEST_F(VersionTest, RemoveThenReinsertSameIdChangesEpoch) {
  // A stale cache entry carries the OLD epoch — the bump guarantees it can
  // never validate against the re-inserted node even if the fresh node's
  // per-node versions both start at 0 again.
  Apply(MakeRemoveNode(2));
  uint64_t afterRemove = tree.structure_epoch();
  BatchBuilder b;
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 2, 1, 0, f.CreateString("path"));
  });
  Apply(b.Finish());
  EXPECT_GT(tree.structure_epoch(), afterRemove);
  const RetainedNode *n = tree.Find(2);
  ASSERT_NE(n, nullptr);
  EXPECT_EQ(n->geom_version, 0u); // fresh node counters
}

TEST_F(VersionTest, SiblingWritesLeaveOtherNodeStable) {
  const RetainedNode *root = tree.Find(1);
  BatchBuilder b;
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 3, 1, 1, f.CreateString("path"));
  });
  Apply(b.Finish());
  const RetainedNode *sibling = tree.Find(3);
  uint32_t g0 = sibling->geom_version, p0 = sibling->paint_version;
  (void)root;
  Apply(MakeSetPaint(2));
  Apply(MakeSetPathData(2));
  EXPECT_EQ(sibling->geom_version, g0);
  EXPECT_EQ(sibling->paint_version, p0);
}

} // namespace
