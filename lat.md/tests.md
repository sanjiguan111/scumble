---
lat:
  require-code-mention: true
---

# Test specifications

Host-side test suites (graphics / react vitest + native C++ gtest) anchor the semantics documented in [[rendering]], [[animation]], and [[architecture]]. This file registers the key cases; every leaf section must be referenced by exactly one `@lat:` comment placed next to the covering test.

## Graphics parsing layer

Vitest suites under `packages/graphics/src/__tests__/`, verifying parsers by round-trip through the generated TS FlatBuffer readers — proving bytes decode back to the authored values without a device.

### Color parsing

`color.test.ts` — any CSS Color 4 form resolves to a packed 0xAARRGGBB int: number passthrough, hex, rgb()/rgba(), hsl()/hsla(), named colors, {r,g,b,a?} objects, [r,g,b,a?] tuples; unknown formats throw.

### Path parsing and Path2D

`path.test.ts` — `parsePath` covers the full SVG command set; `Path2D` covers imperative building and lazy boolean ops.

Details: relative coords, H/V lowering, S/T control-point reflection, implicit repeats, scientific notation, arc flag forms; arcTo flags, addRect, addCircle as four béziers, addPath chaining; `parsePoints` separators; `Path2D.op` null/empty, chained left-fold flattening, right-nesting.

### Path serialization round-trip

`path.test.ts` — `toDString`/`fromDString` serialize the normalized command form back to an SVG `d` string and parse it again; `Path2D.interpolate` morphs two same-structure paths.

Details: compact form (letter glued to first arg, arc flags delimited); normalization applied on parse (relative folds to absolute); op-composed paths serialize to `""`; interpolate lerps args with `a·(1−t)+b·t`, re-quantizes arc flags, nulls on command-structure mismatch, throws on op-composed operands.

### Corner radii resolution

`radii.test.ts` — `resolveCornerRadii` normalizes the three radii authoring forms shared by `<RRect>` and `<ClipRRect>`.

Details: number → uniform, `{x,y}` → per-axis, undefined → zeros; the 4-corner array yields the TL uniform fallback plus the 8-float vector in skity RRect corner order (TL, TR, BR, BL); negatives and non-finite values clamp to 0; a malformed array (≠4 corners) degrades to uniform first-entry with no vector.

### Clip serialization

`clip.test.ts` — `buildClipList` round-trips rect/rrect/path entries through the ClipList reader: geometry, combine ops, nested path bytes; per-corner radii ride the 8-float `radii` vector (the uniform form emits none).

### Gradient building

`gradient.test.ts` — all four gradient kinds serialize to decodable bytes.

Details: absolute coords and {x,y} points, explicit positions, repeat mapping, <2-stop throw; sweep default full-circle and explicit degrees; two-point-conical focal/illegal-circle throw.

### Filter building

`filter.test.ts` — buildImageFilter (single blur, dropShadow color, declaration-order composition, none/bad kind → null); buildColorFilter (20-float matrix, colorBlend, illegal matrix dropped); buildMaskFilter (1-based BlurStyle, first-only).

### Multi-paint blob

`multi-paint.test.ts` — `buildMultiPaint` round-trips a pass list through the MultiPaintList reader; empty list returns null.

Per-pass independent state (style, color, opacity, blendMode, stroke attrs, dash), gradient/filter bytes verbatim, image-shader fields, type NONE for an inactive pass.

### Animation serialization

`animation.test.ts` — `buildAnimationList` round-trips every track feature.

Details: from/to sugar → two keyframes, Infinity iterations, preset easing → cubic-bezier, per-keyframe easing fallback, missing offsets evenly spaced, color packing, multi-track order; zero tracks / <2 keyframes throw.

### Paragraph decoration serialization

`paragraph.test.ts` — `buildSpanList` round-trips the four decoration fields onto the `Span` table.

Details: schema defaults (decoration 0 / decorationColor 0 = follow text color / thickness 0 = metric default / SOLID); the bitfield resolves from names, arrays, and numeric passthrough ("underline"→1, underline+line-through→5, 6→6; case-insensitive, strikethrough/line_through aliases, unknown names contribute 0); `decorationStyle` maps names to the RN-Skia value order (wavy→4, double→1) with numbers masked through; decorationColor parses via `parseColor`, unset stays 0.

### Font metrics

`font-metrics.test.ts` — `createFontMetrics` measures advance sums from a hand-built synthetic sfnt (exact chosen values) and from the real Press Start 2P fixture against fontTools-computed ground truth.

