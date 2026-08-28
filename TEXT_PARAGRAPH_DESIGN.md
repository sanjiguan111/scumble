# Text / Paragraph — design (pre-implementation, 2026-08-18)

> Status: **implemented (2026-08-19, both platforms)** — this document is the
> pre-implementation design, kept for the reasoning; the as-built record (with
> the deviations from this plan — e.g. glyph runs ride the extra-bundle side
> channel rather than a node-id keyed store) is
> [`packages/native/RENDER_ARCHITECTURE.md` §13](packages/native/RENDER_ARCHITECTURE.md).
> skity itself has a paragraph engine on its own roadmap; the §7 replacement
> seam below is why a swap stays cheap.

## 1. Goal

RN-Skia-shaped declarative text: rich paragraphs with spans, width-constrained
layout, alignment, and async measure feedback — rendered through skity's
existing glyph pipeline (`DrawGlyphs` + glyph atlas + FreeType/CoreText
typefaces).

```tsx
<Paragraph x={0} y={0} width={300}>
  <TextSpan text="Hello " fontSize={16} fontFamily="sans-serif" />
  <TextSpan text="skity" fontSize={16} color="#3b82f6" fontStyle="bold" />
</Paragraph>
```

## 2. Architectural constraints (why the layout must live in native)

- **No JS→native synchronous call path.** RN-Skia's `ParagraphBuilder` /
  `font.measureText` are JSI bindings — synchronous JS calls holding C++
  objects. We have no equivalent: the public Lynx Android SDK compiles with
  `ENABLE_NAPI_BINDING` off (`napi_env` unobtainable — the same root cause
  behind explorer-style loaders failing), and Lynx's JS↔native channels are
  props-down + async-events-up only.
- **Consequence:** line breaking and measurement happen in native (shared C++
  or platform layer), driven by the _text + styles_ — never by glyph data from
  JS. JS never sees advance widths.
- **Consequence:** there is no JS-side `paragraph.getHeight()`. Auto-height
  still works synchronously in the Lynx sense: layout runs inside the TASM
  measure pass, so the measured height feeds Lynx layout directly (§6.5).
  Extra details (lineCount, intrinsic size) reach JS asynchronously via a
  `"layout"` LynxDetailEvent — the exact pattern Lynx's own `<text>` uses.

## 3. Layered design

```
<Paragraph> + <TextSpan> children            react (declarative only)
  ↓ text + span styles as scalar props (no bytes: strings/numbers)
scumble-paragraph ShadowNode                     TASM thread
  ↓ measure(width) → PlatformLayoutBackend (per-OS)
  iOS:   CTFramesetter → CTRun walk → glyph ids + positions + height
  Android: HarfBuzz shape (per span) + shared line breaker → glyph runs + height
  ↓ measured height → Lynx layout; glyph runs → native run store (node-id keyed)
SetParagraph command (text + styles only — never glyphs)   command_batch.fbs
  ↓ render thread: fetch runs from the store by node id
skity::Canvas::DrawGlyphs(count, glyphs, pos_x, pos_y, font, paint)  per run
```

### 3.1 Why the two platforms fork at the layout core

- **iOS — CoreText is a full layout engine.** `CTFramesetter`/`CTTypesetter`
  already do shaping + line breaking + kinsoku + (BiDi, out of scope). The iOS
  backend asks CoreText to lay out the paragraph, then walks the `CTRun`s for
  glyph IDs + positions and hands them to `DrawGlyphs`. skity's iOS typeface
  backend _is_ CoreText (`text/ports/typeface_ct.hpp`), so the glyph ID space
  matches. **No self-built layout logic on iOS.**
- **Android — HarfBuzz for shaping + a shared simple line breaker.**
  `hb_shape` per span yields glyphs + advances; line breaking comes from the
  shared breaker below. HarfBuzz has **no official Maven prefab** (corrected
  2026-08-18); the integration candidates are a third-party prebuilt prefab
  (`com.viliussutkus89.ndk.thirdparty:harfbuzz-ndk25-static`, pure-C public API
  so the NDK r25→r27 gap is low-risk — verify at link time) or asking skity to
  carry it in the `skity-native` prefab (cleanest long-term). Link lands in
  `packages/native/android/CMakeLists.txt` next to `skity-native::skity`
  (L88–95).

