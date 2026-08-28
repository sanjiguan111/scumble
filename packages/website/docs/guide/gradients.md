# Gradients

Four gradient components — `LinearGradient`, `RadialGradient`,
`SweepGradient`, `TwoPointConicalGradient` — fill or stroke any shape. They
are declarative, data-only children: they render nothing themselves, and the
parent shape reads their props into its paint. The same pattern covers
`<ImageShader>`, which paints with a bitmap texture.

## Placement: fill or stroke

A gradient placed **directly** under a shape targets its fill paint. A
gradient placed inside a `<Paint style="stroke">` child targets the stroke
paint — the shape then draws both passes:

```tsx
import { Circle, LinearGradient, Paint, SweepGradient, vec } from "@scumble/react";

<Circle cx={180} cy={100} radius={70}>
  <LinearGradient start={vec(110, 30)} end={vec(250, 170)} colors={["#a855f7", "#ec4899"]} />
  <Paint style="stroke" strokeWidth={8}>
    <SweepGradient
      c={vec(180, 100)}
      colors={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"]}
    />
  </Paint>
</Circle>;
```

## Coordinates and shared props

All gradient geometry is expressed in **absolute user-space pixels** — the
same coordinate space the painted shape uses (`userSpaceOnUse`, not 0–1
normalized). Points accept `vec(x, y)` or a `[x, y]` tuple.

Every gradient takes `colors` (two or more, any color format), and two
optional props:

- `positions` — stop offsets in `[0, 1]`; omitted, the colors distribute
  evenly (`positions={[0, 0.7]}` squeezes the ramp into the first 70%),
- `mode` — how the ramp behaves outside the stop range: `"clamp"` (default,
  hold the edge color), `"repeat"`, or `"mirror"`.

## Linear, radial, sweep, conical

```tsx
{
  /* Linear: a ramp from start to end */
}
<Rect x={20} y={20} width={320} height={60}>
  <LinearGradient start={vec(20, 0)} end={vec(340, 0)} colors={["#ff0000", "#0000ff"]} />
</Rect>;

{
  /* Radial: from c outward to r (absolute px) */
}
<Circle cx={110} cy={100} radius={70}>
  <RadialGradient c={vec(110, 100)} r={70} colors={["#fefce8", "#f97316"]} />
</Circle>;

{
  /* Sweep: an angular ramp around c; angles are DEGREES (default 0–360) */
}
<Rect x={20} y={20} width={320} height={100}>
  <SweepGradient
    c={vec(180, 70)}
    colors={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"]}
  />
</Rect>;

{
  /* Two-point conical: stop 0 sits on the start circle, stop 1 on the end */
}
<Circle cx={180} cy={100} radius={70}>
  <TwoPointConicalGradient
    start={vec(150, 70)}
    startR={0}
    end={vec(180, 100)}
    endR={70}
    colors={["#fef9c3", "#7c3aed"]}
  />
</Circle>;
```

::: tip
`SweepGradient`'s `start`/`end` are **degrees**, matching the repo-wide
convention for angles (`rotate` is degrees too). Defaults are 0–360; a partial
wedge is `start={90} end={270}`.
:::

`TwoPointConicalGradient` is the two-circle gradient: `startR` may be `0`
(a focal point) or larger (a ring), `endR` must be positive. Concentric
circles make a ring; offset ones make a spotlight falloff.

## `<ImageShader>` — bitmap textures

`ImageShader` paints a shape with an image instead of a color ramp. Like the
gradients it is a data-only child, and it follows the shape's `style` — fill
by default, stroke when placed under `<Paint style="stroke">` or on a
`style="stroke"` shape:

```tsx
import { ImageShader, Rect, useImage } from "@scumble/react";

const texture = useImage("data:image/png;base64,…");

<Rect x={10} y={10} width={180} height={180}>
  <ImageShader
    image={texture}
    fit="cover"
    rect={{ x: 10, y: 10, width: 180, height: 180 }}
    tx="decal"
    ty="decal"
  />
</Rect>;

{
  /* no rect: the bitmap tiles 1:1 at its intrinsic size */
}
<Rect x={200} y={10} width={150} height={180}>
  <ImageShader image={texture} tx="repeat" ty="repeat" />
</Rect>;
```

- `image` — a `useImage()` handle, a bare uri string, or `null` to clear the
  slot (that paint draws nothing). Bitmaps load asynchronously through the
  same platform loader as `<Image>`; the shape stays blank until pixels land.
- `rect` — where the bitmap is inscribed in user space. Without it the bitmap
  tiles 1:1 at its intrinsic size.
- `fit` — how the bitmap is cropped into `rect` (the CSS object-fit family,
  default `"contain"`); ignored when `rect` is omitted.
- `tx` / `ty` — tiling outside the fitted area: `"clamp"` (default),
  `"repeat"`, `"mirror"`, or `"decal"` (transparent outside — the way to get a
  single non-tiling image fill). The two axes are independent
  (`tx="mirror" ty="repeat"`).

The shader follows the geometry: put one on a `Circle` or `Path` and the
texture fills that shape. See
[ImageShaderDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/ImageShaderDemo.tsx)
for decal/cover, tiling, non-rect geometry, and textured strokes.

## Further reading

- [GradientDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/GradientDemo.tsx)
  — every gradient type, spread modes, and gradient strokes, live
- [Painting](/guide/painting) — the `<Paint>` override and style routing
- [Images](/guide/images) — `<Image>`, `useImage()`, fit and sampling