Details: format-4 idDelta and idRangeOffset lookups (0 entries → .notdef), format 12 with astral code points and surrogate-pair merging (lone surrogate misses), leftmost-segment selection, (3,1)-over-(0,3) subtable preference and symbol-only rejection, hmtx tail sharing beyond numberOfHMetrics, OS/2 typo metrics gated on fsSelection bit 7, letterSpacing per glyph, unitsPerEm scaling; error cases cover truncated/garbage/WOFF/TTC input, missing tables, out-of-range glyph IDs, and non-base64-data-URI string sources; `base64ToBytes` round-trips every length mod 3, tolerates padding and whitespace, and rejects invalid characters and 1-char trailing groups.

## React component layer

Vitest suites under `packages/react/src/__tests__/` (LEPUS globals stubbed) verifying the resolution layer that turns component trees into intrinsic props.

### Paint resolution

`paint.test.ts` — resolvePaint default fill, stroke routing, numeric colors, blendMode byte; resolveLayerEffect three states (undefined/true/false), multi-slot filters, non-Paint children ignored.

#### Multi-pass paint channel

`paint.test.ts` multi-pass describe — the channel switch in `resolvePaint`.

Two same-style `<Paint>` children or any paint with its own `opacity` emit ONLY the `multiPaint` blob; single fill+stroke stay on the single-slot props; no paints carry the explicit `""` clear.

### Animation resolution and playback control

`animation.test.ts` — resolveAnimation (undefined → no command, array filtering, empty result clears, shape passthrough, handle passthrough); createAnimation handle uniqueness and finish-event routing by handle.

### Transform resolution

`transform.test.ts` — translate/scale/rotate (degrees, no pivot), 4x4 column-major → 2D affine, op-array left-to-right composition, no transform → undefined; shape transform passthrough.

## Skia compat layer

