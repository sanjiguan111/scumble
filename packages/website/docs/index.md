---
layout: home

hero:
  name: scumble
  text: Declarative GPU drawing for Lynx
  tagline: '`<Canvas><Circle color="red"/></Canvas>` — write React components, get GPU-accelerated drawing. One shared C++ renderer drives Android (OpenGL ES / Vulkan) and iOS (Metal), and animations interpolate on the render thread with **zero JS per frame**.'
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Installation
      link: /guide/installation
    - theme: alt
      text: GitHub
      link: https://github.com/sanjiguan111/scumble

features:
  - title: Shapes & paths
    details: Circle, Rect, RRect, Ellipse, Line, Polyline, Polygon, Points, Path, Image, Paragraph. Full SVG `d` command set, plus `Path2D` with lazy boolean ops — `Path2D.op(a, b, "difference")` — evaluated natively at render time.
    link: /guide/shapes
    linkText: Read more
  - title: Gradients & shaders
    details: Linear, radial, sweep and two-point conical — as fill or stroke. Images as paint textures via `<ImageShader>` with fit & tile modes.
    link: /guide/gradients
    linkText: Read more
  - title: Filters & blending
    details: Blur, drop shadow, color matrix, color blend and mask blur per paint slot; all 28 Skia blend modes, inheritable from `<Group>`.
    link: /guide/filters
    linkText: Read more
  - title: Group, clip, transform
    details: Paint inheritance down the subtree, declarative clips (`<ClipRect/RRect/Path>`), cascading transforms, and SVG `viewBox` logical spaces via `<Canvas viewPort>`.
    link: /guide/transforms-and-clipping
    linkText: Read more
  - title: Text & BiDi
    details: Platform layout backends, per-span styling, gradient fills, and full RTL/BiDi with fallback font runs (`direction` prop).
    link: /guide/text
    linkText: Read more
  - title: One renderer, two platforms
    details: A single C++ `ScumbleRenderer` drives Android (GLES/Vulkan) and iOS (Metal) — identical drawing behavior on both platforms, by construction.
    link: /architecture/overview
    linkText: Read more
---

<HomeStats />

## An animation engine that lives on the render thread

Declare a track once; a per-vsync tick on the render thread interpolates every
frame and a stop-on-idle driver powers down when nothing is playing. Playback
control comes with it — pause, seek, and completion callbacks without a single
extra frame of JS.

```tsx
import { Canvas, Rect, createAnimation } from "@scumble/react";

// declarative track: keyframes, easing, iterations…
const spin = createAnimation({
  property: "rotate",
  from: 0,
  to: 360,
  duration: 3000,
  iterations: Infinity,
});

<Canvas style={{ width: "100%", height: 200 }}>
  <Rect x={60} y={60} width={80} height={80} color="#f59e0b" animate={spin} />
</Canvas>;

// imperative playback — no re-render involved:
spin.controller.pause();
spin.controller.seekTo(1500);
spin.controller.onFinish(() => done());
```

Read the [animation guide](/guide/animation) and [playback control](/guide/playback-control), or [browse the demos](/examples/).
