# Animation

Animations are declarative: an `animate` prop carries track specs, they ride the command stream once, and the render thread interpolates every frame per vsync — zero JS work per frame, no React re-render. `createAnimation()` mints a spec with an attached `controller` for imperative playback control.

```tsx
import { createAnimation } from "@scumble/react";
import type { AnimationController, ControlledAnimationSpec } from "@scumble/react";
```

Every shape (and [`Canvas`](/api/canvas-and-group#canvas)/[`Group`](/api/canvas-and-group#group)) accepts `animate` with one track per property and many tracks per node. Plain track specs work as-is; `null`/`false` array entries are filtered, and an empty array (or `null`) clears the node's animations.

```tsx
import { Canvas, Rect, createAnimation } from "@scumble/react";

const spin = createAnimation({
  property: "rotate",
  from: 0,
  to: 360,
  duration: 3000,
  iterations: Infinity,
});

export function SpinScene() {
  return (
    <Canvas style={{ width: "100%", height: 200 }}>
      <Rect x={60} y={60} width={80} height={80} color="#f59e0b" animate={spin} />
    </Canvas>
  );
}
```

## `createAnimation`

Mint a controllable animation spec: the return value is a plain track spec usable directly as `animate`, with `.controller` as the imperative surface. No hooks, no refs — a spec held in user code is stable across re-renders by construction.

```ts
function createAnimation(spec: AnimationTrackSpec): ControlledAnimationSpec;
```

Control dispatches ride the owning canvas's invoke lane (canvases register themselves while mounted; a dispatch broadcasts to every live canvas — the one holding the handle executes). Native completion events fire on the canvas root and are demuxed back to `controller.onFinish` by handle.

### AnimationTrackSpec — track fields

| Field         | Type                                  | Default    | Description                                                                                                      |
| ------------- | ------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `property`    | `AnimatedPropertyName`                | —          | The animated property — one of the [16 below](#animatable-properties). Required.                                 |
| `from`        | `number \| Color \| [number, number]` | —          | Start value — sugar for a two-keyframe track. A `[sx, sy]` pair for `scale`; a `Color` for the color properties. |
| `to`          | `number \| Color \| [number, number]` | —          | End value. See `from`.                                                                                           |
| `keyframes`   | `KeyframeSpec[]`                      | —          | Explicit keyframes — the alternative to `from`/`to`.                                                             |
| `duration`    | `number`                              | `300`      | Milliseconds per iteration.                                                                                      |
| `delay`       | `number`                              | `0`        | Milliseconds before the first iteration.                                                                         |
| `iterations`  | `number`                              | `1`        | Iteration count; `Infinity`/negative = infinite.                                                                 |
| `autoReverse` | `boolean`                             | `false`    | Even iterations forward, odd reversed — CSS `alternate`.                                                         |
| `fill`        | `"none" \| "forwards"`                | `"none"`   | What happens after the last iteration: return to base values, or pin the end value.                              |
| `easing`      | `EasingSpec`                          | `"linear"` | Track-default easing; keyframes without their own inherit it.                                                    |
| `cx`          | `number`                              | `0`        | `rotate`/`scale` pivot center x.                                                                                 |
| `cy`          | `number`                              | `0`        | `rotate`/`scale` pivot center y.                                                                                 |

`EasingSpec` is a preset name — `"linear"`, `"ease-in"`, `"ease-out"`, `"ease-in-out"`, `"step-start"`, `"step-end"` — or cubic-bezier control points `[x1, y1, x2, y2]`.

### KeyframeSpec — keyframe fields

| Field    | Type         | Default | Description                                                                                                |
| -------- | ------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `offset` | `number`     | —       | Position within one iteration, `[0, 1]`. Omitted offsets are evened out; the first/last are pinned to 0/1. |
| `value`  | `number`     | —       | Scalar value slot.                                                                                         |
| `value2` | `number`     | —       | Second scalar slot — `scale`'s `sy`.                                                                       |
| `color`  | `Color`      | —       | Color slot (the color properties use this instead of the scalars).                                         |
| `easing` | `EasingSpec` | —       | Easing of the segment **starting** at this keyframe; omitted → the track's.                                |

### Animatable properties

The 16 properties accepted as `property` (`AnimatedPropertyName`):

| Property      | Value type                   | Notes                                                                    |
| ------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `opacity`     | `number`                     | 0–1 alpha.                                                               |
| `translateX`  | `number`                     | X offset (px).                                                           |
| `translateY`  | `number`                     | Y offset (px).                                                           |
| `rotate`      | `number`                     | Degrees (not radians); pivots at the track's `cx`/`cy`.                  |
| `scale`       | `number \| [number, number]` | Uniform, or `[sx, sy]`.                                                  |
| `pathStart`   | `number`                     | [`<Path>`](/api/shapes#path) trim start — `[0, 1]` path-length fraction. |
| `pathEnd`     | `number`                     | `<Path>` trim end — `[0, 1]` fraction.                                   |
| `fillColor`   | `Color`                      | Fill color.                                                              |
| `strokeColor` | `Color`                      | Stroke color.                                                            |
| `x`           | `number`                     | Left edge (rect-family, `<Image>`, `<Paragraph>`).                       |
| `y`           | `number`                     | Top edge.                                                                |
| `width`       | `number`                     | Width.                                                                   |
| `height`      | `number`                     | Height.                                                                  |
| `cx`          | `number`                     | Center x (`<Circle>`, `<Ellipse>`).                                      |
| `cy`          | `number`                     | Center y.                                                                |
| `r`           | `number`                     | Radius (`<Circle>`).                                                     |

## `AnimationController`

The imperative surface on a `createAnimation()` spec — the spec itself. Control is node-granular: one handle steers **all** of the node's tracks.

```ts
spin.controller.pause();
spin.controller.seekTo(1500);
spin.controller.onFinish(() => console.log("done"));
```

| Member     | Signature                                        | Description                                                        |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `handle`   | `readonly handle: string`                        | The minted playback handle — what the native tree registers.       |
| `pause`    | `pause(): void`                                  | Freeze in place (the overlay holds; the driver goes idle).         |
| `play`     | `play(): void`                                   | Resume from the freeze, or restart an idle/finished node from t=0. |
| `seekTo`   | `seekTo(timeMs: number): void`                   | Jump the timeline (ms, `delay` counts); repaints immediately.      |
| `cancel`   | `cancel(): void`                                 | Drop the tracks and return to base values (fires no finish event). |
| `onFinish` | `onFinish(callback: (() => void) \| null): void` | Set (or, with `null`, clear) the natural-completion callback.      |

## `ControlledAnimationSpec`

The return type of `createAnimation()` — a full [`AnimationTrackSpec`](#createanimation) with a minted playback handle and controller attached:

```ts
interface ControlledAnimationSpec extends AnimationTrackSpec {
  controller: AnimationController;
}
```

Hand it to any node's `animate` prop as-is; use `.controller` from event handlers for imperative playback control. Plain track specs (without a controller) remain valid `animate` values — they just run uncontrolled, start to finish.
