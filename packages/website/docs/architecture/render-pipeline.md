# Render pipeline

This page follows a single prop change from your JSX to pixels on the GPU.
The pipeline has two halves: a **JS/TASM half** that resolves friendly values
and serializes _changes_ into FlatBuffer commands, and a **render-thread half**
that owns a retained render tree, applies those commands, and draws through
skity — with a build cache that keeps steady-state frames cheap.

## The pipeline at a glance

```text
JS (React)                TASM thread                 render thread
──────────                ───────────                 ─────────────
resolveAnimation/         prop setter:
parseColor/               record dirty bit +
parsePath/…               append pending command
base64 FlatBuffers ─────▶ layout pass (measure)
                          packs one CommandBatch
                          per frame ────────────────▶ drain queue
                                                     apply to retained tree
                                                     (single source of truth)
                                                     viewport transform
                                                     build paints (cached)
                                                     skity draw
```

Five stages: value resolution in JS, command serialization, transaction flush,
application to the retained tree, and the draw itself.

## Stage 1 — Resolve values in JS

`@scumble/graphics` turns every author-friendly value into a primitive before
it touches a native prop:

- CSS color strings and other color forms → packed `0xAARRGGBB` ints.
- Enum names (`"round"`, `"miter"`, `"evenodd"`, …) → bytes matching the
  `skityrt` schema.
- SVG path `d` strings and `Path2D` objects → a nested `PathCommandList`
  FlatBuffer. Both are interchangeable; `Path2D` boolean ops
  (`Path2D.op(a, b, "difference")`) serialize as a lazy `PathOpList`
  description instead, evaluated natively at render time.
- CSS `transform` lists → a nested `TransformOpList` FlatBuffer.
- Gradients, clips, paint filters, and animation tracks → their own nested
  FlatBuffers, built by the same shared builders.

Variable-length payloads are base64-encoded and set as string props; scalars
travel as number props. The React layer is a thin normalizer on top — it
applies defaults, resolves `ref`s, and forwards to the intrinsic
`<scumble-*>` tags.

## Stage 2 — Commands, not snapshots

The native side does not re-serialize the tree on every change. Each shadow
node setter records **one logical change** as a command into a per-canvas
pending buffer, addressed by a stable `node_id` shared between the shadow node
and its render-tree node:

