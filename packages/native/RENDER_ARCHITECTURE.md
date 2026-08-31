# @scumble/native Render Architecture & Roadmap

> Status: basic rendering + data flow are working (Android OpenGL ES/Vulkan + iOS Metal, green on 2026-08-07).
> This document captures the **functional-development phase**: target architecture, design principles, and work breakdown. **Phase 2 (retained render tree + command stream) is implemented** — see §11 for status & roadmap.

---

## 1. Target architecture

**Declarative tags + localized binary serialization + a viewport logical coordinate system.**

One-line guiding principle:

> **The native side never does "string → structure" parsing; all string parsing happens in front-end JS.**

**Phase 2 revision (§11):** native additionally **holds a retained render tree** — it turned from a stateless serializer into a stateful rendering engine. The rule above ("zero string parsing") is unchanged: the native side owns retained _state_, never string parsing. Topology/geometry/paint now reach it as a FlatBuffer command stream (not a full-tree snapshot); `measure`/`markDirty` are kept only as the flush trigger.

Following this line, the ownership of every attribute falls out naturally. The design keeps the composability of the tag model (nested children, measure, readability) while letting the heavy-parse / heavy-data parts reach the render layer as binaries — mirroring the proven layering of `react-native-svg` / `react-native-skia`.

## 2. Layering

```
┌─────────────────────────────────────────────────────┐
│  @scumble/react        @scumble/vue           │  framework wrapper layer (separate npm pkgs)
│  <Circle fill="#fff"/>    <Circle fill="#fff"/>      │  ergonomics / defaults / ref / animation
└───────────────┬───────────────────┬─────────────────┘
                │   shared parsing    │
        ┌───────▼───────────────────▼─────────┐
        │  @scumble/graphics (pure JS, no    │  parser/normalizer shared layer
        │  framework) color→int · path d→...   │  React/Vue don't reinvent it
        │  transform→... · gradient            │
        └───────┬───────────────────────────────┘
                │  produces "primitive values" (int/float/ArrayBuffer)
        ┌───────▼───────────────────────────────────────┐
        │  @scumble/native (base contract layer,     │  intrinsic tags + elements.ts types
        │  framework-agnostic)                           │  native accepts int/float/base64-string,
        │  <scumble-circle cx cy r fill=0xAARRGGBB>        │  zero string parsing
        │  ─── FlatBuffer skityrt::RenderTree ───────────│
        └─────────────────────────────────────────────────┘
```

Dependency direction is a single directed acyclic chain: `@scumble/{react,vue}` → `@scumble/graphics` → `@scumble/native` (tag contract).

## 3. Responsibility split

