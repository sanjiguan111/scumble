# Feature parity with React Native Skia

> Snapshot: 2026-08-21 (baseline: [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia) 2.11.0, Skia m152). Covers **geometry drawing** (`<Rect>`/`<Circle>`/`<Path>` …, paint, transform, clip), **`<Image>`**, and **`<Paragraph>`** — the focus so far. Remaining non-geometry surfaces (Vertices …) are listed for completeness.
>
> Cross-reference: native architecture & command-stream details live in [`packages/native/RENDER_ARCHITECTURE.md`](packages/native/RENDER_ARCHITECTURE.md). Status legend: ✅ implemented · ⚠️ partial · ❌ missing.

---

## A. Shape geometry

| Capability                                     | Status | Notes                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rect / RRect                                   | ✅     | RRect = rect + `rx`/`ry`                                                                                                                                                                                                                                |
| Circle                                         | ✅     |                                                                                                                                                                                                                                                         |
| Path (`d` string / Path2D)                     | ✅     | Full SVG command set M/L/H/V/C/S/Q/T/A/Z; + `start`/`end` trim                                                                                                                                                                                          |
| **Ellipse**                                    | ✅     | `<Ellipse cx cy rx ry>` → `gesso-ellipse` (native DrawShape `ellipse` branch)                                                                                                                                                                           |
| **Line**                                       | ✅     | `<Line x1 y1 x2 y2>` → `gesso-line`; stroke-only (defaults `style="stroke"`, explicit fill ignored natively)                                                                                                                                            |
| **Polyline / Polygon**                         | ✅     | `<Polyline>`/`<Polygon>` render via the native points channel (`SetGeometry.points` float vector, incremental updates; commits `7eccd03`/`a80b2a1`). Polyline defaults `stroke`, Polygon defaults `fill`                                                |
| **Points (`pointMode`: points/lines/polygon)** | ✅     | `<Points mode>` compiled to path commands at the react layer — `points`: zero-length segments + `strokeCap="round"` (diameter = `strokeWidth`, how Skia's `drawPoints` works too); `lines`: point pairs; `polygon`: polyline. Defaults `style="stroke"` |

> `parsePoints` (SVG `points` string → `{x,y}` pairs) now lives in `@gesso/graphics` alongside the other string parsers.

## B. Paint

| Capability                                                                           | Status                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| fill / stroke / color / strokeWidth / strokeCap / strokeJoin / strokeMiter / opacity | ✅                                                                                                                                                                                                                                                                                                                                                                                               |
| Gradient (linear / radial / sweep / two-point-conical) on fill **and** stroke        | ✅                                                                                                                                                                                                                                                                                                                                                                                               |
| `<Paint>` declarative child (independent fill & stroke paint)                        | ✅                                                                                                                                                                                                                                                                                                                                                                                               |
| **BlendMode**                                                                        | ✅ All 28 Skia modes on every shape, `<Paint>`, and `Group` (inheritable); one mode shared by the fill and stroke paints (`SetPaint.blend_mode`)                                                                                                                                                                                                                                                 |
| **dash array / dashOffset (dashes)**                                                 | ✅ `dash`/`dashOffset` on every shape (and `<Paint style="stroke">`); transported as base64 LE float32 on `SetPaint.stroke_dash` + phase, applied via skity `MakeDashPathEffect`. Odd arrays repeat once (SVG semantics); invalid patterns fall back to solid                                                                                                                                    |
| **ImageFilter (Blur / DropShadow)**                                                  | ✅ Declarative children `<Blur blur>` / `<DropShadow dx dy blur color>`; several of the same kind compose in declaration order (first declared = innermost). Transported as base64 Filter bytes on the new `SetPaintFilter` command, turned into skity filter objects at paint construction. No `inner`/`shadowOnly`, and no Morphology (Dilate/Erode) — skity's HW backend doesn't implement it |
| **ColorFilter (ColorMatrix / Blend)**                                                | ✅ `<ColorMatrix matrix>` (20 row-major) / `<ColorBlend mode color>`; same SetPaintFilter channel, composable in order. Gamma/larp variants not wired                                                                                                                                                                                                                                            |
| **MaskFilter (Blur)**                                                                | ✅ `<MaskBlur blur style>` (style: normal/solid/outer/inner; skity's BlurStyle is 1-based, not Skia's 0-based). Mask slot takes the first maskBlur (no compose)                                                                                                                                                                                                                                  |
| per-shape antiAlias toggle                                                           | ❌ Hard-wired `true`                                                                                                                                                                                                                                                                                                                                                                             |

## C. Transform / clip / layering

| Capability                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| translate / scale / rotate / matrix / skew               | ✅                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Group clip (clipRect / clipPath / RRect)**             | ✅ RN-Skia-style declarative children `<ClipRect>`/`<ClipRRect>`/`<ClipPath>` (`op: intersect\|difference`, combined in order); transported as a base64 ClipList on a new `SetClip` command, applied after the group's transform. ClipRRect radii: uniform / per-axis only (no per-corner)                                                                                                               |
| **Group paint inheritance** (color / opacity to subtree) | ✅ Render-time resolution via `RetainedComputedStyle.explicit_paint` (the SetPaint dirty bits): unset fields fall back to the nearest ancestor; opacity multiplies. Inherits fill/stroke paint (color + gradient), stroke attrs, dash, fillRule. NOT paint-inherited: geometry, display/visibility (transform is not a paint attribute, but its matrix composes geometrically down the tree — cascading) |
| **Exact group opacity (saveLayer)**                      | ⚠️ Approximate — folded into each paint's color alpha; exact for leaves, lossy for overlapping groups                                                                                                                                                                                                                                                                                                    |

## D. Path advanced

| Capability                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`/`end` trim                        | ✅ Every contour trimmed independently against its own length (Skia `SkTrimPathEffect` semantics): one `PathMeasure` walked with `NextContour` + `GetSegment` appends exact curve segments                                                                                                                                                                                                                                                                                          |
| Path ops (union / intersect / diff / xor) | ✅ `Path2D.op(one, two, op)` — a **lazy** composition (no JS geometry math; no channel back to JS — Android public SDK has NAPI disabled). Serialized as a nested `PathOpList` (left-fold operand chain; right-nested compositions ride a `nested` sub-tree) on the `SetPathOpData` command; the renderer evaluates per frame with skity `PathOp::Execute` (a failed operand is skipped). No ReverseDifference (skity doesn't expose it); trim/fillRule apply to the boolean result |
| dash PathEffect                           | ✅ Same mechanism as B (skity `MakeDashPathEffect`); declarative `DashPathEffect` component not offered — `dash`/`dashOffset` props instead                                                                                                                                                                                                                                                                                                                                         |
| corner / discrete / trim-as-effect        | ❌ skity `path_effect.hpp` exposes only `MakeDiscrete` + `MakeDash` factories                                                                                                                                                                                                                                                                                                                                                                                                       |

## E. Non-geometry surfaces

| Capability                                                           | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image**                                                            | ✅     | `<Image image x y width height fit sampling>` + `useImage(source)` — RN-Skia-style API. `fit`: all seven values (fill/contain/cover/fitWidth/fitHeight/none/scaleDown, Flutter BoxFit semantics) resolved at render time against the bitmap's intrinsic size. `sampling`: `{ filter, mipmap, cubic: {B, C} }` — filter (nearest/linear) + mipmap (none/nearest/linear) ride `SetImageSource` (value order == skity); defaults linear/none match the pre-sampling behavior. Sources: `data:` URIs and `http(s)` URLs built-in (Android HttpURLConnection/BitmapFactory, iOS NSURLSession/CGImageSource), host-injectable loader on both platforms. Pixels travel platform→ImageStore (uri-keyed, render-thread only)→`DrawImageRect`; inherited opacity/blendMode/filters apply (fill color does not). **Differences vs RN-Skia**: `useImage` returns the handle immediately (no null-while-loading phase, no onError — no native→JS channel); mipmap modes pass through but need the GPU texture to carry a mip chain; no imperative `Skia.Image.*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Text / Paragraph**                                                 | ✅     | `<Paragraph width>` + `<TextSpan>` children — styled spans serialize to base64 `SpanList` bytes on the `spans` prop (text + styles only; glyphs never cross JS). Layout runs in the TASM measure pass — iOS CoreText, Android HarfBuzz + skity `FontManager` fallback + a shared space/CJK-kinsoku line breaker — so the measured height feeds Lynx layout synchronously; `onLayout` (async `"layout"` LynxDetailEvent) carries `{height, lineCount}`. The laid-out glyph runs ride the **extra-bundle side channel** next to the command batch (`ParagraphRunList`, node-id keyed, entry-level idempotent overwrite), fonts cross threads through the shared `FontRegistry`, and the renderer draws one `DrawGlyphs` per run (glyph atlas handles the rest). `textAlign` (left/center/right), `lineHeight` multiplier, `maxLines` + ellipsis, custom fonts by URI (inline `data:` base64 ttf/otf, or schemed `http(s)`/`file`/host sources via a host-injectable loader — a miss falls back to the default font, bytes landing asynchronously re-trigger layout), and node-level gradient fills + color filters through the glyph-atlas paint, and `direction` (ltr/rtl/auto) BiDi reordering — CoreText's built-in UAX #9 on iOS, SheenBidi statically linked + per-bidi-run HarfBuzz shaping on Android. **Differences vs RN-Skia**: no imperative `ParagraphBuilder`/JSI — layout is native by necessity (public Lynx Android SDK compiles NAPI off); no justification; image-shader fills and blur filters on text are ignored by skity's glyph pipeline (upstream). See [TEXT_PARAGRAPH_DESIGN.md](TEXT_PARAGRAPH_DESIGN.md) + RENDER_ARCHITECTURE.md §13 |
| Vertices / Mesh / Patch, Atlas, Picture                              | ❌     | skity has no mesh-drawing primitive; Picture-style record/replay is structurally covered by the CommandBatch itself (replayable), but no user-facing API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| BackdropFilter (glass/blur-behind)                                   | ❌     | The canvas is a standalone GL surface — layer-compositor content underneath is not reachable in the Lynx composition model. Not fixable without a compositor hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| RuntimeEffect (SkSL) / procedural shaders (FractalNoise, Turbulence) | ❌     | skity exposes no shader-injection path and no built-in noise shaders; also a JIT-shader surface we'd rather not open on-device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| non-gradient Shader — **ImageShader**                                | ✅     | `<ImageShader image fit rect tx ty>` — declarative child like the gradients (data-only; routed by `resolvePaint` to the fill/stroke slot the shape draws with, also nested in `<Paint style=…>`). Flattened to scalar `SetPaint` fields (uri/fit/tx/ty bytes + rect `[float]`, new FILL/STROKE_IMAGE_SHADER bits) — no nested bytes. The uri doubles as the ImageStore key AND the platform loader request (the TASM setter fires it, same as `<Image>`); a shader-filled shape stays blank until pixels land, then the live-session redraw picks it up. `fit`/`rect` resolve at render time (same `ApplyBoxFit` math as `<Image>`, tiled outside the fitted area per `tx`/`ty`); rect omitted = 1:1 tiling. Sampling fixed linear/none (RN-Skia's ImageShader exposes no sampling either); no `transform` prop. FractalNoise/PerlinNoise & other procedural shaders still ❌                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## F. Gap taxonomy vs RN-Skia (2026-08-21)

