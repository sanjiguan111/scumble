// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include "vulkan_render_backend.hpp"

#include <vulkan/vulkan.h>

#include <skity/gpu/gpu_context_vk.hpp>
#include <skity/gpu/gpu_presenter.hpp>
#include <skity/render/canvas.hpp>

#include "ScumbleRenderer.h" // scumble cross-platform renderer (RetainedRenderTree)

namespace scumble {

namespace {

// Process-wide shared Vulkan GPUContext — mirrors the GL side's
// SharedGLContext, as a refcounted C++ singleton instead of a Kotlin-held
// handle. Every Vulkan session runs on the single SkityVulkanRenderThread,
// so create/teardown stay single-threaded: first use builds the instance +
// logical device, the last released backend tears it down. One device for
// the whole process instead of one per canvas (per-canvas devices multiply
// driver memory and were implicated in GPU exhaustion on repeated page
// churn).
std::shared_ptr<skity::GPUContext> &SharedVKContext() {
  static std::shared_ptr<skity::GPUContext> context;
  return context;
}

} // namespace

std::unique_ptr<RenderBackend> CreateVulkanRenderBackend() {
  return std::make_unique<VulkanRenderBackend>();
}

VulkanRenderBackend::VulkanRenderBackend() = default;

VulkanRenderBackend::~VulkanRenderBackend() {
  ResetNativeWindow();
}

void VulkanRenderBackend::SetNativeWindow(ANativeWindow *native_window) {
  if (native_window_handle_ == native_window) {
    return;
  }
  ResetNativeWindow();
  // `native_window` is already acquired by the JNI bridge
  // (ANativeWindow_fromSurface); store the reference as-is.
  native_window_handle_ = native_window;
}

bool VulkanRenderBackend::EnsureContext() {
  if (context_ != nullptr) {
    return true;
  }
  std::shared_ptr<skity::GPUContext> &shared = SharedVKContext();
  if (shared == nullptr) {
    skity::GPUContextInfoVK context_info = {};
    context_info.get_instance_proc_addr = vkGetInstanceProcAddr;
    context_info.enable_debug_runtime = false; // MVP: no validation
    shared = skity::CreateGPUContextVK(&context_info);
  }
  // Adopt a reference; releasing the last backend releases the device.
  context_ = shared;
  return context_ != nullptr;
}

bool VulkanRenderBackend::EnsureNativeWindow() {
  if (native_window_ != nullptr) {
    return true;
  }
  if (native_window_handle_ == nullptr || width_ == 0 || height_ == 0 || !EnsureContext()) {
    return false;
  }
  skity::GPUNativeWindowInfoVK info = {};
  info.native_window.type = skity::VKNativeWindowType::kAndroid;
  info.native_window.handle = native_window_handle_;
  info.width = width_;
  info.height = height_;
  info.present_mode = present_mode_;
  info.min_image_count = min_image_count_;
  native_window_ = skity::CreateGPUNativeWindowVK(context_.get(), &info);
  return native_window_ != nullptr;
}

void VulkanRenderBackend::ResetNativeWindow() {
  native_window_.reset();
  if (native_window_handle_ != nullptr) {
    ANativeWindow_release(native_window_handle_);
    native_window_handle_ = nullptr;
  }
}

void VulkanRenderBackend::OnSurfaceCreated() {
  EnsureContext();
  EnsureNativeWindow();
}

void VulkanRenderBackend::OnSurfaceDestroyed() {
  ResetNativeWindow();
}

void VulkanRenderBackend::OnSurfaceChanged(int width, int height) {
  width_ = static_cast<uint32_t>(width);
  height_ = static_cast<uint32_t>(height);
  if (native_window_ != nullptr) {
    native_window_->Resize(width_, height_);
    return;
  }
  EnsureNativeWindow();
}

void VulkanRenderBackend::DrawFrame(const skityrt::RetainedRenderTree *tree, float density) {
  if (tree == nullptr) {
    return;
  }
  if (!EnsureNativeWindow()) {
    return;
  }
  auto *presenter = native_window_->GetPresenter();
  if (presenter == nullptr) {
    return;
  }

  skity::GPUSurfaceAcquireDescriptor acquire_desc = {};
  acquire_desc.sample_count = 1;
  acquire_desc.content_scale = 1.f;
  auto acquire_result = presenter->AcquireNextSurface(acquire_desc);
  if (acquire_result.status == skity::GPUPresenterStatus::kNeedRecreate) {
    native_window_->Resize(width_, height_);
    return;
  }
  if (acquire_result.status != skity::GPUPresenterStatus::kSuccess ||
      acquire_result.surface == nullptr) {
    return;
  }

  auto surface = std::move(acquire_result.surface);
  auto *canvas = surface->LockCanvas(true);
  if (canvas == nullptr) {
    return;
  }

  skityrt::ScumbleRenderer::Draw(tree, canvas, density, static_cast<float>(width_),
                               static_cast<float>(height_), context_.get());

  canvas->Flush();
  surface->Flush();

  const auto present_result = presenter->Present(std::move(surface));
  if (present_result == skity::GPUPresenterStatus::kNeedRecreate) {
    native_window_->Resize(width_, height_);
  }
}

} // namespace scumble
