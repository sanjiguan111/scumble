// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// SkityRenderer: translates a retained render tree (RetainedRenderTree) into
// skity (Skia-like) Canvas calls. The retained tree is reconciled on the render
// thread from RenderTree snapshots + incremental CommandBatch mutations (Phase
// 2). Keeping the tree platform-independent means Android and iOS share a single
// renderer implementation here; only the surface that owns the skity::Canvas
// differs per platform.
#ifndef SKITY_RENDERER_H_
#define SKITY_RENDERER_H_

#include <skity/skity.hpp>

#include "retained_render_tree.h" // namespace skityrt (RetainedRenderTree)

namespace skityrt {

class SkityRenderer {
public:
  // Draw `tree` onto `canvas`. `density` scales logical dp units to pixels.
  // `canvasWidth`/`canvasHeight` are the surface size in physical pixels, used
  // to apply the viewport (logical → physical) transform; both are required so
  // every backend call site supplies them. `gpu_context` is the calling
  // backend's live GPU context — required to materialize ImageStore bitmaps
  // (image nodes); callers that never draw images may pass nullptr.
  static void Draw(const RetainedRenderTree *tree, ::skity::Canvas *canvas, float density,
                   float canvasWidth, float canvasHeight,
                   ::skity::GPUContext *gpu_context = nullptr);
};

} // namespace skityrt

#endif // SKITY_RENDERER_H_
