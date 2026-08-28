# Images

`<Image>` draws a bitmap; `useImage` resolves a source uri into a stable handle. The bitmap loads asynchronously on the platform side — the node stays blank until pixels land (there is no null-while-loading phase and no `onError`; no native→JS channel exists for it).

```tsx
import { Image, useImage, createImageHandle } from "@scumble/react";
import type { ImageHandle } from "@scumble/react";
```

## `<Image>`

Draw a bitmap on the canvas. The source is a `useImage()` handle or a bare uri string (http(s) URL / data URI); `fit` (default `"contain"`) inscribes the bitmap into the destination rect, and `sampling` controls how texels are sampled when it is scaled. Inherited `opacity`/`blendMode`/filters apply; the fill color does not.

```tsx
const image = useImage("https://picsum.photos/seed/oslo/300/200");

<Image image={image} x={0} y={0} width={300} height={200} fit="cover" />
<Image image={image} width={300} height={200} sampling={{ filter: "nearest" }} />
```

A missing image or destination size renders nothing.

### Props

All [shared graphic props](/api/paint#shared-graphic-props), plus:

| Prop       | Type                                                        | Default                                | Description                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`    | `ImageHandle \| string \| null`                             | —                                      | The image to draw: a `useImage()` handle or a bare uri string (http(s) URL / data URI). `null`/`undefined` draws nothing. Required.                                                                                                |
| `x`        | `number`                                                    | `0`                                    | Left edge x (dp).                                                                                                                                                                                                                  |
| `y`        | `number`                                                    | `0`                                    | Top edge y (dp).                                                                                                                                                                                                                   |
| `width`    | `number`                                                    | —                                      | Destination width (dp). Required unless `rect` is given.                                                                                                                                                                           |
| `height`   | `number`                                                    | —                                      | Destination height (dp). Required unless `rect` is given.                                                                                                                                                                          |
| `rect`     | `{ x?: number; y?: number; width: number; height: number }` | —                                      | Destination rect as one object; takes precedence over the `x`/`y`/`width`/`height` props (`x`/`y` default to 0).                                                                                                                   |
| `fit`      | `Fit`                                                       | `"contain"`                            | How the bitmap is inscribed into the destination rect (the CSS object-fit family). Resolved against the bitmap's intrinsic size at render time.                                                                                    |
| `sampling` | `ImageSamplingOptions`                                      | `{ filter: "linear", mipmap: "none" }` | How texels are sampled when the bitmap is scaled. `cubic` is transported but not yet consumed by the released skity build — it takes effect once a skity-native with `CubicResampler` ships (non-zero B/C then replaces `filter`). |

## `useImage`

Resolve an image source into an [`ImageHandle`](#image-types). The handle is returned immediately — no loading state, no `onError`; the platform loads the bitmap asynchronously and the `<Image>` node simply shows up once pixels land.

```tsx
const image = useImage("https://picsum.photos/seed/x/300/200");
// image === null when source is null/empty → draw nothing
```

```ts
function useImage(source: string | null | undefined): ImageHandle | null;
```

A `null`/empty source returns `null`.

## `createImageHandle`

The non-hook handle factory behind `useImage`. Backed by a module-level cache: the same uri always yields the same handle reference (`===` stable), so it is safe as a dependency/equality key, and multiple `<Image>` nodes sharing a uri map to one store entry for free.

```ts
import { createImageHandle } from "@scumble/react";

const handle = createImageHandle("https://example.com/tile.png");
```

```ts
function createImageHandle(uri: string): ImageHandle;
```

## Image types

The image-related types re-exported from `@scumble/react` (originally from `@scumble/graphics`).

### `ImageHandle`

Opaque handle to an image source, built by `useImage`/`createImageHandle`.

```ts
interface ImageHandle {
  readonly __kind: "scumble-image";
  readonly uri: string;
}
```

### `Fit`

How a bitmap is inscribed into its destination rect (the CSS object-fit family), resolved against the bitmap's intrinsic size at draw time.

```ts
type Fit = "cover" | "contain" | "fill" | "fitHeight" | "fitWidth" | "none" | "scaleDown";
```

### `TileMode`

How an image shader tiles outside its fitted rect (Skia's `SkTileMode` family; also applies to gradient spread).

```ts
type TileMode = "clamp" | "repeat" | "mirror" | "decal";
```

### `ImageSamplingOptions`

Sampling knobs for `<Image>`; every axis is optional.

```ts
interface ImageSamplingOptions {
  filter?: ImageFilterMode; // "nearest" | "linear"
  mipmap?: ImageMipmapMode; // "none" | "nearest" | "linear"
  cubic?: ImageCubicResampler;
}
```

### `ImageFilterMode` / `ImageMipmapMode`

`ImageFilterMode` is `"nearest" | "linear"`; `ImageMipmapMode` is `"none" | "nearest" | "linear"`.

### `ImageCubicResampler`

Mitchell/Robinson cubic resampler weights. `B == 0 && C == 0` disables cubic sampling (see the `sampling` caveat on [`<Image>`](#image)).

```ts
interface ImageCubicResampler {
  B: number;
  C: number;
}
```
