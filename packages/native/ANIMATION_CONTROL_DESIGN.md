# Animation Playback Control (invoke lane) — Design

Status: **IMPLEMENTED 2026-08-27** (Phases A–E; native 66/66, graphics
102/102, react 78/78, both platform builds + example bundle green). As-built
deviations from this doc:

- **D5/D6 were re-shaped during Phase D**: shapes stay PLAIN FUNCTIONS (no
  forwardRef/hooks — the repo's tests call components directly, and hooks
  broke that). The controller is the SPEC ITSELF: `createAnimation({...})`
  (react layer) returns a track spec carrying a minted handle plus
  `spec.controller.{pause,play,seekTo,cancel,onFinish}`. Handing the spec to
  `animate` rides the handle; calling a method dispatches `animateControl`
  through a module-level registry of mounted canvases (broadcast — the
  canvas holding the handle executes, others answer an error code).
  `onAnimationFinish` is likewise `controller.onFinish(cb)`, not a per-node
  prop; the canvas demuxes `skityanimationfinish` by handle.
- **D2's SelectorQuery entry became a plain React ref**: a ref to
  `<skity-canvas>` yields RefProxy, which forwards `NodesRef.invoke` through
  Lynx's selector machinery (§G.3, type-0 selectors supported) — no
  `#id`-selection needed. Canvas registers that invoke lane while mounted.
- The finish drain rides the existing tick lane (pull after
  `TickAnimations`/seeking `ControlAnimation`; `nativeTakeFinishedHandles` /
  `takeFinishedHandles:`), not a push callback — zero cross-thread C++
  callbacks (D5's SkityImageController-style post became: render thread →
  view/UI thread hop in the session, then `LynxEventEmitter.sendCustomEvent`).

Origin: the API-parity review of the Stage 2 engine (ANIMATION_DESIGN.md)
found the declarative `animate` prop has no imperative escape hatch — the
gap item #1 vs the RN mainstream (reanimated / Moti all offer playback
control + completion callbacks). This document designs that hatch. It is
the concrete shape of the lane FEATURE_PARITY.md §G.2 already reserved
("Stage 1 — invoke-driven animated values") and the non-goal
ANIMATION_DESIGN.md §2 recorded ("gesture-driven values (a later `invoke`
lane can reuse the overlay write path)").

Companion reading: ANIMATION_DESIGN.md (the engine being controlled),
RENDER_ARCHITECTURE.md §11 (retained tree + command stream) and §14
(as-built animation notes).

---

## 1. Problem

The engine today is a pure function of wall-clock time once
`SetAnimation` lands. Four concrete breakages:

- **No pause/resume** — an `iterations: Infinity` loop can only be
  stopped by unmounting the node; a `fill: "forwards"` one-shot cannot
  be held mid-flight.
- **No seek** — scrubbing, "jump to end", or snapshotting a specific
  time is impossible.
- **No completion signal** — `onFinish` does not exist; the JS-side
  `setTimeout(duration + delay)` guess drifts and breaks under pause.
- **Today's workaround is a rebuild** — swapping a React `key` remounts
  the node: full structural insert + `SetAnimation` replay, losing all
  playback state.

## 2. Why this needs no NAPI

The Android public SDK compiles `ENABLE_NAPI_BINDING` out (F.3), which
kills "JS holds native objects, synchronous two-way calls". Playback
control needs nothing of the sort — only two **one-directional** Lynx
framework channels, both already verified (§G.3, 2026-08-21):

| Direction   | Channel                                                                                                                                                                            | Verification                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| JS → native | UIMethod: `element.invoke(method, params[, callback])` — three JS entries (jsbridge `lynx.invokeUIMethod`, SelectorQuery `nodeRef.invoke`, lepus `InvokeUIMethod`) all bypass NAPI | §G.3 "Android UIMethod — PASS"                                             |
| native → JS | Component event: `dispatchEvent` with a `LynxCustomEvent`                                                                                                                          | Framework-standard; precedent `LynxBaseUI.java:2631` (layout-change event) |

Our canvas already carries built-in UIMethods (`takeScreenshot`,
`boundingClientRect`, …) via the kapt-generated
`SkityCanvasUI$$MethodInvoker` — the dispatch chain to our UI class is
live today; we are only adding a method of our own.

