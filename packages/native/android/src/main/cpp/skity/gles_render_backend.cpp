// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include "gles_render_backend.hpp"

#include <GLES3/gl3.h>

#include <skity/gpu/gpu_context_gl.hpp>
#include <skity/gpu/gpu_surface.hpp>

#include "ScumbleRenderer.h" // scumble cross-platform renderer (RetainedRenderTree)
#include "shared_gl_context.hpp"

namespace scumble {

std::unique_ptr<RenderBackend> CreateGLESRenderBackend(SharedGLContext *shared) {
  return std::make_unique<GLESRenderBackend>(shared);
}

GLESRenderBackend::GLESRenderBackend(SharedGLContext *shared) : shared_(shared) {}

GLESRenderBackend::~GLESRenderBackend() {
  DestroySurface();
  if (native_window_ != nullptr) {
    ANativeWindow_release(native_window_);
    native_window_ = nullptr;
  }
}

void GLESRenderBackend::SetNativeWindow(ANativeWindow *native_window) {
  if (native_window_ == native_window) {
    return;
  }
  DestroySurface();
  if (native_window_ != nullptr) {
    ANativeWindow_release(native_window_);
  }
  // `native_window` is already acquired by the JNI bridge
  // (ANativeWindow_fromSurface); store the reference as-is.
  native_window_ = native_window;
}

bool GLESRenderBackend::InitSurface() {
  if (egl_surface_ != EGL_NO_SURFACE) {
    return true; // this view's surface already created
  }
  if (native_window_ == nullptr || shared_ == nullptr || shared_->skity_context == nullptr ||
      shared_->display == EGL_NO_DISPLAY) {
    return false;
  }
  // Per-view window surface on the shared EGL display/config.
  egl_surface_ = eglCreateWindowSurface(shared_->display, shared_->config, native_window_, nullptr);
  if (egl_surface_ == EGL_NO_SURFACE) {
    return false;
  }
  return eglMakeCurrent(shared_->display, egl_surface_, egl_surface_, shared_->context);
}

void GLESRenderBackend::DestroySurface() {
  if (shared_ != nullptr && shared_->display != EGL_NO_DISPLAY) {
    eglMakeCurrent(shared_->display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  }
  if (shared_ != nullptr && shared_->display != EGL_NO_DISPLAY && egl_surface_ != EGL_NO_SURFACE) {
    eglDestroySurface(shared_->display, egl_surface_);
  }
  egl_surface_ = EGL_NO_SURFACE;
  // shared_ (display/context/skity_context) is owned by ScumbleRenderThread,
  // not destroyed here.
}

void GLESRenderBackend::OnSurfaceCreated() {
  // Create this view's window surface on the shared EGL context.
  InitSurface();
}

void GLESRenderBackend::OnSurfaceDestroyed() {
  DestroySurface();
  width_ = 0;
  height_ = 0;
}

void GLESRenderBackend::OnSurfaceChanged(int width, int height) {
  width_ = width;
  height_ = height;
}

void GLESRenderBackend::DrawFrame(const skityrt::RetainedRenderTree *tree, float density) {
  if (width_ <= 0 || height_ <= 0 || shared_ == nullptr || shared_->skity_context == nullptr ||
      egl_surface_ == EGL_NO_SURFACE || tree == nullptr) {
    return;
  }

  // Make the shared context current on this view's surface.
  eglMakeCurrent(shared_->display, egl_surface_, egl_surface_, shared_->context);

  skity::GPUSurfaceDescriptorGL surface_desc{};
  surface_desc.backend = skity::GPUBackendType::kOpenGL;
  surface_desc.width = static_cast<uint32_t>(width_);
  surface_desc.height = static_cast<uint32_t>(height_);
  surface_desc.content_scale = 1.0f;
  // 4x MSAA (GLES3 guarantees GL_MAX_SAMPLES >= 4). With
  // GL_EXT_multisampled_render_to_texture (standard on tile-based Android
  // GPUs) the multisampled attachment is a zero-allocation placeholder and
  // the driver resolves in tile memory; otherwise skity falls back to a
  // multisample renderbuffer + resolve. MSAA forces the offscreen
  // kDrawTexture path, which this surface already uses (no stencil on the
  // default framebuffer), so the present pipeline is unchanged.
  surface_desc.sample_count = 4;
  surface_desc.surface_type = skity::GLSurfaceType::kFramebuffer;
  surface_desc.gl_id = 0;
  surface_desc.has_stencil_attachment = false;
  surface_desc.can_blit_from_target_fbo = false;

  auto surface = shared_->skity_context->CreateSurface(&surface_desc);
  if (surface == nullptr) {
    return;
  }

  auto *canvas = surface->LockCanvas(true);
  if (canvas == nullptr) {
    return;
  }

  glClearColor(0.f, 0.f, 0.f, 0.f);
  glClear(GL_COLOR_BUFFER_BIT);

  // The shared GL context is passed so image nodes can materialize ImageStore
  // bitmaps on this backend (Image::MakeImage needs a live context).
  skityrt::ScumbleRenderer::Draw(tree, canvas, density, static_cast<float>(width_),
                               static_cast<float>(height_), shared_->skity_context.get());

  canvas->Flush();
  surface->Flush();

  // Present this view's window surface (the TextureView).
  eglSwapBuffers(shared_->display, egl_surface_);
}

} // namespace scumble
