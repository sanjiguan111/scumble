# Getting Started

This page walks through the smallest working scene: a `<Canvas>` with an
animated square and circle. It assumes you have
[installed](/guide/installation) the three packages in a Lynx project that
already builds and runs.

## Your first canvas

```tsx
import { Canvas, Rect, Circle } from "@scumble/react";

export function FirstScene() {
  return (
    <Canvas style={{ width: "100%", height: 200 }}>
      <Rect x={40} y={40} width={80} height={80} color="#f59e0b" />
      <Circle cx={220} cy={80} radius={44} color="#3b82f6" />
    </Canvas>
  );
}
```

`<Canvas>` creates a GPU surface; every child component draws into it in
document order. Coordinates are in logical pixels by default.

::: tip
`<Canvas>` accepts a `viewPort` prop that maps a logical coordinate space
onto the surface — the SVG `viewBox` equivalent. See
[Canvas & viewPort](/guide/canvas).
:::

## Make it move — without JS per frame

Add an `animate` track and the animation runs entirely on the render thread:
the track rides the command stream once, then a per-vsync tick interpolates
every frame. No React re-render, no JS in the frame loop.

```tsx
import { Canvas, Rect, createAnimation } from "@scumble/react";

const spin = createAnimation({
  property: "rotate",
  from: 0,
  to: 360,
  duration: 3000,
  iterations: Infinity,
});

export function SpinScene() {
  return (
    <Canvas style={{ width: "100%", height: 200 }}>
      <Rect x={60} y={60} width={80} height={80} color="#f59e0b" animate={spin} />
    </Canvas>
  );
}
```

Prefer imperative control? Every `createAnimation()` result carries a
`controller`:

```ts
spin.controller.pause();
spin.controller.seekTo(1500);
spin.controller.onFinish(() => console.log("done"));
```

See the [animation](/guide/animation) and [playback control](/guide/playback-control)
guides for keyframes, easing, and the full controller surface.

## Where to go next

- [Shapes & paths](/guide/shapes) — the full component set
- [Painting](/guide/painting) — fill vs stroke, dash, opacity, blend modes
- [Gradients](/guide/gradients) — four gradient types as fill or stroke
- [Text](/guide/text) — paragraphs, spans, BiDi/RTL
- [Examples](/examples/) — all 17 demo scenes with source links

Or run them on a device:

```bash
git clone https://github.com/sanjiguan111/scumble && cd scumble
pnpm install
pnpm --filter scumble-example ios      # or: android
```
