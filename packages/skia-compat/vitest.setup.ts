// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Same LEPUS stubs as packages/react's vitest.setup.ts: @lynx-js/react's
// runtime probes Lynx compile-target globals at module scope, and the
// @scumble/react components this package wraps import it — the stubs keep
// every probe on its "plain JS" branch so components can be imported and
// called directly under Node.
Object.assign(globalThis, {
  __LEPUS__: false,
  __BACKGROUND__: false,
  __JS__: true,
  __DEV__: false,
  lynx: {},
  lynxCoreInject: { tt: { _params: { initData: {} } } },
}) as unknown as Record<string, unknown>;
