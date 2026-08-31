# Animation engine

scumble's animation engine runs on the render thread, next to the retained
tree it animates. A declarative track — keyframes, easing, delay, iterations —
rides the command stream **once** as data; from then on a vsync-driven tick
interpolates and repaints with **zero JavaScript work per frame**. Playback
control (`pause`, `play`, `seekTo`, `cancel`, `onFinish`) rides the same
engine without reintroducing per-frame JS.

## Why animation lives on the render thread

The naive way to animate a Lynx component is
`setInterval(16ms) → setState → prop → layout flush`. Every frame of that
path pays for a React re-render, JS-thread scheduling jitter, and a full Lynx
layout-pass round trip — and the frame rate is capped by all three. Two facts
about the platform make this structural rather than fixable from JS:

- Lynx's JS-thread `requestAnimationFrame` is a vsync-scheduled callback with
  **no pipeline coupling** — it does not trigger layout or repaint, so it
  cannot drive drawing at all.
- Pure-painting prop updates flush through the Lynx layout pass, so a JS-side
  animator pays for that pass on every frame.

The retained tree + command stream (see the
[render pipeline](/architecture/render-pipeline)) removes the need for any of
that: the animation **spec** is data on the command stream, **time** is
advanced by the platform vsync source, and **interpolation** happens on the
render thread where the tree lives. JS is not involved after the first frame.

## Tracks ride the command stream

```text
JS            animate prop ──buildAnimationList──▶ base64 AnimationList bytes
TASM thread   setter stores bytes; the layout-pass flush drains a
              SetAnimation command (node_id + nested bytes) into the batch
Render thread ApplyCommandBatch parses tracks onto the node (C++ structs)
              vsync tick ─▶ TickAnimations(now): interpolate
                          ─▶ write AnimationOverlay ─▶ repaint
```

The React layer accepts an `animate` prop on every shape, `Group`, and
`Canvas`, with `property`, `from`/`to` (or `keyframes`), `duration`, `delay`,
`easing`, `iterations`, `autoReverse`, and `fill` fields. `@scumble/graphics`
compiles it into an `AnimationList` FlatBuffer
(from/to sugar becomes keyframes, offsets are evened out, easing names and
cubic-bezier tuples resolved, colors parsed), and it crosses as the base64
`animationData` string prop — named that way because Lynx's own standard props
reserve `animation` for CSS-shaped data.

The model is **one track per property, many tracks per node**. Animatable
properties: `opacity`, `translateX`, `translateY`, `rotate`, `scale`,
`pathStart`, `pathEnd`, `fillColor`, `strokeColor`, `x`, `y`, `width`,
`height`, `cx`, `cy`, `r`.

## The overlay model — base values are never written

Parsed tracks live on the render-tree node as C++ structs. Every tick
evaluates them (delay → iteration folding → autoReverse → keyframe segment
search → easing) and writes the results into a fixed-size
**`AnimationOverlay`** on the node. The renderer never reads the base fields
directly while a track is active — it goes through base-fallback accessors
that return the overlay value when a slot is set, the base value otherwise.

Keeping base values intact is what makes the semantics fall out for free:

- **`fill: "none"` (default)** — when a track ends, its overlay slot is
  cleared and the property returns to its base value; the ending frame still
  paints.
- **`fill: "forwards"`** — the terminal value stays pinned in the overlay; the
  driver is not kept running for it.
- **Conflicts** — if a command stream write hits an animated property
  (`SetPaint`, `SetGeometry`, `SetTransform`), the conflicting track is
  cancelled and the command's value takes effect immediately. A new
  `SetAnimation` for the same property replaces the track and restarts it.
- **Transforms** — transform tracks store _resolved components_
  (translate/rotate/scale + pivot) in the overlay, and the draw pass appends
  them after the node's base transform ops. The JS-built transform bytes are
  never re-parsed or rebuilt per frame.
- **Inheritance** — animated fill/stroke/opacity enter the paint-inheritance
  merge as if explicitly authored on the node, so animated colors under a
  styled `Group` behave correctly.

## Easing

Easing functions are hand-written pure C++ in the shared core: `linear`,
`ease-in` / `ease-out` / `ease-in-out` (cubic-bezier presets), arbitrary
`cubic-bezier(x1, y1, x2, y2)` (solved by bisection on the monotone Bezier x,
capped iterations), and `step-start` / `step-end`. Keyframes may carry their
own easing; the fallback to the track default is resolved in the JS builder,
so native receives only final values.

## The vsync driver — stop on idle

Each platform has one animation driver singleton holding weak references to
every live canvas session:

- **Android** — `Choreographer.postFrameCallback` on the main thread forwards
  the frame time to each session's render handler; GL and Vulkan sessions
  live on different threads, so the driver fans ticks out and funnels results
  back.
- **iOS** — a `CADisplayLink` on the main run loop forwards onto the single
  serial render queue, where every session ticks.