| Command                                  | Carries                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `SetPaint`                               | fill/stroke color or gradient, stroke attrs, dash, blend mode — gated by explicit field bits |
| `SetPathData` / `SetTransform`           | nested path / transform-op bytes (memcpy'd verbatim)                                         |
| `SetGeometry`                            | per-field geometry (`x`, `cx`, `r`, `width`, …)                                              |
| `SetViewport`                            | the canvas logical viewport (`viewBox` semantics)                                            |
| `SetClip`                                | a group's clip sequence as nested `ClipList` bytes                                           |
| `SetPathOpData`                          | lazy path boolean-op descriptions                                                            |
| `SetPaintFilter`                         | one paint-filter slot (fill/stroke × color/image/mask)                                       |
| `SetImageSource`                         | image URI + fit + sampling                                                                   |
| `SetAnimation`                           | native animation tracks (see the [animation engine](/architecture/animation-engine))         |
| `InsertNode` / `RemoveNode` / `MoveNode` | structural topology changes                                                                  |

A flush packs the buffer into a `CommandBatch` — a monotonic version plus the
command list. FlatBuffer messages are immutable and one-shot, which is exactly
what this channel wants: the producer never touches a batch after posting it,
and the consumer gets exclusive access.

## Stage 3 — Transaction flush on the layout pass

Setters set a dirty flag and call `markDirty()` (Android) /
`setNeedsLayout()` (iOS), so Lynx schedules a layout pass. The canvas shadow
node's measure function — registered for exactly this purpose — drains the
pending buffer and posts **one `CommandBatch` per pass**, coalescing every
change of a frame into a single immutable message.

The layout pass is the flush point because Lynx exposes no ShadowNode
frame/vsync callback; the measure registration is what makes the pass reach
the node, and Lynx's own native-SVG library flushes the same way. A useful
consequence of this design: the canvas gets its size from Lynx layout via
`style` like any view, while shape children are **virtual nodes** whose
geometry is authored in absolute logical pixels and never participates in Lynx
layout. Every scumble prop — geometry included — is pure rendering data.

## Stage 4 — The retained tree, single source of truth

The render thread owns a C++ **retained render tree**, and it is the only
place render state lives:

- The command queue is drained on the render thread; each command is applied
  through an `id → node` map in O(1).
- **Topology belongs to the tree.** Mount/unmount/reorder in the Lynx element
  tree is mirrored by `InsertNode` / `RemoveNode` / `MoveNode` from the
  shadow-node structure hooks, so the render-tree stays consistent with what
  JS rendered.
- **Paint inheritance is resolved here**, at render time, with nothing extra
  on the wire: each node remembers which paint fields it ever set explicitly,
  and the draw walk threads a merged style down the tree — a node's explicit
  fields overlay the nearest ancestor's values, and `opacity` multiplies.
  Transforms and geometry are never inherited.
- Group clips apply after the group's own transform (clip geometry is in the
  group's local space), before the subtree.

Because the tree is exclusive to the render thread, applying commands and
drawing need no locks anywhere. Threading is one hop — TASM posts straight to
the render thread (a `HandlerThread` on Android, a serial GCD queue on iOS);
the UI thread only hosts the surface and forwards size changes and events.

## Stage 5 — Draw

`ScumbleRenderer::Draw` walks the retained tree once per frame:

1. Apply the **viewport transform** at the root — the logical→physical scale
   implied by `viewPort` (SVG `viewBox` semantics, `xMidYMid meet` by default)
   plus the screen density. This happens at draw time because the physical
   size is only known after layout; the tree itself stays in logical pixels
   all the way down.
2. Build paints — fill/stroke color or gradient or image shader, stroke
   attributes, dash effects, filters, blend mode — consulting the render build
   cache (below).
3. Issue draw calls through skity: paths (including per-contour trim windows
   and boolean-op results), images, and glyph runs for paragraphs
   (`DrawGlyphs` per run; see [text layout](/architecture/text-layout)).

skity lowers everything to OpenGL ES, Vulkan, or Metal; scumble contains no
GPU API code of its own.

## The render build cache

Drawing rebuilds paint objects, paths, and shaders every frame — fine for a
static scene, expensive with several animated canvases. The render build cache
keeps those **build products** per retained tree, keyed for O(1)
invalidation:

| Write                                                                          | Bumps                | Invalidates                                                                            |
| ------------------------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------- |
| `SetPaint`, `SetPaintFilter`, `SetTransform`, `SetImageSource`, paragraph runs | `paint_version`      | interned shaders/filters/dash effects, folded transform matrices                       |
| `SetPathData`, `SetPathOpData`, `SetGeometry`, `SetClip`                       | `geom_version`       | cached paths and contours, clip items                                                  |
| `InsertNode` / `RemoveNode` / `MoveNode`                                       | tree structure epoch | everything                                                                             |
| `SetAnimation`, animation ticks                                                | **nothing**          | animated nodes keep hitting the cache; only their per-frame scalars are computed fresh |

The last row is the load-bearing invariant: **animation never invalidates the
cache.** An animated opacity or trim window reuses the same cached path and
shader objects and only recomputes the cheap scalars.

What is cached: base `skity::Path` objects per shape (fill rule baked in),
per-contour paths for trimming with a resident `PathMeasure` (an animated trim
window then only calls `GetSegment`, never re-subdivides), interned gradient
shaders, filter objects, dash path effects, folded transform matrices, decoded
group clips, and paragraph fonts. Paints themselves are not cached — they are
cheap to build and animation composes fresh color/alpha onto them every frame.
Tables are LRU-capped; overflow degrades to the uncached path, never errors.

## Further reading

- [RENDER_ARCHITECTURE.md §1–6](https://github.com/sanjiguan111/scumble/blob/main/packages/native/RENDER_ARCHITECTURE.md)
  — target architecture, responsibility split, binary serialization, viewport
  semantics
- [RENDER_ARCHITECTURE.md §11–15](https://github.com/sanjiguan111/scumble/blob/main/packages/native/RENDER_ARCHITECTURE.md)
  — retained tree, command stream, cross-thread dispatch, render build cache
- [Canvas & viewPort](/guide/canvas) — the user-facing viewport API
- [Animation engine](/architecture/animation-engine) — how ticks avoid
  invalidating the cache
- [Native integration](/architecture/native-integration) — the schema and
  codegen behind the wire format
