// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#pragma once

namespace lynxskity {

// Resolves a GL function pointer for skity's GLES backend: EGL first, then the
// global symbol table, then libGLESv3/libGLESv2. Mirrors Skity-Android's
// gl_proc_resolver.
void* ResolveGLProcAddress(const char* name);

}  // namespace lynxskity
