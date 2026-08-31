# Playback control

Declarative `animate` tracks run unattended — but when you need a pause
button, a scrub bar, or a completion callback, mint the spec with
`createAnimation()`. The result is the same declarative track spec, usable
directly as `animate`, plus a `controller` object for imperative playback.

## The controller

```ts
import { createAnimation } from "@scumble/react";

const trim = createAnimation({
  property: "pathEnd",
  from: 0,
  to: 1,
  duration: 2000,
  iterations: Infinity,
  easing: "ease-in-out",
});

// Same usage as a plain spec:
<Path path={HEART} color="#22c55e" style="stroke" strokeWidth={6} animate={trim} />

// …plus imperative control:
trim.controller.handle; // the playback handle (string)
trim.controller.play();
trim.controller.pause();
trim.controller.seekTo(500); // ms
trim.controller.cancel();
trim.controller.onFinish(() => console.log("done"));
```

The controller surface:

| Method                             | Behavior                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `play()`                           | Resume from a freeze — or restart an idle/finished track from t = 0 |
| `pause()`                          | Freeze in place; the overlay holds, the vsync driver goes idle      |
| `seekTo(timeMs)`                   | Jump the timeline (milliseconds; `delay` counts) and repaint now    |
| `cancel()`                         | Drop the tracks and return the node to its base values              |
| `onFinish(cb)` \| `onFinish(null)` | Set or clear the natural-completion callback                        |

`cancel` fires no finish event. A canceled node keeps its handle — `play()`
starts it over from the beginning.

## Buttons

Control calls are one-shot commands on the canvas's invoke lane — while
playing, frames are still interpolated entirely on the render thread, zero JS
each. Wire the calls to any tap handler; keep native controls **outside** the
`<Canvas>` (Lynx views cannot live inside a scumble canvas):

```tsx
function Controls() {
  return (
    <view style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <view bindtap={() => trim.controller.play()}>
        <text>play</text>
      </view>
      <view bindtap={() => trim.controller.pause()}>
        <text>pause</text>
      </view>
      <view bindtap={() => trim.controller.seekTo(1000)}>
        <text>50%</text>
      </view>
      <view bindtap={() => trim.controller.cancel()}>
        <text>cancel</text>
      </view>
    </view>
  );
}
```

## Seek, restart, and the finish event

`seekTo` takes milliseconds into the track's timeline — `delay` included, so
`seekTo(0)` rewinds into the delay. Control is node-granular: the handle a
node registers steers all of its tracks, and every `createAnimation()` spec
carries its own — the demo's scrub bar keeps its two tracks in sync by
seeking both:

```tsx
const dotX = createAnimation({
  property: "translateX",
  from: 0,
  to: 220,
  duration: 1500,
  easing: "ease-in-out",
  fill: "forwards",
});
const dotOpacity = createAnimation({
  property: "opacity",
  from: 0,
  to: 1,
  duration: 400,
  fill: "forwards",
});

function Scrubber() {
  const [finished, setFinished] = useState(false);
  dotX.controller.onFinish(() => setFinished(true));

  const seek = (t: number) => {
    setFinished(false);
    dotX.controller.seekTo(t);
    dotOpacity.controller.seekTo(Math.min(t, 400));
  };

  return (
    <view>
      <Circle cx={40} cy={40} radius={16} color="#a855f7" animate={[dotX, dotOpacity]} />
      {/* buttons: seek(0) / seek(750) / seek(1500) / restart */}
    </view>
  );
}
```

`onFinish` fires when a track completes naturally (the canvas demuxes the
native finish event by handle) — after which `play()` restarts it from t = 0.

::: tip
Mint the spec once — module scope, or `useState(() => createAnimation(…))` —
so the Rect and its buttons share one handle. Re-minting on every render hands
the controller a handle the tree no longer tracks.
:::

## Mixing with declarative tracks

`createAnimation()` results and plain spec objects mix freely in one
`animate` array; plain tracks stay uncontrolled (exactly the declarative
behavior), and the first controlled entry's handle steers the node.

## Further reading

- [PlaybackDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PlaybackDemo.tsx)
  — pause/seek/cancel buttons, the finish badge, and cancel-to-base, live
- [Animation](/guide/animation) — the track spec, keyframes, and easing
