# Introduction

scumble is a 2D graphics library for [Lynx](https://lynxjs.org/), powered by the
**skity** GPU backend (Android OpenGL ES / Vulkan, iOS Metal). It brings a
declarative drawing API to Lynx:

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
[`FEATURE_PARITY.md`](https://github.com/sanjiguan111/scumble/blob/main/FEATURE_PARITY.md)
on GitHub.

## Next steps

- [Installation](/guide/installation) — add the packages to a Lynx app
- [Getting started](/guide/getting-started) — your first `<Canvas>`
- [Examples](/examples/) — browse the 17 demo scenes
