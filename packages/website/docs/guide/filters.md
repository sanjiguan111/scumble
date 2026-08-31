# Filters

Five filter components attach to a shape's paint as declarative children:
`<Blur>` and `<DropShadow>` (image filters), `<ColorMatrix>` and
`<ColorBlend>` (color filters), and `<MaskBlur>` (a mask filter). They render
nothing themselves — the parent shape merges them into its paint.

## Blur and DropShadow

`<Blur>` blurs the whole drawing layer by a Gaussian sigma. A number blurs
uniformly; `{x, y}` blurs per axis:

```tsx
<Circle cx={110} cy={100} radius={60} color="#3b82f6">
  <Blur blur={8} />
</Circle>
<Rect x={190} y={40} width={120} height={120} color="#22c55e">
  <Blur blur={{ x: 2, y: 14 }} />
</Rect>
```

`<DropShadow>` renders a blurred copy of the drawing behind it, offset by
`dx`/`dy`, in `color`. Unlike `<Blur>`, the shape itself stays crisp on top:

```tsx
<Circle cx={100} cy={95} radius={55} color="#f59e0b">
  <DropShadow dx={0} dy={10} blur={10} color="#00000055" />
</Circle>
<RRect x={180} y={35} width={140} height={110} radii={16} color="#8b5cf6">
  <DropShadow dx={12} dy={4} blur={6} color="#ef444466" />
</RRect>
```

## Composition in declaration order

Several filters of the same kind compose **in declaration order** — the first
declared is applied first. A soft blur under a drop shadow:

```tsx
<Path path={FLOWER} color="#ec4899">
  <Blur blur={2} />
  <DropShadow dx={0} dy={14} blur={8} color="#00000044" />
</Path>
```

## ColorMatrix and ColorBlend

`<ColorMatrix>` runs a 20-number, row-major 4×5 matrix over the drawing's
colors (Skia layout: R/G/B/A rows plus a translation column). The classic
luminance weights turn anything grayscale; the W3C matrix makes sepia:

```tsx
const GRAYSCALE = [
  0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0,
  1, 0,
];

<Path path={FLOWER} color="#ec4899">
  <ColorMatrix matrix={GRAYSCALE} />
</Path>;
```

An invalid matrix (wrong length or non-finite values) is dropped — the shape
draws unfiltered.

`<ColorBlend>` combines a constant `color` with the drawing via any of the 28
blend modes. `mode="src-in"` replaces all color while keeping the drawn alpha
— a cheap recolor:

```tsx
<Path path={FLOWER} color="#ec4899">
  <ColorBlend mode="src-in" color="#0ea5e9" />
</Path>
```

## MaskBlur

`<MaskBlur>` feathers the drawing's alpha mask. `style` selects how the
inside is treated — `"normal"` (default, fuzzy inside and outside),
`"inner"` (feathered edge drawn inside the shape), plus `"solid"` and
`"outer"`:

```tsx
<Circle cx={110} cy={100} radius={70} color="#14b8a6">
  <MaskBlur blur={30} />
</Circle>
<Circle cx={260} cy={100} radius={70} color="#f43f5e">
  <MaskBlur blur={30} style="inner" />
</Circle>
```

## Filters inside `<Paint>`

A filter placed inside a `<Paint style="stroke">` child applies to the stroke
paint only — the shape's fill draws unfiltered:

```tsx
<Path path={new Path2D().addCircle(170, 100, 60)} color="#94a3b8">
  <Paint style="stroke" color="#6366f1" strokeWidth={10}>
    <Blur blur={4} />
  </Paint>
</Path>
```

Inherited filters also arrive through `Group` paint inheritance, like the
other paint attributes.

## Group-level effects — the `layer` prop

Filters placed directly on a `Group` ride paint inheritance: **every
descendant applies them to its own drawing**, so overlapping shapes stay
separate. When you want the effects to run on the subtree **as a whole** —
the classic gooey/liquid look — use the `layer` prop (RN-Skia semantics):

```tsx
// Gooey: blur → alpha threshold → soften, applied to the COMPOSITED subtree.
// Overlaps fuse into a metaball; per-shape inheritance cannot do that.
const GOOEY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 18, -7];

<Group
  layer={
    <Paint>
      <Blur blur={12} />
      <ColorMatrix matrix={GOOEY} />
      <Blur blur={2} />
    </Paint>
  }
>
  <Circle cx={40} cy={60} radius={26} color="#ec4899" />
  <Circle cx={84} cy={68} radius={26} color="#ec4899" />
</Group>;
```

- `layer={true}` composites the subtree offscreen with **no** effects —
  useful with the Group's own `opacity` (the exact group-opacity lane) or to
  isolate a subtree. The `<Paint>`'s other props (`color`, `style`, stroke
  attributes, shaders) are ignored; the layer's alpha is the Group's
  `opacity`.
- **Clearing**: set `layer={false}`. Simply removing the prop does nothing —
  prop removal fires the setters with `null`, which is a no-op by design.
- **Cost**: each layer-bearing group costs one offscreen buffer per frame
  (clipped to its visible area). Prefer it for effect composition, not as a
  default grouping wrapper.
- Text and images rasterize into the layer like everything else — a group
  blur softens glyphs together with the shapes around them.

## Further reading

- [FiltersDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/FiltersDemo.tsx)
  — every filter and the stroke-only variant, live
- [GooeyDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/GooeyDemo.tsx)
  — the layer prop: gooey fusion vs per-shape inheritance, `layer={true}`,
  text through a group blur
- [Painting](/guide/painting) — the `<Paint>` override and inheritance
- [Text](/guide/text) — a `ColorMatrix` over a whole paragraph
