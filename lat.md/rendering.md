# Rendering feature semantics

What each rendering feature does and the semantics it promises — shapes, paint, gradients, paths, filters, blend modes, clipping, images, and text, plus the gap taxonomy vs react-native-skia.

Full designs live in `RENDER_ARCHITECTURE.md` / `TEXT_PARAGRAPH_DESIGN.md` / `FEATURE_PARITY.md`.

## Shapes and geometry

Eleven shape components (`Circle`, `Rect`, `RRect`, `Ellipse`, `Line`, `Polyline`, `Polygon`, `Points`, `Path`, `Image`, `Paragraph`) plus `Group`, each wrapping an intrinsic `<scumble-*>` tag.

Geometry is authored in absolute logical pixels and never participates in Lynx layout (see [[architecture#Flush via the layout pass]]).

- Ellipse/Line connect straight to their intrinsic scalar props; Polyline/Polygon travel the `points` incremental channel (a float vector).
- `<Points mode>` has no skity DrawPoints primitive: the React layer compiles it to zero-length line segments with round caps, reusing the path channel — the preferred pattern when skity lacks a primitive (react-layer compilation, zero transport change).

## Paint: double pass, single slot

Every node renders a fixed fill+stroke double pass; paint resolution routes `<Paint>` children (color, shaders, filters) into fill/stroke slots with a `defaultStyle` fallback.

Resolution lives in [[packages/react/src/internal/paint.ts#resolvePaint]]; a directly-nested shader child follows the style it lands under.

Known limit (F.1.3): blendMode and opacity are single slots shared by both paints (RN-Skia keeps them independent), and multiple `<Paint>` children do not draw multiple passes. Fill and stroke each get their own filter slots — the six `SetPaintFilter` slots are fill/stroke × color/image/mask.

## Gradients

Four gradient kinds — linear, radial, sweep, two-point conical — usable as fill or stroke alike; each slot carries its own nested Gradient bytes. Gradient units are USER_SPACE; sweep angles are in degrees.

Built by [[packages/graphics/src/gradient.ts#buildLinearGradient]] and siblings. Fewer than two stops, an empty sweep range, or an invalid two-point-conical circle throws in JS — native never sees an invalid gradient.

## Paths

`d` strings support the full SVG command set (including H/V/S/T/A and relative forms), parsed by [[packages/graphics/src/path.ts#parsePath]]. [[packages/graphics/src/path.ts#Path2D]] is a Web-Canvas-style imperative builder, interchangeable with a `d` string, and also carries the boolean-op lane.

- **Trim (`start`/`end` props)**: each contour gets an independent window (Skia SkTrimPE semantics). The renderer takes true curves directly (`NextContour` + `GetSegment`); per-contour single-contour paths with a resident PathMeasure are what the build cache keeps (see [[architecture#Render build cache]]).
- **Boolean ops**: `Path2D.op(a, b, "difference")` builds a LAZY composition — nested PathOpList bytes travel via `SetPathOpData` and are evaluated at render time by a left-fold (no NAPI round-trip exists to evaluate them in JS; right-nesting rides a nested subtree).

## Filters

Per-paint filter children — `Blur`, `DropShadow`, `ColorMatrix`, `ColorBlend`, `MaskBlur` — built into nested Filter bytes riding `SetPaintFilter`.

Built by [[packages/graphics/src/filter.ts#buildImageFilter]], `buildColorFilter`, `buildMaskFilter`. Multiple filters on one paint combine in declaration order; skity's BlurStyle is 1-based (the parser maps the friendly 0-based API); an invalid matrix/kind is dropped, not fatal. Morphology (Dilate/Erode) is not implemented by skity's HW backend — rejected upstream, not by us.

## Blend modes

All 28 skity blend modes parse into a single `SetPaint` slot shared by the fill and stroke paints.

Parsing: [[packages/graphics/src/enum.ts#parseBlendMode]] (kebab-case names, numeric passthrough, unknown falls back to src-over). The shadow-node default needs hand-setting (schema defaults don't cover it).

## Clipping and paint inheritance

Paint attributes (color, opacity, style, shaders, filters, dash) inherit down the tree by resolution AT RENDER TIME through the explicit_paint mechanism — zero transport-level changes for inheritance.

Clips: `<ClipRect>` / `<ClipRRect>` / `<ClipPath>` children on a Group build a ClipList ([[packages/graphics/src/clip.ts#buildClipList]]; default combine op intersect, difference opt-in) riding `SetClip`, applied after the group transform. A group's own clip and its children's clips compose in document order.

Group-level opacity and layer compositing (saveLayer lane, `<Group layer>` filters) are architecture-level features: see [[architecture#Exact group opacity and layer effects]].

## Images

`<Image>` rides `SetImageSource` + fit/sampling props; `<ImageShader>` uses an image as a paint texture via tiling scalars + TileMode + local matrix on `SetPaint`.

Platform loaders (JNI / OC) decode into skity images via `Data::MakeWithProc` + pixmap creation (the animax pattern), with `ApplyBoxFit` reused for the fit mapping. The cubic sampling pipeline is dormant in the published skity (1.1.0-alpha.3 lacks cubic support) — the API surface exists, the backend does not.

## Text and paragraphs

`<Paragraph>` + `<TextSpan>` build styled spans into nested SpanList bytes; layout lives in NATIVE because the front end has no platform metrics (`TEXT_PARAGRAPH_DESIGN.md` §2).

Built by [[packages/graphics/src/paragraph.ts#buildSpanList]]. The layout core forks per platform: Android uses a shared hand-written line breaker (~a built-in table), iOS uses CoreText.

BiDi/RTL ships: SheenBidi v3 is statically linked as a habitat dep, shaping is split per bidi-run × fallback-font-run, and SBLine assembles the visual order (hb's RTL output is already visual order — no second reversal). The `direction` prop flows end to end. The typeface cache holds CTFontFromTypeface as a borrowed reference — see [[lynx-integration#iOS integration traps]].

Text decoration (`decoration` bitfield + `decorationColor`/`decorationThickness`/`decorationStyle`) is a LAYOUT product by necessity: the wire glyph runs carry no advances and iOS `pos_y` mixes per-glyph offsets, so the renderer could never reconstruct x/y (TEXT_PARAGRAPH_DESIGN.md §7). Each backend resolves one `TextDecorationRun` per span × line × set bit — x/width from the same pen positions the glyphs render at (truncation clips decorations for free; the ellipsis never enters), y/thickness from the run font's underline/strikeout metrics via `ResolveDecorationMetrics` in [[packages/native/shared/skity/decoration.h]] (SkParagraph semantics — per-span metrics, so mixed-size lines offset), color resolved (decorationColor, else the span color). The entries ride the ParagraphRunList side channel and the renderer strokes them after the glyphs through the glyph paint lane (node COLOR/GRADIENT fill tints decorations too; solid/double = rects, dotted/dashed = dash lines, wavy = SkParagraph's quad zigzag). `decorationThickness` is absolute px — the one deviation from RN-Skia's multiplier.

## Parity gap taxonomy

Overall parity: geometry ~95%, paint ~95%, text ~85%. Remaining gaps fall into four buckets by ROOT CAUSE (`FEATURE_PARITY.md` §F) — the bucket decides whether a gap is schedulable work at all:

- **F.1 same name, different semantics** (fixable, touches the command stream): single paint slot (see [[rendering#Paint: double pass, single slot]]); minor items — no per-corner ClipRRect radii, antiAlias hard-wired true, DropShadow lacks inner/shadowOnly. Three former members were retracted/fixed: nested transforms DO cascade (the old claim was a documentation misreading); group opacity went exact via the saveLayer lane; text decoration shipped (2026-09-02, layout-time geometry — see [[rendering#Text and paragraphs]]).
- **F.2 skity upstream limits**: Morphology; image-shader fills and blur on text (glyph pipeline consumes gradient + ColorFilter only); Vertices/Patch/Atlas; DisplacementMap/Offset; FractalNoise/Turbulence; corner/discrete path effects.
- **F.3 architecture limits** (Android public SDK compiles NAPI off — see [[lynx-integration#The NAPI wall and the invoke lane]]): the imperative API, shared values, `useImage` loading phases — anything needing a native→JS channel or JS-held objects.
- **F.4 Lynx composition-model limits**: BackdropFilter (canvas can't see compositor layers beneath it); MaskedView-style view/canvas blending (the canvas is not a native view group).

What scumble has that RN-Skia doesn't: Canvas `viewPort` with real viewBox/preserveAspectRatio semantics, a serializable/replayable command stream by construction, and SVG-convention naming (cx/cy/radius, x1y1x2y2).
