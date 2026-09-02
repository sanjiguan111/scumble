---
layout: home

hero:
  name: scumble
  text: Declarative GPU drawing for Lynx
  tagline: "The component API mirrors react-native-skia — Canvas, shapes, declarative paints, Path2D — so an RN-Skia scene ports to Lynx mostly by changing the import. Powered by the skity GPU backend: one C++ renderer drives Android (OpenGL ES / Vulkan) and iOS (Metal), with <strong>zero JS per frame</strong> animations on the render thread."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Installation
      link: /guide/installation
    - theme: alt
      text: RN-Skia parity
      link: https://github.com/sanjiguan111/scumble/blob/develop/FEATURE_PARITY.md
    - theme: alt
      text: GitHub
      link: https://github.com/sanjiguan111/scumble

features:
  - title: The RN-Skia shape vocabulary
    details: Circle, Rect, RRect, Ellipse, Line, Polyline, Polygon, Points, Path, Image, Paragraph — same names and props you know. Full SVG <code>d</code> command set, plus <code>Path2D</code> with lazy boolean ops — <code>Path2D.op(a, b, "difference")</code> — evaluated natively at render time.
    link: /guide/shapes
    linkText: Read more
  - title: Gradients & shaders
    details: Linear, radial, sweep and two-point conical — as fill or stroke. Images as paint textures via <code>&lt;ImageShader&gt;</code> with fit &amp; tile modes.
    link: /guide/gradients
    linkText: Read more
  - title: Filters & blending
    details: Blur, drop shadow, color matrix, color blend and mask blur per paint slot; all 28 Skia blend modes, inheritable from <code>&lt;Group&gt;</code>.
    link: /guide/filters
    linkText: Read more
  - title: Group, clip, transform
    details: Paint inheritance down the subtree, declarative clips (<code>&lt;ClipRect/RRect/Path&gt;</code>), cascading transforms, and SVG <code>viewBox</code> logical spaces via <code>&lt;Canvas viewPort&gt;</code>.
    link: /guide/transforms-and-clipping
    linkText: Read more
  - title: Text & BiDi
    details: Platform layout backends, per-span styling, gradient fills, and full RTL/BiDi with fallback font runs (<code>direction</code> prop).
    link: /guide/text
    linkText: Read more
  - title: One renderer, two platforms
    details: A single C++ <code>ScumbleRenderer</code> drives Android (GLES/Vulkan) and iOS (Metal) — identical drawing behavior on both platforms, by construction. And it stays lean — skity is ~a tenth of Skia's codebase.
    link: /architecture/overview
    linkText: Read more
---

<HomeStats />

## Coming from react-native-skia?

That's the idea. scumble tracks the react-native-skia component API (baseline
2.11.0) — the same `<Canvas>` / shape / `<Paint>` / gradient / filter names and
props, the Canvas-style `Path2D`, image and paragraph components — so an
RN-Skia scene ports to Lynx mostly by changing the import. Feature-by-feature
status lives in
[FEATURE_PARITY.md](https://github.com/sanjiguan111/scumble/blob/develop/FEATURE_PARITY.md)
(geometry ~95%, paint ~90%, text ~85%).

Where it deliberately differs: rendering rides the **skity** GPU backend (not
Skia) through a FlatBuffer command stream — no JSI imperative object surface —
and animation is built in rather than delegated to reanimated. skity is also
far leaner — ~90K lines of C++, roughly a tenth of Skia — which keeps scumble's
whole native APK footprint under a third of react-native-skia's, at 90–95%
feature parity. See
[the comparison](/guide/introduction#coming-from-react-native-skia).

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
