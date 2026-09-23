// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Same LEPUS stubs as packages/react and packages/skia-compat: the vendored
// components (and the shims) import @lynx-js/react, whose runtime probes
// Lynx compile-target globals at module scope.
Object.assign(globalThis, {
  __LEPUS__: false,
  __BACKGROUND__: false,
  __JS__: true,
  __DEV__: false,
  lynx: {},
  lynxCoreInject: { tt: { _params: { initData: {} } } },
}) as unknown as Record<string, unknown>;