| Data nature                       | Examples                                                                  | Owner                                   | Transport                                                                            |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Parse-free scalars                | color `0xAARRGGBB`, geometry `cx/cy/r/x/y/w/h`, `strokeWidth`, enum bytes | base tag prop (unchanged)               | `@LynxProp` number                                                                   |
| Parsed / nested structures        | path `d`, CSS `transform`, `Gradient`, `Shader`, `dasharray`, `points`    | **front-end parse → serialize**         | nested FlatBuffer bytes, base64 over a string prop (Lynx props don't marshal binary) |
| canvas-level coordinate transform | `viewport` (logical → physical px)                                        | canvas node declares + renderer applies | `RenderTree` top-level field                                                         |

Note: even enum strings like `strokeCap="round"` are front-loaded — the framework component accepts a friendly string, the parser maps it to a byte, the base prop receives a number. The native side is left with no enum parsing either; the principle stays consistent.

The "three states" of color `0xAARRGGBB` are a deliberate trade-off and stay as-is: the front-end API takes a packed int (compact, easy to pass) → the schema is an `RGBAColor` struct table (readable, 4-byte aligned, leaves room for gradients) → skity's `Paint` goes back to a packed int.

## 4. Schema status & extensions

The schema lives in `packages/native/schema/render_tree*.fbs` (namespace `skityrt`); `scripts/generate-fbs.mjs` runs flatc to emit C++ (`shared/skity/generated/`), Java stubs (`android/.../fbs-gen/`), and TypeScript stubs (`packages/graphics/src/generated/`). iOS reuses the C++ stubs directly.

**Existing structures:**

- `RGBAColor { r,g,b,a:uint32 }`, `GradientStop`, `Gradient` (linear+radial+sweep+two-point-conical+stops, complete; sweep angles in degrees), `ResolvedPaint { type: NONE/COLOR/GRADIENT; color; gradient }`
- `PathCommand { type; args:[float] }` + `PathCommandType` (MOVE_TO..CLOSE)
- `TransformOp { type; args:[float] }` + `TransformType` (MATRIX..SKEW_Y)
- `ComputedStyle` (fill/stroke/strokeWidth/linecap/linejoin/dasharray/dashoffset/miterlimit/fillRule/opacity/display/visibility/transform)
- `RenderNode` (tag_name/style/float geometry/children/path_commands/points/gradient_units/spread_method)
- `RenderTree { root:RenderNode }`

**Extensions this phase:**

- Added `ViewBox { x,y,width,height }` + `PreserveAspectRatio` (`AspectRatioAlign` + `AspectRatioMeetOrSlice`, SVG `preserveAspectRatio` semantics); `RenderTree` gained `viewport`, `preserve_aspect`, `density`.
- `RenderNode` geometry comment changed from "absolute pixels" to **logical pixels (within the viewport logical coordinate space)**.
- Added `PathCommandList` / `TransformOpList` wrapper tables + `RenderNode.path_data` / `ComputedStyle.transform_data` as `[ubyte] (nested_flatbuffer: ...)` fields (legacy `path_commands` / `transform` kept during migration).

**Future extensions (TBD):**

- **Shader**: add `SHADER=3` to `ResolvedPaint.type` + a `Shader` table. **Design pending** — depends on which shader to support (image fill / runtime shader / skity `SkShader`). No field is added until confirmed, to avoid a dangling enum value.

## 5. Binary serialization

`@scumble/graphics` parses strings/objects and produces FlatBuffer bytes. Lynx component props marshal `NSNumber` / `NSString` / `NSArray` but **not** binary (`NSData` / `byte[]`), so the bytes are **base64-encoded** (`bytesToBase64`, hand-written — Lynx JSC has no `btoa`) and carried as a string prop. The native setter base64-decodes (`-[NSData initWithBase64EncodedString:]` / `android.util.Base64.decode`) then does a **mechanical copy** into the FlatBuffer vector — the decode is an encoding conversion, not structure parsing, so "native never parses" still holds.

**Nested-FlatBuffer approach**: path / transform / (later gradient / shader) are built directly as standalone FlatBuffers (`PathCommandList` / `TransformOpList` / `PathOpList` / `Filter`) by `@scumble/graphics` using `flatbuffers.js`, and passed in as `[ubyte]` blobs (base64 over the wire).

- **schema**: wrapper tables + `RenderNode.path_data` / `ComputedStyle.transform_data`, annotated `(nested_flatbuffer: "...")`
- **front end**: parsers build finished FlatBuffer bytes using `flatc --ts` stubs + the `flatbuffers` runtime, then `bytesToBase64`
- **native setter**: base64-decode → `CreateVector(ubyte, bytes)` — a memcpy, **zero parsing, zero table construction**
- **renderer**: `node->path_data_nested_root()` / `transform_data_nested_root()` — standard FlatBuffer lazy parsing

Why nested flatbuffer over a custom wire format: the native side is fully free of deserialization (just memcpy), the renderer uses standard FlatBuffer accessors, and every variable-length field shares one mechanism. (An earlier custom wire format `[u8 type][u8 argc][u16 pad][f32]` is retired; `binary.ts` keeps only the enum constants.)

> The flatbuffers TS runtime is **vendored from the habitat source** (`generate-fbs` copies `shared/third_party/flatbuffers/ts/` → `packages/graphics/src/generated/flatbuffers/`, adds `@ts-nocheck`, excludes flexbuffers, clears the dir before each run), not an npm dependency — flatc (`25.12.19`) and the stub/runtime must match versions exactly, the same reason Android consumes the flatbuffers Java runtime from source rather than maven. Stub imports are rewritten from `'flatbuffers'` to the vendored `'../flatbuffers/flatbuffers.js'`.

> **`@scumble/graphics` is consumed as a tsc-built `dist/`** (`pnpm --filter @scumble/graphics build`), not as raw source. The vendored `flatbuffers.ts` re-exports type-only symbols (`Offset`/`Table`/interfaces) from `types.js`; tsc whole-program erases those re-exports at emit time, but a bundler (rspack/swc, `isolatedModules`) cannot, so raw source fails to link under rspeedy (`module has no exports`). The build keeps `isolatedModules` off deliberately; Lynx packages stay source-only and import the compiled `dist`.

> **Lynx JSC lacks `TextEncoder` / `TextDecoder`** (web APIs). The vendored flatbuffers runtime instantiates them in its `Builder` / `ByteBuffer` constructors, so `parsePath` / `parseTransform` would otherwise throw at builder construction and blank the page. `@scumble/graphics`'s entry installs a hand-written polyfill; the nested FlatBuffers carry only numbers, so `encode` is effectively unused.

## 6. Viewport coordinate system (SVG viewBox semantics)

A front-end `width={100}` is a **logical pixel**; `scumble-canvas` declares the logical coordinate system via the `viewPort` prop (`{x,y,width,height}`, forwarded to native as four scalar props) with a fixed `preserveAspectRatio` (xMidYMid meet), and the renderer maps it to physical pixels.

- Child coordinates stay as **logical-pixel values** in the FlatBuffer; the transform is applied once at the root canvas → front-end parsers and binary data are uniformly in logical pixels, clean and consistent.
- **The viewport transform is applied by the renderer `ScumbleRenderer::Draw`** (scale/translate on the skity Canvas before drawing), not on the front end, because physical size / density are only known after layout — the front end doesn't have them at render time. This neatly sidesteps the layout-timing problem that "front end builds the whole tree bytes" would run into.
- The renderer already does a `density` scale; extending it to `viewport` + `preserveAspectRatio` is straightforward.

## 7. Native-side changes

- **Delete** the semantic parsing in `ScumblePropParser` (Android `.kt` / iOS `.m`).
- Variable-length field setters take a **base64 string** (Lynx props don't marshal `byte[]` / `NSData`); the setter decodes and mechanically copies the bytes into the FlatBuffer vector. Enum setters take a **number** (parsers already mapped the friendly string → skityrt byte in JS).
- `ScumbleCanvasShadowNode.measure()` is **kept** (compute layout + collect scalars + ferry bytes + build the `ViewBox` / `PreserveAspectRatio`); the renderer applies the viewport transform.
- The packed-int color prop is unchanged.

## 8. Work breakdown

Dependency-ordered; each step is independently reviewable:

1. **schema extension** (viewport + nested_flatbuffer fields) → regenerate stubs. Backward compatible; consumers untouched for now. **✓ done**
2. **`@scumble/graphics`** (pure-JS shared layer): color→int, enum→byte, path d→nested FlatBuffer, transform→nested FlatBuffer (full SVG command set incl. H/V/S/T/A + relative). Vitest round-trip tests. **✓ done**
3. **native slim-down**: delete `ScumblePropParser`; variable-length setters take a base64 string → decode → memcpy (Lynx props don't marshal binary); enum setters take a number; renderer applies the viewport transform and consumes `path_data` / `transform_data` via `nested_root` (+ MATRIX/SKEW). **✓ done**
4. **`@scumble/react`**: thin wrapper components `<Circle>` that normalize then render `<scumble-circle>`; reuse parsers. **✓ MVP done** — full SVG path + matrix/skew now flow through after Task 3; Paint/gradient/clip/`forwardRef`/animation still TBD.
5. **example** switches to the React component layer + a viewport demo. **✓ done**
6. **`@scumble/vue`** (later): same wrapping; the base tags are framework-agnostic, so this works naturally.

**Plus (TBD):** Shader schema extension (needs the shader type confirmed first).

## 9. Cleanup backlog

- `shared/elements/` (`x-scumble` C++ `LynxNativeView`): autolink default scaffold, unrelated to the graphics pipeline; clean up later.
- `polyline` / `polygon`: the renderer `ScumbleRenderer.cc` already dispatches by tag_name, but no tag is registered natively, no TS type exists, and the `points` prop is currently unused — wire these up together when they land.

## 10. Key file index

- Schema: `packages/native/schema/render_tree{,_common,_style}.fbs`
- Codegen: `packages/native/scripts/generate-fbs.mjs` (`pnpm --filter @scumble/native generate-fbs`)
- Front-end tag types: `packages/native/src/elements.ts` (`declare module` augments `IntrinsicElements`)
- Parsers: `packages/graphics/` (`@scumble/graphics`)
- Front-end usage: `packages/example/src/App.tsx`
- Native registration: Android `android/.../graphics/ScumbleBehavior.kt` + `ScumbleInit.kt`; iOS `ios/Classes/Node/ScumbleCanvasShadowNode.mm` + `ScumbleNodeBase.m`
- prop setters: Android `android/.../graphics/node/ScumbleNodeBase.kt`; iOS `ios/Classes/Node/ScumbleNodeBase.m`
- parser: **deleted** in Task 3 (was `node/ScumblePropParser.kt` / `Node/ScumblePropParser.m` — string parsing now lives in `@scumble/graphics`)
- serialization: Android `android/.../graphics/node/ScumbleCanvasShadowNode.kt` (measure/buildRenderNode/buildStyle/buildPaint); iOS `ios/Classes/Node/ScumbleCanvasShadowNode.mm`
- renderer: `packages/native/shared/skity/ScumbleRenderer.cc` (cross-platform C++, `Draw(tree,canvas,density,W,H)` + viewport)
- backends: Android `android/src/main/cpp/skity/{gles,vulkan}_render_backend.cpp`; iOS `ios/Classes/Render/`

---

## 11. Phase 2 roadmap — retained render tree + command stream

> Status: **Step 1 + Step 2 + Step 3a + Step 3b implemented (2026-08-11..13, branch
> `phase2/step1-retained-tree`).** The retained tree is the single source of truth
> and the command stream is the single wire format; the `extraBundle` snapshot
> channel is retired. Verified: dual-platform build; Android dynamic
> (Insert/Remove/Move + geometry/viewport) and iOS dynamic (2026-08-13) both green.
> Step 4's "delete `markDirty`/`setNeedsLayout`" is **deferred** — Lynx 4.0.1
> exposes no ShadowNode frame/vsync callback, so the layout pass is still the only
> flush point (§11.6/§11.7); only the doc-sync part of Step 4 is done. This section
> revises the §1 principle — Phase 2 moves from a _stateless serializer_ to a
> _stateful rendering engine_, motivated by animation.

### 11.1 Motivation

Phase 1 is a stateless serializer: any single prop change → `markDirty` → Lynx
layout pass → `measure()` rebuilds the **entire** `RenderTree` FlatBuffer →
`extraBundle` ships an immutable snapshot across three threads. This is simple
and thread-safe (zero shared mutable state), but for **animation** — a high
frequency of small updates — the cost is not the GPU draw, it is the Lynx layout
pass + the full-tree re-serialization that runs on every changed prop. The Lynx
ShadowNode tree is already incremental (only the changed setter fires); Phase 1
flattens that back into a full rebuild.

**Goal:** make a single prop change cost O(1) on the renderer thread, and take
the pure-painting props **off the Lynx layout pipeline entirely**.

### 11.2 Target architecture

> **Two threads, decoupled.** The TASM thread only serializes _changes_ into
> commands and posts them. The render thread owns a retained C++ render tree,
> drains the command queue, applies it, and draws. The `extraBundle` snapshot
> channel is retired.

```
TASM thread                 UI thread              render thread
──────────                  ─────────              ─────────────
setter → emit Command       onLayout /             drain command queue
       → batch              onSizeChanged          → apply to retained tree
       → post ───────────────────────────────────▶
                            ── session.updateSize ▶ adjust surface
                                                   read density locally
                                                   Draw(tree, canvas, …)
```

The render tree is **exclusive to the render thread** — no locks, no shared
mutable state across threads. Cross-thread hand-off is now a _command stream_
(still an immutable message) instead of a _full-tree snapshot_.

### 11.3 Why FlatBuffers is the right wire format here

An earlier idea was to use nested FlatBuffers to **splice a full tree** from
per-node blobs. That is undermined by FlatBuffer immutability (a changed child
invalidates every ancestor blob). Phase 2 uses FlatBuffers for **incremental
command messages** instead — commands are one-shot immutable messages, so
immutability is a feature, not a liability. Path/transform payloads reuse the
existing `(nested_flatbuffer: …)` blob channel verbatim.

### 11.4 Command stream schema (draft — finalized at implementation)

```fbs
// render_tree_command.fbs  (Phase 2 draft)
include "render_tree_common.fbs";
include "render_tree_style.fbs";
namespace skityrt;

// One logical change to the retained tree. Union members are grouped by concern
// so the layout/paint split (§11.6) falls out of which command a setter emits.
union Command {
  SetGeometry,    // cx/cy/r/x/y/w/h/… (virtual nodes, absolute logical px)
  SetPaint,       // fill/stroke color + gradient (nested), strokeWidth, cap/join/miter/fillRule/opacity, stroke dash, blend mode
  SetPathData,    // node_id + nested PathCommandList bytes (memcpy)
  SetTransform,   // node_id + nested TransformOpList bytes (memcpy)
  SetViewport,    // canvas viewBox
  SetClip,        // group clip sequence (nested ClipList bytes; applied after transform)
  SetPathOpData,  // path boolean ops (nested PathOpList bytes; evaluated at render time)
  SetPaintFilter, // one paint-filter slot: nested Filter bytes (fill/stroke × color/image/mask)
  InsertNode,     // create node under a parent at an index
  RemoveNode,     // destroy node (+ subtree)
  MoveNode,       // reparent / reorder
}

table SetGeometry {
  node_id:uint;
  x:float; y:float; width:float; height:float;   // sparse semantics: see §11.6
  cx:float; cy:float; r:float; rx:float; ry:float;
  x1:float; y1:float; x2:float; y2:float;
}

table SetPaint {
  node_id:uint;
  fill_color:uint;     // 0xAARRGGBB; sentinel (e.g. 0xFFFFFFFF+1) = NONE
  stroke_color:uint;
  stroke_width:float; stroke_cap:LineCap; stroke_join:LineJoin;
  stroke_miter:float; fill_rule:FillRule; opacity:float;
  stroke_dash:[float]; stroke_dashoffset:float;  // dash intervals (LE float32 over the base64 string prop channel) + phase
}

table SetPathData  { node_id:uint; data:[ubyte] (nested_flatbuffer: "PathCommandList"); }
table SetTransform { node_id:uint; data:[ubyte] (nested_flatbuffer: "TransformOpList"); }
table SetViewport  { node_id:uint; x:float; y:float; width:float; height:float; }
table InsertNode   { node_id:uint; parent_id:uint; index:uint; tag_name:string; }
table RemoveNode   { node_id:uint; }
table MoveNode     { node_id:uint; new_parent_id:uint; index:uint; }

table CommandBatch {
  version:uint;        // monotonic tree version; renderer detects gaps / reorder
  commands:[Command];
}
root_type CommandBatch;
```

Open detail (resolve at implementation): whether `SetGeometry`/`SetPaint` carry
_all_ fields and use an "unchanged" sentinel, or split into per-field commands.
The schema above keeps one table per concern with sentinel values for "not set";
optional scalars (`(optional)`, flatc ≥ 1.12) are the cleaner alternative if the
codegen target supports them everywhere.

### 11.5 Node identity

Commands address nodes by a stable `node_id` shared between the TASM-side shadow
node and the render-thread node.

- **Preferred:** reuse the Lynx shadow node's native id/sign (iOS
  `initWithSign:`, Android `ShadowNode` id) directly. **Must verify** it stays
  stable across insert/remove/reorder and isn't reused after unmount.
- **Fallback:** TASM-side monotonic id allocator, assigned at mount, carried on
  the shadow node.
- Render thread keeps an `id → RenderNode*` map for O(1) command application.

### 11.6 The layout/paint split — and why `markDirty` goes away

This is the key simplification the whole design turns on:

- The **canvas size** comes from `style` (Lynx layout, standard) — see
  `Canvas.tsx`: _"Size comes from `style` like any Lynx view."_ Lynx lays the
  canvas out without any help from skity.
- **Child nodes are virtual**; their geometry (`cx/cy/r`, path data, …) is
  authored in absolute logical pixels and **does not participate in Lynx
  layout** at all.

Therefore **every skity prop — geometry included — is pure rendering data** that
can go straight to a command. _Originally_ the plan was to delete every
`markDirty()` / `setNeedsLayout` once `measure` was gone. **Step 3b revised
this** (Lynx 4.0.1): no ShadowNode frame/vsync callback is exposed, and the
layout-pass-driven `measure` is the only reliable coalescing/flush point (iOS
has no TASM-thread CADisplayLink equivalent). So `markDirty`/`setNeedsLayout`
are **kept** as the flush trigger even though the snapshot body is gone —
paint-only updates still ride a layout pass. Deleting them (the real animation
win) is deferred until Lynx exposes a frame callback.

### 11.7 Transaction batching

`measure` currently rides on the Lynx layout pass, which gave it a free
coalescing of multiple prop changes per frame. Removing `measure` removes that
free lunch: batching multiple setters into one `CommandBatch` becomes the command
channel's explicit job.

- Each setter appends to a per-canvas pending buffer on the TASM thread.
- A flush at a reliable "end of update transaction / end of frame" point packs
  the buffer into one `CommandBatch` and posts it.
- **Resolved (Step 3b, Lynx 4.0.1):** the "reliable flush hook" is the layout
  pass itself — `measure` (iOS `measureWithMeasureParam:`) drains the pending
  buffer into one `CommandBatch` per pass. `setCustomMeasureFunc` /
  `customMeasureDelegate` registration is **kept** (emptying only the snapshot
  body) because `onLayoutBefore`/`measure` only fire for nodes that registered a
  measure function. No Lynx frame callback is exposed to ShadowNodes, and iOS
  has no TASM-thread CADisplayLink, so the layout pass remains the only
  cross-platform flush point (lynx-native-svg uses the same pattern). The root
  `onAfterUpdateTransaction` caveat still holds (per-node, not parent-fired) —
  which is exactly why the per-setter `markDirty`→layout→`measure` path is used.

### 11.8 Structural sync

Mount/unmount/insert/remove/move in the Lynx element tree must be hooked
(`InsertNode` / `RemoveNode` / `MoveNode`) so the render-thread tree stays
consistent. Hook Lynx ShadowNode's structure-change overrides on both platforms.
This is the most bug-prone area of a retained external tree — orphans, id reuse
collisions, child-order races — and needs dedicated round-trip tests.

### 11.9 What gets retired

Removing the snapshot channel dissolves the `measure` function, which today
couples "compute size" with "serialize the whole tree":

| Today (in `measure` / Phase 1)                                                       | Phase 2 owner                                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Compute canvas size                                                                  | **Deleted** — Lynx layout via `style`                                                                             |
| Build the `RenderTree` FlatBuffer (leaf→root)                                        | **Deleted** — command stream                                                                                      |
| `buildRenderNode` / `buildStyle` / `buildPaint`                                      | **Deleted**                                                                                                       |
| `ScumbleRenderBundle` + `getExtraBundle` + `updateExtraData` + `consumeRenderBundle` | **Deleted**                                                                                                       |
| `setCustomMeasureFunc` (Android) / `customMeasureDelegate` (iOS)                     | **Kept registered** (Step 3b: only the snapshot _body_ is deleted; the registration is the flush trigger — §11.7) |
| `density` capture in measure                                                         | Render thread reads it locally (it already is the single source of truth in `Draw`)                               |
| Canvas physical size in bundle                                                       | `onSurfaceTextureSizeChanged` / `onSizeChanged` → `session.updateSize` (already exists)                           |

**Kept:** `isVirtual = false` on the canvas (it still needs a platform view —
`TextureView` / `MetalLayer` — to host the GPU surface; removing `measure` ≠
removing the view). Shape/group nodes stay virtual.

### 11.10 Migration path (incremental, each step independently revertable)

1. **Paint command channel** ✓ done (commits `defc114`/`baff691`). Stand up the
   C++ retained tree + `CommandBatch` plumbing; route pure-paint setters
   (`SetPaint`/`SetPathData`/`SetTransform`) through it, `extraBundle` coexisting.
2. **Structural commands + node id** ✓ done (commit `b567ff8`). `InsertNode`/
   `RemoveNode`/`MoveNode` from precise ShadowNode hooks (Android `addChildAt`/
   `removeChildAt`, iOS `didAddSubComponent:`/`willRemoveComponent:`); the
   render-thread tree is the source of truth for topology. Snapshot demoted to a
   field-value refresh (SyncFromSnapshot no longer rebuilds topology).
3. **Geometry + viewport via commands.** `SetGeometry`/`SetViewport`; delete
   `measure`, `buildRenderNode`, `extraBundle`, `ScumbleRenderBundle`. Lynx layout
   owns canvas size end-to-end.
   - **3a ✓ done.** `SetGeometry`/`SetViewport` added to the schema; geometry +
     viewport setters mark dirty (`dirtyGeometry` bitmask / `dirtyViewport`) and
     drain through the command channel alongside paint/path/transform. `measure`
     and the snapshot channel are **kept** as the flush point + full-tree
     fallback, so the new commands land as same-value no-ops under the Apply→Sync
     ordering until 3b. Verified by zero-regression (the commands are masked by
     the coexisting snapshot).
   - **3b ✓ done (plan A — mirrors lynx-native-svg).** Retired the snapshot
     channel: deleted `buildRenderNode`/`buildStyle`/`buildPaint`/`extraBundle`/
     `ScumbleRenderBundle` + `SyncFromSnapshot` + `nativeSetRenderTree`; `measure`'s
     body now only drains the CommandBatch (the sole extra-bundle payload) +
     returns size; the render thread's retained tree is the single source of
     truth. **`measure` registration + `markDirty`/`setNeedsLayout` are kept** as
     the flush trigger: investigation (Lynx 4.0.1) found no ShadowNode frame/vsync
     callback is exposed, and `onLayoutBefore`/`measure` only fire when a measure
     function is registered — so deleting them loses the only coalescing point
     (iOS has no TASM-thread CADisplayLink equivalent). The "delete markDirty →
     paint-only updates skip layout" win is therefore **deferred until Lynx
     exposes a frame callback**. See §11.6/§11.7/§11.9 for the revised reasoning.
     **Verified:** dual-platform build; Android + iOS dynamic (Insert/Remove/Move,
     geometry/viewport via the command channel, 2026-08-13).
4. Cleanup: the doc-sync part — §1 principle + this §11 Status block — is ✓ done
   (2026-08-13). Removing the now-dead `markDirty`/`setNeedsLayout` calls is
   **deferred**: Lynx 4.0.1 exposes no ShadowNode frame callback, so the layout
   pass is still the only cross-platform flush point (§11.6/§11.7); that removal —
   the real "paint-only updates skip layout" animation win — waits for Lynx to
   expose a frame callback.

### 11.11 Trade-offs & risks

- This is a turn from **stateless serializer** to **stateful engine**. The §1
  principle is revised accordingly: native now **holds a retained render tree**,
  but still does **zero string parsing** — parsing stays in JS (§3), only the
  _retained state_ moves native-side. (The "zero string parsing" rule itself is
  unchanged; the revision is the added "native holds state".)
- Cost: a command system, node-id mapping, structural sync, and transaction
  batching to own and test on both platforms.
- Payoff: animation off the Lynx layout pipeline (the real frame-rate win), and
  a native home for future SVG capabilities (selectors, style inheritance).

### 11.12 Cross-thread dispatch — how commands reach the render thread

The render thread and its dispatch mechanism already exist in Phase 1; Phase 2
reuses them unchanged.

**Mechanism (per platform):**

- Android (`ScumbleRenderThread.kt`): a process-wide `HandlerThread` + a `Handler`
  bound to its `Looper`. Any thread holding `ScumbleRenderThread.handler` calls
  `handler.post { … }` to enqueue work on the render thread.
- iOS (`ScumbleMetalContext.mm`): a shared _serial_ GCD queue
  (`dispatch_queue_create("com.scumble.lynx.queue", DISPATCH_QUEUE_SERIAL)`). Any
  thread holding the queue calls `dispatch_async(queue, ^{ … })`.

**Key fact — single-threaded ownership already holds.** Every native call
(`nativeSetRenderTree` / `nativeDrawFrame` on Android; `drawLayer` →
`GetRenderTree` + `Draw` on iOS) is wrapped in a `post` / `dispatch_async`, so
the native renderer object (`rendererHandle` / `GPUContext`) is touched only on
the render thread. The Phase 2 retained tree attaches to that same object; no
new synchronization is needed for the tree itself.

**What changes in Phase 2 is _not_ the mechanism — it's the sender, the payload,
and one piece of wiring:**

|                    | Phase 1 (today)                   | Phase 2                    |
| ------------------ | --------------------------------- | -------------------------- |
| Dispatch mechanism | `Handler.post` / `dispatch_async` | **reused unchanged**       |
| Sender             | UI thread (`onDraw`)              | TASM thread (setter)       |
| Payload            | `pendingTree` full-tree snapshot  | `CommandBatch` incremental |
| Thread hops        | TASM → UI → render (two)          | TASM → render (one)        |

**The one new piece of wiring** is how a TASM-side shadow node reaches the
render-thread dispatch port. Today the `handler` / `renderQueue` reference lives
on the UI side (`ScumbleCanvasView` → session → handler); the shadow node cannot
see it. Two landing options:

- **(a) Native registry.** A `canvasSign → rendererHandle` map, registered at
  attach. The shadow node calls `nativePostCommands(sign, batchBytes)`; the JNI
  method runs on the TASM thread, looks up the renderer's dispatch port, and
  posts the bytes to the render-thread queue.
- **(b) Native handle on the shadow node.** The render thread builds a retained
  tree root per canvas and hands back a `long handle` stored on the shadow node.
  A setter calls `nativeApplyCommands(handle, batchBytes)`; the native method
  posts to the render thread that owns `handle`.

Both mirror today's `nativeSetRenderTree(handle, data, density)` shape — only
the semantics flip from "set whole tree" to "apply commands". The final step is
always `handler.post` / `dispatch_async`.

**Why this stays lock-free:**

- The retained tree is read/written only on the render thread (apply + draw).
- A `CommandBatch` is an immutable byte array: the producer (TASM) never touches
  it after serialization; the consumer (render thread) has exclusive access —
  producer and consumer never overlap.
- The only shared state is the dispatch port itself (Handler's `MessageQueue` /
  the GCD queue), which is already a thread-safe concurrent queue.

This is the most concrete engineering step of Phase 2: the dispatch model does
not change, only the TASM→render-thread wiring and the payload do.

### 11.12 Group clip + paint inheritance (2026-08-14)

**Clip.** A group's clip sequence travels as a JS-built `ClipList` FlatBuffer
(rect / rrect / path, each intersect-or-difference, combined in document order)
on the new `SetClip` command — the same base64-string-prop + memcpy pipeline as
path/transform/gradient/dash. The renderer applies it in `DrawNode` **after**
the group's own transform (clip geometry is in the group's local space), before
the subtree; the canvas accumulates intersect/difference ops natively.

**Paint inheritance** is resolved entirely at render time — nothing new is
transported. `RetainedComputedStyle.explicit_paint` accumulates the
`SetPaint.fields_dirty` bits a node ever received; `DrawNode` threads a merged
style down the tree, overlaying only the fields a node explicitly authored and
falling back to the nearest ancestor's value for the rest. `opacity`
multiplies. Inherits: fill/stroke paint (color + gradient), stroke attrs, dash,
fillRule. Not inherited: transform, geometry, display/visibility (each stays a
per-node property).

### 11.13 Path boolean ops (2026-08-17)

Skia path ops (difference / intersect / union / xor) via **render-time
evaluation** — there is no synchronous channel back to JS (the Lynx public SDK
disables NAPI on Android), so unlike RN-Skia's `Skia.Path.MakeFromOp` (which
computes the result via JSI and hands the path back), the composition travels
as a description and the renderer evaluates it.

