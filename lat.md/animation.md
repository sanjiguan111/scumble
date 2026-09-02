# Animation system

Declarative animation tracks ride the command stream once; the render thread interpolates per vsync with zero JS per frame, and playback control reaches native over the invoke lane.

This file summarizes both designs (`ANIMATION_DESIGN.md`, `ANIMATION_CONTROL_DESIGN.md` — both implemented as designed) plus the unimplemented gesture lane sketch.

## Overlay model

Base fields are NEVER written by animation: every tick interpolates and writes a fixed-size `AnimationOverlay`, and the renderer reads through base-fallback accessors (`AnimOpacity` etc.).

`ApplySetAnimation` ([[packages/native/shared/skity/retained_render_tree.h]]) parses tracks into C++ structs on the node (`RetainedNode::anim`). Consequences:

- CSS-like semantics for free: fill=none ends by clearing the slot (value returns to base); fill=forwards pins the terminal value.
- A conflicting explicit command wins: `ApplySetPaint` / `ApplySetGeometry` / `SetTransform` call `CancelAnimationsFor` ([[packages/native/shared/skity/retained_render_tree.h]]) via dirty-bit → overlay-bit maps — last-writer-wins, no zombie animations.
- Transform tracks store resolved components and APPEND after the base TransformOpList ops (the JS-built bytes are never rebuilt).
- Animated fill/stroke/opacity enter the inheritance merge as if explicitly authored — the explicit_paint trap: an animated value on a Group behaves like an authored value for children.

## Track schema and animated properties

`SetAnimation` (13th Command union member) carries JS-built AnimationList bytes — nested FlatBuffer, memcpy'd like SetClip: one track per property, many tracks per node.

Built by [[packages/graphics/src/animation.ts#buildAnimationList]]. First-batch properties (16): opacity / translateX / translateY / rotate / scale / pathStart / pathEnd / fillColor / strokeColor / x / y / width / height / cx / cy / r.

The JS builder resolves from/to sugar into keyframes, evens out missing offsets, packs colors — and resolves the per-keyframe easing FALLBACK in JS, because FlatBuffer defaults cannot express "inherit the track default"; native takes keyframe easing as final. React surface: an `animate` prop on every shape + `Group` + `Canvas`.

## Frame drivers

Stop-on-idle vsync drivers on the platform layer; the tick body always runs on each render thread (never off it):

- Android (`render/ScumbleAnimationDriver.kt`): `Choreographer.postFrameCallback` on the main thread fans `scheduleTick(now, onDone)` out to EACH session's render handler — GL and Vulkan sessions live on different threads, so results are funneled back; one frame in flight; a frame where no session reports live ends the loop.
- iOS (`Render/ScumbleAnimationDriver`): CADisplayLink on the main runloop forwards to the single Metal render queue; every session ticks; a fully idle frame invalidates the link; `inFlight` drops frames while a tick block is still queued.
- Arming: `applyCommands` ends with `driver.wakeUp()` — a batch may install animations while the driver is stopped.
- Timestamps come from the frame callback itself (`frameTimeNanos` / `targetTimestamp`); the clock origin is the first tick after apply. Animation ticks bump no cache version — see [[architecture#Render build cache]].

## Easing

Hand-written pure functions in `packages/native/shared/skity/easing.{h,cc}`: LINEAR, EASE_* cubic-bezier presets, CUBIC_BEZIER (bisection, ≤24 iterations), STEP_START, STEP_END. JS resolves the spec ([[packages/graphics/src/animation.ts#buildAnimationList]]); native evaluates.

## Playback control

The controller is the spec itself: `createAnimation({...})` returns a spec with `spec.controller.{pause, play, seekTo, cancel, onFinish}` — handing the spec to `animate` starts it, no separate registration ([[packages/react/src/internal/animation-control.ts#createAnimation]]).

- **Addressing**: a JS-assigned animation handle. The native `node_id` is unusable (not stable across tree edits from JS's view); the handle travels inside the track bytes.
- **Command lane**: `element.invoke('animateControl', params, callback)` — the UIMethod lane that bypasses NAPI ([[lynx-integration#The NAPI wall and the invoke lane]]); worklets are the future upgrade lane. The controller holds a host ref registered on the Canvas ([[packages/react/src/Canvas.tsx#Canvas]] demuxes the finish event by handle).
- **State machine**: WAAPI `currentTime` semantics — pause freezes the clock, seekTo moves it, play resumes; "playing", not "live", keeps the driver idle (a paused animation costs nothing).
- **Completion**: the native `scumbleanimationfinish` event fires once per finished handle (the retained tree's `TakeFinishedHandles` gathers them — [[packages/native/shared/skity/retained_render_tree.h]]); `controller.onFinish(cb)` subscribes on the React side.

## Gesture lane (setValue, design sketch)

Not implemented; design sketch in `ANIMATION_CONTROL_DESIGN.md` §9 — the gesture path reuses the overlay lane without React re-renders per frame.

A zero-duration track (`from: 0, to: 0`) whose value is driven per touchmove: `drag.controller.setValue("translateX", fingerX)` → `invoke('setValue', { handle, property, value })` — the same base-fallback semantics and cache treatment as time-driven animation.