### 3.2 The shared line breaker (Android only; ~a built-in table)

Full UAX #14 is not needed for the target audience (CJK + Latin business UIs):

- Latin/Western: break at spaces (`iswspace`), never inside a word.
- CJK: break between any two ideographs; kinsoku via a **small built-in
  table** — no-break-before (closing punctuation `、。」』）` etc.) and
  no-break-after (opening `「『（` etc.). Tens of ranges, a few hundred bytes.
- Thai/Khmer/Lao (dictionary word-breaking) and BiDi/RTL are explicitly **out
  of scope** — revisit when a real case lands (BiDi on iOS would be free via
  CoreText; Android would need ICU at that point).

Reference point: SkParagraph/sktext also ships a built-in UAX #14 table rather
than calling ICU for line breaking — ICU is only a hard requirement for BiDi.

## 4. Scope

**v1 (this design):**

- Spans: fontFamily / fontSize / fontStyle (weight+slant) / color / letterSpacing
- Paragraph: width, textAlign (left/center/right), lineHeight multiplier,
  maxLines + ellipsis, baseline placement
- Paint inheritance: opacity / blendMode / filters apply (like every shape)
- ImageShader as text fill (free once the shader rides the paint — same
  `fillImage*` slots as shapes)
- `onLayout` event (`"layout"` LynxDetailEvent: lineCount, size) — height
  itself flows through the TASM measure pass, no event needed for auto-height
- Custom fonts: ttf/otf from JS (base64 data URI through the existing string
  prop channel → native `Typeface::MakeFromData`), plus platform system font
  lookup by family name

**Not in v1:** BiDi/RTL, complex-script shaping beyond what HarfBuzz gives for
free, justification, `getMinIntrinsicWidth`-style JS queries, vertical text,
strut/half-leading controls.

**Accepted caveat:** the two platforms will not produce pixel-identical line
breaks (CoreText's breaker vs the shared simple breaker differ at edge widths
by a character or two). Browsers differ the same way; if pixel-parity across
platforms ever becomes a requirement, the only answer is one shared engine —
i.e. skity's future paragraph.

## 5. Effort estimate

| Slice           | Content                                                                                                        | Size      |
| --------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| Shared plumbing | schema (SetParagraph/TextStyle), react components, glyph-run data model, `DrawGlyphs` wiring, `onLayout` event | ~2 days   |
| iOS backend     | CTFramesetter layout → CTRun extraction → DrawGlyphs; system font + ttf typefaces                              | ~2 days   |
| Android backend | HarfBuzz prefab integration, breaker wiring, font creation path                                                | ~3–4 days |
| Line breaker    | space + CJK kinsoku table (Android path)                                                                       | ~1 day    |

Roughly a week of focused sessions. **Order: plumbing → iOS (fastest full
path) → breaker → Android.**

## 6. Open questions — resolved by exploration (2026-08-18)

Verified against the local skity repo (v1.1.0-alpha.4-16) **and** the shipped
prefab/pod 1.1.0-alpha.3 (only prefab-present APIs count; the SDK sources for
Lynx 4.0.1 were read from the local Pods checkout and the gradle sources jar).

