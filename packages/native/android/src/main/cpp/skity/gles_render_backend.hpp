// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include "render_backend.hpp"

#include <EGL/egl.h>
#include <android/native_window.h>

#include <memory>

namespace scumble {

class SharedGLContext; // forward declare; defined in shared_gl_context.hpp

// GLES backend. Reuses a thread-shared [SharedGLContext] (EGL display/context
// + skity GPUContext, owned by the Kotlin ScumbleRenderThread); each backend owns
// only its own EGL window surface (one per TextureView) and makes the shared
// context current on it before drawing.
class GLESRenderBackend : public RenderBackend {
public:
  explicit GLESRenderBackend(SharedGLContext *shared);
  ~GLESRenderBackend() override;

  void SetNativeWindow(ANativeWindow *native_window) override;
  void OnSurfaceCreated() override;
  void OnSurfaceDestroyed() override;
  void OnSurfaceChanged(int width, int height) override;
  void DrawFrame(const skityrt::RetainedRenderTree *tree, float density) override;

private:
  bool InitSurface();
  void DestroySurface();

  SharedGLContext *shared_ = nullptr; // not owned (ScumbleRenderThread owns)
  ANativeWindow *native_window_ = nullptr;
  EGLSurface egl_surface_ = EGL_NO_SURFACE; // per-view window surface
  int width_ = 0;
  int height_ = 0;
};

// `shared` may be null (then InitSurface fails); the caller (app_renderer)
// passes the ScumbleRenderThread-owned SharedGLContext.
std::unique_ptr<RenderBackend> CreateGLESRenderBackend(SharedGLContext *shared);

} // namespace scumble
