// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

#include <EGL/egl.h>

#include <memory>

#include <skity/gpu/gpu_context_gl.hpp>

namespace lynxskity {

// Shared EGL display/context/config + skity GPUContext for the GL backend.
// Owned by the Kotlin SkityRenderThread as a jlong handle (created/destroyed
// via JNI). All GLESRenderBackends running on that thread reuse one of these,
// avoiding both per-view EGL context creation and the thread_local slot limit.
class SharedGLContext {
public:
  EGLDisplay display = EGL_NO_DISPLAY;
  EGLConfig config = nullptr;
  EGLContext context = EGL_NO_CONTEXT;
  std::unique_ptr<skity::GPUContext> skity_context;

  // Creates the EGL display/context + binds skity's GL context. Returns false
  // on failure (in which case the object should be deleted).
  bool Init();

  ~SharedGLContext();
};

} // namespace lynxskity
