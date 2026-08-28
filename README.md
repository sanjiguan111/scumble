# scumble

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-5b8cff.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS-2dd4bf.svg)](#architecture)
[![Docs](https://img.shields.io/badge/docs-sanjiguan111.github.io%2Fscumble-7683b3.svg)](https://sanjiguan111.github.io/scumble)
[![Deploy website](https://github.com/sanjiguan111/scumble/actions/workflows/deploy-website.yml/badge.svg)](https://github.com/sanjiguan111/scumble/actions/workflows/deploy-website.yml)

A 2D graphics library for [Lynx](https://lynxjs.org/), powered by the
**[skity](https://github.com/lynx-family/skity)** GPU
backend (Android OpenGL ES / Vulkan, iOS Metal). It brings a declarative drawing
API to Lynx, with the native side reduced to a thin memcpy over a FlatBuffer
render tree:

```tsx
import { Canvas, Rect, createAnimation } from "@scumble/react";

const spin = createAnimation({
  property: "rotate",
  from: 0,
  to: 360,
  duration: 3000,
  iterations: Infinity, // interpolated on the render thread — zero JS per frame
});

<Canvas style={{ width: "100%", height: 200 }}>
  <Rect x={60} y={60} width={80} height={80} color="#f59e0b" animate={spin} />
</Canvas>;
```

> 🌐 Documentation: <https://sanjiguan111.github.io/scumble> — guides, API
> reference, and architecture notes, built with VitePress from
> [`packages/website`](packages/website).

## Features

- **Declarative React API** — 11 shape components (`Circle`, `Rect`, `RRect`, `Ellipse`,
  `Line`, `Polyline`, `Polygon`, `Points`, `Path`, `Image`, `Paragraph`) plus `Group`
  with paint inheritance and declarative clips.
- **Native animation engine** — declarative `animate` tracks (keyframes, cubic-bezier
  easing, delay/iterations/autoReverse/fill) ride the command stream once; the render
  thread interpolates per vsync — **zero JS per frame**, stop-on-idle drivers.
  Playback control ships with it: `createAnimation().controller.{pause, play, seekTo,
cancel, onFinish}`.
- **Gradients & shaders** — linear / radial / sweep / two-point conical, as fill or
  stroke; images as paint textures (`ImageShader`) with fit/tile modes.
- **Filters** — blur, drop shadow, color matrix, color blend, mask blur, per paint slot.
- **28 blend modes**, SVG `viewBox` viewport, cascading transforms.
- **`Path2D`** — a command-style path builder like the Web Canvas one, interchangeable
  with a `d` string (full SVG command set), plus lazy boolean ops
  (`Path2D.op(a, b, "difference")`) evaluated natively at render time.
- **Text** — platform layout backends with per-span styling, gradient fills, and
  BiDi/RTL (`direction` prop, SheenBidi + fallback font runs).
- **GPU rendering** — skity backend: Android (OpenGL ES + Vulkan) and iOS (Metal),
  driven by one shared C++ renderer over a retained tree + FlatBuffer command stream.
- **Friendly values, parsed in JS** — CSS color strings, paint enums, CSS `transform`
  lists, and SVG path `d` strings are all resolved in JS; **the native side never
  parses strings.**
- **Cross-platform** — one C++ renderer (`ScumbleRenderer`) shared by Android and iOS.

## Architecture

```
@scumble/react   ─ framework wrapper (ergonomic components, friendly props)
        │
@scumble/graphics ─ pure-JS core (parseColor / parsePath / Path2D / parseTransform)
        │             produces primitive values (int / float / FlatBuffer bytes)
 @scumble/native  ─ native tag contract (<scumble-*>) + skityrt FlatBuffer schema
        │             ─── skityrt::RenderTree FlatBuffer ───
   skity GPU backend ─ Android GLES/Vulkan · iOS Metal
```

Dependency direction is a single DAG: `@scumble/react` → `@scumble/graphics` →
`@scumble/native`. The native side never does "string → structure" parsing — all of it lives
in `@scumble/graphics`; variable-length data (path / transform) travels as nested
FlatBuffer bytes, base64-encoded over Lynx's string-only prop channel.

Full design + roadmap: [`packages/native/RENDER_ARCHITECTURE.md`](packages/native/RENDER_ARCHITECTURE.md).

## Packages

| Package                                  | What it is                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`@scumble/native`](packages/native)     | The native Lynx library — intrinsic `<scumble-*>` tags, the `skityrt` FlatBuffer schema, and the cross-platform C++ `ScumbleRenderer`. |
| [`@scumble/graphics`](packages/graphics) | Framework-agnostic pure-JS core: color / enum / path / transform parsers + `Path2D`.                                                   |
| [`@scumble/react`](packages/react)       | React component layer (`<Canvas>`, shapes, `Group`) — the user-facing API.                                                             |
| [`example`](packages/example)            | rspeedy demo app consuming all of the above.                                                                                           |
| [`website`](packages/website)            | VitePress documentation site (GitHub Pages) — `pnpm dev:website` to preview, `build` to build.                                         |

## Installation

Consumers install all three packages explicitly — `@scumble/react` declares
the other two as **peerDependencies**, so they are not pulled transitively (the
host owns the versions, no surprise nested copy):

```bash
pnpm add @scumble/react @scumble/graphics @scumble/native
```

> All packages are consumed through a bundler (rspeedy/rspack) — `@scumble/react`
> and `@scumble/native` ship TS sources, and `@scumble/graphics`' compiled
> `dist` uses extensionless relative imports resolvable by bundlers only. Plain
> Node ESM imports are not a supported consumption mode.

### Android host integration

One Gradle-side change comes from the skity integration: the native library
links skity-native via prefab, and AGP copies the prefab runtime `.so` into
the library AAR's `jni/` — duplicating the copy that the skity-native AAR
already ships transitively. The files are identical, so the host just picks
one at merge time:

```kotlin
android {
    packaging {
        jniLibs {
            pickFirsts += setOf("**/libskity.so")
        }
    }
}
```

(`libc++_shared.so` and the primjs `.so` files may need the same treatment if
the host doesn't configure them already — those duplicates come from the Lynx
toolchain, not from skity.)

## Getting started

```bash
pnpm install
```

The FlatBuffer stubs (C++/Java/TS) are generated, not committed — generate
them once after cloning (and after any `.fbs` change):

```bash
tools/hab sync                                                   # fetches flatc
pnpm --filter @scumble/native generate-fbs
```

Run the example app on a booted simulator / connected device:

```bash
pnpm example:ios       # iOS simulator (scripts/run-ios.mjs)
pnpm example:android   # Android (scripts/run-android.mjs)
```

Edit `packages/example/src/App.tsx` and reload to iterate.

> The iOS build needs Ruby ≥ 3.0 for CocoaPods — `mise` provides 3.4.9 (the
> 3.0.x branch is EOL and won't compile on recent Xcode toolchains).

## Status

Rendering, text, gradients/filters, and the animation engine (including playback
control) are implemented and verified on both platforms — host-side unit tests
(native C++ / graphics / react) plus on-device demos. Known architecture limits and
the remaining roadmap live in
[`FEATURE_PARITY.md`](FEATURE_PARITY.md); per-feature designs in
[`packages/native/`](packages/native/) (`RENDER_ARCHITECTURE.md`,
`ANIMATION_DESIGN.md`, `ANIMATION_CONTROL_DESIGN.md`).

## License

[Apache License 2.0](LICENSE)