Overall: geometry ~95%, paint ~90%, text ~85%. What remains falls into four
buckets by ROOT CAUSE — the bucket decides whether a gap is schedulable work
at all.

### F.1 Same-name components, different semantics (fixable, touches the command stream)

1. ~~**Nested transforms don't cascade**~~ — **retracted (2026-08-21)**: the
   renderer has cascaded since the initial commit (`DrawNode`:
   `Save → ApplyTransform → recurse children → Restore`, standard Skia canvas
   semantics; the viewport matrix is the outermost layer). The "no cascade"
   claim was a documentation misreading of "transform is not a _paint_
   inheritance attribute". The real gap was the React API surface — shapes
   had no `transform` prop and op arrays weren't accepted — both fixed
   2026-08-21 (`GraphicProps.transform`, `TransformProp` array composition).
2. **Group opacity is approximate** — folded into each paint's color alpha
   (exact for leaves, lossy where a group's children overlap); RN-Skia does a
   saveLayer offscreen composite.
3. **Single paint slot** — blendMode/opacity are shared by the fill and
   stroke paints; RN-Skia keeps them independent, and multiple `<Paint>`
   children draw multiple passes (we have a fixed fill+stroke double pass).
4. Minor: no per-corner ClipRRect radii; antiAlias hard-wired true;
   DropShadow has no `inner`/`shadowOnly`.

### F.2 skity upstream limits (needs an upstream change or a workaround)

- Morphology (Dilate/Erode) — not implemented by the HW backend.
- Image-shader fills and blur filters on text — the glyph pipeline consumes
  gradient + ColorFilter only.
- Vertices / Patch (coons mesh) / Atlas — no mesh-drawing primitive.
- DisplacementMap/Offset image filters; FractalNoise/Turbulence; Corner and
  Discrete path effects.

### F.3 Architecture limits (Android public SDK compiles NAPI off → no synchronous JSI)

- **Imperative API** — `Skia.Canvas/Path/Paint/Image` objects, `draw*` calls,
  ParagraphBuilder, `getImageBytes`/encode, `makeImageFromView`: everything
  needing a native→JS channel or JS-held objects. This is WHY the whole
  library is declarative + serialized command stream (v1 design decision).
- **Animation value system** — RN-Skia 2.x shared values / `select` drive
  animated props straight into native, bypassing React; we go React state →
  setter → command stream, and rAF does not drive redraws (setInterval is
  the current ceiling). Highest-pain scenario today.
  _Investigated 2026-08-21 — see §G: the React-bypassing channel EXISTS
  (worklet/MTS via `main-thread:`; the `element.invoke()` UIMethod variant
  is preferred). CSS animation and `Element.animate()` are closed-whitelist
  and can never drive custom props. JS rAF is pipeline-decoupled — that is
  the root cause above, and the worklet rAF is its flush-forcing mirror._
- `useImage` loading/onError phases (no native→JS state channel).

### F.4 Lynx composition-model limits

- BackdropFilter — the canvas can't see compositor layers beneath it.
- MaskedView-style native-view/canvas blending — SkityCanvasUI is not a
  UIGroup (native elements can't live inside the canvas).

### F.5 What we have that RN-Skia doesn't

- Canvas `viewPort` — SVG viewBox semantics + preserveAspectRatio (RN-Skia
  emulates with a manual Group scale).
- The command stream is serializable/replayable by construction (future
  record/replay, snapshots).
- Naming follows SVG conventions (cx/cy/radius, x1y1x2y2) vs RN-Skia's vecs.

---

## G. Animation path investigation (2026-08-21) — findings

Question (roadmap #11): does the Lynx ecosystem offer a React-bypassing
value driver — the analog of RN-Skia worklets/shared values? Investigated
against the local Lynx engine source tree (`template-assembler/lynx`).
**Verdict: yes — animation parity is reachable.** The channel is the
worklet/MTS main-thread script (plus a native self-driving option);
CSS animation is a dead end for custom props.

### G.1 Channel matrix

| Channel                                             | Verdict            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JS-thread `requestAnimationFrame`                   | ✗                  | A vsync-scheduled JS callback and nothing more: after callbacks run there is no `SetNeedsLayout`/`OnPatchFinish` — zero coupling to the render pipeline (`core/runtime/js/bindings/js_app.cc` `RequestAnimationFrame`/`DoFrame`). Root cause of "rAF doesn't drive redraws". `setInterval`+setState works only because setState → patch → flush.                                                                                                     |
| CSS animation / transition                          | ✗ for custom props | Closed compile-time whitelist (~40 `CSSPropertyID`s via `ALL_ANIMATABLE_PROPERTY_ID`); hardcoded curve if-else chain, unknown properties dropped at parse (`core/animation/css_keyframe_manager.cc:116-224`, `core/renderer/css/css_style_utils.cc:1308-1335`). No `@property`, no passthrough to the platform layer. Interpolation itself is native (TASM thread, vsync-ticked, paint-only props skip layout) — a good engine behind a closed door. |
| `Element.animate()` (WAAPI-style, 3.4+)             | ✗ for custom props | Shares the same keyframe interpolation whitelist (`css_keyframe_manager` path).                                                                                                                                                                                                                                                                                                                                                                      |
| Worklet (Lepus/MTS) `element.setAttributes`         | ✓                  | Runs on the TASM engine thread; attribute namespace is OPEN — any string key lands in the PropBundle and reaches the `@LynxProp` setter (`core/renderer/worklet/lepus_element.cc` `SetAttributes` → `UpdateLayoutNodeProps` → platform `updateUIWithSign`). Worklet rAF forces a per-frame flush (`core/renderer/worklet/lepus_raf_handler.cc:114-117`). React entry: `main-thread:` props / `runOnMainThread`.                                      |
| Worklet `element.invoke()` (UIMethod)               | ✓ preferred        | Direct dispatch to `LYNX_UI_METHOD`-declared methods on the custom UI; no attribute diff, no layout pipeline (`lepus_element.cc` `InvokeUIMethod` → `Catalyzer::Invoke` → `LynxUIOwner invokeUIMethod`).                                                                                                                                                                                                                                             |
| Native self-driving (Choreographer / CADisplayLink) | ✓                  | What Lynx's own built-ins do (Android `UIList`, iOS `LynxUIScroller`); same system-vsync source as Lynx's internal `VSyncMonitor`s. Our canvas already self-paints, so a native animator can interpolate on the retained tree with zero Lynx pipeline involvement.                                                                                                                                                                                   |

Note: there are TWO rAFs in Lynx. JS-thread rAF (no flush, the one we
hit) vs worklet/TASM rAF (flush-forcing). Also, `LynxBaseUI` on Android has
an `onAnimationUpdated()` hook fired on CSS-animation frames — but it only
sees whitelisted standard properties, so it's a curiosity, not a channel.

### G.2 Two-stage plan

1. **Stage 1 — invoke-driven animated values** (RN-Skia shared-value
   equivalent): the animation loop interpolates values and calls
   `element.invoke('<method>', {...})` (or `nodeRef.invoke`) into the
   canvas UI, which writes the retained tree and invalidates itself.
   One hop bypasses React + attribute diff + the Lynx flush pipeline —
   our canvas self-paints, so invalidate alone repaints. Two lanes:
   - iOS / worklet-enabled SDKs: `main-thread` worklet runs its
     flush-forcing rAF and interpolates on the TASM engine thread.
   - Android public-SDK fallback: JS-thread rAF + `SelectorQuery`
     `nodeRef.invoke` (no worklet, no napi needed — see G.4).
2. **Stage 2 — native interpolation engine** (beyond RN-Skia parity):
   a declarative animation spec (keyframes/easing/duration) rides the
   command stream once; a Choreographer/CADisplayLink animator on the
   native side interpolates directly on the retained tree. Zero JS/Lepus
   work per frame, identical on both platforms — the long-term answer
   that also de-risks G.4. Plays to the "command stream is serializable"
   asset (F.5) and matches how Lynx's own CSS engine animates (native
   tick).

### G.3 Verification results (stage 1, 2026-08-21) — all PASS

- **ReactLynx API — PASS.** `@lynx-js/react` 0.123.2 ships
  `runOnMainThread`, `useMainThreadRef<MainThread.Element>`,
  `main-thread:ref` / `main-thread:<event>` props. Compile chain:
  `pluginReactLynx()` handles worklets unconditionally (dual entry
  `<entry>__main_thread`, MAIN_THREAD layer, swc LEPUS target,
  worklet-runtime auto-injected once a `'main thread'` fn exists) —
  zero changes needed to example's `lynx.config.ts`; `main-thread.js`
  - `background.js` already in `dist/.rspeedy/main/`.
- **Element access — PASS, better than expected.** Prefer
  `main-thread:ref` direct binding — no selector involved (it also tags
  `has-react-ref` so the node survives layout-only optimization). Plain
  React `ref` only yields a `RefProxy` (async selector query), not the
  element. Worklet `lynx.querySelector` supports `#id/.class/tag/
[attr=v]` (no `*`/pseudo-classes); React components create NO nodes —
  only host elements exist, and our `<canvas>` IS a host element, so it
  is selectable as well.
- **Android UIMethod — PASS.** `@LynxUIMethod` + `@LynxUIMethodsHolder`
  - `lynx-processor` (`org.lynxsdk.lynx:lynx-processor` via kapt —
    official precedent: lynx_xelement) generates a `$$MethodInvoker`
    switch table; signature `(ReadableMap params, Callback callback)`.
    Even without kapt a runtime reflection fallback works (public methods
  - R8 keep; throws only under DevTool debug + `checkPropsSetter`).
    NAPI-off affects none of the three entry paths (jsbridge
    `lynx.invokeUIMethod`, SelectorQuery `nodeRef.invoke`, lepus
    `InvokeUIMethod`).

### G.4 Open risk: worklet needs napi binding (Android public SDK)

`core/napi.gni`: `enable_napi_binding ||= enable_lepusng_worklet` — the
lepusng worklet runtime compiles on top of libnapi. Since the public
Android `liblynx.so` ships with NAPI compiled out (F.3), the entire
`main-thread:` / `runOnMainThread` surface may be dead on the public
Android SDK (the tree default `enable_lepusng_worklet=false` is
consistent with this). MUST smoke-test on the example app before
committing to the worklet lane; the `nodeRef.invoke` fallback lane and
Stage 2 are unaffected either way.

---

## Suggested roadmap (cost/benefit order)

1. ~~**`<Ellipse>` / `<Line>` wrappers**~~ — done, plus `Polyline`/`Polygon` (compiled to paths).
2. ~~**Dashes**~~ — done (`SetPaint.stroke_dash` transport + `MakeDashPathEffect`).
3. ~~**Group clip + paint inheritance**~~ — done (`SetClip` command + render-time inheritance via `explicit_paint`).
4. ~~**BlendMode**~~ — done (`SetPaint.blend_mode`, applied to both paints, inheritable).
5. ~~**`<Points pointMode>`**~~ — done (react-layer compilation to path commands; zero-length segments + round cap for `points` mode).
6. ~~**Path ops**~~ — done (`Path2D.op` lazy composition → `SetPathOpData` → render-time `PathOp::Execute`; see RENDER_ARCHITECTURE.md §11.13).
7. ~~**Image**~~ — done (`SetImageSource` command + platform image loader + render-thread `ImageStore`; see RENDER_ARCHITECTURE.md §12).
8. ~~**Text / Paragraph**~~ — done (platform layout backends + the extra-bundle glyph-run side channel; see RENDER_ARCHITECTURE.md §13). ImageShader landed with §12.
9. ~~**BiDi/RTL**~~ — done (2026-08-21, `direction` prop + SheenBidi/CoreText; §13).
10. ~~**Transform cascade**~~ — done by retraction (2026-08-21): rendering
    always cascaded; what shipped is the React API completion — `transform`
    on every shape/`Group`/`<Paragraph>` + op-array composition
    (`TransformProp`), zero native changes.
11. ~~**Animation path investigation** (F.3)~~ — investigated 2026-08-21,
    verdict **yes** (details in §G): worklet (`main-thread:`) rAF +
    `element.invoke()` UIMethod is the RN-Skia-worklet equivalent; CSS
    animation / `Element.animate()` are closed-whitelist and can never
    drive custom props; a native Choreographer/CADisplayLink animator is
    the long-game option. Follow-ups:
    - **11a. Stage 1: invoke-driven animated values** (§G.2, §G.3 verified
      PASS) — shared-value API in `@gesso/react`; worklet lane where
      available, `nodeRef.invoke` lane elsewhere. First step: smoke-test
      `main-thread:` on the Android public SDK (§G.4 risk).
    - **11b. Stage 2: native interpolation engine** (§G.2) — **done
      (2026-08-25)**: `SetAnimation` command + overlay interpolation +
      Choreographer/CADisplayLink stop-on-idle drivers + `animate` prop on
      every shape/Group/Canvas. Design `packages/native/ANIMATION_DESIGN.md`,
      as-built RENDER_ARCHITECTURE.md §14, demo `AnimationDemo`.
    - **11c. Playback control + finish event** — **done (2026-08-27)**:
      `createAnimation().controller.{pause,play,seekTo,cancel,onFinish}`
      (the spec IS the controller — no hooks/refs, shapes stay plain
      functions) over the canvas root's UIMethod invoke lane (no NAPI —
      §G.3); JS-minted playback handles ride `SetAnimation` (native
      `node_id` never crosses to JS); `skityAnimationFinish` custom event
      demuxed by handle. `play` wakes the stop-on-idle driver, `seek`
      re-evaluates the overlay off-vsync (WAAPI `currentTime` semantics).
      Design + as-built deviations:
      `packages/native/ANIMATION_CONTROL_DESIGN.md`, demo `PlaybackDemo`.
      Same plumbing carries the future `setValue` gesture lane.
    - **11d. Gesture-driven values (`setValue` lane)** — designed, NOT
      implemented (sketch: `ANIMATION_CONTROL_DESIGN.md` §9). The last
      big animation-parity gap (reanimated shared-value semantics):
      `controller.setValue(property, value)` per touchmove writes the
      node's overlay slot + invalidates on the render thread — canvas
      self-paints, no flush-forcing rAF, zero React per frame. Conflict
      rule already shipped (external write cancels the conflicting
      track via the D2 hooks); hand-off to a spring is a fresh
      SetAnimation on the same handle. Rides the exact invoke plumbing
      11c built (handle map, UI method, threading).
12. **Multi-`<Paint>` multi-pass + exact group opacity** (F.1.2/F.1.3) —
    needs a saveLayer-equivalent; verify skity exposes one first.
13. **Small-items bundle** (F.1.4 + justification) — per-corner radii,
    antiAlias toggle, DropShadow variants, paragraph justification.
14. **Explicitly out of scope** — BackdropFilter, Vertices/Atlas/Patch,
    SkSL/RuntimeEffect, imperative API (F.2–F.4: double-constrained by
    upstream and architecture; worst effort/return on this list).
