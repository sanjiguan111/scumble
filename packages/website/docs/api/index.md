# API Reference

Complete reference for the `@scumble/react` component layer. Everything below is imported from one place — `Path2D`, `PathOpName`, and the image types are re-exports from the `@scumble/graphics` core:

```tsx
import { Canvas, Rect, LinearGradient, vec, createAnimation } from "@scumble/react";
```

New here? Start with [Getting Started](/guide/getting-started), then circle back for the details.

## Containers

| Export                                   | Description                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`Canvas`](/api/canvas-and-group#canvas) | The GPU drawing surface — the root node every scene renders into, with an optional logical `viewPort`. |
| [`Group`](/api/canvas-and-group#group)   | Grouping node: cascading transforms, paint inheritance, and clipping for a subtree.                    |

## Animation

| Export                                                              | Description                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`createAnimation`](/api/animation#createanimation)                 | Mint a declarative native animation track spec with an imperative playback controller attached.       |
| [`AnimationController`](/api/animation#animationcontroller)         | The imperative surface: `pause` / `play` / `seekTo` / `cancel` / `onFinish` / `handle`.               |
| [`ControlledAnimationSpec`](/api/animation#controlledanimationspec) | The `createAnimation()` return type — a track spec plus its controller, usable directly as `animate`. |

## Shapes

| Export                                           | Description                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`Circle`](/api/shapes#circle)                   | A circle from center + radius.                                                     |
| [`Ellipse`](/api/shapes#ellipse)                 | An axis-aligned ellipse from center + two radii.                                   |
| [`Line`](/api/shapes#line)                       | A straight line between two points — always stroked.                               |
| [`Rect`](/api/shapes#rect)                       | An axis-aligned rectangle.                                                         |
| [`RRect`](/api/shapes#rrect)                     | A rectangle with corner radii.                                                     |
| [`Polyline`](/api/shapes#polyline)               | An open polyline through vertices — stroked by default.                            |
| [`Polygon`](/api/shapes#polygon)                 | A closed polygon through vertices — filled by default.                             |
| [`Points`](/api/shapes#points)                   | A point set with Skia `drawPoints` semantics: dots, segments, or an open polyline. |
| [`Path`](/api/shapes#path)                       | An SVG `d` string or `Path2D`, with fill rule and path trim.                       |
| [`Image`](/api/images#image)                     | Draw a bitmap with `fit` and sampling control.                                     |
| [`Paragraph`](/api/paragraph-and-text#paragraph) | Width-constrained rich text, laid out natively (CoreText / HarfBuzz, BiDi-aware).  |
| [`TextSpan`](/api/paragraph-and-text#textspan)   | One styled run of text inside a `<Paragraph>`.                                     |

## Images

| Export                                               | Description                                             |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [`useImage`](/api/images#useimage)                   | Resolve a source uri into a stable `ImageHandle`.       |
| [`createImageHandle`](/api/images#createimagehandle) | The non-hook handle factory — same uri, same reference. |

## Shaders

Declarative children of a shape (or `<Paint>`): directly under a shape they fill it, inside `<Paint style="stroke">` they stroke it.

| Export                                                              | Description                                   |
| ------------------------------------------------------------------- | --------------------------------------------- |
| [`LinearGradient`](/api/gradients#lineargradient)                   | A linear gradient between two points.         |
| [`RadialGradient`](/api/gradients#radialgradient)                   | A radial gradient from a center + radius.     |
| [`SweepGradient`](/api/gradients#sweepgradient)                     | An angular sweep around a center.             |
| [`TwoPointConicalGradient`](/api/gradients#twopointconicalgradient) | A two-circle (focal) conical gradient.        |
| [`ImageShader`](/api/gradients#imageshader)                         | Fill or stroke a shape with a bitmap texture. |

## Paint & Filters

| Export                                    | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| [`Paint`](/api/paint#paint)               | Declarative override for a shape's fill or stroke paint. |
| [`Blur`](/api/filters#blur)               | Image filter: blur the shape's rendered layer.           |
| [`DropShadow`](/api/filters#dropshadow)   | Image filter: a blurred colored copy behind the shape.   |
| [`ColorMatrix`](/api/filters#colormatrix) | Color filter: a per-pixel 4×5 color matrix.              |
| [`ColorBlend`](/api/filters#colorblend)   | Color filter: blend a constant color onto the source.    |
| [`MaskBlur`](/api/filters#maskblur)       | Mask filter: feather the shape's alpha mask.             |

## Clipping

| Export                                 | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| [`ClipRect`](/api/clipping#cliprect)   | Clip a `Group`'s subtree to a rectangle.         |
| [`ClipRRect`](/api/clipping#cliprrect) | Clip a `Group`'s subtree to a rounded rectangle. |
| [`ClipPath`](/api/clipping#clippath)   | Clip a `Group`'s subtree to an arbitrary path.   |

## Utilities

| Export                                                                                 | Description                                                                        |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`vec`](/api/gradients#vec)                                                            | Build an `{x, y}` point for shader/vertex props.                                   |
| [`Path2D`](/api/path2d#path2d)                                                         | Command-style path builder, with lazy boolean compositions via `Path2D.op()`.      |
| [`PathOpName`](/api/path2d#pathopname)                                                 | The four boolean path-op names: `"difference" \| "intersect" \| "union" \| "xor"`. |
| [`Fit`](/api/images#fit)                                                               | How a bitmap is inscribed into its destination rect (CSS object-fit family).       |
| [`TileMode`](/api/images#tilemode)                                                     | How an image shader tiles outside its fitted rect.                                 |
| [`ImageSamplingOptions`](/api/images#imagesamplingoptions)                             | Texel sampling knobs for `<Image>` (filter / mipmap / cubic).                      |
| [`ImageFilterMode`, `ImageMipmapMode`, `ImageCubicResampler`](/api/images#image-types) | The sub-types of `ImageSamplingOptions`.                                           |
