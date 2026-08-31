# Examples

The repo ships a demo app ([`packages/example`](https://github.com/sanjiguan111/scumble/tree/develop/packages/example))
with 17 live scenes covering the whole API surface. Run them on a device or
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

| Demo        | What it shows                                                    | Source                                                                                                                  | Guide                                                   |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Shapes      | Circle · Rect · RRect · fill/stroke · opacity                    | [ShapesDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ShapesDemo.tsx)           | [Shapes](/guide/shapes)                                 |
| Gradient    | Linear · radial · sweep · conical · gradient stroke              | [GradientDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/GradientDemo.tsx)       | [Gradients](/guide/gradients)                           |
| Paths       | SVG `d` · Path2D · arcs · path trim animation                    | [PathsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PathsDemo.tsx)             | [Shapes](/guide/shapes)                                 |
| Animation   | Native interpolation · zero JS per frame                         | [AnimationDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/AnimationDemo.tsx)     | [Animation](/guide/animation)                           |
| Playback    | `createAnimation().controller` · pause / seek / finish           | [PlaybackDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PlaybackDemo.tsx)       | [Playback control](/guide/playback-control)             |
| Path Ops    | `Path2D.op` — union · intersect · difference · xor               | [PathOpsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PathOpsDemo.tsx)         | [Shapes](/guide/shapes)                                 |
| Filters     | Blur · DropShadow · ColorMatrix · ColorBlend · MaskBlur          | [FiltersDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/FiltersDemo.tsx)         | [Filters](/guide/filters)                               |
| Transform   | translate · scale · rotate · nested groups · matrix              | [TransformDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/TransformDemo.tsx)     | [Transforms & clipping](/guide/transforms-and-clipping) |
| Clip        | ClipRect · ClipRRect · ClipPath · difference · paint inheritance | [ClipDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ClipDemo.tsx)               | [Transforms & clipping](/guide/transforms-and-clipping) |
| Paint       | stroke cap/join/width · dash · fillRule                          | [PaintDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/PaintDemo.tsx)             | [Painting](/guide/painting)                             |
| Blend       | multiply · screen · difference · Group inheritance               | [BlendDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/BlendDemo.tsx)             | [Painting](/guide/painting)                             |
| Interactive | tap to recolor · mount/unmount · JS-driven progress              | [InteractiveDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/InteractiveDemo.tsx) | [Animation](/guide/animation)                           |
| Viewport    | `viewPort` scaling compared side by side                         | [ViewportDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ViewportDemo.tsx)       | [Canvas & viewPort](/guide/canvas)                      |
| Image       | data URI · http(s) · seven fit modes · sampling · async decode   | [ImageDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ImageDemo.tsx)             | [Images](/guide/images)                                 |
| ImageShader | Bitmap fills · repeat/mirror/decal · textured stroke             | [ImageShaderDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ImageShaderDemo.tsx) | [Gradients](/guide/gradients)                           |
| Paragraph   | Rich text · wrapping & alignment · maxLines · onLayout           | [ParagraphDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/ParagraphDemo.tsx)     | [Text](/guide/text)                                     |
| BiDi        | RTL · auto-detection · mixed-direction runs · visual alignment   | [BiDiDemo.tsx](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/src/demos/BiDiDemo.tsx)               | [Text](/guide/text)                                     |
