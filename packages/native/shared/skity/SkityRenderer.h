// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// SkityRenderer: translates a RenderTree FlatBuffer (namespace `skityrt`) into
// skity (Skia-like) Canvas calls. This is the cross-platform C++ consumption
// point for the FlatBuffer data produced by the platform ShadowNode layer.
//
// It is the skity counterpart of lynx-native-svg's TreeRenderer.kt, which
// renders the same kind of RenderTree onto android.graphics.Canvas. Keeping the
// RenderTree schema platform-independent means Android and iOS share a single
// renderer implementation here; only the surface that owns the skity::Canvas
// differs per platform.
#ifndef SKITY_RENDERER_H_
#define SKITY_RENDERER_H_

#include <skity/skity.hpp>

#include "render_tree_generated.h" // namespace skityrt (FlatBuffers generated)

namespace skityrt {

class SkityRenderer {
public:
  // Draw `tree` onto `canvas`. `density` scales logical dp units to pixels.
  // `canvasWidth`/`canvasHeight` are the surface size in physical pixels, used
  // to apply the RenderTree viewport (logical → physical) transform; both are
  // required (no defaults) so every backend call site supplies them.
  static void Draw(const RenderTree *tree, ::skity::Canvas *canvas, float density,
                   float canvasWidth, float canvasHeight);
};

} // namespace skityrt

#endif // SKITY_RENDERER_H_