- **API**: `Path2D.op(one, two, op)` (@scumble/graphics) builds a _lazy_
  op-composed `Path2D` (a descriptor tree, no geometry math in JS). Operands
  accept `d` strings, plain `Path2D`s, and other op-composed instances —
  compositions nest arbitrarily. `<Path path={…}>` detects it via
  `toOpBytes()` and sends the `op` string prop (base64) instead of `d`.
- **Wire**: JS-built `PathOpList` FlatBuffer (nested, like ClipList) on the
  `SetPathOpData` command. The operand chain is the tree's **left-fold form**:
  `op(op(a,b),c)` flattens to `[a, b:op, c:op]`; a _right_-nested composition
  (`op(a, op(b,c))`, e.g. `(A−B)∪(C−D)`) can't flatten, so that operand carries
  a sub-`PathOpList` in its `nested` field. `PathOpKind` value order ==
  `skity::PathOp::Op` (== Skia SkPathOp; skity has no ReverseDifference).
- **Renderer**: `BuildOpPath` (`ScumbleRenderer.cc`) resolves each operand
  (nested sub-tree recursively, else `BuildPathFromBytes`) and left-folds with
  `skity::PathOp::Execute`; an operand whose `Execute` **fails is skipped**
  (degenerate input degrades gracefully — the counterpart of RN-Skia returning
  null). A non-empty `path_op_data` wins over `path_data` in `BuildPath`; trim
  (`pathStart/End`) and `fillRule` apply to the boolean result as usual.
