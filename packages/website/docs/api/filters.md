# Filters

Paint filter components — declarative children of a shape (or of a [`<Paint>`](/api/paint#paint)), like the [shaders](/api/gradients). Each is data-only and renders nothing itself: the parent shape collects the props and serializes them into its paint.

```tsx
import { Blur, DropShadow, ColorMatrix, ColorBlend, MaskBlur } from "@scumble/react";
```

`<Blur>`/`<DropShadow>` are image filters (they render the shape into a layer first), `<ColorMatrix>`/`<ColorBlend>` are color filters, and `<MaskBlur>` is a mask filter. Several filters of the same kind compose in declaration order — the first declared applies first (innermost). Like shaders, a filter child routes to the paint the shape actually draws with: inside `<Paint style="stroke">` it targets the stroke paint.

```tsx
<Circle cx={60} cy={60} radius={40} color="#3b82f6">
  <DropShadow dx={0} dy={8} blur={12} color="#00000055" />
</Circle>
```

## `<Blur>`

Image filter: blur the shape's rendered layer.

```tsx
<Rect x={20} y={20} width={120} height={80} color="#3b82f6">
  <Blur blur={8} />
</Rect>
```

### Props

| Prop   | Type                                 | Default | Description                                                               |
| ------ | ------------------------------------ | ------- | ------------------------------------------------------------------------- |
| `blur` | `number \| { x: number; y: number }` | —       | Blur sigma in px — a number blurs uniformly, `{x, y}` per axis. Required. |

## `<DropShadow>`

Image filter: drop a blurred, colored copy of the shape behind it.

```tsx
<Rect x={20} y={20} width={120} height={80} color="#f59e0b">
  <DropShadow dx={4} dy={6} blur={10} color="#00000066" />
</Rect>
```

### Props

| Prop    | Type     | Default | Description                                                                |
| ------- | -------- | ------- | -------------------------------------------------------------------------- |
| `dx`    | `number` | —       | Shadow offset x (px). Required.                                            |
| `dy`    | `number` | —       | Shadow offset y (px). Required.                                            |
| `blur`  | `number` | —       | Shadow blur sigma (px, uniform). Required.                                 |
| `color` | `Color`  | —       | Shadow color. Required. (`inner`/`shadowOnly` variants are not supported.) |

## `<ColorMatrix>`

Color filter: a per-pixel 4×5 color matrix — grayscale, sepia, channel swaps, and other linear color transforms.

```tsx
const grayscale = [
  0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0,
  1, 0,
];

<Rect x={20} y={20} width={120} height={80} color="#3b82f6">
  <ColorMatrix matrix={grayscale} />
</Rect>;
```

### Props

| Prop     | Type       | Default | Description                                                                                                                                       |
| -------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matrix` | `number[]` | —       | 20 numbers, row-major 4×5 (Skia layout: R/G/B/A rows + a translation column). An invalid matrix (wrong length / non-finite) is dropped. Required. |

## `<ColorBlend>`

Color filter: blend a constant color onto the source, with any of the 28 [blend modes](/api/paint#blendmode-values).

```tsx
<Rect x={20} y={20} width={120} height={80} color="#3b82f6">
  <ColorBlend mode="multiply" color="#ffcc00" />
</Rect>
```

### Props

| Prop    | Type        | Default | Description                                                   |
| ------- | ----------- | ------- | ------------------------------------------------------------- |
| `mode`  | `BlendMode` | —       | How the blend color combines with the source color. Required. |
| `color` | `Color`     | —       | The blend color. Required.                                    |

## `<MaskBlur>`

Mask filter: feather the shape's alpha mask (Skia's blur `MaskFilter` — the fuzzy-edge sibling of `<Blur>`, without the separate render layer).

```tsx
<Rect x={20} y={20} width={120} height={80} color="#ef4444">
  <MaskBlur blur={10} />
</Rect>
```

### Props

| Prop    | Type                                        | Default    | Description                                                                                                                                                                                   |
| ------- | ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blur`  | `number`                                    | —          | Feather radius (px). Required.                                                                                                                                                                |
| `style` | `"normal" \| "solid" \| "outer" \| "inner"` | `"normal"` | How the mask treats its inside (Skia `BlurStyle`): `"normal"` is fuzzy inside and outside, `"solid"` solid inside / fuzzy outside, `"outer"` fuzzy outside only, `"inner"` fuzzy inside only. |
