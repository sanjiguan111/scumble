# Animation

Pass an `animate` prop and the animation runs entirely on the render thread:
the tracks are serialized once and ride the command stream down; from then on
a per-vsync tick interpolates every frame. No React re-renders, no JS in the
frame loop, no layout passes — and the vsync driver goes idle when nothing is
animating.

## One track

A track describes one animated property. `from`/`to` is sugar for a
two-keyframe track:

```tsx
<Path
  path={HEART}
  color="#22c55e"
  style="stroke"
  strokeWidth={6}
  animate={{
    property: "pathEnd",
    from: 0,
    to: 1,
    duration: 2000,
    iterations: Infinity,
    easing: "ease-in-out",
  }}
/>
```

The track options:

| Option        | Meaning                                                                 | Default    |
| ------------- | ----------------------------------------------------------------------- | ---------- |
| `property`    | Which property animates (16 choices, below)                             | —          |
| `from`/`to`   | Endpoints — or use `keyframes` instead                                  | —          |
| `keyframes`   | Keyframe list (below)                                                   | —          |
| `duration`    | Milliseconds per iteration                                              | `300`      |
| `delay`       | Milliseconds before the first iteration                                 | `0`        |
| `iterations`  | Iteration count; `Infinity` (or negative) loops forever                 | `1`        |
| `autoReverse` | Even iterations forward, odd reversed (CSS `alternate`)                 | `false`    |
| `fill`        | `"none"`, or `"forwards"` to pin the end value after the last iteration | `"none"`   |
| `easing`      | Track-default easing curve                                              | `"linear"` |
| `cx`, `cy`    | Pivot for `rotate` and `scale`                                          | `0, 0`     |

## Many tracks, one node

`animate` also takes an array — one track per property, any number of them.
`null`/`false` entries are filtered out, and an empty array (or `null`)
clears the node's animations:

```tsx
<Circle
  cx={150}
  cy={110}
  radius={60}
  animate={[
    {
      property: "opacity",
      from: 1,
      to: 0.35,
      duration: 900,
      iterations: Infinity,
      autoReverse: true,
    },
    {
      property: "fillColor",
      from: "#3b82f6",
      to: "#ec4899",
      duration: 1800,
      iterations: Infinity,
      autoReverse: true,
    },
  ]}
/>
```

## The 16 animatable properties

`opacity`, `translateX`, `translateY`, `rotate`, `scale`, `pathStart`,
`pathEnd`, `fillColor`, `strokeColor`, `x`, `y`, `width`, `height`, `cx`,
`cy`, `r`.

A few notes:

- `rotate` is **degrees**; `rotate` and `scale` honor the `cx`/`cy` pivot.
- `scale` also accepts a `[sx, sy]` pair: `from={[1, 1]} to={[1.2, 0.8]}`.
- `fillColor`/`strokeColor` animate between colors — any color format.
- `pathStart`/`pathEnd` drive the path trim window (see
  [Shapes](/guide/shapes#trim-start-end)) — a draw-on effect with
  zero JS, versus the `setInterval`-driven version the paths demo also shows.
- Geometry tracks (`x`, `y`, `width`, `height`, `cx`, `cy`, `r`) write the
  node's own geometry without touching siblings.

Groups animate too — a track on a `Group` moves the whole subtree, cascading
with any per-child tracks:

```tsx
<Group
  animate={{
    property: "translateX",
    from: -30,
    to: 30,
    duration: 1200,
    iterations: Infinity,
    autoReverse: true,
  }}
>
  <Rect
    x={110}
    y={70}
    width={80}
    height={80}
    color="#f59e0b"
    animate={{
      property: "rotate",
      from: 0,
      to: 360,
      duration: 3000,
      iterations: Infinity,
      cx: 150,
      cy: 110,
    }}
  />
</Group>
```

## Keyframes and easing

Swap `from`/`to` for a `keyframes` array when a property needs more than two
stops. Each keyframe takes `offset` (its position within one iteration,
`[0, 1]` — omitted offsets are spaced evenly, and the first/last are pinned to
0/1), its `value` (or `color` for the color properties), and an optional
`easing` for the segment starting at that keyframe (omitted → the track's):

```tsx
animate={{
  property: "translateX",
  keyframes: [
    { offset: 0, value: 0, easing: "ease-in" },
    { offset: 0.6, value: 180 },
    { offset: 1, value: 220, easing: [0.2, 0, 0.1, 1] },
  ],
  duration: 1500,
}}
```

`easing` accepts the presets `"linear"`, `"ease-in"`, `"ease-out"`,
`"ease-in-out"`, `"step-start"`, `"step-end"`, or a cubic-bezier control
point tuple `[x1, y1, x2, y2]`.

## Finite animations and fill

A finite track reverts to the base value when it ends — unless
`fill: "forwards"` pins the terminal value. This pairs with a delay for
entrance sequences, and the driver stops once nothing is live:

```tsx
<Circle
  cx={40}
  cy={40}
  radius={16}
  color="#a855f7"
  animate={[
    {
      property: "translateX",
      from: 0,
      to: 220,
      duration: 1500,
      easing: "ease-in-out",
      fill: "forwards",
    },
    { property: "opacity", from: 0, to: 1, duration: 400, fill: "forwards" },
  ]}
/>
```

## How it works

The spec is serialized in JS into a binary track list and attached to the node
once. The render thread keeps it and interpolates the animated values into a
per-node overlay on top of the base fields — the base values are never
rewritten, and no further JS or layout work happens per frame. Interpolation,
including the trim window and color ramps, is native.

For imperative control — pause, seek, finish callbacks — see
[Playback control](/guide/playback-control).

## Further reading

- [AnimationDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/AnimationDemo.tsx)
  — trim loop, multi-track breathing circle, pivoted transforms, fill
  forwards, live
- [Playback control](/guide/playback-control) — `createAnimation().controller`