- Clearing: an empty/absent `SetPathOpData` vector clears the payload — the
  node falls back to its plain `d`.
- **Perf note**: like the plain path channel, the fold re-evaluates every
  frame; a `RetainedNode`-level cache keyed on payload identity is a TODO if
  animated op compositions ever show up in profiles.

### 11.14 Paint filters (2026-08-17)

Image filters (blur / dropShadow), color filters (colorMatrix / colorBlend)
and the mask filter (maskBlur) — declarative children of a shape (or `<Paint>`),
react-native-skia style, routed to the paint the shape draws with (same rule
as shaders).

- **Engine**: skity `Paint::SetColorFilter/SetImageFilter/SetMaskFilter`; the
  HW canvas chains a paint's three slots mask → image → color
  (`hw_filters.cc ConvertPaintToHWFilter`). **Only kinds the HW backend
  implements are modeled** — Dilate/Erode (morphology) are absent from the hw
  switch and are deliberately not wired.
- **Wire**: one JS-built `Filter` FlatBuffer per (paint × kind) slot on the
  `SetPaintFilter` command (`slot: FILL|STROKE` × `kind: COLOR|IMAGE|MASK`;
  empty data clears the slot). A single filter serializes directly; several
  of the same kind ride an `IMAGE_COMPOSE` node whose `children` are **in
  declaration order, `[0]` innermost** (`Compose(outer, inner)` with the later
  declaration outer — the first declared applies first). The mask slot takes
  the first maskBlur only (skity MaskFilter has no compose).
