# Introduction

scumble brings [react-native-skia](https://github.com/Shopify/react-native-skia)-style
drawing to the [Lynx](https://lynxjs.org/) ecosystem: the declarative component
model of RN-Skia — `<Canvas>`, shapes, `<Paint>` / gradient / filter children,
`Path2D`, images, paragraphs — rebuilt for Lynx and powered by the
**[skity](https://github.com/lynx-family/skity)** GPU backend (Android OpenGL ES /
Vulkan, iOS Metal):

```tsx
<Canvas style={{ width: "100%", height: 200 }}>
  <Circle cx={100} cy={100} r={60} color="#5b8cff" />
</Canvas>
```

You write React components with friendly props; the library resolves them in JS
and hands the native side a compact binary render tree. The native side is
reduced to a thin memcpy over a FlatBuffer render tree — one shared C++
renderer draws it on the GPU.

## Why scumble

- **react-native-skia's API, natively on Lynx** — the component names, props and
  paint semantics track [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia)
  (baseline 2.11.0); see [FEATURE_PARITY.md](https://github.com/sanjiguan111/scumble/blob/develop/FEATURE_PARITY.md)
  for the feature-by-feature comparison.
- **Lean: a tenth of the code, ~95% of the surface** — skity is a purpose-built
  GPU 2D library: ~90K lines of C++, roughly a tenth of Skia's million-line
  codebase, with none of its extraneous surfaces (PDF/SVG backends, image
  codecs, JSI bindings). Release builds of scumble's entire native side strip
  to ~12 MB across the four Android ABIs — ~3.1 MB on an arm64 device — against
  the [41.3 MB APK increase (~4 MB per device) react-native-skia documents](https://shopify.github.io/react-native-skia/docs/getting-started/bundle-size/) —
  while the parity matrix stands at 90–95%.
- **Declarative React API** — 11 shape components (`Circle`, `Rect`, `RRect`,
  `Ellipse`, `Line`, `Polyline`, `Polygon`, `Points`, `Path`, `Image`,
  `Paragraph`) plus `Group` with paint inheritance and declarative clips.
- **Native animation engine** — declarative `animate` tracks (keyframes,
  cubic-bezier easing, delay/iterations/autoReverse/fill) ride the command
  stream once; the render thread interpolates per vsync — **zero JS per
  frame**, stop-on-idle drivers. Playback control ships with it:
  `createAnimation().controller.{pause, play, seekTo, cancel, onFinish}`.
- **Gradients & shaders** — linear / radial / sweep / two-point conical, as
  fill or stroke; images as paint textures (`ImageShader`) with fit/tile modes.
- **Filters** — blur, drop shadow, color matrix, color blend, mask blur, per
  paint slot.
- **28 blend modes**, SVG `viewBox` viewport, cascading transforms.
- **`Path2D`** — a command-style path builder like the Web Canvas one,
  interchangeable with a `d` string (full SVG command set), plus lazy boolean
  ops (`Path2D.op(a, b, "difference")`) evaluated natively at render time.
- **Text** — platform layout backends with per-span styling, gradient fills,
  and BiDi/RTL (`direction` prop, SheenBidi + fallback font runs).
- **Friendly values, parsed in JS** — CSS color strings, paint enums, CSS
  `transform` lists, and SVG path `d` strings are all resolved in JS; **the
  native side never parses strings.**
- **Cross-platform** — one C++ renderer (`ScumbleRenderer`) shared by Android
  and iOS.

## Coming from react-native-skia

If you have drawn with RN-Skia in React Native, you already know scumble's
surface API. An RN-Skia scene ports to Lynx mostly by changing the import:
same `<Canvas>` root, same shape components, same declarative
`<Paint>`/gradient/filter children, same Canvas-style `Path2D` (including lazy
`Path2D.op` boolean ops), same `<Image>`/`useImage` and
`<Paragraph>`/`<TextSpan>` vocabulary. Coverage against the RN-Skia 2.11.0
baseline: geometry ~95%, paint ~90%, text ~85% — the full matrix lives in
[FEATURE_PARITY.md](https://github.com/sanjiguan111/scumble/blob/develop/FEATURE_PARITY.md).

The differences that matter, all rooted in the platform:

- **skity, not Skia — and much the smaller for it.** Rendering rides the Lynx
  family's own GPU library — Android OpenGL ES / Vulkan, iOS Metal — a
  purpose-built 2D backend at roughly a tenth of Skia's codebase, so the whole
  package stays far lighter than an RN-Skia integration at ~95% geometry
  parity. Consequence of the leaner backend: no SkSL
  `RuntimeEffect`/procedural shaders, no `Vertices`/mesh drawing, no
  `BackdropFilter` (the canvas is a standalone surface in Lynx's composition
  model).
- **No JSI imperative surface.** The public Lynx Android SDK ships with NAPI
  compiled off, so there is no `Skia.Image.MakeFromEncoded`-style object API.
  Everything declarative travels as a FlatBuffer command stream; everything
  else (`Path2D` geometry, boolean ops) is evaluated natively at render time.
- **Animation is built in.** No reanimated pairing — `createAnimation()`
  tracks ride the command stream once and the render thread interpolates per
  vsync (`controller.{pause, seekTo, onFinish, …}` for playback). See
  [Animation](/guide/animation).
- **Small semantic deltas.** `useImage` returns the handle immediately (no
  null-while-loading phase); `Canvas viewPort` gives you an SVG `viewBox`
  logical space RN-Skia doesn't offer.

## Packages

| Package             | What it is                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@scumble/native`   | The native Lynx library — intrinsic `<scumble-*>` tags, the `skityrt` FlatBuffer schema, and the cross-platform C++ `ScumbleRenderer`. |
| `@scumble/graphics` | Framework-agnostic pure-JS core: color / enum / path / transform parsers + `Path2D`.                                                   |
| `@scumble/react`    | React component layer (`<Canvas>`, shapes, `Group`) — the user-facing API.                                                             |

Dependency direction is a single DAG: `@scumble/react` → `@scumble/graphics`
→ `@scumble/native`. The native side never does "string → structure" parsing —
all of it lives in `@scumble/graphics`; variable-length data (path / transform)
travels as nested FlatBuffer bytes, base64-encoded over Lynx's string-only
prop channel.

## Status

Rendering, text, gradients/filters, and the animation engine (including
playback control) are implemented and verified on both platforms — host-side
unit tests (native C++ / graphics / react) plus on-device demos. Known
architecture limits and the remaining roadmap live in
[`FEATURE_PARITY.md`](https://github.com/sanjiguan111/scumble/blob/develop/FEATURE_PARITY.md)
on GitHub.

## Next steps

- [Installation](/guide/installation) — add the packages to a Lynx app
- [Getting started](/guide/getting-started) — your first `<Canvas>`
- [Examples](/examples/) — browse the 17 demo scenes
