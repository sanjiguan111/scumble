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

// Owns a RenderBackend + the retained render tree reconciled from RenderTree
// snapshots pushed from the Lynx ShadowNode layer (via JNI). The UI thread
// feeds snapshot bytes; the render thread syncs them into the retained tree and
// draws. Single-threaded by contract (render thread), so the tree needs no lock.
// Mirrors Skity-Android's AppRenderer minus demo scene/MSAA.
class AppRenderer {
public:
  // backend_type: 1 = GLES (default), 2 = Vulkan.
  // shared_gl_handle: handle to a SharedGLContext (GL only; 0 for Vulkan).
  explicit AppRenderer(int backend_type, int64_t shared_gl_handle);
  ~AppRenderer();

  void SetNativeWindow(ANativeWindow *native_window);
  void OnSurfaceCreated();
  void OnSurfaceDestroyed();
  void OnSurfaceChanged(int width, int height);
  void DrawFrame();

  // Called from the Lynx/UI thread with a serialized RenderTree snapshot.
  void SetRenderTree(const uint8_t *data, std::size_t size, float density);

private:
  std::unique_ptr<RenderBackend> backend_;
  skityrt::RetainedRenderTree retained_tree_;
  float density_ = 1.f;
};

} // namespace lynxskity
