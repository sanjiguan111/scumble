// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include "render_backend.hpp"

#include <android/native_window.h>
#include <vulkan/vulkan.h>

#include <memory>

#include <skity/gpu/gpu_context_vk.hpp>
#include <skity/gpu/gpu_presenter.hpp>

namespace lynxskity {

// Vulkan backend: creates a skity GPUContextVK + a GPUNativeWindowVK bound to
// the host TextureView's ANativeWindow, and renders a RenderTree via the
// presenter (AcquireNextSurface → LockCanvas → SkityRenderer → Present). All
// Vulkan state is thread-local, so this backend must be driven from a single
// render thread (SkityVulkanRenderThread, separate from the GL thread).
//
// MVP defaults: no validation, FIFO present mode, double-buffer. Mirrors
// Skity-Android's VulkanRenderBackend minus the demo/diagnostics surface.
class VulkanRenderBackend : public RenderBackend {
public:
  VulkanRenderBackend();
  ~VulkanRenderBackend() override;

  void SetNativeWindow(ANativeWindow *native_window) override;
  void OnSurfaceCreated() override;
  void OnSurfaceDestroyed() override;
  void OnSurfaceChanged(int width, int height) override;
  void DrawFrame(const uint8_t *data, std::size_t size, float density) override;

private:
  bool EnsureContext();
  bool EnsureNativeWindow();
  void ResetNativeWindow();

  ANativeWindow *native_window_handle_ = nullptr;
  uint32_t width_ = 0;
  uint32_t height_ = 0;
  std::unique_ptr<skity::GPUContext> context_;
  std::unique_ptr<skity::GPUNativeWindowVK> native_window_;
  VkPresentModeKHR present_mode_ = VK_PRESENT_MODE_FIFO_KHR;
  uint32_t min_image_count_ = 2;
};

std::unique_ptr<RenderBackend> CreateVulkanRenderBackend();

} // namespace lynxskity
