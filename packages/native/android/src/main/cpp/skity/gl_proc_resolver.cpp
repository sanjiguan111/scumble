// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include "gl_proc_resolver.hpp"

#include <EGL/egl.h>
#include <dlfcn.h>

namespace lynxskity {

void *ResolveGLProcAddress(const char *name) {
  if (name == nullptr) {
    return nullptr;
  }

  if (void *proc = reinterpret_cast<void *>(eglGetProcAddress(name)); proc != nullptr) {
    return proc;
  }

  if (void *proc = dlsym(RTLD_DEFAULT, name); proc != nullptr) {
    return proc;
  }

  static void *gles3 = dlopen("libGLESv3.so", RTLD_NOW | RTLD_LOCAL);
  if (gles3 != nullptr) {
    if (void *proc = dlsym(gles3, name); proc != nullptr) {
      return proc;
    }
  }

  static void *gles2 = dlopen("libGLESv2.so", RTLD_NOW | RTLD_LOCAL);
  return gles2 != nullptr ? dlsym(gles2, name) : nullptr;
}

} // namespace lynxskity