## 3. Goal / non-goals

**Goal**: `play / pause / seek / cancel` per animated node, an
`onAnimationFinish` event, and a state query — surfaced as a React ref
handle (`anim.current.pause()`), riding the existing retained tree +
overlay + stop-on-idle driver with **zero per-frame JS** unchanged.

**Non-goals (first cut)**:

- Gesture-driven `setValue` lane — designed here (§9) but shipped
  separately; it shares only the invoke plumbing.
- Per-track control — granularity is the node (all its tracks);
  `SetAnimation` replace already models "change the tracks".
- Spring easing, `points` animation (unchanged engine non-goals).

## 4. Architecture overview

```
JS (React)     anim.current.pause()
                 └─ SelectorQuery '#canvas-id' → nodeRef.invoke('animateControl',
                    { handle: "a12", action: "pause", time? })          [JS thread]
Lynx UI thread MethodInvoker (Android) / LynxUIMethodProcessor (iOS)
                 └─ marshal: post {handle, action, time} onto the render
                   thread (same lane as nativeApplyCommands)             [UI method body does ONLY this]
Render thread   ControlAnimation(handle, action, time)
                 └─ mutates RetainedAnimation playback state; seek
                   re-evaluates the overlay immediately + drawIfReady()
                 TickAnimations returns "any track unfinished AND unpaused"
                 └─ all-finished frame → post finish event {handle} to UI thread
Lynx UI thread dispatchEvent(custom "skityAnimationFinish")              [D5]
JS (React)      onAnimationFinish → matched back to the node by handle
```

## 5. Design decisions

### D1 — Addressing: a JS-assigned animation handle (native `node_id` is unusable)

The retained-tree `node_id` is allocated by a native monotonic counter
(iOS: `SkityCanvasShadowNode.nextNodeId` /
`assignNativeIdsRecursive:`, `SkityCanvasShadowNode.mm:273-322`; Android
mirrors it) — **JS never sees it**, and SelectorQuery can only address
host elements (the canvas root), never the render-tree nodes inside.
So the invoke command carries a **handle minted on the JS side**:

- The react layer assigns one stable handle (session-monotonic counter,
  a short string like `"a12"`) to every node that ever mounts an
  `animate` prop; it rides the `SetAnimation` command as a new
  `handle: string` field (FlatBuffer tail-append, wire-compatible).
- The render tree keeps a `handle → node_id` map alongside
  `animated_ids_`; `EraseSubtree` drops entries in the same walk it
  already does for ids (zero new lifecycle surface).
- Clearing animations (`animationData=""`) **keeps** the handle
  registered so a later re-set reuses it; `RemoveNode` removes both.
- Unknown/late `invoke` after unmount → method returns an error code
  via the invoke `Callback` (never crashes; the map lookup just misses).

One-directional data flow (JS mints, native stores), no back-channel —
same philosophy as every other id in the command stream.

### D2 — Command lane: SelectorQuery `nodeRef.invoke` is v0; worklet is the upgrade lane

- **v0 (this doc)**: JS-thread `SelectorQuery.select('#canvas-id')` →
  `nodeRef.invoke('animateControl', params, callback)`. Chosen because
  it is the only entry guaranteed alive on the **Android public SDK**:
  §G.4 — lepusng worklet compiles on libnapi, so the whole
  `main-thread:` surface may be dead there. Discrete commands
  (pause/seek/play) are latency-tolerant; a `setTimeout`-class hop is
  fine.
- **Upgrade lane (API-compatible)**: worklet `element.invoke` (TASM
  thread, direct dispatch — §G.3 PASS on iOS SDK) for future
  high-frequency seek / gesture scrub. The react handle hides the lane;
  swapping it later is invisible to user code.
- **Native signatures** follow the built-in methods' pattern exactly:
  - Android (`SkityCanvasUI.kt`, `@LynxUIMethod` — **kapt**, not
    annotationProcessor, per project memory):
    `fun animateControl(params: ReadableMap, callback: Callback)`.
  - iOS (`SkityCanvasUI.m`): `LYNX_UI_METHOD(animateControl)` →
    `-(void)animateControl:(NSDictionary*)params
withResult:(LynxUIMethodCallbackBlock)callback`
    (`LynxUIMethodProcessor.h:18` registers it automatically).
  - Parameters are scalars only (`handle: String, action: String,
time?: Number`) — the ReadableMap/NSDictionary marshal boundary
    accepts nothing richer (same class of limit as `@LynxProp`).
  - The method body does exactly one thing: forward onto the render
    thread. All state lives with the tree (§11.12 single-thread rule).

