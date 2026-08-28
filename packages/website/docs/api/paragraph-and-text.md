# Paragraph & Text

`<Paragraph>` lays out width-constrained rich text natively (CoreText on iOS, HarfBuzz + a CJK-aware line breaker on Android, with UAX #9 BiDi reordering). Layout runs in the TASM measure pass; the measured height reaches JS asynchronously via `onLayout`. `<TextSpan>` is its data-only styled-text child — the same declarative-child pattern as the [shaders](/api/gradients).

```tsx
import { Paragraph, TextSpan } from "@scumble/react";
```

## `<Paragraph>`

Width-constrained rich text. The paragraph-level style props are the **defaults for every span**; each [`<TextSpan>`](#textspan) overrides them per field.

```tsx
<Paragraph x={0} y={0} width={300} fontSize={16} onLayout={(d) => console.log(d.height)}>
  <TextSpan text="Hello " />
  <TextSpan text="scumble" color="#3b82f6" fontWeight={700} />
</Paragraph>
```

A gradient child (or a [`<Paint>`](/api/paint#paint) wrapping one) fills the whole paragraph through skity's glyph atlas — the span colors then only contribute their alpha. [`<ColorMatrix>`](/api/filters#colormatrix)/[`<ColorBlend>`](/api/filters#colorblend) children apply as color filters; image-shader fills and blur/shadow filters are ignored by skity's text pipeline (they fall back to the span colors).

Note that `color` on a paragraph is the **span default color**, not a node fill — use `<Paint color>` for that. A `width` that is not positive renders nothing.

### Props

All [shared graphic props](/api/paint#shared-graphic-props), plus:

| Prop            | Type                                      | Default  | Description                                                                                                                                                                                |
| --------------- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x`             | `number`                                  | `0`      | Left edge x (dp).                                                                                                                                                                          |
| `y`             | `number`                                  | `0`      | Top edge y (dp).                                                                                                                                                                           |
| `width`         | `number`                                  | —        | Layout width constraint (dp) — required; line breaking needs it.                                                                                                                           |
| `textAlign`     | `"left" \| "center" \| "right"`           | `"left"` | Line alignment. Stays physical regardless of `direction` — left/right always mean the screen edges.                                                                                        |
| `direction`     | `"ltr" \| "rtl" \| "auto"`                | `"ltr"`  | Base writing direction for BiDi (UAX #9) reordering. `"auto"` picks the first strong directional character (LTR when there is none).                                                       |
| `lineHeight`    | `number`                                  | `1`      | Line-height multiplier (1 = font default).                                                                                                                                                 |
| `maxLines`      | `number`                                  | `0`      | Maximum lines; `0` = unlimited. Overflow is ellipsized when set.                                                                                                                           |
| `fontFamily`    | `string`                                  | —        | Default span font family, then the platform default. May instead be a font URI — see [`TextSpanProps.fontFamily`](#textspan).                                                              |
| `fontSize`      | `number`                                  | —        | Default span font size in px (ultimate fallback 14).                                                                                                                                       |
| `fontWeight`    | `number`                                  | —        | Default span weight, CSS-style 100–900 (ultimate fallback 400).                                                                                                                            |
| `italic`        | `boolean`                                 | —        | Default span italics.                                                                                                                                                                      |
| `color`         | `string`                                  | —        | Default span color (ultimate fallback black).                                                                                                                                              |
| `letterSpacing` | `number`                                  | —        | Default extra letter spacing in px.                                                                                                                                                        |
| `onLayout`      | `(detail: ParagraphLayoutDetail) => void` | —        | Async layout details — fires after each re-layout. `ParagraphLayoutDetail` is `{ height: number; lineCount: number }`: the laid-out content height in px and the number of laid-out lines. |

## `<TextSpan>`

One styled run of source text inside a [`<Paragraph>`](#paragraph). A data-only declarative child — the parent collects these props and serializes them into its `spans` payload; the component never mounts. Fields left unset fall back to the paragraph's defaults.

The text rides the `text` prop or JSX children, whichever is given — `<TextSpan text="hi" />` ≡ `<TextSpan>hi</TextSpan>`; the prop wins when both are present. Children are trimmed (JSX indentation whitespace is not meaningful) and only plain text is collected — nested elements are ignored.

```tsx
<TextSpan text="Hello " />
<TextSpan color="#3b82f6" fontWeight={700}>scumble</TextSpan>
```

### Props

| Prop            | Type                                                  | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`          | `string`                                              | —       | The span's text as a prop (may be empty). Alternative to JSX children; the prop wins when both are given.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `children`      | `string \| number \| ReadonlyArray<string \| number>` | —       | The span's text as JSX children; string content is trimmed. Only plain text is collected — nested elements are ignored.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `fontFamily`    | `string`                                              | —       | Font family; unset = the paragraph's default, then the platform default. May instead be a font URI: `data:...;base64,...` (inline ttf/otf, decoded synchronously, process-cached) or any schemed URI — `http(s)`, `file`, host schemes (loaded asynchronously by the platform font loader, host-injectable; the paragraph first lays out with the default font and re-lays out when the bytes arrive). A broken payload is a sticky fallback to the default font. One file = one style (no weight/italic variants from a single URI). |
| `fontSize`      | `number`                                              | —       | Font size in px. Unset = the paragraph's default (then 14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `fontWeight`    | `number`                                              | —       | CSS-style weight 100–900. Unset = the paragraph's default (then 400).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `italic`        | `boolean`                                             | —       | Italics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `color`         | `string`                                              | —       | Span color. Unset = the paragraph's default (then black).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `letterSpacing` | `number`                                              | —       | Extra letter spacing in px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
