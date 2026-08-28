// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

namespace scumble {

// Resolves a GL function pointer for skity's GLES backend: EGL first, then the
// global symbol table, then libGLESv3/libGLESv2. Mirrors Skity-Android's
// gl_proc_resolver.
void *ResolveGLProcAddress(const char *name);

} // namespace scumble