Vitest suites under `packages/skia-compat/src/__tests__/` (same LEPUS stubs) verifying the RN-Skia adapter surface from [[overview#The skia-compat adapter layer]] — pure mappers tested directly; fixture numbers shared with the graphics font-metrics suite.

The vendored Victory suite — upstream's own 48 files / 252 cases under `packages/victory-native/src/`, codemodded onto the shim — is the functional gate for that package; its tree is generated, so it carries no `@lat:` leaves by design.

### Reanimated shim ticker

`tests/reanimated-ticker.test.ts` (packages/victory-native) — pins the global animation ticker that fixed on-device tap latency: all concurrent tweens ride ONE 16 ms interval and subscribers are notified exactly once per frame.

Details: N concurrent `withTiming`s advance the epoch by exactly 1 per frame (not N — the per-tween-interval shape re-rendered every subscriber dozens of times per frame on a candlestick window's ~36 tweens); the final value lands and the completion callback fires; `cancelAnimation` freezes mid-flight; a new assignment supersedes the running tween; the ticker stops itself when idle. Fake timers must fake `Date` alongside the timer APIs (tween progress reads wall-clock), and `resetTickerForTests()` drops the interval between tests — a handle created under one test's clock never fires under the next.

### Skia namespace and path shims

`skia-core.test.ts` — matrix helpers compose column-major; `SkPath`/`PathBuilder` produce the d-strings Victory's lanes build.

Details: `multiply4`/`translate`/`scale`/`rotate` point-mapping; `rrect` caps radii at half the shorter side; `addRRect` walks per-corner elliptical arcs and SKIPS zero-radius corners; `arcToOval` converts Canvas oval-arc form to SVG endpoint arcs (large-sweep flag over 180°, forceMoveTo vs continue — a continued arc emits the Canvas connecting line from the current point to the arc start, and a ≥360° sweep splits into two half arcs since one SVG `A` degenerates when start == end); the donut-slice regression (Victory `useSlicePath`: outer arc then reversed inner arc) pins the radial connecting edge; `MakeFromSVGString` round-trips and nulls on blank, including REAL d3-shape `curveMonotoneX` output (semantic round-trip: same command sequence + number stream — d3 comma-glues where toDString spaces); `Path.Interpolate` midpoint and mismatch-null; fillType survives build; `Skia.Color` packs; `SkPaint` setters feed reads.

### Compat component and font mapping

`components.test.tsx` — the exported pure mappers turn RN-Skia props into scumble component props, and `useFont` measures from the fixture binary.

Details: PaintStyle enum → style string; DashPathEffect children extracted to `dash`/`dashOffset`; `paint`-object state under explicit props; MAYBE-ANIMATED passthrough paint props (`blendMode`/`strokeCap`/`strokeJoin`/`strokeMiter`/`antiAlias`) are unwrapped and undefined-valued `{value}` wrappers DROPPED — Victory's AnimatedPath wraps every present prop key, and Candlestick explicitly spreads `{blendMode: undefined}`, which would otherwise reach scumble's `parseBlendMode` as an object and crash on `.toLowerCase`; `path` prop carries the wrapped Path2D + fillType → fillRule; `p1`/`p2` → x1/y1/x2/y2; `<Points>` polygon mode closes the chain as a stroked path and circle mode emits one closed subpath per point at `strokeWidth`/2 radius with mode-defaulted styles; Matrix4 passthrough with RN-Skia-only props dropped; ClipDef → scumble clip child props incl. 4-corner radii array; `textPropsToScumble` lifts baseline y by font ascent with measured no-wrap width (fixture: 24px ascent/widths), family-name fonts fall back to a wide box + size lift; `matchFont` on a family name throws guidance on measure.

### Paragraph builder shim

`paragraph-builder.test.ts` — `Skia.ParagraphBuilder` measures multi-line label layout from font metrics.

Details: intrinsic width from measured advances (fixture em-width math); explicit newlines count as lines; heuristic fallback (fontSize·0.6·chars per line) for metrics-less families; built paragraph exposes its spans for the shim's renderer.

### Tween core and morph lane

`use-tween.test.ts` — the pure half of the `useTween` Reanimated replacement plus the per-frame morph consumer.

Details: `tweenValue` progresses with the easing and clamps to [0,1] on both sides; zero/negative/non-finite durations complete instantly; easing presets match the standard cubic curves (easeInOutCubic point-symmetric about its 0.5 knot); `Skia.Path.Interpolate` morphs two REAL d3 monotoneX series across ChartDemo's datasets — matched command structures by construction, midpoint coordinate asserted (58 vs 40 → 49).

### Pan recognizer state machine

`gesture.test.ts` — the RNGH-semantics pan: offset windows, fail-beats-activate, long-press arming, default min distance, tap finalize.

Details: number window is [−V, V] with an inclusive boundary, array form explicit (one-sided windows); activation past activeOffsetX streams onUpdate with translation/x/numberOfPointers then onEnd(END)+onFinalize on touchup; failOffsetY fails a vertical drag BEFORE X activation (FAILED finalizes, state resets to UNDETERMINED); activateAfterLongPress arms a timer that activates within the 10px slop and a slop-exceeding move fails it (late timer is a no-op); without active axes the default 10px euclidean min-distance activates; a no-activation tap finalizes FAILED without onEnd; builders capture config/callbacks chainably and minDistance is superseded by an explicit active-axis window.

### Pinch recognizer and detector wiring

`gesture.test.ts` — two-pointer scale/focal tracking and the GestureDetector runtime flattening.

Details: pinch begins at scale 1 with the focal midpoint, scales by distance ratio, and lifts (END → UNDETERMINED) when a pointer drops; `buildRuntime` flattens bare builders, Race (flagged, first-activation cancels the rest), Simultaneous, and nested compositions (a nested Race still arbitrates).

## Native C++ core

Host-side gtest suites under `packages/native/tests/` — run on the desktop, no device or GPU surface needed.

### Multi-pass paint

`multi_paint_test.cc` — SetMultiPaint installs a full pass list with independent per-pass state on the retained node (bumping paint_version), a second command REPLACES the list, an empty payload clears it, and an unknown node id is a no-op.

### Animation engine

`animation_test.cc` — the overlay model end to end: delay freeze, iteration fold, infinite, autoReverse, fill none/forwards, conflict cancel, replace, clear, RemoveNode safety, multi-track, multi-keyframe.

### Retained tree versioning

`retained_tree_version_test.cc` — command-batch versioning and retained-tree state transitions: inserts/removes/moves keep the tree consistent, stale ids never validate, corner radii set and clear.

### Render build cache

`render_cache_core_test.cc` — the §15 invalidation contract: paint/geom version bumps, structure epoch, animation ticks bump nothing, LRU caps degrade to uncached lanes.

### BiDi line assembly

`bidi_line_test.cc` — SheenBidi runs assemble into visual order per line; RTL output needs no second reversal; mixed-direction runs split correctly.

### Paragraph justification slack

`paragraph_justify_test.cc` — the shared inter-word justification policy (`JustifyLineSlack`): slack splits evenly across interior spaces; last/ellipsized/space-less/overflowing lines fall back to left.
