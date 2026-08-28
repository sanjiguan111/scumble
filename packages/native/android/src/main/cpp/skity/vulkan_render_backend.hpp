// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include "render_backend.hpp"

#include <android/native_window.h>
#include <vulkan/vulkan.h>

#include <memory>

#include <skity/gpu/gpu_context_vk.hpp>
#include <skity/gpu/gpu_presenter.hpp>

namespace scumble {

// Vulkan backend: creates a skity GPUContextVK + a GPUNativeWindowVK bound to
// the host TextureView's ANativeWindow, and renders the retained tree via the
// presenter (AcquireNextSurface → LockCanvas → ScumbleRenderer → Present). All
// Vulkan state is thread-local, so this backend must be driven from a single
// render thread (ScumbleVulkanRenderThread, separate from the GL thread).
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
  void DrawFrame(const skityrt::RetainedRenderTree *tree, float density) override;

private:
  bool EnsureContext();
  bool EnsureNativeWindow();
  void ResetNativeWindow();

  ANativeWindow *native_window_handle_ = nullptr;
  uint32_t width_ = 0;
  uint32_t height_ = 0;
  // Reference into the process-wide shared Vulkan context (see
  // vulkan_render_backend.cc) — one logical device per process, not per
  // canvas; released when the last backend goes away.
  std::shared_ptr<skity::GPUContext> context_;
  std::unique_ptr<skity::GPUNativeWindowVK> native_window_;
  VkPresentModeKHR present_mode_ = VK_PRESENT_MODE_MAILBOX_KHR;
  uint32_t min_image_count_ = 2;
};

std::unique_ptr<RenderBackend> CreateVulkanRenderBackend();

} // namespace scumble
