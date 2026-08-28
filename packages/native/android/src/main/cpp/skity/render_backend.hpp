// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// RenderBackend: abstract GPU backend (GLES / Vulkan) for the skity canvas
// element. Mirrors Skity-Android's render_backend.hpp, minus the demo-scene
// surface; instead of SetScene it renders a retained render tree via
// ScumbleRenderer. Native-window/surface lifecycle matches Android's
// SurfaceView / GLSurfaceView callbacks.
#pragma once

#include <android/native_window.h>

#include <cstdint>

#include "retained_render_tree.h" // skityrt::RetainedRenderTree (DrawFrame)

namespace scumble {

class RenderBackend {
public:
  virtual ~RenderBackend() = default;

  // Vulkan path attaches the ANativeWindow up front; GLES ignores it (EGL is
  // owned by GLSurfaceView).
  virtual void SetNativeWindow(ANativeWindow *native_window) {}
  virtual void OnSurfaceCreated() = 0;
  virtual void OnSurfaceDestroyed() = 0;
  virtual void OnSurfaceChanged(int width, int height) = 0;

  // Render the retained tree onto a freshly acquired skity surface. Called on
  // the render thread. `density` scales logical dp → pixels inside ScumbleRenderer
  // (canvas->scale(density)).
  virtual void DrawFrame(const skityrt::RetainedRenderTree *tree, float density) = 0;
};

} // namespace scumble