The rules are the same on both platforms:

- The tick **body always runs on the render thread**; the platform callback
  does nothing but forward (one `handler.post` / `dispatch_async`).
- Timestamps come from the frame callback itself, never a fresh wall-clock
  read inside the tick.
- At most one tick is in flight at a time.
- Applying a command batch wakes the driver up — a batch may install
  animations while it is stopped.
- **Stop on idle**: a frame in which no session reports anything playing ends
  the loop. No tracks running means no vsync callbacks fire at all — no
  battery cost for static content. Paused tracks count as not playing; their
  overlays stay frozen at their held values.

## Playback control

`createAnimation({ … })` returns a track spec carrying a
`controller` — `play()`, `pause()`, `seekTo(ms)`, `cancel()`, `onFinish(cb)`.
Hand the spec to `animate` as usual; call the controller from event handlers
to steer playback. None of it costs per-frame JS.

**Addressing.** The render tree's internal `node_id` never crosses to JS, so
every controlled track carries a **handle minted on the JS side** (a short
string like `"a12"`) as a field on the `SetAnimation` command. The tree keeps
a `handle → node_id` map alongside its animation state.

**The control lane.** A controller method dispatches an `animateControl` UI
method (`{ handle, action, time }` — scalars only) through a module-level
registry of mounted canvases; the canvas holding the handle executes it. The
UI-method body does exactly one thing: post the request onto the render
thread, where `ControlAnimation` mutates the track's playback state (a
`paused` flag plus the anchored in-animation time). One-directional flow,
no synchronous native objects.

**Semantics** follow the WAAPI `currentTime` model, so the behavior has a
spec to cite rather than folklore:

| Action       | Effect                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play()`     | Resume from the anchored time; a finished `fill: "forwards"` track restarts from 0                                                                                          |
| `pause()`    | Records the current in-animation time; the overlay freezes (it is not cleared)                                                                                              |
| `seekTo(ms)` | Clamps to the track's timeline, re-evaluates the overlay, and repaints immediately — no vsync wait. A finished track revives if the target lands inside its active interval |
| `cancel()`   | Clears the overlay (values return to base) and resets playback state; the tracks themselves stay, so `play()` restarts them                                                 |

Seeking into a `delay` shows iteration-0 pre-values; `autoReverse` folds
per-iteration while seek targets the unfolded timeline. A changed `animate`
prop (a fresh `SetAnimation`) resets playback state — the replace rule above.

**Completion.** On the tick where a handle's last unfinished track finishes,
the render thread posts the handle to the UI thread, which emits a custom
`skityAnimationFinish` event; the canvas demuxes it by handle and the React
layer fires the matching `controller.onFinish` callbacks. Once per natural
completion — `cancel` and replace never fire it.

## Why no NAPI

The public Android Lynx SDK compiles its NAPI binding out, which rules out the
"JS holds a native object, calls it synchronously" style of API (the approach
react-native-skia's animation control takes). Playback control needs nothing
of the sort — only two **one-directional** framework channels, both available
on the public SDK:

- **JS → native**: Lynx UI methods (`element.invoke(method, params)`), which
  every JS entry lane (jsbridge, SelectorQuery, lepus) reaches without NAPI.
- **native → JS**: component custom events (`dispatchEvent`), the same channel
  the layout event uses.

This fits the library-wide philosophy: declarative data down, events up, and
never a synchronous object boundary.

## What still runs in JS

The engine covers **timeline** animation, where the value is `f(t)` and the
engine owns it. The other family — **gesture-driven** values, where an input
stream owns the value (`g(input)`: drag-to-follow, scrubbers, scroll-linked
effects) — has no zero-JS lane yet. Per-frame externally driven updates
currently route through React state like any prop change. The overlay is the
designated integration point for such a lane: an external value write would
cancel the conflicting track and write the overlay slot directly, which is the
same hook `SetPaint` / `SetGeometry` already use.

Known limitations: spring easing and animating variable-length data (the
`points` arrays) are not supported.

## Further reading

- [ANIMATION_DESIGN.md](https://github.com/sanjiguan111/scumble/blob/develop/packages/native/ANIMATION_DESIGN.md)
  — the engine design: overlay model, conflict semantics, frame driver
- [ANIMATION_CONTROL_DESIGN.md](https://github.com/sanjiguan111/scumble/blob/develop/packages/native/ANIMATION_CONTROL_DESIGN.md)
  — playback control: handle addressing, the invoke lane, WAAPI semantics
- [RENDER_ARCHITECTURE.md §14](https://github.com/sanjiguan111/scumble/blob/develop/packages/native/RENDER_ARCHITECTURE.md)
  — as-built notes for the animation command, overlay, and drivers
- [Animation](/guide/animation) — the `animate` prop from the user side
- [Playback control](/guide/playback-control) — controllers from the user side
- [Animation API](/api/animation) — `AnimationSpec` and controller reference
