# Text layout

Text is the one part of scumble where the heavy work cannot live in JS.
`<Paragraph>` with `<TextSpan>` children gives you RN-Skia-shaped rich text —
per-span styling, width-constrained layout, alignment, ellipsis, BiDi/RTL —
but shaping, line breaking, and measurement all happen **natively**, drawn
through skity's glyph pipeline. The JS side only assembles the span structure.

## Why layout must live in native

Text layout is a feedback loop: the shaper produces advances, advances drive
line breaking, missing glyphs redirect runs into fallback fonts, and the
resulting heights flow back into layout. On the public Lynx SDK there is no
synchronous JS→native call path that could host such a loop — the Android SDK
ships with its NAPI binding compiled out, and the JS↔native channels that
remain are props-down plus async-events-up. RN-Skia's `ParagraphBuilder`
(JSI-style synchronous calls holding C++ objects) has no equivalent here.

Two consequences fall out of that constraint:

- **JS never sees advance widths.** There is no synchronous
  `paragraph.getHeight()` either — auto-height works because layout runs
  inside the native measure pass, and details like line count reach JS
  asynchronously through the `onLayout` event.
- **The wire carries text and styles, never glyphs.** Glyph data crossing the
  schema would couple JS to one shaping engine's output; keeping it native is
  what lets the layout engine vary per platform (below).

## The pipeline

```text
<Paragraph> + <TextSpan> children          react layer (declarative only)
  ↓ spans serialized: text + styles only → base64 SpanList FlatBuffer
scumble-paragraph shadow node              TASM thread
  ↓ layout pass: layoutIfNeeded (dirty → re-layout, clean → cached result)
  ↓ iOS: CoreText        Android: HarfBuzz + shared line breaker
  ↓ measured height → Lynx layout
  ↓ glyph runs → side channel next to the CommandBatch (idempotent snapshot)
render thread                              applies runs to retained nodes
  ↓ skity::Canvas::DrawGlyphs per run
```

The span payload is pure content — `text`, `fontFamily`, `fontSize`, weight
and slant, `color`, `letterSpacing` — with unset span fields falling back to
the paragraph-level defaults. Layout runs on the TASM thread inside the same
Lynx layout pass that flushes the command stream, so a paragraph re-layout
batches with every other change of the frame. The produced glyph runs travel
alongside the `CommandBatch` as a full snapshot of all live paragraphs:
delivery of that side channel is best-effort, so every flush carries
everything and the last flush that lands wins — an idempotent overwrite, with
the batch applied first because the runs reference nodes it just inserted.

## Two layout backends, by design

The backends fork at the core because each platform already ships a competent
text stack:

**iOS — CoreText does everything.** Spans build a `CFAttributedString`;
`CTFramesetter` performs shaping, line breaking, kinsoku handling, line
height, and alignment; a walk over the resulting `CTRun`s extracts glyph IDs
and positions. CoreText's glyph IDs feed `DrawGlyphs` unchanged because
skity's Darwin typeface backend _is_ CoreText — the ID spaces match by
construction. Truncation uses CoreText's truncated-line API with an ellipsis
token cut from the tail run's font.

**Android — HarfBuzz shapes, a shared breaker breaks.** skity's
`FontManager` (it parses the system `fonts.xml` itself) selects each span's
typeface; then **per-character fallback** segments the run wherever the base
typeface has no glyph for a code point, rematching a fallback font per
character. HarfBuzz shapes each segment using font bytes taken from the _same_
typeface skity will draw with — so glyph IDs match `DrawGlyphs` exactly.
Line breaking comes from a shared greedy breaker with a built-in table:
break at spaces for Latin scripts, break between ideographs for CJK, with a
kinsoku table (no break before closing punctuation, none after opening).
Line assembly takes the max ascent/descent across the line's fonts, applies
the `lineHeight` multiplier centered on the baseline, excludes trailing
spaces from the alignment width, and ellipsizes `maxLines` overflow with
glyphs trimmed until the line fits. HarfBuzz is statically linked — it adds
no runtime `.so` to the app.

