// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include "app_renderer.hpp"

#include "gles_render_backend.hpp"
#include "shared_gl_context.hpp"
#include "vulkan_render_backend.hpp"

namespace lynxskity {

namespace {
// Backend type ids (match SkityNative.kt).
constexpr int kBackendGles = 1;
constexpr int kBackendVulkan = 2;
} // namespace

AppRenderer::AppRenderer(int backend_type, int64_t shared_gl_handle) {
  // GLES reuses the SkityRenderThread-owned SharedGLContext; Vulkan manages
  // its own context.
  if (backend_type == kBackendVulkan) {
    backend_ = CreateVulkanRenderBackend();
  } else {
    auto *shared = reinterpret_cast<SharedGLContext *>(shared_gl_handle);
    backend_ = CreateGLESRenderBackend(shared);
  }
}

AppRenderer::~AppRenderer() = default;

void AppRenderer::SetNativeWindow(ANativeWindow *native_window) {
  if (backend_ != nullptr) {
    backend_->SetNativeWindow(native_window);
  }
}

void AppRenderer::OnSurfaceCreated() {
  if (backend_ != nullptr) {
    backend_->OnSurfaceCreated();
  }
}

void AppRenderer::OnSurfaceDestroyed() {
  if (backend_ != nullptr) {
    backend_->OnSurfaceDestroyed();
  }
}

void AppRenderer::OnSurfaceChanged(int width, int height) {
  if (backend_ != nullptr) {
    backend_->OnSurfaceChanged(width, height);
  }
}

void AppRenderer::DrawFrame() {
  if (backend_ == nullptr) {
    return;
  }
  std::vector<uint8_t> data;
  float density = 1.f;
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    data = render_tree_;
    density = density_;
  }
  if (data.empty()) {
    return;
  }
  backend_->DrawFrame(data.data(), data.size(), density);
}

void AppRenderer::SetRenderTree(const uint8_t *data, std::size_t size, float density) {
  if (data == nullptr || size == 0) {
    return;
  }
  std::lock_guard<std::mutex> lock(data_mutex_);
  render_tree_.assign(data, data + size);
  density_ = density;
}

} // namespace lynxskity
