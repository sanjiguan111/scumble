# Text

`<Paragraph>` renders rich text: one width-constrained block built from
`<TextSpan>` children, each carrying its own style. Text layout has to happen
natively — shaping, ligatures, and font fallback belong to the platform
(CoreText on iOS, HarfBuzz plus a CJK-aware line breaker on Android) — so the
JS side only ships the span structure, and the platform lays it out during the
measure pass. The measured height comes back asynchronously through
`onLayout`.

## Paragraph basics

`width` is required — line breaking needs the constraint (`x`/`y` default to
0). Everything else is optional:

```tsx
import { Paragraph, TextSpan } from "@scumble/react";

<Paragraph
  x={10}
  y={10}
  width={330}
  fontSize={16}
  onLayout={(d) => console.log(`height=${d.height.toFixed(1)} lines=${d.lineCount}`)}
>
  <TextSpan text="The quick brown fox jumps over the lazy dog." />
</Paragraph>;
```

Layout-relevant props:

- `textAlign` — `"left"` (default), `"center"`, or `"right"`; physical,
  regardless of text direction (below).
- `lineHeight` — line-height multiplier, default `1`.
- `maxLines` — maximum lines; `0` (default) means unlimited. Overflow is
  ellipsized when set.
- `onLayout` — fires after each re-layout with `{ height, lineCount }`.

The paragraph also carries default span styling — `fontFamily`, `fontSize`,
`fontWeight`, `italic`, `color`, `letterSpacing` — which every span overrides
per field.

## Spans

`<TextSpan>` is a data-only declarative child (like the shaders): its props
are collected into the paragraph's span list. Text comes from the `text` prop
or JSX children (`<TextSpan>hi</TextSpan>`; the prop wins when both are
given, and children are trimmed):

```tsx
<Paragraph x={10} y={10} width={330} fontSize={16}>
  <TextSpan text="Hello " />
  <TextSpan text="skity" color="#3b82f6" fontWeight={700} fontSize={24} />
  <TextSpan text=" — " color="#9ca3af" />
  <TextSpan italic={true} color="#ef4444">
    italic span
  </TextSpan>
  <TextSpan text=" and back to normal weight text." />
</Paragraph>
```

Spans with different sizes align on a shared baseline. `fontWeight` is the
CSS-style 100–900 scale. Unset fields fall back to the paragraph default,
then the platform default: font size 14, weight 400, black.

Shaping features come through as-is — ligatures (`Office workflow: fine
figure affine`), kerning (a bold `AVATAR To Ya` tightens up), and emoji,
including composed ones (flag sequences, ❤️) via the platform fallback fonts.

## Text decoration

Spans carry RN-Skia-style text decoration: `decoration` (underline /
overline / line-through — combinable via an array or a numeric bitmask),
`decorationColor`, `decorationThickness`, and `decorationStyle`
(`"solid" | "double" | "dotted" | "dashed" | "wavy"`). All four also work as
paragraph-level span defaults:

```tsx
<Paragraph x={10} y={10} width={330} fontSize={16}>
  <TextSpan text="plain " />
  <TextSpan text="underline " decoration="underline" />
  <TextSpan
    text="wavy red"
    decoration="underline"
    decorationColor="#ef4444"
    decorationThickness={3}
    decorationStyle="wavy"
  />
  <TextSpan text=" and strike" decoration={["underline", "line-through"]} />
</Paragraph>
```

Position and thickness come from the span's own font metrics (SkParagraph
semantics): on a mixed-size line, each span's lines take its own font's
underline/strikeout metrics, so they visibly offset — same as RN-Skia and as
CSS with span-level `text-decoration`. A decoration breaks at line wraps and
stops at a `maxLines` ellipsis (never covering the `…`), and a gradient or
color-filter fill on the paragraph tints the decoration lines too.

Two differences from RN-Skia: `decorationThickness` is **absolute px**
(0/unset = the font's metric thickness; RN-Skia treats it as a multiplier),
and `decorationColor` unset (0) means "follow the text color" — an explicit
fully-transparent black falls back the same way.

## Fonts

`fontFamily` accepts a font name or a font URI. A `data:` URI embeds a whole
ttf/otf inline — decoded synchronously and cached for the process:

```tsx
const PRESS_START_2P = "data:font/ttf;base64,…";

<Paragraph x={10} y={10} width={330} fontSize={12} fontFamily={PRESS_START_2P}>
  <TextSpan>Custom font!</TextSpan>
</Paragraph>;
```

A schemed URI (`https://…`, `file`, host schemes) loads asynchronously through
the platform font loader: the paragraph first lays out with the default font
and re-lays out automatically when the bytes arrive — fonts are a layout
input, unlike images. A broken payload falls back to the default font and
stays there. One file provides one style (no weight/italic variants from a
single URI).

## Gradient and filtered text

Shaders and filters place under `<Paragraph>` like under any shape. A
gradient child fills the whole paragraph — span colors then contribute only
their alpha — and a `<ColorMatrix>` recolors the glyphs:

```tsx
<Paragraph x={10} y={10} width={330} fontSize={22} fontWeight={700}>
  <LinearGradient start={[10, 0]} end={[340, 0]} colors={["#8b5cf6", "#ec4899", "#f59e0b"]} />
  <TextSpan>Gradient text</TextSpan>
</Paragraph>
```

See [Gradients](/guide/gradients) and [Filters](/guide/filters) for the full
component set.

## Direction and BiDi

`direction` sets the paragraph's base writing direction for UAX #9
reordering: `"ltr"` (default), `"rtl"`, or `"auto"` — which picks the first
strong directional character in the text (LTR when there is none):

```tsx
// Arabic with embedded Latin and digits: the paragraph runs right-to-left,
// the Latin words and numbers stay LTR inside it.
<Paragraph x={10} y={10} width={330} fontSize={16} direction="rtl">
  <TextSpan
    text="نص ثنائي الاتجاه: العربية واللاتينية 123 والأرقام مختلطة مع English words داخل الجملة."
  />
</Paragraph>

// Hebrew text auto-detected as RTL:
<Paragraph x={10} y={10} width={330} fontSize={16} direction="auto">
  <TextSpan text="שלום עולם, זהו טקסט מימין לשמאל עם 456 numbers ו-English." />
</Paragraph>
```

Mixed-direction fragments inside an LTR paragraph reorder in place (an Arabic
word renders right-to-left at its position in the line). `maxLines`
truncation puts the ellipsis on the logical trailing side.

`textAlign` stays **physical**: left/right always mean the screen edges, no
matter the direction — `direction="rtl" textAlign="left"` gives an RTL
paragraph flushed to the left edge.

::: tip
Interactive controls (Lynx `<view>`/`<text>`) cannot live inside a canvas —
place buttons outside the `<Canvas>`, as the demo app does.
:::

## Further reading

- [ParagraphDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ParagraphDemo.tsx)
  — spans, alignment, custom/remote fonts, truncation, `onLayout`, live
- [BiDiDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/BiDiDemo.tsx)
  — RTL, auto detection, mixed runs, direction × alignment
