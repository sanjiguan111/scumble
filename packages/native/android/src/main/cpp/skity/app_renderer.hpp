// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include <android/native_window.h>

#include <cstddef>
#include <cstdint>
#include <memory>

#include "retained_render_tree.h" // skityrt::RetainedRenderTree

namespace lynxskity {

class RenderBackend;

// Owns a RenderBackend + the retained render tree. The render thread applies
// incremental CommandBatch mutations (Step 3b retired the snapshot channel —
// the tree is the single source of truth) and draws. Single-threaded by
// contract (render thread), so the tree needs no lock.
// Mirrors Skity-Android's AppRenderer minus demo scene/MSAA.
class AppRenderer {
public:
  // backend_type: 1 = GLES (default), 2 = Vulkan.
  // shared_gl_handle: handle to a SharedGLContext (GL only; 0 for Vulkan).
  explicit AppRenderer(int backend_type, int64_t shared_gl_handle, float density);
  ~AppRenderer();

  void SetNativeWindow(ANativeWindow *native_window);
  void OnSurfaceCreated();
  void OnSurfaceDestroyed();
  void OnSurfaceChanged(int width, int height);
  void DrawFrame();

  // Phase 2: apply an incremental CommandBatch to the retained tree (the only
  // mutation path now — Step 3b retired the snapshot channel).
  void ApplyCommands(const uint8_t *data, std::size_t size);

  // <Paragraph>: apply a ParagraphRunList snapshot (glyph runs keyed by node
  // id) to the retained tree. Call after the batch of the same flush — the
  // runs reference nodes the batch inserts.
  void ApplyParagraphRuns(const uint8_t *data, std::size_t size);

  // Native animation: interpolate the tree's tracks to `now_ns` (a vsync frame
  // timestamp). True while anything is live — the driver redraws on true and
  // stops when every session goes idle (ANIMATION_DESIGN.md D4).
  bool TickAnimations(uint64_t now_ns);

private:
  std::unique_ptr<RenderBackend> backend_;
  skityrt::RetainedRenderTree retained_tree_;
  float density_ = 1.f;
};

} // namespace lynxskity
