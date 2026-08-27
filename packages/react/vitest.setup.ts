// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// The shapes import `forwardRef` from @lynx-js/react, whose runtime probes
// Lynx's compile-target globals at module scope. Node has none of them; the
// stubs below satisfy the probes so components can be imported and their
// render functions called directly, without a Lynx engine:
//   - __LEPUS__/__BACKGROUND__/__JS__: thread-target markers (runtime-backend
//     registration and lane selection). Claiming the JS/foreground side keeps
//     every probe on its "plain JS" branch.
//   - __DEV__: invariant/assert branches.
//   - lynx: feature-flag reads get a bare object (no engine behavior).
Object.assign(globalThis, {
  __LEPUS__: false,
  __BACKGROUND__: false,
  __JS__: true,
  __DEV__: false,
  lynx: {},
  // Snapshot backend's event table — `tt._params.initData` is destructured at
  // module init; deeper paths only run when components publish events (never
  // in these tests).
  lynxCoreInject: { tt: { _params: { initData: {} } } },
}) as unknown as Record<string, unknown>;