- **Enum orders**: `skityrt::BlurStyle` is **1-based** to match
  `skity::BlurStyle` (kNormal=1..kInner=4) — NOT Skia's 0-based order;
  `ColorBlend`'s mode reuses the skityrt BlendMode bytes.
- **Renderer**: `BuildImageFilter/BuildColorFilter/BuildMaskFilter`
  (`ScumbleRenderer.cc`) turn the bytes into skity filter objects at paint
  construction (`ApplyPaintFilters`, called from MakeFillPaint /
  MakeStrokePaint on every successful path). Filters never flip the
  "does this paint draw" decision — a paint still needs color or gradient.
- **Shadow nodes**: six base64 string props (`fillColorFilter` …
  `strokeMaskFilter`) decode into six `*FilterData` byte slots with a 6-bit
  `dirtyFilter` mask, drained as up to six `SetPaintFilter` commands.

## 12. Image nodes (2026-08-17)

`<Image image x y width height fit sampling>` + `useImage(source)` — RN-Skia-style
bitmap drawing. Three cooperating pieces: a `SetImageSource` command (uri +
fit + sampling — the destination rect rides the regular SetGeometry channel), a
process-wide `ImageStore` on the render thread, and a platform image loader
fired from the TASM setter.

- **API alignment**: `fit` is RN-Skia's seven-value `Fit` union (Flutter
  BoxFit semantics); the enum is `skityrt::BoxFit` with Flutter's value order.
  **Fit resolves at render time** against the bitmap's intrinsic size — the JS
  side never knows the dimensions (no native→JS channel, hence no
  null-while-loading `useImage` phase, no onError). `useImage` returns a
  reference-stable handle immediately (module-level cache, uri-keyed).
- **Load path** (TASM setter side, not the render thread — the load runs in
  parallel with the command batch that carries the uri):
  setter → platform loader (dedup by pending-set) → pixels → **posted onto the
  render thread** → `ImageStore::StorePixels` → redraw all live sessions.
  The shared renderer stays a pure consumer: `DrawShape("image")` asks the
  store and silently skips the node while pending/failed.
- **ImageStore** (`shared/skity/image_store.{h,cc}`): uri-keyed, **render
  thread only** (Android `nativeStoreImage` is posted to the active backend's
  render handler; iOS `ScumbleStoreImageBytes` dispatches onto
  ScumbleMetalContext.renderQueue — no locks anywhere). Entries hold CPU pixels
  (`skity::Pixmap`, premultiplied RGBA) plus a **per-GPUContext weak_ptr
  cache** of `skity::Image` (GL: one process context; Vulkan: one per
  renderer — each gets its own entry automatically). Failures are permanent
  (v1: no retry, no LRU eviction — TODO).
- **GPU context rule**: `Image::MakeImage(pixmap, ctx)` **requires the live
  backend context** — `MakeImage(pixmap, nullptr)` produces an undrawable
  image (verified on Metal in the pre-implementation spike). `ScumbleRenderer::
Draw` therefore takes a trailing `gpu_context` param, supplied by each
  backend at its existing call site (iOS `_gpuContext.get()`, GL
  `shared_->skity_context.get()`, Vulkan `context_.get()`).
- **Pixel transport**: Android `Bitmap.copyPixelsToBuffer` (ARGB_8888 =
  premultiplied RGBA, R,G,B,A byte order) → JNI `GetByteArrayElements` →
  malloc copy → `skity::Data::MakeWithProc(free)`; iOS CGBitmapContext
  (`kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big` = R,G,B,A) →
  NSData → malloc copy → same `Data::MakeWithProc`. One copy at the boundary;
  the store then owns the bytes. **Copy timing discipline**: on iOS the copy
  must happen SYNCHRONOUSLY in the loader callback (before dispatching to the
  render queue) — the callback's NSData dies when it returns, and the
  dispatch block must only carry owned data (uri by value, the malloc'd
  buffer). Capturing the raw `bytes` pointer or a `const std::string&` across
  `dispatch_async` was an EXC_BAD_ACCESS in the wild (2026-08-17).
- **Built-in loaders**: `data:` URIs + `http(s)` on both platforms
  (HttpURLConnection / NSURLSession, zero third-party deps). Hosts inject
  their own: `ScumbleInit.imageLoader` (Android), `[ScumbleImageLoaderRegistry
setImageLoader:]` (iOS). Unknown schemes → host loader only.
- **Paint**: `MakeImagePaint` applies the inherited (or node-authored)
  opacity + blendMode + the fill slot's filters; fill color/gradient are
  ignored (the bitmap supplies color — the modulate color is white at the
  effective opacity).
- **Fit math**: `ApplyBoxFit` in ScumbleRenderer.cc is a port of Flutter's
  `applyBoxFit` + inscribe (cover center-crops the source; none is 1:1 center
  crop; scaleDown = contain-but-never-upscale).
- **Sampling** (2026-08-18): `sampling: { filter, mipmap, cubic: {B, C} }` rides
  `SetImageSource` as two enum bytes + two floats (`skityrt::ImageFilterMode`/
  `ImageMipmapMode`, value order == skity — the renderer casts straight
  through, BlendMode convention). Defaults LINEAR/NONE/0/0 reproduce the
  pre-sampling hardcoded behavior, so old batches render identically. The JS
  side resolves literals via `parseImageFilterMode`/`parseImageMipmapMode`
  (linear/none fallbacks); sampling setters share `dirtyImage` with `fit` (a
  sampling change re-issues the whole SetImageSource command — idempotent).
  **cubic is piped but dormant**: the released skity-native (1.1.0-alpha.3)
  `SamplingOptions` has no cubic member (the local skity repo's
  CubicResampler commit is unreleased), so `DrawShape("image")` assigns
  filter/mipmap only — once a skity build with `CubicResampler` ships, wire
  `sampling.cubic.B/C` to `node->image_cubic_b/c` there (non-zero B/C then
  ignores filter, Skia semantics).
- **ImageShader** (2026-08-18): `<ImageShader image fit rect tx ty>` — a
  bitmap as a shape's fill/stroke texture. A declarative data-only child like
  the gradients (`resolvePaint` routes it to the slot the shape draws with),
  but **flattened to scalar `SetPaint` fields** instead of nested Gradient
  bytes: `fill_image_uri/fit/tx/ty` + `fill_image_rect:[float]` (and the
  stroke mirror), gated by new `FILL_IMAGE_SHADER`/`STROKE_IMAGE_SHADER`
  PaintField bits. Rationale: `@LynxProp` scalars are the natural channel, the
  uri setter fires the platform load directly (see below), and the renderer
  needs no GetRoot/base64 decode. `RetainedPaint.type` gains `3=IMAGE_SHADER`
  (uri empty on a set bit → back to `0=NONE`, i.e. cleared); the inheritance
  resolver treats the new bits like the gradient bits.
  - **Load trigger**: the `fillImageUri`/`strokeImageUri` setters call the
    same `ScumbleImageLoaderRegistry requestImage:` / `ScumbleImageController
.request` as the image node's `image` prop — the uri is the ImageStore
    key, so loads dedupe globally and a shader shares pixels with an `<Image>`
    of the same uri. `ApplyImageShader` returns false (inactive paint → shape
    draws nothing) while pending; the store write's live-session redraw picks
    it up.
  - **Fit math reuse**: with a rect, `ApplyImageShader` runs the same
    `ApplyBoxFit` as the image node and builds the shader's local matrix
    `Scale(dst/src) · PreTranslate(-src.xy) · PostTranslate(dst.xy)` mapping
    the fitted source sub-rect into the fitted destination; without a rect the
    bitmap tiles 1:1 (`Matrix::Scale(1,1)`). Tiling outside the fitted area
    follows `tx`/`ty` (`skityrt::TileMode`, value order == skity, cast
    straight through). Sampling is fixed `{kLinear, kNone}` (RN-Skia's
    ImageShader has no sampling prop; `sampling.cubic` remains off-limits in
    the released skity anyway).
  - `MakeFillPaint`/`MakeStrokePaint` take a trailing `gpu_context` (all call
    sites are inside `DrawShape`, which already holds it) — image-shader
    paints need `ImageStore::FindImage(uri, ctx)`.

