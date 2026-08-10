// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include <android/native_window.h>

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

namespace lynxskity {

class RenderBackend;

// Owns a RenderBackend + the latest RenderTree bytes pushed from the Lynx
// ShadowNode layer (via JNI). The UI thread updates the bytes; the render
// thread reads them in DrawFrame(). Mirrors Skity-Android's AppRenderer, minus
// demo scene/MSAA, plus a thread-safe RenderTree slot.
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

  // Called from the Lynx/UI thread with the serialized RenderTree.
  void SetRenderTree(const uint8_t *data, std::size_t size, float density);

private:
  std::unique_ptr<RenderBackend> backend_;
  std::mutex data_mutex_;
  std::vector<uint8_t> render_tree_;
  float density_ = 1.f;
};

} // namespace lynxskity
