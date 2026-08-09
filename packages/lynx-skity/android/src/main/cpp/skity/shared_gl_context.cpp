// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include "shared_gl_context.hpp"

#include <GLES3/gl3.h>

#include "gl_proc_resolver.hpp"

namespace lynxskity {

bool SharedGLContext::Init() {
  if (display != EGL_NO_DISPLAY) {
    return true; // already initialized
  }

  display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  if (display == EGL_NO_DISPLAY) {
    return false;
  }

  EGLint major = 0, minor = 0;
  if (!eglInitialize(display, &major, &minor)) {
    display = EGL_NO_DISPLAY;
    return false;
  }

  EGLint config_attribs[] = {EGL_RENDERABLE_TYPE,
                             EGL_OPENGL_ES3_BIT,
                             EGL_RED_SIZE,
                             8,
                             EGL_GREEN_SIZE,
                             8,
                             EGL_BLUE_SIZE,
                             8,
                             EGL_ALPHA_SIZE,
                             8,
                             EGL_SURFACE_TYPE,
                             EGL_WINDOW_BIT,
                             EGL_NONE};
  EGLint num_configs = 0;
  if (!eglChooseConfig(display, config_attribs, &config, 1, &num_configs) || num_configs < 1) {
    return false;
  }

  EGLint ctx_attribs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
  context = eglCreateContext(display, config, EGL_NO_CONTEXT, ctx_attribs);
  if (context == EGL_NO_CONTEXT) {
    return false;
  }

  // Make current with no surface so skity can resolve/bind GL functions.
  eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, context);
  skity_context = skity::GLContextCreate(reinterpret_cast<void *>(&ResolveGLProcAddress));
  return skity_context != nullptr;
}

SharedGLContext::~SharedGLContext() {
  if (display == EGL_NO_DISPLAY) {
    return;
  }
  eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  skity_context.reset();
  if (context != EGL_NO_CONTEXT) {
    eglDestroyContext(display, context);
  }
  eglTerminate(display);
}

} // namespace lynxskity