1. **skity Font/Typeface API surface — everything needed is shipped.**
   - Typeface: `MakeFromData(Data)` (ttf), `GetDefaultTypeface()`,
     `UnicharsToGlyphs(const uint32_t[], int, GlyphID[])` (char→glyph, batch).
     No `MakeFromName` — family lookup goes through
     `FontManager::RefDefault()->MatchFamilyStyle(family, FontStyle)`, and
     **per-character fallback** through `MatchFamilyStyleCharacter(...)`
     (the CJK-fallback recipe skity's own example uses).
   - Android system fonts: `FontManager::RefDefault()` parses
     `/system/etc/fonts.xml` and mmaps `/system/fonts` internally — no
     AssetManager plumbing needed from us. Asset-bundled fonts: read bytes,
     `Typeface::MakeFromData`.
   - Advance: `Font::LoadGlyphMetrics(...)` then `GlyphData::AdvanceX()`
     (or `Font::GetWidths`). Metrics via `Font::GetMetrics(FontMetrics*)`.
   - `DrawGlyphs(int count, const GlyphID glyphs[], const float px[],
const float py[], const Font&, const Paint&)` — one Font per call, so
     **one call per run** (same typeface+size+style); the atlas dedupes by
     typeface+size+style and auto-splits A8 vs color-emoji internally.
   - Gaps to handle in our layout layer: **no letterSpacing/wordSpacing
     support** (accumulate into positions), no shaping API
     (`DrawSimpleText` is the deprecated no-shape path — confirms HarfBuzz).
     UTF-8 walking: skity ships `text/utf.hpp`. Two local-repo-only APIs to
     avoid: `GlyphBitmapData::RowBytes()`, `TypefaceFromCTFontWithoutCache`.
2. **CTRun → DrawGlyphs hand-off — the bridge is shipped.**
   `text/ports/typeface_ct.hpp` has both directions on the released pod:
   `TypefaceCT::CTFontFromTypeface(typeface)` and
   `TypefaceFromCTFont(CTFontRef)` (cached — fine for us). skity's darwin
   scaler casts glyph IDs to `CGGlyph` verbatim, so **CTFramesetter's glyph
   IDs feed `DrawGlyphs` unchanged**, and per-run `CTFontRef` → skity Font via
   the cached bridge.
3. **HarfBuzz distribution — corrected: no official prefab.** Candidates:
   third-party prebuilt `com.viliussutkus89.ndk.thirdparty:harfbuzz-ndk25-static`
   (prefab consumption; pure-C public API makes the NDK r25→r27 STL gap
   low-risk — verify), or carrying it in skity's prefab (cross-repo, cleanest
   long-term). `hb_shape` per span with an `hb_buffer` of UTF-8 →
   glyph+advance arrays is all v1 needs.
4. **Measure/event channel — Lynx has a first-class path, with an official
   template that is exactly our use case.** Lynx's own `<text>` does async
   layout then notifies JS via a `"layout"` `LynxDetailEvent` — event name,
   payload shape (`{lineCount, size, …}`) and all.
   - iOS (virtual node): override `needsEventSet` → YES, check
     `self.eventSet[@"layout"]`, build `LynxDetailEvent initWithName:
@"layout" targetSign:[self sign] detail:…`, then
     `dispatch_async(main_queue, ^{ [uiOwner.uiContext.eventEmitter
sendCustomEvent:event]; })` — template: `LynxTextShadowNode.m:568-600`
     in the local Pods checkout.
   - Android (virtual node): override `setEvents` to record
     `events.containsKey("layout")`; on completion
     `new LynxDetailEvent(getSignature(), "layout")` +
     `getContext().getEventEmitter().sendCustomEvent(event)` — the emitter
     hops to the UI thread itself, callable from the TASM thread. Template:
     `AbsInlineImageShadowNode.java`.
   - JS: custom elements receive events via `bind`-prefixed props —
     `<scumble-paragraph bindlayout={cb}/>`; our `Paragraph.tsx` maps an
     `onLayout` prop to `bindlayout` for the RN-Skia-shaped API. Payload:
     use `detail` (cross-platform; `params` is Android-only in places).
     Bonus: `bindlayoutchange` is a built-in frame event on every element —
     free if all we need is the final box.
5. **Where the laid-out paragraph lives — layout in the TASM measure pass,
   glyph runs in a native side store.** Measure runs on the TASM thread with
   the width in hand; layout there (CTFramesetter / HarfBuzz are fast at
   paragraph scale) feeds the measured height straight back into Lynx layout
   — no async first-frame placeholder, no event needed for the common
   auto-height case (`"layout"` event remains for lineCount/size details).
   The produced glyph runs **do not ride the schema** (keeps the §7 seam):
   they land in a node-id-keyed native store (TASM produces, render thread
   consumes — same decoupling pattern as the ImageStore), and the renderer
   draws them via `DrawGlyphs` per run. Re-layout on width/style change
   happens in measure and re-populates the store.

## 7. Replacement seam for skity's future paragraph engine

Everything above the layout core — DOM API, schema (text + styles in, never
glyphs out), `onLayout` event, paint inheritance — survives an engine swap
unchanged. When skity ships its paragraph, the per-platform backends in §3.1
collapse into one call and this repo deletes the line breaker. Design and
review future PRs against that seam: **no glyph-level data crosses the schema,
and no layout logic lives above the platform backends.**