### D3 — Playback state machine (WAAPI `currentTime` semantics)

`RetainedAnimation` grows runtime playback fields — `paused: bool` and
`anchor_ms` (the in-animation time at the last pause/seek) — evaluated
by the existing `EvaluateTrack` pipeline; nothing about keyframe
semantics changes:

| Action   | Semantics                                                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play`   | resume: `start_ns = now − anchor_ms·1e6`; a finished (`fill=forwards`) track restarts from 0                                                                                                                                                                                                          |
| `pause`  | record `anchor_ms` from current evaluation; driver stops needing ticks for it; overlay **freezes** (not cleared)                                                                                                                                                                                      |
| `seek`   | set `anchor_ms = t` (clamped to `[0, duration×iterations + delay]`), re-evaluate + repaint immediately (no vsync wait); a finished track **revives** if `t` lands inside its active interval (WAAPI liveness rule)                                                                                    |
| `cancel` | overlay cleared → base values; track RUNTIME reset (unstarted, t=0) but the tracks themselves STAY — a cancel is a reset, not a delete, so `play()` restarts them (WAAPI cancel+play). As-built correction: the first cut cleared the tracks and play() could never revive the node. No finish event. |

Boundary rules adopted from WAAPI `currentTime` (so the behavior has a
spec to cite, not folklore): seeking into `delay` shows iteration-0
pre-values; `autoReverse` folds per-iteration, seek targets the
unfolded timeline; seek past the end of an infinite loop clamps to one
iteration boundary.

Conflicts keep ANIMATION_DESIGN.md D2's last-writer-wins: a new
`SetAnimation` (React re-render with changed `animate`) resets playback
state (t=0, unpaused) — documented, not "fixed".

### D4 — Driver idle: "playing", not "live"

`TickAnimations`' liveness return changes from "any track unfinished"
to "any track unfinished **and unpaused**". Consequences:

- All-paused → driver stops (battery rule intact), overlays stay
  rendered at their frozen values.
- `play` (invoke lane) must `wakeUp()` the driver — the same call
  `applyCommands` already makes (ANIMATION_DESIGN.md D4).
- `seek` triggers one immediate `drawIfReady()` (it re-evaluated the
  overlay synchronously; no reason to wait a vsync).

### D5 — Completion: the `skityAnimationFinish` event

- **When**: on the tick where a handle's **last** unfinished track
  transitions to finished (a `fill=forwards` hold counts as finished).
  `cancel` and `SetAnimation`-replace do **not** fire it. One event per
  handle per natural completion.
- **How**: render thread posts `{handle}` to the Lynx UI thread, which
  dispatches a custom event — Android
  `dispatchEvent(new LynxCustomEvent(getSign(), "skityAnimationFinish",
data))` (precedent: the layout-change event, `LynxBaseUI.java:2631`);
  iOS `-[LynxUI dispatchEvent:LynxEventDetail*]` (`LynxUI.h:228`). The
  cross-thread post mirrors the existing image-arrival path
  (`SkityImageController`) — no new threading pattern.
- **React side**: `onAnimationFinish` on any shape/`Group`; the react
  layer matches the event's handle back to the mounting component. This
  is the library's first component event — the JS binding follows the
  Lynx custom-event standard attribute channel (confirm exact
  ReactLynx prop→`bind` mapping during Phase C; the canvas root carries
  the listener, children's handles disambiguate).

### D6 — React API: a ref handle, not hooks

```tsx
const anim = useRef<SkityAnimationHandle>(null);

<Path
  ref={anim}
  path={HEART}
  animate={{ property: "pathEnd", from: 0, to: 1, duration: 2000, iterations: Infinity }}
  onAnimationFinish={() => console.log("done")}
/>

<Button onClick={() => anim.current?.pause()} />
<Button onClick={() => anim.current?.seekTo(1500)} />
```

- `SkityAnimationHandle` holds `{ canvasSelector, handle }`; its methods
  are one-line invoke wrappers (`pause() / play() / seekTo(ms) /
