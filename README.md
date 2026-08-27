# lynx-skity

A 2D graphics library for [Lynx](https://lynxjs.org/), powered by the **skity** GPU
backend (Android OpenGL ES / Vulkan, iOS Metal). It brings a declarative drawing
API — `<Canvas><Circle color="red"/></Canvas>`
— to Lynx, with the native side reduced to a thin memcpy over a FlatBuffer render tree.

## Features

- **Declarative React API** — `<Canvas>`, `Circle`, `Rect`, `RRect`, `Path`, `Group`.
- **GPU rendering** — skity backend: Android (OpenGL ES + Vulkan) and iOS (Metal),
  driven by one shared C++ renderer.
- **Friendly values, parsed in JS** — CSS color strings, paint enums, CSS `transform`
  lists, and SVG path `d` strings (full command set — relative, `S`/`T` reflection,
  arc-flag concatenation) are all resolved in JS; **the native side never parses strings.**
- **`Path2D`** — a command-style path builder (`new Path2D().moveTo(…)…`), like the Web
  Canvas `Path2D`, interchangeable with a `d` string.
- **Viewport** — SVG `viewBox` logical coordinate spaces via `<Canvas viewPort={…}>`.
- **Cross-platform** — one C++ renderer (`SkityRenderer`) shared by Android and iOS.

## Architecture

```
@lynx-skity/react   ─ framework wrapper (ergonomic components, friendly props)
        │
@lynx-skity/graphics ─ pure-JS core (parseColor / parsePath / Path2D / parseTransform)
        │             produces primitive values (int / float / FlatBuffer bytes)
 @lynx-skity/native  ─ native tag contract (<skity-*>) + skityrt FlatBuffer schema
        │             ─── skityrt::RenderTree FlatBuffer ───
   skity GPU backend ─ Android GLES/Vulkan · iOS Metal
```

Dependency direction is a single DAG: `@lynx-skity/react` → `@lynx-skity/graphics` →
`@lynx-skity/native`. The native side never does "string → structure" parsing — all of it lives
in `@lynx-skity/graphics`; variable-length data (path / transform) travels as nested
FlatBuffer bytes, base64-encoded over Lynx's string-only prop channel.

Full design + roadmap: [`packages/native/RENDER_ARCHITECTURE.md`](packages/native/RENDER_ARCHITECTURE.md).

## Packages

| Package                                     | What it is                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`@lynx-skity/native`](packages/native)     | The native Lynx library — intrinsic `<skity-*>` tags, the `skityrt` FlatBuffer schema, and the cross-platform C++ `SkityRenderer`. |
| [`@lynx-skity/graphics`](packages/graphics) | Framework-agnostic pure-JS core: color / enum / path / transform parsers + `Path2D`.                                               |
| [`@lynx-skity/react`](packages/react)       | React component layer (`<Canvas>`, shapes, `Group`) — the user-facing API.                                                         |
| [`example`](packages/example)               | rspeedy demo app consuming all of the above.                                                                                       |

## Installation

Consumers install all three packages explicitly — `@lynx-skity/react` declares
the other two as **peerDependencies**, so they are not pulled transitively (the
host owns the versions, no surprise nested copy):

```bash
pnpm add @lynx-skity/react @lynx-skity/graphics @lynx-skity/native
```

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

Run the example app on a booted simulator / connected device:

```bash
pnpm --filter lynx-skity-example ios       # iOS simulator (scripts/run-ios.mjs)
pnpm --filter lynx-skity-example android   # Android (scripts/run-android.mjs)
```

Edit `packages/example/src/App.tsx` and reload to iterate.

> The iOS build needs Ruby ≥ 3.0 for CocoaPods — `mise` provides 3.4.9 (the
> 3.0.x branch is EOL and won't compile on recent Xcode toolchains).

## Status

Basic rendering and the data pipeline work on both platforms. In progress: more shape
types, paint inheritance, gradients/shaders, and filters. See the
[render architecture & roadmap](packages/native/RENDER_ARCHITECTURE.md).

## License

[Apache License 2.0](LICENSE)
