# Project overview

scumble brings react-native-skia-style declarative 2D graphics to the Lynx ecosystem, rendered on the skity GPU backend (Android OpenGL ES / Vulkan, iOS Metal).

This file is the knowledge-base entry point: what the project is, how the packages layer, and where the long-form design docs live.

## What scumble is

A React component library — `<Canvas>` plus 11 shape components, `<Paint>` / gradient / filter children, `Path2D`, image and paragraph components — whose props resolve in JS and ship to one shared C++ renderer as FlatBuffer bytes.

The API tracks @shopify/react-native-skia (baseline 2.11.0): same component names, same props, same semantics where the backends agree — the renderer lives in `packages/native/shared/skity/` (see [[overview#Package layout]]). Feature-by-feature status and the gap taxonomy live in `FEATURE_PARITY.md` (see [[rendering#Parity gap taxonomy]]).

Why skity and not Skia: skity is a purpose-built GPU 2D library (~90K lines of C++, roughly a tenth of Skia, no PDF/SVG backends or image codecs). Release builds of scumble's entire native side strip to ~12 MB across the four Android ABIs (~3.1 MB on arm64) against the ~41 MB APK increase react-native-skia documents, while the parity matrix stands at 90–95%.

## Package layout

Dependency direction is a single DAG; nothing skips a layer:

- **@scumble/react** (`packages/react`) — the user-facing React layer: ergonomic components with friendly props, plus the animation React API. Entry: [[packages/react/src/Canvas.tsx#Canvas]].
- **@scumble/graphics** (`packages/graphics`) — framework-agnostic pure-JS core: color / enum / path / transform parsers, `Path2D`, and the FlatBuffer builders for gradients, filters, clips, spans, animation tracks. Entry: [[packages/graphics/src/color.ts#parseColor]], [[packages/graphics/src/path.ts#parsePath]].
- **@scumble/native** (`packages/native`) — the native Lynx library: intrinsic `<scumble-*>` tags, the `skityrt` FlatBuffer schema (`packages/native/schema/*.fbs`), and the cross-platform C++ core in `packages/native/shared/skity/`.
- **example** (`packages/example`) — rspeedy demo app with 20 demo pages under `packages/example/src/demos/`, used for on-device verification.
- **website** (`packages/website`) — VitePress docs site (GitHub Pages), built from `packages/website/docs/`.

All three published packages are consumed through a bundler (rspeedy/rspack); `@scumble/graphics` ships a tsc-built `dist/` (raw source fails to link under `isolatedModules` because the vendored flatbuffers runtime re-exports types), while react/native ship TS sources.

## Core principle: the native side never parses strings

Every user-facing string — CSS colors, paint enums, SVG path `d`, CSS `transform` lists — is parsed in front-end JS by `@scumble/graphics` into ints, floats, or FlatBuffer bytes.

The native setters receive numbers or base64 strings and only memcpy. This principle governs the responsibility split in [[architecture#Binary transport]] and explains why there is no string-parsing code anywhere under `packages/native/shared/`.

## Design doc index

The long-form documents stay in place; this knowledge base links into them rather than duplicating them:

- `packages/native/RENDER_ARCHITECTURE.md` — the authoritative render-pipeline history and per-feature designs (§11 retained tree, §14 animation, §15 build cache, §16/§17 group opacity and layers). Summarized in [[architecture]].
- `packages/native/ANIMATION_DESIGN.md` and `packages/native/ANIMATION_CONTROL_DESIGN.md` — animation engine and playback control designs. Summarized in [[animation]].
- `TEXT_PARAGRAPH_DESIGN.md` — text/paragraph layout design. Summarized in [[rendering#Text and paragraphs]].
- `FEATURE_PARITY.md` — RN-Skia parity matrix and roadmap. Summarized in [[rendering#Parity gap taxonomy]].
