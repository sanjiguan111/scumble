# Paint & Shared Paint Props

Every shape (and `Canvas`/`Group`) accepts the shared `GraphicProps` — the paint and compositing attributes that control how a node draws. This page documents that shared surface, plus `<Paint>`, the declarative child that overrides a shape's fill or stroke paint.

```tsx
import { Paint } from "@scumble/react";
```

## Shared graphic props

All shape components document only their geometry; these props (`GraphicProps`) are available on every one of them. Geometry is authored in the canvas coordinate space (logical pixels when [`viewPort`](/api/canvas-and-group#canvas) is set).

| Prop          | Type                                       | Default  | Description                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`       | `Color`                                    | —        | Fill or stroke color — any CSS color string (`"red"`, `"#fff"`, `"rgb(…)"`, …), a packed `0xAARRGGBB` number, an `{ r, g, b, a? }` object, or an `[r, g, b, a?]` tuple. Omit for a transparent (no-op) shape.                                      |
| `style`       | `"fill" \| "stroke"`                       | `"fill"` | Whether `color` fills or strokes the shape. [`Line`](/api/shapes#line), [`Polyline`](/api/shapes#polyline), and [`Points`](/api/shapes#points) default to `"stroke"`.                                                                              |
| `strokeWidth` | `number`                                   | —        | Stroke width (dp). Stroke-only.                                                                                                                                                                                                                    |
| `strokeCap`   | `"butt" \| "round" \| "square"`            | —        | Cap style for the open endpoints of a stroke. Stroke-only.                                                                                                                                                                                         |
| `strokeJoin`  | `"miter" \| "round" \| "bevel"`            | —        | Join style for the corners of a stroke. Stroke-only.                                                                                                                                                                                               |
| `strokeMiter` | `number`                                   | —        | Miter limit for `"miter"` joins. Stroke-only.                                                                                                                                                                                                      |
| `opacity`     | `number`                                   | —        | Shape opacity, 0–1, folded into the paint's color alpha. Inheritable from a [`Group`](/api/canvas-and-group#group).                                                                                                                                |
| `dash`        | `number[]`                                 | —        | Stroke dash intervals in px — `[on, off, on, off, …]`. An odd array is repeated once to make it even (SVG `stroke-dasharray` semantics). An invalid pattern (empty / negative values / zero sum) is dropped — the stroke stays solid. Stroke-only. |
| `dashOffset`  | `number`                                   | —        | Phase offset into the dash pattern (px).                                                                                                                                                                                                           |
| `blendMode`   | `BlendMode`                                | —        | Blend mode (Skia's 28 modes) — how the shape composites onto what is below it. Applied to the shape's fill **and** stroke paints; inheritable from a [`Group`](/api/canvas-and-group#group).                                                       |
| `zIndex`      | `number`                                   | —        | z-index, accepted for parity; native z-ordering follows tree order today.                                                                                                                                                                          |
| `transform`   | `TransformProp`                            | —        | Transform applied to this node's own drawing (shapes) and its whole subtree (groups). Nested transforms cascade. See [transform forms](#transform-forms).                                                                                          |
| `animate`     | `AnimationSpec \| AnimationSpec[] \| null` | —        | Declarative native animations — one track per property, many tracks per node. `null`/`false` array entries are filtered; an empty array (or `null`) clears the node's animations. See [Animation](/api/animation).                                 |
| `children`    | `ReactNode`                                | —        | Declarative children consumed by the shape's paint: shaders ([gradients](/api/gradients), [`ImageShader`](/api/gradients#imageshader)), [`<Paint>`](#paint) overrides, and [filters](/api/filters).                                                |

### BlendMode values

`BlendMode` mirrors Skia/skity's 28 modes (kebab-case): `clear`, `src`, `dst`, `src-over`, `dst-over`, `src-in`, `dst-in`, `src-out`, `dst-out`, `src-atop`, `dst-atop`, `xor`, `plus`, `modulate`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `multiply`, `hue`, `saturation`, `color`, `luminosity`.

### Transform forms

`transform` takes a single op object, a 4×4 column-major matrix, or an array of ops composed left-to-right (`[translate, rotate]` translates first, then rotates — Skia canvas semantics).

| Form      | Type                                           | Notes                                                                                                                          |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| translate | `{ translateX?: number; translateY?: number }` | Defaults 0.                                                                                                                    |
| scale     | `{ scaleX?: number; scaleY?: number }`         | Each defaults to the other, or 1.                                                                                              |
| rotate    | `{ rotate: number; x?: number; y?: number }`   | `rotate` is **degrees** (not radians); `x`/`y` are an optional pivot (native rotate-with-center support pending verification). |
| matrix    | `number[]`                                     | A 4×4 column-major matrix — 16 numbers, `m[col*4 + row]`; the 2D affine part is `m0, m1, m4, m5, m12, m13`.                    |
| array     | `Transform[]`                                  | Ops composed left-to-right; a matrix inside an array composes like any other op.                                               |

```tsx
<Rect width={80} height={80} color="#f59e0b" transform={[{ translateX: 100 }, { rotate: 45 }]} />
```

## `<Paint>`

Declarative paint override — a data-only **child** of a shape. It overrides the paint properties for one `style`, and shaders nested inside it apply to that paint.

```tsx
<Circle cx={100} cy={100} radius={70}>
  <LinearGradient start={vec(30, 30)} end={vec(170, 170)} colors={["#f00", "#00f"]} />
  <Paint style="stroke" strokeWidth={8}>
    <SweepGradient c={vec(100, 100)} colors={["#0f0", "#00f"]} />
  </Paint>
</Circle>
```

Here the `<LinearGradient>` (placed directly under the shape) fills the circle, while the `<SweepGradient>` inside `<Paint style="stroke">` strokes it. The component renders nothing itself — the parent shape reads its props and merges them into its native paint props.

Properties given here **override** the shape-level ones; properties omitted fall back to the shape level.

::: warning Native paint-slot limits
At most one fill paint + one stroke paint per shape (a later `<Paint>` of the same style wins), and `opacity` is not honored here — opacity is a single node-level channel.
:::

### Props

| Prop          | Type                            | Default  | Description                                                                                                                     |
| ------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `style`       | `"fill" \| "stroke"`            | `"fill"` | Which paint this declaration targets.                                                                                           |
| `color`       | `Color`                         | —        | Paint color; overrides the shape's `color` for this style.                                                                      |
| `blendMode`   | `BlendMode`                     | —        | Overrides the shape's `blendMode`. Natively one blend mode is shared by the fill and stroke paints — the last declaration wins. |
| `strokeWidth` | `number`                        | —        | Stroke width. Stroke-only.                                                                                                      |
| `strokeCap`   | `"butt" \| "round" \| "square"` | —        | Stroke cap. Stroke-only.                                                                                                        |
| `strokeJoin`  | `"miter" \| "round" \| "bevel"` | —        | Stroke join. Stroke-only.                                                                                                       |
| `strokeMiter` | `number`                        | —        | Miter limit. Stroke-only.                                                                                                       |
| `dash`        | `number[]`                      | —        | Dash intervals — see the shared [`dash`](#shared-graphic-props). Stroke-only.                                                   |
| `dashOffset`  | `number`                        | —        | Phase offset into the dash pattern. Stroke-only.                                                                                |
| `children`    | `ReactNode`                     | —        | Shader children (e.g. `<LinearGradient>`) applied to this paint.                                                                |
