# Architecture overview

scumble is built as four layers with strictly one-way responsibilities: a React
component layer, a framework-agnostic parsing core, a native Lynx library, and
the skity GPU backend. Every layer has exactly one job, and data only flows
downward — from friendly props in your JSX to draw calls on the GPU.

This page introduces the layers and the principles that hold the system
together. The companion pages go deeper:
[render pipeline](/architecture/render-pipeline),
[animation engine](/architecture/animation-engine),
[text layout](/architecture/text-layout), and
[native integration](/architecture/native-integration).

## The four layers

```text
┌─────────────────────────────────────────────────────────────────────┐
│  @scumble/react                                                    │
│  <Canvas> <Circle> <Group> … friendly props, defaults, animate     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  renders intrinsic <scumble-*> tags
┌───────────────────────────────▼─────────────────────────────────────┐
│  @scumble/graphics            (pure JS, framework-agnostic)         │
│  parseColor · parsePath · Path2D · parseTransform · builders        │
│  produces primitive values: int / float / FlatBuffer bytes          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  number props + base64 nested FlatBuffers
┌───────────────────────────────▼─────────────────────────────────────┐
│  @scumble/native             (the Lynx library)                     │
│  <scumble-*> intrinsic tags · skityrt FlatBuffer schema             │
│  retained render tree + command stream · ScumbleRenderer (C++)      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  skity Canvas draw calls
                    ┌───────────▼───────────┐
                    │  skity GPU backend    │
                    │  Android GLES/Vulkan  │
                    │  iOS Metal            │
                    └───────────────────────┘
```

| Layer             | Package             | Responsibility                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework wrapper | `@scumble/react`    | The user-facing API: ergonomic components with friendly props (CSS color strings, named enums, `transform` lists), defaults, refs, the `animate` prop and playback controllers. A thin layer — it normalizes props and renders intrinsic tags.                                                                                     |
| Parsing core      | `@scumble/graphics` | Framework-agnostic pure JS. Resolves every "human" value into primitives: CSS colors to packed `0xAARRGGBB` ints, enum names to bytes, SVG path `d` strings and `Path2D` objects to path-command FlatBuffers, transform lists to transform-op FlatBuffers — plus the builders for gradients, filters, clips, and animation tracks. |
| Native library    | `@scumble/native`   | The Lynx library: the intrinsic `<scumble-*>` tag contract, the `skityrt` FlatBuffer schema, shadow nodes, the retained render tree with its command stream, and the cross-platform C++ `ScumbleRenderer`. Platform glue lives here (Android Kotlin/Gradle/CMake, iOS CocoaPods, Harmony scaffold).                                |
| GPU backend       | skity               | The drawing engine. Android uses OpenGL ES or Vulkan; iOS uses Metal. scumble never talks to these APIs directly — only through skity.                                                                                                                                                                                             |

## A one-way dependency graph

The dependency direction is a single directed acyclic chain:

```text
@scumble/react → @scumble/graphics → @scumble/native
```

Nothing lower imports anything higher. The tag contract in `@scumble/native`
is deliberately framework-agnostic — it knows about numbers, strings, and
FlatBuffer bytes, nothing more — so the React layer is a pure normalization
layer over the same base tags the parsing core feeds. A different framework
wrapper could sit on the exact same two packages without touching native code.

## The native side never parses strings

This is the guiding principle of the whole design:

> **All "string → structure" parsing happens in front-end JS. The native side
> receives numbers and bytes only.**

Every human-friendly value is resolved before it crosses the JS/native
boundary:

| Data                       | Examples                                                                       | Resolved by                            | Transport                                |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------- |
| Parse-free scalars         | `cx` / `cy` / `r`, `strokeWidth`, packed color ints                            | already numeric                        | `@LynxProp` number                       |
| Strings and objects        | `"#ff5500"`, `strokeCap="round"`, path `d`, CSS `transform` lists, gradients   | `@scumble/graphics` parsers            | mapped ints/bytes, or nested FlatBuffers |
| Variable-length structures | path commands, transform ops, gradient stops, clips, filters, animation tracks | JS builds finished FlatBuffers         | base64 string prop (see below)           |
| Viewport mapping           | logical → physical pixels                                                      | canvas node declares, renderer applies | viewport fields + density at draw time   |

