# Native integration

This page is for contributors: how `@scumble/native` is packaged as a Lynx
library, how the intrinsic tags, the NAPI addon, and the FlatBuffer schema are
declared and generated, and how to build both platforms from source. Nothing
here is needed to _use_ scumble — see [installation](/guide/installation) for
that.

## Lynx library anatomy

A Lynx library is an npm package that the host app's Lynx runtime discovers
and integrates automatically (autolink). The manifest is
[`lynx.lib.json`](https://github.com/sanjiguan111/scumble/blob/main/packages/native/lynx.lib.json),
which declares each platform:

| Platform | Entry                                                     | What it points at                                                                                                                                                           |
| -------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android  | `packageName: com.scumble.graphics`, `sourceDir: android` | The Gradle library module: Kotlin shadow nodes and views, CMake-built native renderer (`libscumblerender.so`), prefab consumption of skity and a statically linked HarfBuzz |
| iOS      | `podspecPath: scumble.podspec`                            | The CocoaPods pod: Objective-C++/C++ shadow nodes and views under `ios/Classes`, compiling the shared C++ core alongside them                                               |
| Harmony  | `packageDir: harmony`                                     | An hvigor module scaffold (`LynxLibraryProviderImpl.ets`)                                                                                                                   |

The podspec lives at the package root — not under `ios/` — because
CocoaPods only compiles source files inside the podspec's own directory, and
the pod must reach `shared/skity/**` (the cross-platform C++ core) next to
the iOS-specific code. Android builds the same core through
`android/CMakeLists.txt`; both platforms compile `ScumbleRenderer`,
the retained tree, the animation engine, and the caches from the identical
sources.

## The intrinsic tag contract

The framework-agnostic layer of the library is a set of **intrinsic tags**:
`<scumble-canvas>`, `<scumble-rect>`, `<scumble-circle>`,
`<scumble-ellipse>`, `<scumble-line>`, `<scumble-path>`,
`<scumble-polyline>`, `<scumble-polygon>`, `<scumble-group>`,
`<scumble-image>`, and `<scumble-paragraph>`. Their props are the wire
contract described in the [overview](/architecture/overview): numeric colors
and geometry, byte-valued enums, and base64 nested FlatBuffers for
variable-length data.

- `src/elements.ts` augments `@lynx-js/types`' `IntrinsicElements` via
  `declare module`, so importing `@scumble/native` (or
  `@scumble/native/elements`) makes the tags typed in JSX. No React
  components are exported here — the [`@scumble/react`](/guide/introduction)
  layer is a separate package that normalizes friendly props onto these tags.
- Tags are registered natively per platform: on Android through the library's
  behavior/init classes (with `@LynxProp` setters processed by **kapt** —
  `annotationProcessor` only scans Java, so Kotlin setters silently disappear
  without it); on iOS through the canvas shadow node classes under
  `ios/Classes/Node/`.

### Where things live

| Path in `packages/native`              | Contents                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `schema/*.fbs`                         | The `skityrt` FlatBuffer schema (see below)                                                                                 |
| `scripts/generate-fbs.mjs`             | FlatBuffer stub generation                                                                                                  |
| `shared/skity/`                        | Cross-platform C++: renderer, retained tree, command application, animation engine, easing, render cache, image/font stores |
| `shared/nativeModule/`                 | The NAPI addon's C++ implementation (user-owned, see below)                                                                 |
| `android/`, `ios/Classes/`, `harmony/` | Platform glue: shadow nodes, views, render threads, loaders                                                                 |
| `src/`, `types/`, `generated/`         | JS-side tag typings, addon typings, codegen output                                                                          |

## The NAPI addon module

Alongside the tag contract, the package declares a Node-API addon named
`ScumbleModule`:

- `types/napi-native-module.d.ts` declares the module's class with the
  `@lynxmodule` annotation — this typing file is the source of truth.
- `pnpm --filter @scumble/native codegen` (Lynx's `lynx-autolink-codegen`)
  generates the JS specs into `generated/` plus the C++ facade and
  registration files.
- `shared/nativeModule/ScumbleModule.cc` is **user-owned**: codegen creates it
  once and preserves it on later runs, so the callback implementations are
  yours to maintain. After changing the typings, re-run codegen and sync the
  callbacks manually — codegen never deletes or rewrites user-owned files.
- Importing the package root in BTS installs the generated
  `NativeModules.ScumbleModule` shim on the mobile runtimes.

The addon is declared `required: false` in `lynx.lib.json` — the rendering
pipeline does not depend on it. All rendering data crosses through component
props; on the public Android SDK the NAPI environment is unavailable anyway
(see [animation engine](/architecture/animation-engine) for how playback
control avoids it).

## The FlatBuffer schema

All wire structures live in `packages/native/schema/` under the `skityrt`
namespace:

| File                     | Contents                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `render_tree_common.fbs` | Shared enums: line cap/join, fill rule, blend modes, box fit, tile modes…                         |
| `render_tree_style.fbs`  | Style payloads: path command lists, transform op lists, gradients, filters, animation tracks      |
| `render_tree.fbs`        | Node and tree tables, viewport                                                                    |
| `command_batch.fbs`      | The `Command` union and `CommandBatch` (see the [render pipeline](/architecture/render-pipeline)) |
| `paragraph_runs.fbs`     | Glyph-run payloads produced natively by the text backends                                         |

Run:

```bash
pnpm --filter @scumble/native generate-fbs
```

This invokes `flatc` and emits C++ stubs (`shared/skity/generated/` — reused
directly by the iOS pod), Java stubs (`android/…/fbs-gen/`), and TypeScript
stubs (`packages/graphics/src/generated/`, where the vendored flatbuffers TS
runtime also lands). Regenerate after any `.fbs` change — the stubs are
generated, not committed.

Two schema conventions worth knowing when extending it:

- **Enum value order matches skity exactly** wherever the renderer casts a
  byte straight through (blend modes, tile modes, blur styles) — check skity's
  ordering before adding values.
- **The `Command` union appends at the tail** — union member order is wire
  order, so new commands must not be inserted before existing ones.

## Habitat dependencies

Native build dependencies are managed by
[`DEPS.py`](https://github.com/sanjiguan111/scumble/blob/main/DEPS.py) with the
Lynx ecosystem's **habitat** tool (`tools/hab sync` on Unix, `tools/hab.ps1`
on Windows). It fetches, into `packages/native/shared/third_party/`
(git-ignored):

- **flatc** — the pinned FlatBuffer compiler binary. The version must match
  the TS runtime exactly, which is also why the flatbuffers TypeScript
  runtime is vendored from the habitat source rather than taken from npm.
- **flatbuffers** — the header-only C++ runtime at the matching tag.
- **googletest** — for the host-side C++ tests of the shared layer; test-only,
  never compiled into a shipping library.
- **SheenBidi** — the UAX #9 implementation for the Android paragraph backend
  (iOS uses CoreText's built-in BiDi).

Consumers of the npm package never run `hab sync` themselves — the shipped
sources that habitat provides to the build (SheenBidi, the flatbuffers
headers) are listed in the package `files` so they travel with the package.

## Conventions for prop setters

When adding or changing a native prop, the existing setters establish the
rules:

- `@LynxProp` setters marshal `NSNumber` / `NSString` / `NSArray` only —
  never binary. Variable-length data goes in as a base64 string, decodes, and
  is **memcpy'd into the FlatBuffer vector** with no parsing (the
  "native never parses strings" rule from the
  [overview](/architecture/overview)).
- Every setter records a dirty bit and calls `markDirty()` (Android) /
  `setNeedsLayout()` (iOS) — the Lynx layout pass is the flush point that
  drains pending commands, so a setter that skips it never reaches the render
  tree.
- Be aware of a marshaling asymmetry: an undefined number prop arrives as `0`
  on Android but is dropped entirely on iOS — filter `undefined` values in
  the JS layer rather than relying on either behavior.
- Friendly enum strings are resolved in JS; the native setter receives a
  number.

## Building from source

```bash
pnpm install                 # workspace deps
tools/hab sync               # fetch flatc + runtime, googletest, sheenbidi
pnpm --filter @scumble/native generate-fbs   # FlatBuffer stubs (C++/Java/TS)
pnpm --filter @scumble/graphics build        # graphics dist (tsc)
```

Then run the example app against a booted simulator or connected device:

```bash
pnpm --filter scumble-example ios       # scripts/run-ios.mjs
pnpm --filter scumble-example android   # scripts/run-android.mjs
```

Platform notes:

- **iOS** needs Ruby ≥ 3.0 for CocoaPods (`mise` provides 3.4.9), and a
  `pod install` after touching pod sources — new files and methods only exist
  in the build after it.
- **Android** hosts pick one copy of `libskity.so` at merge time
  (`packaging { jniLibs { pickFirsts += setOf("**/libskity.so") } }`), since
  AGP duplicates the prefab runtime into the library AAR next to the copy the
  skity AAR already ships.
- Host-side C++ tests for the shared layer (line breaker, easing, animation
  engine) run with `pnpm --filter @scumble/native test:native`.

## Further reading

- [`packages/native/README.md`](https://github.com/sanjiguan111/scumble/blob/main/packages/native/README.md)
  — the package's own contributor notes (codegen, NAPI module)
- [`lynx.lib.json`](https://github.com/sanjiguan111/scumble/blob/main/packages/native/lynx.lib.json)
  and [`DEPS.py`](https://github.com/sanjiguan111/scumble/blob/main/DEPS.py) —
  the autolink manifest and habitat dependency list
- [RENDER_ARCHITECTURE.md](https://github.com/sanjiguan111/scumble/blob/main/packages/native/RENDER_ARCHITECTURE.md)
  — key file index and the full design
- [Architecture overview](/architecture/overview) — how the layers fit
  together