cancel() / state()`), so the lane swap in D2 stays internal.
- `state()` uses the invoke `Callback` (pull model):
  `Promise<{ playing, timeMs, iteration }>` — the callback exists on
  every entry lane, so this costs nothing extra.
- Imperative-only consumers may skip `animate` on the JSX and drive a
  dormant track purely via `seekTo` — the engine evaluates whatever the
  playback state says.

## 6. Implementation phases (each independently verifiable & revertible)

### Phase A — schema + shared C++ core

- `schema/command_batch.fbs`: `SetAnimation` grows `handle: string`
  (tail-append; missing → empty string = uncontrolled, today's
  behavior). Regenerate stubs.
- `shared/skity/animation.{h,cc}`: playback fields on
  `RetainedAnimation`; `ControlAnimation(tree, handle, action, time)`
  (D3 table; reuses `EvaluateTrack`); handle→id map on
  `RetainedRenderTree` (+ `EraseSubtree` cleanup); liveness rule change
  (D4); finish detection hook.
- Tests (`tests/animation_test.cc` additions): pause freezes overlay;
  seek revives a finished track; seek-in-delay; cancel clears; unknown
  handle returns error; driver stop with all-paused.

### Phase B — both platforms' UI method

- Android `SkityCanvasUI.kt`: `@LynxUIMethod animateControl` → forward
  to the render session (pattern of the `nativeApplyCommands` JNI hop).
  Verify the kapt `$$MethodInvoker` picks it up.
- iOS `SkityCanvasUI.m`: `LYNX_UI_METHOD(animateControl)`; same forward
  via `SkityMetalContext`. `pod install` after touching the pod
  sources (project memory).

### Phase C — the finish event

- Native: finish post → UI thread → `dispatchEvent` (D5) both platforms.
- React: `onAnimationFinish` prop plumbing; canvas-root listener +
  handle demux.

### Phase D — React API

- Handle minting (react-layer module counter) + `handle` riding
  `buildAnimationList`'s caller (`resolveAnimation` passes it through;
  the graphics builder signature grows an optional handle).
- `SkityAnimationHandle` + SelectorQuery invoke wrapper
  (`@lynx-js/react` SelectorQuery; the canvas root gets a stable
  `uid` for selection).

### Phase E — demo + tests

- `PlaybackDemo`: pause/resume buttons, a seek slider, a finish toast;
  asserts (devtool) zero JS work per frame while playing.
- graphics/react unit tests: handle passthrough, resolveAnimation
  unchanged for handle-less nodes.

## 7. Risks & mitigations

- **Worklet lane dead on Android public SDK** (§G.4) — v0 depends only
  on SelectorQuery `nodeRef.invoke`, explicitly verified PASS there.
- **kapt vs annotationProcessor** — `.kt` `@LynxUIMethod` requires
  kapt (project memory); a missing method surfaces only as
  `METHOD_NOT_FOUND` at runtime, so Phase B's check is a live invoke.
- **iOS pod change** — any pod source touch requires `pod install`
  before the method exists (project memory).
- **Threading** — UIMethod callbacks arrive on the Lynx UI thread; all
  tree writes post to the render thread (single-thread contract
  §11.12); the finish event posts back. No new thread hops beyond the
  two already present.
- **Late invokes after unmount** — handle map miss → error code through
  the invoke Callback; never a dangling pointer (map holds ids, not
  pointers — same rationale as `animated_ids_`).
- **React re-render mid-playback** — a changed `animate` prop resets
  playback (D3 conflict rule). Documented in the react API JSDoc;
  `onAnimationFinish` not fired for resets.
- **Rollback** — additive at every layer: no `handle` prop → old
  behavior byte-identical; the UI method is inert if never invoked;
  each phase reverts independently.

## 8. Verification

1. Unit: `pnpm --filter @lynx-skity/native test:native` (Phase A cases).
2. Build: Android `./gradlew assembleDebug`; iOS workspace + `pod
install`.
3. Dynamic (both platforms, PlaybackDemo): pause freezes mid-flight and
   resumes exactly where it stopped; seek slider scrubs the trim
   animation; a finished `fill:forwards` track revives on seek-back;
   finish toast fires once per natural completion; devtool shows zero
   per-frame JS while playing; driver stops when all tracks paused.
4. Regression: AnimationDemo unchanged (handle-less nodes are
   byte-identical commands).

## 9. Future: the `setValue` lane (gesture-driven animation) — design sketch

**PROPOSED, not implemented.** Recorded so the next session can start
building without re-deriving the analysis.

### 9.1 What gesture-driven animation is

The two animation families differ by **where the value comes from**:

|                 | Timeline (shipped)                                 | Gesture-driven (this lane)                                   |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Value           | `f(t)` — vsync advances t, the engine interpolates | `g(input)` — the input IS the animation; nobody interpolates |
| React per frame | zero (one declarative payload)                     | must also be zero — today it is not                          |
| Conflicts       | engine owns the value                              | an external writer owns the value                            |

Typical scenarios: drag-to-follow (a card tracks the finger; release
hands off to a spring), scroll-linked effects (offset drives header
collapse / parallax / pull-refresh rings), scrubbers, swipe cards
(track, then fling-or-snap by velocity). This is reanimated's core
territory: `sharedValue` + `useDerivedValue` + worklets — a
per-frame value pipeline that never enters React's render cycle. It is
the LAST big animation-parity gap (FEATURE_PARITY §F): imperative
playback control (this doc) steered the timeline; `setValue` adds the
other value source.

Today's only path is `touchmove → setState → render → patch → layout
flush → repaint` per frame — the exact "highest-pain" pipeline the
native engine eliminated for timelines (ANIMATION_DESIGN §1).

### 9.2 API sketch (reactive layer mirrors what shipped)

```tsx
const drag = createAnimation({ property: "translateX", from: 0, to: 0, duration: 0 });
// .controller grows:
drag.controller.setValue("translateX", fingerX);  // per touchmove
<Rect animate={drag} ... />
// release: swap in a timeline track — the overlay guarantees continuity
<Rect animate={{ property: "translateX", from: fingerX, to: 0,
                 duration: 300, easing: [0.22, 1, 0.36, 1] }} ... />
