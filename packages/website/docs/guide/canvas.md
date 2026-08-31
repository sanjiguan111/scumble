# Canvas & viewPort

Every scumble scene lives inside a single `<Canvas>`. It creates the GPU
surface (Android OpenGL ES / Vulkan, iOS Metal), and every child component
draws into it in document order — first declared, first drawn.

## Sizing and coordinate space

The canvas size comes from `style`, like any Lynx view. Children are
positioned in that space in **logical pixels** — a `<Rect x={40} …>` lands 40
px from the left edge, 1:1:

```tsx
import { Canvas, Rect } from "@scumble/react";

<Canvas style={{ width: "100%", height: 200 }}>
  <Rect x={40} y={40} width={80} height={80} color="#f59e0b" />
</Canvas>;
```

Canvas children must be scumble components (shapes, groups, clips, shaders) —
native Lynx views such as `<view>` or `<text>` cannot be placed inside.

## viewPort — a logical coordinate space

`viewPort` opts into an SVG `viewBox`-style logical space. Child geometry
authored in that space is scaled by the renderer to fit the canvas, with
`preserveAspectRatio = xMidYMid meet` semantics: the content is scaled
uniformly and centered, never stretched or cropped:

```tsx
<Canvas style={{ width: "100%", height: 150 }} viewPort={{ x: 0, y: 0, width: 100, height: 100 }}>
  {/* authored in a 0–100 space, scaled up to the canvas */}
  <Rect x={5} y={5} width={40} height={40} color="#ef4444" />
  <Circle cx={70} cy={30} radius={20} color="#3b82f6" />
  <Rect x={55} y={55} width={40} height={40} color="#22c55e" style="stroke" strokeWidth={2} />
</Canvas>
```

`x` and `y` are optional (default 0) and offset the logical origin; `width`
and `height` are required.

The demo app renders the same three shapes — authored once in a 0–100 space —
under three viewport settings:

```tsx
// A bigger logical space → smaller shapes on the same canvas.
<Canvas style={{ width: "100%", height: 150 }} viewPort={{ width: 100, height: 100 }}>
  {/* …the same children… */}
</Canvas>
<Canvas style={{ width: "100%", height: 150 }} viewPort={{ width: 200, height: 200 }}>
  {/* …the same children, drawn half the size… */}
</Canvas>
<Canvas style={{ width: "100%", height: 150 }}>
  {/* …the same children, at 1:1 physical pixels… */}
</Canvas>
```

::: tip
Author scenes in a fixed logical space (the demo app uses 360-wide) and let
`viewPort` scale them: small screens shrink the whole scene instead of
clipping the right edge.
:::

## Canvas-level animation

`<Canvas>` also accepts an `animate` prop. It targets the canvas **root
node**, so transform/opacity tracks apply to the whole scene at once — handy
for scene-wide entrance effects. The spec is the same as on any shape, see
[Animation](/guide/animation).

## Further reading

- [ViewportDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ViewportDemo.tsx)
  — the three-viewport comparison, live
- [Getting started](/guide/getting-started) — your first animated canvas
- [Examples](/examples/) — all demo scenes