## BiDi and RTL

A paragraph-level `direction` prop (`"ltr"` / `"rtl"` / `"auto"`, where
`auto` picks from the first strong character) drives UAX #9 reordering.
`textAlign` stays **physical** — left / center / right refer to screen edges
regardless of direction.

**iOS** needs no extra library: CoreText implements UAX #9 itself, so the
prop only feeds the paragraph's base writing direction and the existing run
walk already yields visual order.

**Android** links [SheenBidi](https://github.com/Tehreer/SheenBidi) (pure C,
data tables compiled in, statically linked like HarfBuzz). The shaper:

1. Concatenates all spans into one UTF-32 buffer and resolves per-code-point
   bidi levels once, up front.
2. Splits each span into bidi-level-homogeneous sub-ranges **before** the
   fallback-font segmentation, shaping each with the matching direction —
   HarfBuzz then emits each segment already in visual order.
3. After line breaking, applies the UAX #9 L1 trailing-whitespace reset and
   L2 reordering per line, and maps the resulting visual order onto the glyph
   stream. Stream order within each visual-order run _is_ visual order, so
   nothing re-reverses interior runs.
4. Places trailing-space exclusion and the ellipsis on the visual edge that
   holds the logical tail (right for an LTR paragraph, left for RTL).

## Fonts, fallback, and the FontRegistry

Two native stores keep the TASM thread (which lays out) and the render thread
(which draws) decoupled:

- **FontRegistry** — the TASM thread registers each run's real post-fallback
  `skity::Font` (typeface + size) and gets back a process-unique, monotonic
  ID; the render thread rebuilds the font by value at draw time.
  Registration is idempotent per (typeface, size), so repeated layouts don't
  grow the registry.
- **TypefaceCache** — custom fonts. A span's `fontFamily` may carry an inline
  `data:…;base64,…` URI, decoded synchronously and cached process-wide, or a
  schemed URI (`http(s)`, `file`, host schemes) loaded **asynchronously** by a
  platform font pipeline with host-injectable loaders. A pending font falls
  back to the default font for that layout; when the bytes land, the waiting
  paragraphs re-layout through the same Lynx async-task API the framework
  uses for its own async fonts. Fonts are a _layout input_ — unlike images,
  which are consumed at render time — so late bytes must trigger re-layout,
  not just repaint. A broken payload is a sticky fallback to the default
  font, never a dropped span.

## Drawing and paints

The renderer draws one `DrawGlyphs` call per run, under the node's transform.
The paint is built per run: a node-level fill styles every run — a gradient
fill rides skity's glyph-atlas shader path (span colors then survive only as
alpha), a solid color fill replaces the span colors — and without one it is
the span color multiplied by inherited opacity, with color filters chaining
in. Known limitation: image-shader fills and image/mask filters are ignored
by skity's text pipeline and fall back to span colors.

## Cross-platform consistency strategy

The two backends do not produce pixel-identical line breaks — CoreText's
breaker and the shared breaker can differ at edge widths by a character or
two, the same class of divergence browsers have. The design contains this
deliberately:

- **The schema carries text and styles only, never glyph-level data.**
- **No layout logic lives above the platform backends** — components,
  serialization, events, and paint inheritance are all engine-agnostic.

Those two rules are the replacement seam: everything above the backends
survives an engine swap unchanged, so adopting a single shared paragraph
engine later is a backend-level change, not an API change.

## Further reading

- [TEXT_PARAGRAPH_DESIGN.md](https://github.com/sanjiguan111/scumble/blob/develop/TEXT_PARAGRAPH_DESIGN.md)
  — the pre-implementation design: constraints, layered design, backend
  rationale, the replacement seam
- [RENDER_ARCHITECTURE.md §13](https://github.com/sanjiguan111/scumble/blob/develop/packages/native/RENDER_ARCHITECTURE.md)
  — as-built notes: layout timing, glyph-run channel, custom fonts, BiDi
- [Text](/guide/text) — the `<Paragraph>` API from the user side
- [Paragraph & Text API](/api/paragraph-and-text) — props reference