## 13. Paragraph / text nodes (2026-08-19)

`<Paragraph width>` + `<TextSpan>` children — width-constrained rich text laid
out **natively in the TASM measure pass** (no JSI: the public Lynx Android SDK
compiles `ENABLE_NAPI_BINDING` off, so there is no synchronous JS→native call
path — the reason layout can't live in JS). Pre-implementation design and
rationale: `TEXT_PARAGRAPH_DESIGN.md`; this section is the as-built record.

- **API alignment**: RN-Skia-shaped declarative API, but no imperative
  `ParagraphBuilder`. `ParagraphProps` = `x/y/width` + `textAlign
(left|center|right)` + `lineHeight` multiplier + `maxLines` (0 = unlimited,
  overflow ellipsized) + paragraph-level default span style + `onLayout`;
  `TextSpanProps` = `text` + per-field style overrides (unset fields fall back
  to the paragraph's). The react layer (`packages/react/src/shapes/
Paragraph.tsx`) serializes spans to a base64 `SpanList` FlatBuffer on the
  `spans` string prop — **text + styles only, never glyph data** (the §7
  replacement seam in the design doc). It also filters undefined
  `opacity/blendMode`: Android marshals an undefined number prop to 0
  (opacity 0 = invisible, blendMode 0 = CLEAR), iOS drops it.
- **Layout timing**: every paragraph prop setter — and the `width` setter, the
  layout constraint — sets a `dirtyParagraph` flag plus `setNeedsLayout` /
  `markDirty()`. The canvas measure walk then calls `layoutIfNeeded` on each
  live paragraph (dirty → re-layout, clean → cached `lastResult`), so layout
  runs on the TASM thread, batched into the existing Lynx layout pass (still
  the only flush point — §11.6/§11.7). The layout width is the node's own
  `width` prop, not the measure param.
- **The two layout backends fork at the core, by design**:
  - **iOS** (`ScumbleParagraphShadowNode.mm`): CoreText does everything —
    shaping, breaking, kinsoku, line height (`kCTParagraphStyleSpecifier
LineHeightMultiple`), alignment. Spans build a `CFAttributedString`
    (weight ≥ 600 → symbolic traits, letterSpacing via `kCTKern`, the span
    color as a custom run attribute — read back per CTRun, no UTF-16 offset
    bookkeeping). `CTFramesetter` over a huge negative-y frame flips CoreText
    y-down into render y-up; the walk extracts `CTRunGetGlyphs`/`Positions`
    per run (CGGlyph ids feed `DrawGlyphs` unchanged — skity's darwin typeface
    IS CoreText) and registers each run's real post-fallback `CTFontRef` into
    the FontRegistry. maxLines truncation = `CTLineCreateTruncatedLine` on the
    last line with a "…" token (hardcoded system font 14pt). First-line top =
    measured `origin.y + ascent`, not assumed 0.
  - **Android** (`paragraph_shaper.cc` via JNI `nativeShapeParagraph`):
    skity `FontManager::RefDefault()` (ships its own fonts.xml parser) picks
    the span typeface (`MatchFamilyStyle`, empty family → default), then
    **per-character fallback** segments the run wherever the base typeface has
    no glyph (`UnicharToGlyph(cp) == 0` → `MatchFamilyStyleCharacter`, per-cp
    memo; a char with no glyph anywhere is dropped). `hb_face` is built from
    the SAME `Typeface::GetData()` bytes (glyph ids strictly match skity's;
    cache keyed by TypefaceID, `shared_ptr<Data>` keeps the bytes alive;
    variable-font axes mirrored via `hb_font_set_var_coords_design`). `hb_shape`
    per segment (UTF-32 buffer, cluster → first code point, advance folds in
    letterSpacing) feeds the **shared line breaker**
    (`shared/skity/line_breaker.{h,cc}` — greedy + space/CJK kinsoku table,
    host-side GoogleTest coverage: `tests/` via
    `pnpm --filter @scumble/native test:native`; the framework itself is a
    habitat dep, `DEPS.py → shared/third_party/googletest`).
    Line assembly: ascent/descent = max over the line's fonts, `lineAdvance =
(asc+desc) × mult` with the extra centered around the baseline, trailing
    spaces excluded from the alignment width, run split on font/color change,
    and maxLines ellipsis = U+2026 resolved on the line's tail font with glyphs
    trimmed until `lineWidth + ellAdvance ≤ width`. (iOS builds its truncation
    token from the tail run's CTFont too — a fixed 14pt token shrank visibly
    in large-print paragraphs.)
  - HarfBuzz ships as the third-party static prefab
    `com.viliussutkus89.ndk.thirdparty:harfbuzz-ndk26-static:8.3.0-beta-4`
    (`libharfbuzz.a` links into `libscumblerender.so` — no new runtime `.so`,
    no pickFirst fallout; see `android/build.gradle.kts` / `CMakeLists.txt`).
- **The glyph-run side channel** (the design's biggest deviation): runs ride
  the **extra bundle next to the CommandBatch**, not a node-id-keyed native
  store. Every flush carries a full snapshot of all live paragraphs (a dirty
  one re-laid-out, clean ones from cache) because a single extra-bundle
  delivery is best-effort — idempotent overwrite makes the last flush that
  lands carry everything. Payload: `{"batch": …, "runs": …}`, batch applied
  first (runs reference nodes the batch just inserted). Platform shapes
  differ: iOS serializes ALL paragraphs into one `ParagraphRunList` FlatBuffer
  (`NSData` under `runs`); Android ships `List<ByteArray>`, one
  single-entry `ParagraphRunList` per paragraph straight out of the shaper.
  UI side: `ScumbleCanvasUI.onReceiveUIOperation` / `updateExtraData` dispatch
  to the render session, which applies batch → runs → redraw in one
  render-queue block, then `RetainedRenderTree::ApplyParagraphRuns`:
  per-entry `Find(node_id)` (missing node → entry skipped), `has_paragraph =
true`, height/line_count/runs overwritten whole. **A missing entry is not a
  clear** — a node with no entry keeps its last layout.
- **FontRegistry** (`shared/skity/font_registry.{h,cc}`): the TASM thread
  registers the real post-fallback `skity::Font` (typeface + size) and hands
  back a process-unique monotonic id; the render thread rebuilds the Font from
  it by value at draw time. Plain mutex (TASM writes, render reads — unlike
  the lock-free render-thread-only ImageStore); entries live for the process;
  ids never reused. `Register` is idempotent per (typeface, size) — repeated
  layouts return the existing id (2026-08-20; iOS used to grow the registry
  by re-registering every CTRun on every layout).
- **Drawing**: `ScumbleRenderer.cc` `tag == "paragraph"` — `Save` →
  `Translate(x, y)` → one `DrawGlyphs` per run. The paint is built per run:
  the node-level fill (explicit or inherited) styles every run when present —
  a GRADIENT rides skity's glyph-atlas shader path (span colors survive only
  as alpha modulation), a COLOR fill replaces the span colors, and color
  filters chain in; without one it is the span color × inherited opacity.
  Image-shader fills and image/mask filters are ignored by skity's text
  pipeline (upstream) and fall back to the span colors. The `skity::Font` is
  rebuilt from the registry (an unknown font id yields an empty typeface →
  run skipped).
- **onLayout**: the measured `{height, lineCount}` reaches JS asynchronously
  as a Lynx `"layout"` `LynxDetailEvent` — the exact channel Lynx's own
  `<text>` uses (gated on the `bindlayout` subscription: `needsEventSet` /
  `setEvents`; iOS dispatches via main queue, Android's emitter hops threads
  itself). `Paragraph.tsx` maps `onLayout` → `bindlayout`, unpacking
  `e.detail`. **Auto-height is NOT synchronous Lynx layout** (a design-doc
  claim the implementation dropped): paragraphs are virtual nodes, the canvas
  measure size is independent of paragraph heights, and the height reaches JS
  only through this event.
- **Custom fonts (2026-08-20..21)**. A span `fontFamily` may carry:
  - an inline `data:...;base64,...` URI — the shared `TypefaceCache`
    (`shared/skity/typeface_cache.{h,cc}`) decodes it synchronously
    (process-cached, sticky failure; the decode uses the shared
    `base64.{h,cc}` since the URI rides INSIDE the SpanList bytes, past the
    platform-layer base64) into a `Typeface::MakeFromData` typeface;
  - any other schemed URI (`http(s)`, `file`, host schemes) — loaded
    ASYNCHRONOUSLY by a platform font pipeline mirroring the image loader:
    host-injectable loaders (`ScumbleInit.fontLoader` on Android,
    `[ScumbleFontLoaderRegistry setFontLoader:]` on iOS; built-ins cover
    http/file), bytes delivered to `TypefaceCache::StoreBytes` (any thread,
    mutex-guarded), with a three-state lookup (`kMiss/kReady/kFailed`).
    A miss falls back to the default font for THAT layout; when bytes land,
    the controller/registry re-triggers layout on the waiting paragraphs via
    `findShadowNodeAndRunTask` (the public Lynx API its own async-font /
    inline-image paths use) — fonts are a layout INPUT, unlike images'
    render-time consumption. Android's shaper reports missed URIs through
    `TakeMissedFontUris` drained per shape; iOS collects them in
    `ScumbleSpanFont`'s out-param.
    iOS bridges a custom typeface back to CoreText for layout
    (`CTFontFromTypeface` is a BORROWED pointer — copy out an owned span-sized
    CTFont, never release the bridge result) while the run walk re-wraps the
    same typeface, so glyph ids match `DrawGlyphs`; Android uses it as the
    shaper's base typeface (fallback segmentation unchanged). A broken payload
    is a sticky fallback to the default font, never a dropped span. One file =
    one style (no weight/italic variants from a single URI).
- **BiDi / RTL (2026-08-21)**. A paragraph-level `direction` prop
  (`"ltr"|"rtl"|"auto"`, byte 0/1/2 through the shadow-node prop channel like
  `textAlign`; `auto` = first strong character, LTR when none) drives UAX #9
  reordering. `textAlign` stays PHYSICAL — left/center/right are screen edges
  regardless of direction (iOS maps align 0 to `kCTTextAlignmentLeft`
  explicitly, since `Natural` would flip with the writing direction).
  - **iOS** needs no library: CoreText implements UAX #9 itself — the prop
    only feeds `kCTParagraphStyleSpecifierBaseWritingDirection` (Natural for
    `auto`); the existing CTRun walk already extracts visual order.
  - **Android** links [SheenBidi](https://github.com/Tehreer/SheenBidi) v3.0.0
    (Apache-2.0, pure C, data tables compiled in) — a habitat git dep
    (`DEPS.py → shared/third_party/sheenbidi`, `tools/hab sync`) statically
    linked into `libscumblerender.so` like HarfBuzz; the source ships in the
    npm package (`files`) so consumers never sync it themselves. In the
    shaper: all spans concatenate into ONE UTF-32 array (newlines become
    spaces first — SB would end the paragraph at the first separator, while
    v1 keeps the payload a single paragraph), `SBAlgorithm → SBParagraph`
    resolves per-code-point levels once up front, and shaping splits each
    span into bidi-level-homogeneous sub-ranges BEFORE the fallback
    segmentation, shaping each with `hb_buffer_set_direction` (odd level →
    RTL). HarfBuzz then emits every segment already in visual
    (left-to-right) order — odd-level runs reversed, even-level runs logical
    (= visual). After breaking, each line's code-point range goes to
    `SBParagraphCreateLine` (UAX #9 L1 trailing-whitespace reset + L2
    reordering applied; runs come back in visual order) and
    `shared/skity/bidi_line.cc` (`BuildLineVisualOrder`, host-tested in
    `tests/`) maps that onto the glyph stream: stream order within each
    visual-order run IS visual order, so no interior re-reversal anywhere.
    Trailing-space exclusion and maxLines ellipsis operate on the line's
    VISUAL edge that holds the logical tail (right for an LTR paragraph,
    left for RTL); the ellipsis lands on that same edge with the cut-adjacent
    glyph's font. fribidi (LGPL, incompatible with static linking) and ICU
    (too heavy) were considered and rejected.
- **Empty text clears (2026-08-20..21)**: a paragraph whose spans decode empty
  emits a 0-height/0-run ENTRY (not a missing entry) — `ApplyParagraphRuns`
  then clears the retained node's previous runs. iOS produces it via
  `emptyResult`; Android's shaper used to bail out early on empty glyph
  content (`if (glyphs.empty()) return`) which produced NO payload and kept
  the last layout alive — both early returns are gone, empty content falls
  through to the serialization.

### 13.1 Open items (v2 backlog)

- ~~Per-run paint pipeline~~ — done (2026-08-20): gradient fills + color
  filters ride the glyph-atlas path; image-shader fills and image/mask
  filters are ignored by skity's text pipeline (upstream limitation, falls
  back to span colors).
- ~~Custom ttf/otf fonts~~ — done (2026-08-20..21): data URIs + schemed
  remote/local sources through the platform font pipeline (above).
- ~~Empty-text handling~~ — done (2026-08-20..21).
- ~~iOS FontRegistry dedup~~ — done (2026-08-20): `Register` is idempotent
  per (typeface, size).
- ~~BiDi/RTL~~ — done (2026-08-21): `direction` prop (ltr/rtl/auto) +
  SheenBidi on Android, CoreText `BaseWritingDirection` on iOS (above).
- Justification — out of scope per the design, revisit with a real case.

## 14. Native animation engine (2026-08-25)

Design doc: `ANIMATION_DESIGN.md` (status now: **implemented**). Summary of
what shipped, as-built:

**Command**: `SetAnimation` (13th `Command` union member) carries JS-built
`AnimationList` bytes (nested FlatBuffer, memcpy'd like SetClip) — one track
per property, many tracks per node. First-batch properties (16):
opacity / translateX / translateY / rotate / scale (sx+sy) / pathStart /
pathEnd / fillColor / strokeColor / x / y / width / height / cx / cy / r.
React API: `animate={{ property, from, to, duration, easing, loop… }}` on
every shape + `Group` + `Canvas` (`resolveAnimation` → base64 `animationData`
prop — named `animationData`, NOT `animation`: Lynx's StandardProps reserves
`animation` for its own CSS shape).

**Overlay model (base fields are never written)**: `ApplySetAnimation`
(shared/skity/node_animation.cc) parses tracks into C++ structs on the node
(`RetainedNode::anim`). Every tick interpolates and writes a fixed-size
`AnimationOverlay`; the renderer reads through base-fallback accessors
(`AnimOpacity` etc. in retained_render_tree.h). Consequences:

- fill=none ends by clearing the slot (value returns to base); fill=forwards
  pins the terminal value (`finished`+`holding`) — CSS-like semantics for free.
- A conflicting command wins: `ApplySetPaint`/`ApplySetGeometry`/`SetTransform`
  call `CancelAnimationsFor` with the dirty-bit → overlay-bit maps
  (`PaintDirtyToAnimBits` / `GeometryDirtyToAnimBits` / `kTransformAnimBits`).
- Transform tracks store resolved components; `ApplyTransform` APPENDS them
  after the base TransformOpList ops (the JS-built bytes are never rebuilt).
- Animated fill/stroke/opacity enter the inheritance merge as if explicitly
  authored (`DrawNode` sets the explicitPaint bits + local style copy) — the
  explicit_paint trap from the design doc.

**Frame driver (stop-on-idle)**: vsync clock on the platform layer, tick body
on each render thread (never off it):

- Android (`render/ScumbleAnimationDriver.kt`): `Choreographer.postFrameCallback`
  on the main thread forwards to EACH session's render handler — GL and Vulkan
  sessions live on different threads, so the driver fans `scheduleTick(now,
onDone)` out and funnels the results; one frame in flight; a frame where no
  session reports live ends the loop. Sessions call
  `ScumbleNative.nativeTickAnimations(handle, nowNs)` (JNI → `AppRenderer::
TickAnimations`) and redraw when live.
- iOS (`Render/ScumbleAnimationDriver.{h,mm}`): CADisplayLink on the main runloop
  forwards to the single `ScumbleMetalContext.renderQueue`; every session ticks
  (`tickAnimations:treeKey:`); a fully idle frame invalidates the link.
  `inFlight` drops frames while a tick block is still queued.
- Arming: `applyCommands` ends with `driver.wakeUp()` — a batch may install
  animations while the driver is stopped.
- Timestamps come from the frame callback itself (`frameTimeNanos` /
  `targetTimestamp`); the clock origin is the first tick after apply.

**Easing** (`shared/skity/easing.{h,cc}`): LINEAR / EASE_* (cubic-bezier
presets) / CUBIC_BEZIER (bisection, ≤24 iters) / STEP_START / STEP_END. The
JS builder (`@scumble/graphics` `buildAnimationList`) resolves from/to
sugar, evens out offsets, pins 0/1 — and resolves the per-keyframe easing
fallback (FlatBuffer defaults can't express "inherit the track default", so
the fallback resolves in JS; native takes keyframe easing as final).

**Header-name trap**: the engine core lives in `node_animation.{h,cc}` (not
`animation.h`) — CocoaPods header maps resolve a bare `#include "animation.h"`
against the Lynx pod's `core/animation/animation.h` first.

**Tests**: host-side `tests/animation_test.cc` (12: delay freeze, iteration
fold, infinite, autoReverse, fill none/forwards, conflict cancel, replace,
clear, RemoveNode safety, multi-track, multi-keyframe) + `easing_test.cc` (7);
graphics `animation.test.ts` (9, read-back via generated TS reader); react
`animation.test.ts` (5). Dynamic verification: example `AnimationDemo`
(registered in demos) — trim loop / breathing + color / transform spin /
finite+forwards, all with zero JS per frame.

## 15. Render build cache (2026-08-25)

The per-frame cost audit found `Draw` rebuilding everything, every frame, on
every canvas — on a MI 6 (Adreno 540) three animated canvases saturated one
core of the shared `ScumbleRenderThread` (70–77%). §15 caches the BUILD
PRODUCTS, keyed for O(1) invalidation, animated-value-safe.

**Model**: one `RenderCache` per retained tree, attached as the tree's
type-erased `render_cache` blob (`retained_render_tree.h` stays skity-free;
lifetime = tree lifetime; per-tree so node ids from different canvases can
never collide). ScumbleRenderer reaches it via a frame-local thread_local set
at `Draw` entry; null means disabled and every consumer falls back to the
original uncached lane (kept verbatim as the rollback). `SetRenderCacheEnabled`
is the global kill switch.

**Invalidation contract** (`CacheStamp` = node's two counters + tree epoch):

| write                                                                     | bumps                          | invalidates                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SetPaint / SetPaintFilter / SetTransform / SetImageSource / ParagraphRuns | `paint_version`                | shader/filter/dash interns, folded transform matrix, oval geom keys                                                                                             |
| SetPathData / SetPathOpData / SetGeometry / SetClip                       | `geom_version`                 | cached paths (+ contours), clip items                                                                                                                           |
| Insert / Remove / Move                                                    | `structure_epoch_` (tree-wide) | everything — a Remove→Insert reusing an id can never validate a stale entry                                                                                     |
| SetAnimation / animation ticks                                            | **nothing**                    | the load-bearing invariant: animated nodes keep hitting every cache; only their per-frame scalars (color/alpha/trim window/transform append) are computed fresh |

Oval shapes additionally key on their scalar geometry (cx,cy,rx,ry) — an
animated radius rewrites the values without bumping any version, so the
values themselves join the hit check.

**What is cached** (and what is not):

- path/polyline/polygon/circle/ellipse base `skity::Path` (fill type baked
  in; untrimmed hits feed the canvas by const&);
- trims: the base splits into per-contour single-contour paths each with a
  RESIDENT PathMeasure (skity's PathMeasure rebuilds its tables on
  construction/SetPath, so per-contour residency is the only way an animated
  window avoids re-subdividing — GetSegment per frame only);
- gradient shaders (intern by descriptor hash; fill/stroke/paragraph share),
  filter objects (3 slots), dash path effects (intervals+phase), folded
  transform matrices (ops → one Matrix; the animation overlay still appends
  on the canvas), group-clip items (nested path bytes decoded once),
  paragraph fonts by id (FontRegistry::Find takes a mutex);
- NOT cached: Paints themselves (cheap to build; animation composes
  per-frame color/alpha on fresh ones) and skity's per-draw arena copies
  (upstream, accepted).

**COW style payloads (P3)**: the style deep fields (gradient/filter bytes,
image-shader uri, dash floats, transform bytes) are `shared_ptr<const T>`
(`BytesPtr`/`StringPtr`/`FloatsPtr`, null == empty) — the per-node
inheritance scratch copy went from ~12 heap allocations to refcount bumps.
Writes (command time, rare) allocate fresh immutable objects.

**Bounds**: path/xform/clip tables are LRU-capped (512 entries each, evict a
quarter on overflow), intern tables 256/128 — overflow degrades to uncached
lanes, never errors. Stale-id entries (node removed) die by stamp/epoch miss
and LRU; no observer on EraseSubtree is needed.

**Stats**: `RenderCacheStats` counts hits/misses per layer (see
render_cache_core.h); the skew-jank A/B on the MI 6 Animation page measured
the shared render thread at ~50% median CPU after §15 vs 70–77% before
(the uncached remainder is skity per-draw arena copies + GetSegment +
rasterization driver cost; the TransformSpin section stopped dropping
frames).

## 16. Exact group opacity — saveLayer lane (2026-08-31)

FEATURE_PARITY.md F.1.2. A group whose OWN opacity contribution is < 1
composites its subtree through a skity `Canvas::SaveLayer` instead of folding
the factor into every child paint alpha: the subtree mixes inside the
offscreen layer first, then the whole layer fades in at the group's factor
(RN-Skia/SVG semantics). The folded approximation was exact for leaves but
lossy wherever a group's children overlap — two 50%-transparent shapes
blended to 75% in the overlap (most visible during fade animations).

**Factor-splitting invariant** (`DrawNode`): this node's factor stays OUT of
`eff` and rides the layer composite; ancestors' factors stay folded in `eff`.
Multiplication associates, and every ancestor with a factor < 1 opened its own
layer, so each factor in the chain is applied exactly once — nesting is exact
by construction. Leaves keep the folded fast path (exact, zero cost). The
lane decision (`isGroup && children non-empty && nodeOpacity < 0.9999 &&
bounds ok`) is made BEFORE the inheritance merge: once folded there is no way
back but division.

**Layer bounds** = the whole device surface `(0,0,canvasW,canvasH)`
inverse-mapped into the group's local space via
`GetTotalMatrix().Invert().MapRect()` (conservative bbox, rotation-safe).
Every pixel a child can visibly reach lies inside it, so it can never cull
visible content — it only hands skity an allocation target that GenLayer then
intersects with the live clip. Empty/non-finite/>4096px extents NEVER reach
skity: `QuickReject` on an empty rect blanks the subtree entirely, and
GenLayer's silent degrade on oversized requests (plain Save+ClipRect) would
drop group opacity altogether — worse than the folded approximation the lane
replaces. Guard failures (and a degenerate transform) fall back to the folded
lane. `canvasW/H` travel as explicit DrawNode parameters (physical pixels,
same values Draw already receives).

**Ordering**: `Save → ApplyTransform → lane decision → eff merge →
ApplyClipIfAny → SaveLayer → children → Restore(layer composite) → Restore`.
Clip is applied BEFORE SaveLayer so GenLayer's bounds∩clip shrinks the FBO;
the clip stays active for the children inside the layer and the composite is
clipped to a region the layer already covers — visually identical, cheaper.
The layer paint is white + alpha, never a bare `SetAlphaF`: skity Paint's
default color is black, and white is correct whether the composite consumes
just the alpha or the full color.

**Fully transparent groups** (`nodeOpacity <= 0`) skip their subtree and the
layer entirely. Leaves keep drawing: an alpha-0 paint with e.g.
blendMode=CLEAR still clears its region (CLEAR is alpha-independent).

**Interaction with §15**: none to speak of — Paints are never cached and the
canvas command sequence (now including SaveLayer) is replayed per frame;
animated opacity already composes as a per-frame scalar on the fresh layer
paint, and animation ticks bump no version.

**Kill switch**: `SetExactGroupOpacityEnabled(bool)` (default ON), mirroring
the render-cache switch precedent; not wired to JS.

**Out of scope**: multi-`<Paint>` multi-pass and independent fill/stroke
paints (F.1.3 — shares this saveLayer machinery but needs schema work),
group-level blendMode / isolated groups, and skipping layers whose children
are all invisible (a `HasDrawableDescendant` pre-scan costs O(depth·n) per
frame for a rare shape; revisit if profiling ever shows it).
