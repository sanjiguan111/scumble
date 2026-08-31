# Transforms & clipping

Every shape and group accepts a `transform` prop, and every `Group` accepts
declarative clip children. Nested transforms cascade down the tree with
standard scene-graph matrix composition — inside the canvas `viewPort`, if one
is set.

## The transform prop

`transform` takes a single op object, a 4×4 matrix, or an array of ops
composed left-to-right:

```tsx
import { Circle, Group, Rect } from "@scumble/react";

// Translate (translateX/translateY, default 0)
<Group transform={{ translateX: 100, translateY: 0 }}>
  <Rect x={0} y={50} width={80} height={80} color="#22c55e" />
</Group>

// Rotate — degrees, not radians; x/y set the pivot
<Group transform={{ rotate: 45, x: 160, y: 80 }}>
  <Rect x={120} y={40} width={80} height={80} color="#a855f7" />
</Group>

// Scale (scaleX/scaleY; each defaults to the other)
<Group transform={{ scaleX: 1.6, scaleY: 1.6 }}>
  <Circle cx={150} cy={62} radius={25} color="#22c55e" />
</Group>
```

On a shape, the transform applies to that shape's own drawing — no `Group`
wrapper needed:

```tsx
<Rect
  x={20}
  y={10}
  width={60}
  height={60}
  color="#3b82f6"
  transform={{ rotate: 45, x: 50, y: 40 }}
/>
```

## Arrays and matrices

An array composes left-to-right — `[translate, rotate]` translates first, then
rotates (Skia canvas semantics):

```tsx
<Rect
  x={200}
  y={60}
  width={80}
  height={80}
  color="#14b8a6"
  transform={[{ translateX: -15 }, { rotate: 15, x: 240, y: 100 }]}
/>
```

A 4×4 **column-major** matrix (`m[col*4 + row]`, 16 numbers) drops in where an
op object would — scale 1.4 plus a translate:

```tsx
const MATRIX: number[] = [1.4, 0, 0, 0, 0, 1.4, 0, 0, 0, 0, 1, 0, 160, 30, 0, 1];
<Group transform={MATRIX}>…</Group>;
```

## Nesting cascades

Each node's matrix pre-multiplies onto the inherited one. An outer translate
with an inner rotate is exactly what the array form expresses on a single
node:

```tsx
<Group transform={{ translateX: 40 }}>
  <Group transform={{ rotate: 30, x: 60, y: 100 }}>
    <Rect x={20} y={60} width={80} height={80} color="#ec4899" />
  </Group>
</Group>
```

Note that a scale also scales the child coordinates — a circle at
`cx={150}` under `scaleX: 1.6` lands further right than 150 px.

## Declarative clips

`<ClipRect>`, `<ClipRRect>`, and `<ClipPath>` clip a `Group`'s subtree. They
are data-only children that render nothing; several of them combine in
document order, and `op` selects how each combines with the clips before it —
`"intersect"` (default) or `"difference"` (subtracts, punching a hole):

```tsx
import { Circle, ClipPath, ClipRRect, Group } from "@scumble/react";

// A rounded-rect window with a circular hole: intersect, then difference.
<Group>
  <ClipRRect x={60} y={30} width={180} height={140} radii={20} />
  <ClipPath path={new Path2D().addCircle(150, 100, 55)} op="difference" />
  <Rect x={60} y={30} width={180} height={140} color="#ec4899" />
</Group>

// A triangular window
<Group>
  <ClipPath path="M40 170 L95 20 L150 170 Z" />
  <Circle cx={95} cy={95} radius={70} color="#f59e0b" />
</Group>
```

- `ClipRect` — `x`, `y` (default 0), `width`, `height`, `op`.
- `ClipRRect` — the same rect props plus `radii`: a `number` (uniform) or
  `{x, y}` (per-axis).
- `ClipPath` — `path` as an SVG `d` string or a `Path2D`, plus `op`.

Clip geometry is expressed in the group's local coordinate space, and the
group's own transform applies to the clip like everything else in its
subtree.

## Further reading

- [TransformDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/TransformDemo.tsx)
  and
  [ClipDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ClipDemo.tsx)
  — every transform form and the clip gallery, live
- [Painting](/guide/painting) — what `Group` inherits into its subtree
- [Path2D](/guide/path2d) — building clip paths command-style
