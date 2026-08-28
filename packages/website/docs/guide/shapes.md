# Shapes

scumble ships nine shape components: `Circle`, `Rect`, `RRect`, `Ellipse`,
`Line`, `Polyline`, `Polygon`, `Points`, and `Path`. All of them accept the
paint props (`color`, `style`, `opacity`, transforms, animations — see
[Painting](/guide/painting)) plus the geometry props documented here.

## Circle, Rect, RRect

`Circle` takes a center and radius; `Rect` takes an edge and size; `RRect`
adds corner radii to the rect:

```tsx
import { Circle, Rect, RRect } from "@scumble/react";

<Circle cx={50} cy={100} radius={45} color="#3b82f6" />
<Rect x={120} y={55} width={90} height={90} color="#22c55e" />
<RRect x={240} y={55} width={90} height={90} radii={22} color="#ef4444" />
```

`cx`/`cy`/`x`/`y` default to 0. The `radii` prop accepts:

::: v-pre

- a `number` — uniform radius,
- `{ x, y }` — per-axis radii (`<RRect radii={{ x: 40, y: 16 }} />` makes
  wide, flat corners),
- a `[top-left, top-right, bottom-right, bottom-left]` array — only the
  top-left value is consumed today (the native side supports uniform rx/ry).
  :::

## Ellipse and Line

`Ellipse` takes center plus separate horizontal/vertical radii. `Line` takes
its two endpoints — and unlike the other shapes, a line **strokes by default**
(`style` defaults to `"stroke"`), because a line has no interior to fill:

```tsx
<Ellipse cx={65} cy={100} rx={55} ry={38} color="#8b5cf6" />
<Line x1={150} y1={40} x2={230} y2={150} color="#0ea5e9" strokeWidth={5} />
<Line
  x1={230}
  y1={40}
  x2={150}
  y2={150}
  color="#f97316"
  strokeWidth={5}
  strokeCap="round"
/>
```

## Polyline, Polygon, Points

All three share the `points` prop, which accepts either an SVG `points` string
(`"20,40 60,120 100,50"`) or an array of `{x, y}` pairs built with `vec()`:

```tsx
import { Points, Polygon, Polyline, vec } from "@scumble/react";

<Polyline points="20,40 60,120 100,50 140,130" color="#14b8a6" strokeWidth={4} />
<Polygon
  points={[vec(220, 30), vec(300, 60), vec(280, 140), vec(200, 120)]}
  color="#ec4899"
/>
```

- `Polyline` strokes an open chain through the vertices (`style` defaults to
  `"stroke"`). Pass `style="fill"` to fill it as if closed.
- `Polygon` implicitly closes with a segment from the last vertex back to the
  first, and fills by default.
- `Points` interprets the same vertices per its `mode`:
  - `"points"` (default) — a dot per vertex; the dot diameter is
    `strokeWidth` and `strokeCap` defaults to `"round"`,
  - `"lines"` — a segment per vertex pair,
  - `"polygon"` — an open polyline stroke through all vertices.

```tsx
<Points points="40,60 80,120 120,50 20,130 100,140" color="#3b82f6" strokeWidth={10} />
<Points
  points={[vec(250, 40), vec(320, 70), vec(255, 100), vec(320, 130), vec(250, 145)]}
  mode="polygon"
  color="#22c55e"
  strokeWidth={3}
  strokeCap="round"
/>
```

Updating a `points` array every frame is cheap: the vertices ship as a bare
float vector on an incremental channel, so a per-frame state update (the demo
animates a sine wave this way) does not recompile any path.

## Path — `d` strings

`Path` draws any SVG path. The `d` string supports the full SVG command set —
`M L H V C S Q T A Z`, absolute or relative (lowercase) — and is parsed in JS:
relative coordinates are resolved to absolute, `H`/`V` become line commands,
`S`/`T` reflect the previous control point, and arc flags may be written
without separators (`A 60 60 0 11 …` means large-arc=1, sweep=1):

```tsx
const HEART =
  "M150 60 C100 20 30 40 30 100 C30 150 90 190 150 220 C210 190 270 150 270 100 C270 40 200 20 150 60 Z";
const ARC = "M40 150 A 60 60 0 0 1 260 150";

<Path path={HEART} color="#ef4444" />
<Path path={ARC} color="#3b82f6" style="stroke" strokeWidth={8} />
```

`fillRule` selects `"nonzero"` (default) or `"even-odd"` — see
[Painting](/guide/painting#fill-rule).

### Trimming with start / end {#trim-start-end}

`start` and `end` trim the path to a normalized length fraction in `[0, 1]`
(defaults 0 and 1). Combined with the animated `pathEnd` property this makes
a draw-on effect in one line (see [Animation](/guide/animation)):

```tsx
{
  /* the middle 50% of the arc, round caps */
}
<Path
  path={ARC}
  color="#3b82f6"
  style="stroke"
  strokeWidth={8}
  strokeCap="round"
  start={0.25}
  end={0.75}
/>;
```

Each contour of a multi-contour path is trimmed independently against its own
length (Skia trim semantics) — two circles in one path each keep 50% of
themselves.

The `path` prop also accepts a command-style `Path2D` object, interchangeable
with a `d` string — see [Path2D](/guide/path2d) for the builder and boolean
path ops.

## Further reading

- [ShapesDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/ShapesDemo.tsx)
  and
  [PathsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/PathsDemo.tsx)
  — the full galleries, live
- [Painting](/guide/painting) — color, stroke attributes, dash, blend modes
- [Path2D](/guide/path2d) — the imperative builder and boolean ops
