# Render architecture

The render pipeline is a retained C++ tree owned exclusively by the render thread, mutated by an incremental FlatBuffer command stream — the single source of truth and the single wire format.

This file summarizes the decisions behind it; the full history is `packages/native/RENDER_ARCHITECTURE.md`.

## Three-thread model

Two threads, decoupled by an immutable message queue. The TASM thread only serializes *changes* into commands and posts them; the render thread owns the retained tree, drains the queue, applies it, and draws.

- TASM thread: a prop setter emits a Command into a per-canvas pending buffer; the layout pass (see [[architecture#Flush via the layout pass]]) packs it into one `CommandBatch` and posts it.
- UI thread: `onLayout` / `onSizeChanged` adjust the surface via `session.updateSize`.
- Render thread: drains the queue, applies commands to the retained tree, reads density locally, draws.

The retained tree ([[packages/native/shared/skity/retained_render_tree.h]]) is exclusive to the render thread — no locks, no shared mutable state across threads. Cross-thread hand-off is a command stream, not a full-tree snapshot; the Phase-1 `extraBundle` snapshot channel is retired.

## Command stream

Every logical change to the retained tree is one Command union member in `packages/native/schema/command_batch.fbs` (namespace `skityrt`), applied by the retained tree's `ApplyCommandBatch`.

Fourteen members, grouped by concern so the layout/paint split falls out of which command a setter emits:

- `SetGeometry` — scalar geometry (cx/cy/r/x/y/w/h…), sparse semantics with sentinels
- `SetPaint` — fill/stroke color + nested gradient, width, cap/join/miter/fillRule/opacity, dash, blend mode
- `SetPathData` / `SetTransform` — node_id + nested FlatBuffer bytes (memcpy)
- `SetViewport`, `SetClip`, `SetPathOpData`, `SetPaintFilter`, `SetAnimation`, `SetLayerEffect`
- `InsertNode` / `RemoveNode` / `MoveNode` — structural sync (the most bug-prone area: orphans, id reuse, child-order races)

Why FlatBuffers: commands are one-shot immutable messages, so FlatBuffer immutability is a feature, not a liability. Path/transform payloads reuse the `(nested_flatbuffer: …)` blob channel verbatim. `CommandBatch.version` is a monotonic tree version the renderer uses to detect gaps/reorder.

## Node identity

Commands address nodes by a stable `node_id` shared between the TASM-side shadow node and the render-thread node; the render thread keeps an id → `RetainedNode*` map for O(1) application.

Structural commands (`InsertNode`/`RemoveNode`/`MoveNode`) keep the external tree consistent with the Lynx element tree — the most bug-prone area (orphans, id reuse, child-order races). A Remove→Insert that reuses an id must never validate stale state, which is why structure changes bump a tree-wide epoch (see [[architecture#Render build cache]]).

## Flush via the layout pass

The key simplification the design turns on: canvas size comes from `style` (Lynx layout), and child nodes are virtual — their geometry never participates in Lynx layout, so every skity prop is pure rendering data that can go straight to a command.

The original plan was to delete every `markDirty()` / `setNeedsLayout` once the snapshot was gone. **Revised (Lynx 4.0.1):** no ShadowNode frame/vsync callback is exposed, and iOS has no TASM-thread CADisplayLink, so the layout pass is the only reliable cross-platform coalescing/flush point (lynx-native-svg uses the same pattern). `markDirty` → layout → `measure` drains the pending buffer into one `CommandBatch`; the measure registration and per-setter dirty flags are kept, only the snapshot body is gone. Consequence for setters: [[lynx-integration#Setters must trigger layout]].

## Binary transport

Lynx component props marshal `NSNumber` / `NSString` / `NSArray` but not binary, so variable-length data travels as base64 over a string prop.

The native setter decodes and mechanically copies the bytes into the FlatBuffer vector — a memcpy, zero parsing. Nested FlatBuffers ([ubyte] with `(nested_flatbuffer: …)`) carry path commands, transform ops, path ops, filters, clips, animation tracks, paragraph runs — one mechanism for every variable-length field.

- JS side: [[packages/graphics/src/base64.ts#bytesToBase64]] (hand-written — Lynx JSC has no `btoa`), [[packages/graphics/src/base64.ts#floatsToBase64]] for dash intervals (LE float32).
- The flatbuffers TS runtime is vendored from the habitat source into `packages/graphics/src/generated/flatbuffers/`, not an npm dependency — flatc (25.12.19) and the stub/runtime must match versions exactly.
- Stubs are generated, not committed: `pnpm --filter @scumble/native generate-fbs` (after `tools/hab sync`) emits C++ / Java / TS from the five `.fbs` files.

## Viewport coordinate system

Front-end pixel values are logical pixels; the canvas declares the logical coordinate system via the `viewPort` prop (SVG viewBox semantics, fixed xMidYMid meet) forwarded as four scalar props.

The renderer's `Draw` ([[packages/native/shared/skity/ScumbleRenderer.h]]) applies the viewport transform — scale/translate on the skity Canvas before drawing — because physical size/density are only known after layout. Child coordinates stay logical throughout, so parsers and binary data are uniformly in one space.

## Render build cache

The build cache caches render BUILD PRODUCTS, keyed for O(1) invalidation and animated-value-safe — one per retained tree, kill switch `SetRenderCacheEnabled` ([[packages/native/shared/skity/render_cache.h]]).

Motivation: a per-frame cost audit found `Draw` rebuilding everything on every frame — on a MI 6 (Adreno 540) three animated canvases saturated one core of the shared render thread (70–77% CPU).

- Write invalidation: paint-ish commands bump `paint_version`; geometry-ish bump `geom_version`; structural changes bump a tree-wide epoch (invalidates everything — a reused id can never validate a stale entry).
- **Animated values bump nothing** — the load-bearing invariant: animated nodes keep hitting every cache; only their per-frame scalars are computed fresh. Oval shapes additionally key on their scalar geometry.
- What is cached: base `skity::Path`s, per-contour trim paths with resident PathMeasure (skity rebuilds tables on construction, so residency is the only way an animated window avoids re-subdividing), gradient shaders, filter objects, dash effects, folded transform matrices, clip items, paragraph fonts.
- Not cached: Paints themselves (cheap; animation composes per-frame scalars on fresh ones) and skity's per-draw arena copies (upstream, accepted).
- COW style payloads: deep style fields are `shared_ptr<const T>` — the per-node inheritance scratch copy went from ~12 heap allocations to refcount bumps.
- Tables are LRU-capped; overflow degrades to the uncached lane (kept verbatim as rollback), never errors. Result on the MI 6 animation page: ~50% median CPU vs 70–77%.

## Exact group opacity and layer effects

Two features share one offscreen-composite lane in `DrawNode` (designs: RENDER_ARCHITECTURE.md §16/§17):

- **Group opacity**: a group whose own opacity < 1 composites its subtree through a skity `Canvas::SaveLayer` instead of folding the factor into child alphas (the folded approximation was lossy wherever children overlap). Factor-splitting invariant: the node's own factor stays out of the inherited `eff` and rides the layer composite; ancestors' factors stay folded. Leaves keep the folded fast path; guard failures (degenerate transform, non-finite or >4096px bounds) fall back to it — `QuickReject` on an empty rect would blank the subtree. Kill switch: `SetExactGroupOpacityEnabled` (default on).
- **Group layer effects**: the `<Group layer>` prop is the ONLY entrance to group-level effects — `layer={true}` forces an offscreen composite; `layer={<Paint>…</Paint>}` applies the Paint's filter children to that composite (gooey/liquid territory). Transported by the full-state `SetLayerEffect` command (force + three filter slots; one dirty flag covers all four so partial prop updates can't leave stale bytes). State lives on `RetainedNode`, not the style, because it is group-only and never inherited. Kill switch: `SetGroupLayerEnabled`, orthogonal to the opacity switch. Filter children placed directly on the Group keep per-shape inheritance semantics — different blast radius, both valid.

Texture churn during animations is absorbed by a cross-frame render-target pool; every layer-bearing group still costs one offscreen FBO + composite per frame.
