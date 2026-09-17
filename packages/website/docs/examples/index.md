# Examples

The repo ships a demo app ([`packages/example`](https://github.com/sanjiguan111/scumble/tree/develop/packages/example))
with 18 live scenes covering the whole API surface. Run them on a device or
simulator:

```bash
git clone https://github.com/sanjiguan111/scumble && cd scumble
pnpm install
pnpm example:ios      # or: android
```

Every demo is a single self-contained component under
[`packages/example/src/demos/`](https://github.com/sanjiguan111/scumble/tree/develop/packages/example/src/demos) —
the table below links each one to its source and to the guide page that
explains the topic.

| Demo        | What it shows                                                    | Source                                                                                                                     | Guide                                                   |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Shapes      | Circle · Rect · RRect · fill/stroke · opacity                    | [ShapesDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ShapesDemo.tsx)           | [Shapes](/guide/shapes)                                 |
| Gradient    | Linear · radial · sweep · conical · gradient stroke              | [GradientDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/GradientDemo.tsx)       | [Gradients](/guide/gradients)                           |
| Paths       | SVG `d` · Path2D · arcs · path trim animation                    | [PathsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PathsDemo.tsx)             | [Shapes](/guide/shapes)                                 |
| Animation   | Native interpolation · zero JS per frame                         | [AnimationDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/AnimationDemo.tsx)     | [Animation](/guide/animation)                           |
| Playback    | `createAnimation().controller` · pause / seek / finish           | [PlaybackDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PlaybackDemo.tsx)       | [Playback control](/guide/playback-control)             |
| Path Ops    | `Path2D.op` — union · intersect · difference · xor               | [PathOpsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PathOpsDemo.tsx)         | [Shapes](/guide/shapes)                                 |
| Filters     | Blur · DropShadow · ColorMatrix · ColorBlend · MaskBlur          | [FiltersDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/FiltersDemo.tsx)         | [Filters](/guide/filters)                               |
| Transform   | translate · scale · rotate · nested groups · matrix              | [TransformDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/TransformDemo.tsx)     | [Transforms & clipping](/guide/transforms-and-clipping) |
| Clip        | ClipRect · ClipRRect · ClipPath · difference · paint inheritance | [ClipDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ClipDemo.tsx)               | [Transforms & clipping](/guide/transforms-and-clipping) |
| Multi-Paint | Multi-`<Paint>` passes · per-pass opacity/blendMode/dash         | [MultiPaintDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/MultiPaintDemo.tsx)   | [Painting](/guide/painting)                             |
| Paint       | stroke cap/join/width · dash · fillRule                          | [PaintDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PaintDemo.tsx)             | [Painting](/guide/painting)                             |
| Blend       | multiply · screen · difference · Group inheritance               | [BlendDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/BlendDemo.tsx)             | [Painting](/guide/painting)                             |
| Interactive | tap to recolor · mount/unmount · JS-driven progress              | [InteractiveDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/InteractiveDemo.tsx) | [Animation](/guide/animation)                           |
| Viewport    | `viewPort` scaling compared side by side                         | [ViewportDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ViewportDemo.tsx)       | [Canvas & viewPort](/guide/canvas)                      |
| Image       | data URI · http(s) · seven fit modes · sampling · async decode   | [ImageDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ImageDemo.tsx)             | [Images](/guide/images)                                 |
| ImageShader | Bitmap fills · repeat/mirror/decal · textured stroke             | [ImageShaderDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ImageShaderDemo.tsx) | [Gradients](/guide/gradients)                           |
| Paragraph   | Rich text · wrapping & alignment · maxLines · onLayout           | [ParagraphDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ParagraphDemo.tsx)     | [Text](/guide/text)                                     |
| BiDi        | RTL · auto-detection · mixed-direction runs · visual alignment   | [BiDiDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/BiDiDemo.tsx)               | [Text](/guide/text)                                     |

## Screenshots

Captured from the iOS demo app (iPhone 17 Pro simulator). Each shot is the
top of the corresponding demo page — the live app renders every scene at
60fps with the skity GPU backend.

<div class="shot-grid">
  <figure v-for="s in shots" :key="s.name">
    <img :src="withBase('/shots/' + s.name + '.png')" :alt="s.alt" loading="lazy" />
    <figcaption>{{ s.caption }}</figcaption>
  </figure>
</div>

<script setup>
import { withBase } from "vitepress";

const shots = [
  { name: "shapes", caption: "Shapes", alt: "Shapes demo — circles, rects, opacity" },
  { name: "gradient", caption: "Gradient", alt: "Gradients — linear, radial, sweep, conical" },
  { name: "paths", caption: "Paths", alt: "Paths — SVG d, Path2D, trim" },
  { name: "pathops", caption: "Path Ops", alt: "Path ops — union, intersect, difference, xor" },
  { name: "multi-paint", caption: "Multi-Paint", alt: "Multi-Paint — concentric strokes, per-pass opacity and blend modes" },
  { name: "paint", caption: "Paint", alt: "Paint — stroke cap, join, width, dash, fillRule" },
  { name: "blend", caption: "Blend", alt: "Blend modes — multiply, screen, difference" },
  { name: "filters", caption: "Filters", alt: "Filters — blur, drop shadow, color matrix" },
  { name: "group-opacity", caption: "Group Opacity", alt: "Group opacity — exact offscreen compositing" },
  { name: "layer-effects", caption: "Layer Effects", alt: "Layer effects — gooey fusion" },
  { name: "clip", caption: "Clip", alt: "Clipping — rect, rrect, path clips" },
  { name: "transform", caption: "Transform", alt: "Transforms — translate, scale, rotate" },
  { name: "animation", caption: "Animation", alt: "Animation — native interpolation" },
  { name: "playback", caption: "Playback", alt: "Playback control — pause, seek, finish" },
  { name: "image", caption: "Image", alt: "Images — fit modes, async decode" },
  { name: "image-shader", caption: "ImageShader", alt: "Image shader — bitmap fills and tiled strokes" },
  { name: "paragraph", caption: "Paragraph", alt: "Paragraph — rich text layout" },
  { name: "bidi", caption: "BiDi", alt: "BiDi — RTL and mixed-direction text" },
  { name: "viewport", caption: "Viewport", alt: "Viewport — viewBox scaling" },
];
</script>
