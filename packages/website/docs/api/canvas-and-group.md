# Canvas & Group

The two container components: `<Canvas>` is the GPU drawing surface every scene renders into, and `<Group>` applies transforms, paint inheritance, and clipping to a subtree.

```tsx
import { Canvas, Group } from "@scumble/react";
```

## `<Canvas>`

Root canvas — renders the native `<scumble-canvas>` (Android OpenGL ES / Vulkan, iOS Metal). Size comes from `style` like any Lynx view; children are positioned in that physical space by default. `viewPort` opts into a logical coordinate space (the SVG `viewBox` equivalent).

While mounted, the canvas is also the transport for [animation playback control](/api/animation): `createAnimation().controller` dispatches through this root's invoke lane, and the canvas demuxes the native animation-finish events back to the right controller.

```tsx
// 1:1 physical pixels
<Canvas style={{ width: 200, height: 100 }}>
  <Rect x={0} y={0} width={50} height={50} color="red" />
</Canvas>

// logical 100x100 space, scaled to fit (xMidYMid meet)
<Canvas style={{ width: "100%", height: 160 }} viewPort={{ width: 100, height: 100 }}>
  <Rect x={5} y={5} width={40} height={40} color="red" />
</Canvas>
```

### Props

| Prop       | Type                                                        | Default | Description                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `children` | `ReactNode`                                                 | —       | The scene: shapes, groups, shaders, filters.                                                                                                                                                                       |
| `style`    | `Lynx view style`                                           | —       | Standard Lynx view style object — the canvas size comes from here.                                                                                                                                                 |
| `viewPort` | `{ x?: number; y?: number; width: number; height: number }` | —       | Logical viewport (SVG `viewBox`). When set, child geometry authored in this logical pixel space is scaled by the renderer to fit the canvas (`preserveAspectRatio = xMidYMid meet`). Omit for 1:1 physical pixels. |
| `animate`  | `AnimationSpec \| AnimationSpec[] \| null`                  | —       | Declarative native animations on the canvas **root** node (whole-canvas transform/opacity). Same semantics as the shared [`animate` prop](/api/paint#shared-graphic-props).                                        |

## `<Group>`

Grouping node — applies a `transform`, optional [clip children](/api/clipping), and paint inheritance to its subtree.

- **Transforms cascade**: each group's matrix pre-multiplies onto the inherited one (standard 2D scene-graph semantics, inside the canvas `viewPort`).
- **Paint inheritance**: a Group's `color`/`style`/`opacity`/stroke attributes/`dash` — and a direct gradient child or `<Paint>` override — apply to every descendant that doesn't set its own. A color-less `<Circle>` under `<Group color="red">` fills red. `opacity` multiplies down the tree. Not inherited: geometry, `display`/`visibility`.

```tsx
<Group transform={{ translateX: 10, translateY: 10 }}>
  <Circle cx={0} cy={0} radius={20} color="red" />
</Group>

<Group color="#3b82f6" opacity={0.8}>
  <ClipRRect x={0} y={0} width={100} height={80} radii={12} />
  <Circle cx={50} cy={40} radius={45} />
</Group>
```

### Props

`GroupProps` extends [`GraphicProps`](/api/paint#shared-graphic-props) — the Group accepts the full [shared graphic props](/api/paint#shared-graphic-props) table and adds no props of its own. `transform` applies to the whole subtree, `children` carries the scene graph (shapes, clip children, shader/`<Paint>` children).
