# Native Animation Engine (Stage 2) — Design

Status: **IMPLEMENTED 2026-08-25** (all six phases). As-built notes live in
RENDER_ARCHITECTURE.md §14; deviations from this doc: the prop is named
`animationData` (Lynx's StandardProps reserves `animation`), the shared core
files are `node_animation.{h,cc}` (CocoaPods header-map collision with the
Lynx pod's `core/animation/animation.h`), and the keyframe-easing fallback
resolves in the JS builder (FlatBuffer defaults cannot express "inherit").

Origin: FEATURE_PARITY.md §G (animation path investigation) — roadmap #11b.
The investigation verdict: CSS animation is closed-whitelist (can never
drive custom props), the worklet lane carries an open Android public-SDK
risk (§G.4: lepusng worklet compiles on top of libnapi), and the highest
ceiling is a native interpolation engine that bypasses JS/Lepus and the
Lynx pipeline entirely. This document is the implementation design.

Companion reading: RENDER_ARCHITECTURE.md §11 (retained tree + command
stream — this engine is a pure extension of it).

---

## 1. Problem

Today every animation demo runs `setInterval(16ms) → setState → prop →
markDirty → layout flush`. That is the F.3 "highest-pain scenario":
per-frame React render + JS-thread scheduling jitter + a full Lynx
layout-pass round trip per frame. Root causes (all structural, §G.1):

- Lynx's JS-thread `requestAnimationFrame` is a vsync-scheduled JS
  callback with **zero pipeline coupling** (no `SetNeedsLayout` /
  `OnPatchFinish` after callbacks run) — it can never drive repaints.
- Lynx 4.0.1 exposes no ShadowNode frame callback; the layout pass is
  the only flush channel for pure-painting props (§11.7).

## 2. Goal / non-goals

**Goal**: an animation spec (keyframes / easing / duration / loop) rides
the existing command stream **once**; a native per-frame vsync tick
interpolates the retained tree and repaints. Zero JS/Lepus work per
frame, zero Lynx pipeline involvement per frame, identical code path on
iOS and Android.

**Non-goals (first cut)**: `points` animation (variable-length), spring
easing, gesture-driven values (a later `invoke` lane can reuse the
overlay write path), Harmony (scaffold only).

## 3. Architecture overview

```
JS (React)     animate prop ──buildAnimationList──▶ base64 AnimationList bytes
TASM thread    setter stores bytes + dirty flag; measure() drains a SetAnimation
               command (node_id + nested bytes) into the CommandBatch   [existing machinery]
Render thread  ApplyCommandBatch → parses tracks onto RetainedNode (C++ structs)
               vsync driver (Choreographer/CADisplayLink) forwards frame time
               ──▶ TickAnimations(now): interpolate → write AnimationOverlay
               ──▶ drawIfReady()  (full repaint, as today)
```

The engine lives **entirely on the render thread** (iOS:
`com.skity.lynx.queue`; Android: `SkityRenderThread`/Vulkan twin), next
to the retained tree it animates — single-threaded by contract, **zero
locks** (same rationale as §11.12). The vsync source callback does
nothing but one `dispatch_async`/`handler.post` forward.

## 4. Design decisions

### D1 — Eager per-tick evaluation into an overlay; base fields are never written

- Tick: `TickAnimations(now_ns)` walks active animations, interpolates,
  writes each node's `AnimationOverlay`; returns whether anything is
  still live (drives start/stop of the vsync source and the repaint).
- Rejected lazy sampling inside `Draw`: `SkityRenderer::Draw` takes a
  `const RetainedRenderTree*` and stays pure-read; stop-on-idle wants
  liveness and evaluation in the same pass; full repaint is the status
  quo so laziness saves nothing meaningful.
- Rejected writing base fields: CSS-like semantics (fill=none returns to
  base; a conflicting command cancels the track) require base to remain
  intact; the overlay keeps it by construction.
- **transform byte-payload trap**: `transform_data` is JS-built
  TransformOpList bytes parsed every frame. The overlay stores resolved
  components (tx/ty/rotateDeg/sx/sy + pivot) and `ApplyTransform`
  **appends** them after the base ops loop (post-multiply). The bytes are
  never rebuilt — zero FlatBuffer work, zero allocation on the render
  thread.
- **explicit_paint trap**: when a fill/stroke/opacity track is active,
  `DrawNode` copies `node->style` into a local, writes the animated
  values and sets the corresponding `explicitPaint` bits — reusing the
  existing inheritance merge unchanged.

### D2 — Conflict & lifecycle semantics (CSS-like, last-writer-wins)

| Scenario                                                                                            | Semantics                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `SetAnimation` for a property that already has a track                                          | replace; runtime state resets (t=0, first tick stamps start)                                                                                                                                |
| `SetAnimation` with empty data                                                                      | clears ALL animations + overlay on the node                                                                                                                                                 |
| Command stream sets an animated property while active (`SetPaint` / `SetGeometry` / `SetTransform`) | cancels the conflicting track(s) + clears its overlay slot; command value takes effect immediately (gradient / image-shader bits also cancel a FILL_COLOR track — the paint _type_ changed) |
| Natural end, `fill=none` (default)                                                                  | overlay slot cleared → value returns to base; the ending frame still paints                                                                                                                 |
| `fill=forwards`                                                                                     | final value pinned in overlay (track marked finished+holding); does NOT keep the driver running                                                                                             |
| React re-renders with a changed `animate` prop                                                      | new `SetAnimation` → per-property replace + restart                                                                                                                                         |
| `RemoveNode` / tree teardown                                                                        | node destruction releases its animation state; tree-side `animated_ids_` removes the id; driver stops when fully idle                                                                       |

### D3 — Schema: one property per track, many tracks per node

First-batch properties (17): `opacity`, `translateX`, `translateY`,
`rotate` (pivot), `scale` (sx+sy, pivot), `pathStart`, `pathEnd`,
`fillColor`, `strokeColor`, `x`, `y`, `width`, `height`, `cx`, `cy`, `r`.

### D4 — Frame driver: one singleton per platform, forward-only callbacks, stop on idle

- Weak-reference session registry (mirrors the image-arrival precedent:
  `SkityImageController` / `SkityImageLoaderRegistry`) distributes ticks
  to every live canvas.
- Android: `Choreographer.postFrameCallback` → one `renderHandler.post`;
  iOS: `CADisplayLink` on the main runloop → one `dispatch_async` onto
  the render queue. **Never touch the tree off the render thread**
  (lesson of the `purgeRetainedTreeForKey` use-after-free fix).
- Start: `driver.wakeUp()` at the end of `applyCommands` (a batch may
  have installed new animations while the driver was stopped).
- Stop: a frame in which every session's tick returns false.
- Timestamps come from the frame callback itself (`frameTimeNanos` /
  `targetTimestamp`) — never a fresh wall-clock read inside the tick.
- At most one in-flight tick at a time.

### D5 — React API

`GraphicProps.animate?: AnimationSpec | AnimationSpec[]` (entries may be
`null`/`false`, filtered out). `AnimationSpec = { property, from?, to?,
keyframes?, duration, delay?, easing?, loop?, autoReverse?, fill?,
cx?, cy? }`. `easing` accepts a name or a 4-tuple (cubic-bezier
control points). Colors accept any `Color` the library already parses.

### D6 — Easing: hand-written pure functions

`shared/skity/easing.{h,cc}`: LINEAR / EASE_IN / EASE_OUT /
EASE_IN_OUT (cubic-bezier presets) / CUBIC_BEZIER(x1,y1,x2,y2 —
bisection on monotone Bezier x, ≤24 iterations, 1e-6) / STEP_START /
STEP_END. Extensible by tail-append.

## 5. Implementation phases (each independently verifiable & revertible)

### Phase A — schema + codegen

- `schema/render_tree_style.fbs`: after `Filter`, add
  `enum AnimatedProperty : byte` (17 values), `enum EasingKind : byte`,
  `enum FillMode : byte`, `table Keyframe { offset, value, value2, color,
easing, p1x/p1y/p2x/p2y }`, `table AnimationTrack { property, duration,
delay, iterations (-1 = infinite), auto_reverse, fill, easing,
keyframes[], cx, cy }`, `table AnimationList { tracks[] }`.
- `schema/command_batch.fbs`: append `SetAnimation` to the `Command`
  union **at the tail** (13th member; union order is wire order);
  `table SetAnimation { node_id:int = -1; data:[ubyte]
(nested_flatbuffer: "AnimationList"); }` (pattern of `SetClip`).
- `pnpm --filter @scumble/native generate-fbs` → C++/Java/TS stubs.

### Phase B — shared C++ core (no platform code, zero regression surface)

- New `shared/skity/easing.{h,cc}` (D6).
- New `shared/skity/animation.{h,cc}`:
  - `AnimationOverlay` — fixed-size mask + slots (opacity, tx/ty, rotate,
    sx/sy, pivot, path_start/end, x/y/w/h/cx/cy/r, fill/stroke colors).
  - `RetainedAnimation` — parsed C++ structs (never raw bytes) + runtime
    fields (`start_ns`, `finished`, `holding`).
  - `ApplySetAnimation` (parse → per-property replace; empty = clear all),
    `CancelAnimationsFor(node, property_bits)`,
    `EvaluateTrack` (delay → iteration folding → autoReverse → keyframe
    segment search → easing),
    `RetainedRenderTree::TickAnimations(now_ns)`.
- `retained_render_tree.h/.cc`: `RetainedNode.anim`; tree-level
  `animated_ids_` (ids, not pointers); `case Command_SetAnimation:`;
  conflict-cancel hooks at the end of `ApplySetPaint` /
  `ApplySetGeometry` / `SetTransform`; `EraseSubtree` removes subtree ids.
- `SkityRenderer.cc` three read-only hooks: `ApplyTransform` (signature
  takes the node; appends overlay components after base ops), `DrawNode`
  (local style copy + explicitPaint bits when paint slots active),
  `DrawShape` geometry/trim reads go through overlay accessors.
- Build registration: `android/CMakeLists.txt` source list +
  `scumble.podspec` source/public header files.
- Tests: `tests/easing_test.cc`, `tests/animation_test.cc` (builder-made
  batch → Apply → synthetic timestamps → assert delay freeze, loop
  folding, autoReverse, fill none/forwards, command-conflict cancel,
  RemoveNode cleanup); register in `tests/CMakeLists.txt`.

### Phase C — TASM wiring both platforms (base64 prop → command)

- iOS: `SkityNodeBase.h/.m` `animation` prop (pattern of `setClip:` —
  base64 → NSData, dirty flag, `setNeedsLayout`);
  `SkityCanvasShadowNode.mm` `SkityCollectCommands` branch (pattern of
  the dirtyClip branch).
- Android: `SkityNodeBase.kt` `@LynxProp(name = "animation")` setter
  (pattern of `setTransform`); `SkityCanvasShadowNode.kt`
  `collectCommands` branch.

### Phase D — frame drivers

- Android: new `render/SkityAnimationDriver.kt` (singleton; weak session
  list; Choreographer forward; wakeUp/doFrame/stop-on-idle);
  `SkityRenderSession` interface gains `tickAnimations(nowNanos):
Boolean`; GL + Vulkan sessions implement via new
  `SkityNative.nativeTickAnimations(handle, now)` (JNI in `skity_jni.cpp`,
  pattern of `nativeApplyCommands`) + `drawIfReady()` when live;
  `applyCommands` ends with `driver.wakeUp()`; `SkityCanvasView`
  registers its session; `AppRenderer::TickAnimations` forwards to the
  tree.
- iOS: new `Render/SkityAnimationDriver.{h,mm}` (singleton; `NSHashTable`
  weak sessions; CADisplayLink on main runloop forwarding to the render
  queue); `SkityMetalContext` gains `tickAnimations:treeKey:`;
  `SkityRenderSession` gains `tickAnimations:` + registers + wakeUp after
  apply.

### Phase E — JS builder + React API

- New `packages/graphics/src/animation.ts`: `buildAnimationList(tracks)`
  (pattern of `gradient.ts`): from/to sugar → two keyframes, offset
  evenization, easing name/tuple mapping, colors via `parseColor`;
  export from `index.ts`.
- `packages/react/src/types.ts`: `AnimationSpec` etc.;
  `GraphicProps.animate?`.
- New `packages/react/src/internal/animation.ts`: `resolveAnimation()`
  (pattern of `internal/transform.ts`) → base64 string.
- One-line hookup in `shapes/*.tsx` (11 files) + `Group.tsx` +
  `Canvas.tsx`.
- `packages/native/src/elements.ts`: `SkityPaintProps.animation?: string`
  (all 11 intrinsic tags inherit it).

### Phase F — demo + tests + as-built docs

- New `packages/example/src/demos/AnimationDemo.tsx`: trim draw-on loop,
  opacity breathing + fill-color shift, rotate/scale (exercises the
  transform overlay and explicit_paint path); register in
  `demos/index.tsx`.
- `packages/graphics/src/__tests__/animation.test.ts` (byte-level builder
  assertions read back via the generated TS reader); React
  `resolveAnimation` cases.
- RENDER_ARCHITECTURE.md: as-built section (command, overlay semantics,
  conflict rules, driver threading, transform append order, timestamp
  sources).

## 6. Risks & mitigations

- **Idle drain / battery** — stop-on-idle is a first-class semantic;
  acceptance: after leaving the demo page, Choreographer/CADisplayLink
  stop firing. Optional watchdog: force-stop after N consecutive dead
  frames.
- **Dangling pointers** — `animated_ids_` stores ids only; `EraseSubtree`
  removes them in the same walk; unit test covers "RemoveNode while
  animating".
- **explicit_paint miss** — fill tracks must set `fill.type=1` + the
  FILL bit in the DrawNode local copy, or group styles override them;
  covered by a demo case (animated fill under a styled group).
- **Thread contract** — tick body always on the render thread; platform
  callbacks forward exactly once.
- **Compatibility / rollback** — everything is additive: union
  tail-append (old consumers tolerate unknown types via `default:
break`); no `animate` prop → no `SetAnimation` command → driver never
  starts; each phase reverts independently.

## 7. Verification

1. Unit: `pnpm --filter @scumble/native test:native`;
   `pnpm --filter @scumble/graphics test`;
   `pnpm --filter @scumble/react test`.
2. Build: Android `./gradlew assembleDebug` (example); iOS workspace.
3. Dynamic (both platforms, AnimationDemo): smooth animation with zero
   JS per-frame work (Lynx devtool shows no layout flush), driver stops
   after page unload, delay/loop/autoReverse/fill behave, animated fill
   under a styled group is not overridden.
4. Regression: all existing demos unchanged.