```

Native: `invoke('setValue', { handle, property, value, value2? })` —
the UI method posts onto the render thread, which writes the node's
overlay slot and invalidates. The canvas self-paints, so **no
flush-forcing rAF is needed** (§G.1's conclusion about our canvas) —
invalidate alone repaints.

### 9.3 Implementation notes

- **Addressing**: same handle map (D1); `property` maps through the
  existing `AnimatedProperty` enum. One method per platform
  (`setValue`) next to `animateControl`.
- **Conflict rule — already shipped**: an external value write is the
  D2 "command takes over the value" case: cancel the conflicting track
  for that property (`CancelAnimationsFor`, the same hook SetPaint /
  SetGeometry already fire) and write the overlay slot. Hand-off back
  to a timeline is a fresh `SetAnimation` (reset semantics, already
  implemented).
- **Overlay continuity**: setValue writes the same slot the timeline
  engine reads/writes, so gesture → spring hand-off never flickers
  (the base fields stay untouched throughout).
- **Driver**: no timeline is running during pure gesture frames —
  repaints ride the setValue invalidations themselves; a hand-off
  `SetAnimation` wakes the driver as usual (applyCommands → wakeUp).
- **Frequency / lanes**: touchmove fires ~60–120 Hz. v0 = the same
  JS-thread RefProxy invoke lane as playback control (Android public
  SDK safe). The worklet lane (§G.3 PASS on iOS; §G.4 risk on Android
  public SDK) is the upgrade path for tighter budgets — the react API
  must stay lane-agnostic (controller methods only).
- **Scale factor**: `scale` needs `value2` (sy); colors could ride the
  same channel later (`color` param) — start with the 14 scalar
  properties, skip FILL/STROKE colors in v0.

### 9.4 Verification sketch

Demo: a draggable card — `bindpan`/touchmove feeds setValue (card
tracks the finger with zero React re-renders: verify via devtool that
no patch/flush fires during the drag), release swaps in a spring
track. Unit: setValue cancels a conflicting timeline track and writes
the slot; SetAnimation after setValue restarts cleanly; unknown handle
returns the error code.
