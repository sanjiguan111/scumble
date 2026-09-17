// Licensed under the Apache License Version 2.0 that may not be used except in
// compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.
//
// Host-side unit tests for the multi-<Paint> multi-pass channel (FEATURE_PARITY
// F.1.3 / roadmap #13): SetMultiPaint installs a full pass list on the retained
// node (nested MultiPaintList bytes, JS-built on the platform side — rebuilt
// here with the same FlatBuffer builder), each pass carrying fully independent
// paint state; an empty payload clears the list.

#include "../shared/skity/retained_render_tree.h"

#include <vector>

#include <flatbuffers/flatbuffers.h>
#include <gtest/gtest.h>

#include "command_batch_generated.h"

namespace {

using namespace skityrt;

// Batch builder helpers (same pattern as retained_tree_version_test.cc —
// offsets are builder-local, so each command must be created on the SAME
// builder as the batch that references it).
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

std::vector<uint8_t> MakeTree() {
  BatchBuilder b;
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 1, -1, 0, f.CreateString("canvas"));
  });
  b.Add(Command_InsertNode, [](flatbuffers::FlatBufferBuilder &f) {
    return skityrt::CreateInsertNode(f, 2, 1, 0, f.CreateString("rect"));
  });
  return b.Finish();
}

// A nested MultiPaintList blob: a red fill pass (half opacity, plus blend
// mode) followed by a wide white stroke pass with dashes.
std::vector<uint8_t> MakeMultiPaintListBlob() {
  flatbuffers::FlatBufferBuilder f;
  auto dash = f.CreateVector(std::vector<float>{6.f, 4.f});
  PaintPassBuilder p0(f);
  p0.add_style(PaintSlot_FILL);
  p0.add_type(1); // COLOR
  p0.add_color(0xffff0000);
  p0.add_opacity(0.5f);
  p0.add_blend_mode(BlendMode_MULTIPLY);
  auto off0 = p0.Finish();
  PaintPassBuilder p1(f);
  p1.add_style(PaintSlot_STROKE);
  p1.add_type(1);
  p1.add_color(0xffffffff);
  p1.add_stroke_width(3.f);
  p1.add_stroke_cap(LineCap_ROUND);
  p1.add_opacity(1.f);
  p1.add_stroke_dash(dash);
  auto off1 = p1.Finish();
  auto passes = f.CreateVector(std::vector<flatbuffers::Offset<PaintPass>>{off0, off1});
  MultiPaintListBuilder list(f);
  list.add_passes(passes);
  f.Finish(list.Finish());
  return std::vector<uint8_t>(f.GetBufferPointer(), f.GetBufferPointer() + f.GetSize());
}

std::vector<uint8_t> MakeSetMultiPaint(int32_t node, const std::vector<uint8_t> &blob) {
  BatchBuilder b;
  b.Add(Command_SetMultiPaint, [&](flatbuffers::FlatBufferBuilder &f) {
    auto data = f.CreateVector(blob);
    return skityrt::CreateSetMultiPaint(f, node, data);
  });
  return b.Finish();
}

} // namespace

// @lat: [[tests#Native C++ core#Multi-pass paint]]
TEST(MultiPaintTest, InstallsPassesWithIndependentState) {
  RetainedRenderTree tree;
  auto insert = MakeTree();
  tree.ApplyCommandBatch(insert.data(), insert.size());
  const RetainedNode *node = tree.Find(2);
  ASSERT_NE(node, nullptr);
  EXPECT_TRUE(node->multi_passes.empty());
  auto version = node->paint_version;

  auto blob = MakeMultiPaintListBlob();
  auto batch = MakeSetMultiPaint(2, blob);
  tree.ApplyCommandBatch(batch.data(), batch.size());

  ASSERT_EQ(node->multi_passes.size(), 2u);
  // Pass 0: red fill, half opacity, multiply blend — the fields the
  // single-slot channel shares, made per-pass.
  const RetainedPaintPass &fill = node->multi_passes[0];
  EXPECT_FALSE(fill.stroke);
  EXPECT_EQ(fill.paint.type, 1u);
  EXPECT_EQ(fill.paint.color, 0xffff0000u);
  EXPECT_FLOAT_EQ(fill.opacity, 0.5f);
  EXPECT_EQ(fill.blend_mode, BlendMode_MULTIPLY);
  // Pass 1: white stroke, own width/cap/dash — independent stroke attrs.
  const RetainedPaintPass &stroke = node->multi_passes[1];
  EXPECT_TRUE(stroke.stroke);
  EXPECT_EQ(stroke.paint.type, 1u);
  EXPECT_EQ(stroke.paint.color, 0xffffffffu);
  EXPECT_FLOAT_EQ(stroke.stroke_width, 3.f);
  EXPECT_EQ(stroke.stroke_cap, LineCap_ROUND);
  ASSERT_NE(stroke.stroke_dash, nullptr);
  ASSERT_EQ(stroke.stroke_dash->size(), 2u);
  EXPECT_FLOAT_EQ((*stroke.stroke_dash)[0], 6.f);
  EXPECT_FLOAT_EQ((*stroke.stroke_dash)[1], 4.f);
  // Full-state write bumps the paint build-cache version.
  EXPECT_GT(node->paint_version, version);
}

// @lat: [[tests#Native C++ core#Multi-pass paint]]
TEST(MultiPaintTest, FullStateReplaceAndClear) {
  RetainedRenderTree tree;
  auto insert = MakeTree();
  tree.ApplyCommandBatch(insert.data(), insert.size());
  const RetainedNode *node = tree.Find(2);
  ASSERT_NE(node, nullptr);

  auto blob = MakeMultiPaintListBlob();
  auto batch = MakeSetMultiPaint(2, blob);
  tree.ApplyCommandBatch(batch.data(), batch.size());
  ASSERT_EQ(node->multi_passes.size(), 2u);

  // A second command REPLACES the whole list (full state, not append).
  std::vector<uint8_t> one;
  {
    flatbuffers::FlatBufferBuilder f;
    PaintPassBuilder p(f);
    p.add_style(PaintSlot_FILL);
    p.add_type(1);
    p.add_color(0xff00ff00);
    auto off = p.Finish();
    auto passes = f.CreateVector(std::vector<flatbuffers::Offset<PaintPass>>{off});
    MultiPaintListBuilder list(f);
    list.add_passes(passes);
    f.Finish(list.Finish());
    one.assign(f.GetBufferPointer(), f.GetBufferPointer() + f.GetSize());
  }
  auto replace = MakeSetMultiPaint(2, one);
  tree.ApplyCommandBatch(replace.data(), replace.size());
  ASSERT_EQ(node->multi_passes.size(), 1u);
  EXPECT_EQ(node->multi_passes[0].paint.color, 0xff00ff00u);

  // An empty payload clears — the node falls back to its single-slot paints.
  auto clear = MakeSetMultiPaint(2, {});
  tree.ApplyCommandBatch(clear.data(), clear.size());
  EXPECT_TRUE(node->multi_passes.empty());
}

// @lat: [[tests#Native C++ core#Multi-pass paint]]
TEST(MultiPaintTest, UnknownNodeIsIgnored) {
  RetainedRenderTree tree;
  auto insert = MakeTree();
  tree.ApplyCommandBatch(insert.data(), insert.size());
  auto blob = MakeMultiPaintListBlob();
  auto batch = MakeSetMultiPaint(99, blob);
  tree.ApplyCommandBatch(batch.data(), batch.size()); // no crash, no-op
  EXPECT_EQ(tree.Find(99), nullptr);
}
