# @scumble/react

React component layer for [scumble](https://github.com/sanjiguan111/scumble) —
declarative GPU drawing for [Lynx](https://lynxjs.org/):

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

## Installation

scumble ships as three peer-linked packages — install all of them and let the
host own the versions:

```bash
pnpm add @scumble/react @scumble/graphics @scumble/native
```

`@scumble/native` is a Lynx native library picked up by
[Lynx autolink](https://lynxjs.org/guide/autolink.html); see the
[installation guide](https://sanjiguan111.github.io/scumble/guide/installation)
for host-app requirements.

> All packages are consumed through a bundler (rspeedy/rspack) — plain Node
> ESM imports are not supported.

## What you get

- **11 shape components** — `Circle`, `Rect`, `RRect`, `Ellipse`, `Line`,
  `Polyline`, `Polygon`, `Points`, `Path`, `Image`, `Paragraph` — plus `Group`
  with paint inheritance and declarative clips.
- **Native animation engine** — declarative `animate` tracks interpolate on
  the render thread per vsync, zero JS per frame; playback control via
  `createAnimation().controller.{pause, play, seekTo, cancel, onFinish}`.
- **Gradients & shaders** — linear / radial / sweep / two-point conical as fill
  or stroke, images as paint textures (`ImageShader`).
- **Filters** — blur, drop shadow, color matrix, color blend, mask blur.
- **28 blend modes**, SVG `viewBox` viewport, cascading transforms.
- **`Path2D`** — command-style path builder with lazy boolean ops
  (`Path2D.op(a, b, "difference")`).
- **Text** — platform layout backends, per-span styling, gradient fills,
  BiDi/RTL.

## Documentation

Guides, full API reference, and architecture notes live at
<https://sanjiguan111.github.io/scumble>.

## License

[Apache License 2.0](https://github.com/sanjiguan111/scumble/blob/develop/LICENSE)