The rule extends to enums: even `strokeCap="round"` is front-loaded — the
framework component accepts the friendly string, the parser maps it to a byte,
and the base prop receives a number. The native side is left with no enum
parsing either.

Keeping parsing in JS pays off three ways: the parsers run in one place with
one test suite (and framework wrappers reuse them for free), the native side
stays a thin, auditable data path, and parse errors surface in JS where they
are debuggable.

## Variable-length data over a string-only channel

Lynx component props marshal `NSNumber` / `NSString` / `NSArray` — but **not**
binary (`NSData` / `byte[]`). Since paths, transforms, gradients, and
animations are naturally variable-length, they need a wire strategy:

1. `@scumble/graphics` builds each structure as a **standalone nested
   FlatBuffer** (`PathCommandList`, `TransformOpList`, `Gradient`, `ClipList`,
   `Filter`, `AnimationList`, …) using the same schema as the render tree.
2. The bytes are **base64-encoded** in JS (a hand-written encoder — Lynx's
   JavaScriptCore has no `btoa`) and travel as an ordinary string prop.
3. The native setter base64-decodes and does a **mechanical copy** (memcpy)
   into the FlatBuffer vector. Decoding is an encoding conversion, not
   structure parsing — "native never parses" still holds.
4. At render time the renderer reads the nested tables through standard
   FlatBuffer lazy accessors.

One mechanism covers every variable-length field, and the native side stays
free of deserialization work. See
[render pipeline](/architecture/render-pipeline) for how these payloads ride
the command stream.

## One renderer, three GPU backends

All platform-specific rendering lives behind skity. scumble's C++
`ScumbleRenderer` — one implementation in `shared/skity/` — walks the retained
render tree and issues skity draw calls; skity lowers them to OpenGL ES,
Vulkan, or Metal. What each platform actually owns is a thin ring around the
renderer:

- **Surface hosting** — a `TextureView` on Android, a `MetalLayer` on iOS.
- **A dedicated render thread** — a `HandlerThread` on Android, a serial GCD
  queue on iOS (see below).
- **Platform services** — image and font loaders, vsync sources, event
  emission.

Because both platforms share the same renderer, drawing semantics, paint
inheritance, animation behavior, and optimizations such as the render build
cache are identical by construction — and there is exactly one place to
optimize them.

## Threads at a glance

Every canvas involves three threads, and each owns its state exclusively:

```text
TASM thread               UI thread                render thread
(setters, layout)         (platform view)          (retained tree + draw)
─────────────             ─────────────            ─────────────────
prop setter →             hosts the surface        drains command queue
pending command           forwards events          applies to retained tree
layout pass flush ───────────────────────────────▶ draws via skity
```

The retained render tree is touched only on the render thread — no locks, no
shared mutable state. Cross-thread traffic is immutable FlatBuffer messages,
so producer and consumer never overlap. The
[render pipeline](/architecture/render-pipeline) page walks this in detail.

## Further reading

- [RENDER_ARCHITECTURE.md](https://github.com/sanjiguan111/scumble/blob/develop/packages/native/RENDER_ARCHITECTURE.md)
  — the full internal design document (layering, serialization, retained tree,
  command stream)
- [Render pipeline](/architecture/render-pipeline) — one prop change, end to end
- [Animation engine](/architecture/animation-engine) — vsync-driven
  interpolation with zero JS per frame
- [Text layout](/architecture/text-layout) — native shaping, BiDi, and fonts
- [Native integration](/architecture/native-integration) — Lynx library
  anatomy, codegen, and building from source
