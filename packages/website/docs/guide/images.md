# Images

`<Image>` draws a bitmap on the canvas. Sources are data URIs (decode locally,
zero network) or `http(s)` URLs (loaded by the platform); both decode
asynchronously — each node stays blank until its pixels land, then appears on
the next draw.

## Source and destination

`image` accepts a `useImage()` handle, a bare uri string, or `null`/nothing
(the node renders nothing). The destination is `x`/`y`/`width`/`height`, or a
single `rect` object (which takes precedence; its `x`/`y` default to 0):

```tsx
import { Image, useImage } from "@scumble/react";

const local = useImage("data:image/png;base64,…");
const remote = useImage("https://picsum.photos/seed/scumble/300/200");

<Image image={local} x={10} y={10} width={180} height={180} />
<Image image={remote} rect={{ x: 200, y: 10, width: 150, height: 180 }} fit="cover" />
```

There is no loading state or error callback — a failed URL (say, a 404) simply
never paints. Changing only the destination (size, position) does not re-issue
a load; the bitmap is keyed by uri in the native image store, so animating the
destination rect is free.

## useImage and handles

`useImage(source)` resolves a uri into an opaque `ImageHandle` — returned
immediately, with no loading phase:

```tsx
const image = useImage("https://picsum.photos/seed/x/300/200");
// image === null when source is null/empty
```

The same uri always yields the same handle (`===` stable), so handles are safe
as effect dependencies and equality keys. Passing the uri string directly to
`<Image image="…">` works too; the hook just keeps the value stable across
renders. A non-hook `createImageHandle(uri)` is exported for module scope.

## fit — seven ways to inscribe

`fit` controls how the bitmap is inscribed into the destination rect, resolved
against the bitmap's intrinsic size at render time. It is the CSS
`object-fit` family; the default is `"contain"`:

| Value       | Behavior                                      |
| ----------- | --------------------------------------------- |
| `fill`      | Stretch to the rect, ignoring aspect ratio    |
| `contain`   | Fit entirely inside, letterboxed (default)    |
| `cover`     | Fill the rect, cropping the overflow          |
| `fitWidth`  | Match the width, overflow or letterbox height |
| `fitHeight` | Match the height, overflow or letterbox width |
| `none`      | Draw at intrinsic size, centered in the rect  |
| `scaleDown` | Like `contain`, but never scale up            |

```tsx
{
  (["fill", "contain", "cover", "fitWidth", "fitHeight", "none", "scaleDown"] as const).map(
    (fit) => <Image key={fit} image={local} x={0} y={0} width={80} height={64} fit={fit} />,
  );
}
```

## sampling

`sampling` controls how texels are read when the bitmap is scaled. The default
is `{ filter: "linear", mipmap: "none" }`:

```tsx
<Image image={local} width={150} height={92} fit="fill" sampling={{ filter: "nearest" }} />
<Image image={local} width={150} height={92} fit="fill" sampling={{ mipmap: "linear" }} />
```

- `filter` — `"linear"` (smooth, default) or `"nearest"` (crisp pixel blocks
  when magnifying).
- `mipmap` — `"none"` (default), `"nearest"`, or `"linear"`; effective when
  the GPU texture carries a mip chain.
- `cubic` — `{B, C}` Mitchell/Robinson weights; transported today but not yet
  consumed by the released skity build, so it takes no effect yet.

## Paint interaction

`<Image>` participates in paint inheritance: an inherited or group-level
`opacity`, `blendMode`, or filter applies to the bitmap. A `color` fill does
not — the pixels are the content.

## Further reading

- [ImageDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ImageDemo.tsx)
  — data URI vs remote, the seven-value fit gallery, sampling comparison,
  animated destination, live
- [Gradients](/guide/gradients) — `<ImageShader>` for bitmap fills on shapes
