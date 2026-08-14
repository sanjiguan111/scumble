# @lynx-skity/native Render Architecture & Roadmap

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
│  @lynx-skity/react        @lynx-skity/vue           │  framework wrapper layer (separate npm pkgs)
│  <Circle fill="#fff"/>    <Circle fill="#fff"/>      │  ergonomics / defaults / ref / animation
└───────────────┬───────────────────┬─────────────────┘
                │   shared parsing    │
        ┌───────▼───────────────────▼─────────┐
        │  @lynx-skity/graphics (pure JS, no    │  parser/normalizer shared layer
        │  framework) color→int · path d→...   │  React/Vue don't reinvent it
        │  transform→... · gradient            │
        └───────┬───────────────────────────────┘
                │  produces "primitive values" (int/float/ArrayBuffer)
        ┌───────▼───────────────────────────────────────┐
        │  @lynx-skity/native (base contract layer,     │  intrinsic tags + elements.ts types
        │  framework-agnostic)                           │  native accepts int/float/base64-string,
        │  <skity-circle cx cy r fill=0xAARRGGBB>        │  zero string parsing
        │  ─── FlatBuffer skityrt::RenderTree ───────────│
        └─────────────────────────────────────────────────┘
```

Dependency direction is a single directed acyclic chain: `@lynx-skity/{react,vue}` → `@lynx-skity/graphics` → `@lynx-skity/native` (tag contract).

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

`@lynx-skity/graphics` parses strings/objects and produces FlatBuffer bytes. Lynx component props marshal `NSNumber` / `NSString` / `NSArray` but **not** binary (`NSData` / `byte[]`), so the bytes are **base64-encoded** (`bytesToBase64`, hand-written — Lynx JSC has no `btoa`) and carried as a string prop. The native setter base64-decodes (`-[NSData initWithBase64EncodedString:]` / `android.util.Base64.decode`) then does a **mechanical copy** into the FlatBuffer vector — the decode is an encoding conversion, not structure parsing, so "native never parses" still holds.

**Nested-FlatBuffer approach**: path / transform / (later gradient / shader) are built directly as standalone FlatBuffers (`PathCommandList` / `TransformOpList`) by `@lynx-skity/graphics` using `flatbuffers.js`, and passed in as `[ubyte]` blobs (base64 over the wire).

- **schema**: wrapper tables + `RenderNode.path_data` / `ComputedStyle.transform_data`, annotated `(nested_flatbuffer: "...")`
- **front end**: parsers build finished FlatBuffer bytes using `flatc --ts` stubs + the `flatbuffers` runtime, then `bytesToBase64`
- **native setter**: base64-decode → `CreateVector(ubyte, bytes)` — a memcpy, **zero parsing, zero table construction**
- **renderer**: `node->path_data_nested_root()` / `transform_data_nested_root()` — standard FlatBuffer lazy parsing

Why nested flatbuffer over a custom wire format: the native side is fully free of deserialization (just memcpy), the renderer uses standard FlatBuffer accessors, and every variable-length field shares one mechanism. (An earlier custom wire format `[u8 type][u8 argc][u16 pad][f32]` is retired; `binary.ts` keeps only the enum constants.)

> The flatbuffers TS runtime is **vendored from the habitat source** (`generate-fbs` copies `shared/third_party/flatbuffers/ts/` → `packages/graphics/src/generated/flatbuffers/`, adds `@ts-nocheck`, excludes flexbuffers, clears the dir before each run), not an npm dependency — flatc (`25.12.19`) and the stub/runtime must match versions exactly, the same reason Android consumes the flatbuffers Java runtime from source rather than maven. Stub imports are rewritten from `'flatbuffers'` to the vendored `'../flatbuffers/flatbuffers.js'`.

> **`@lynx-skity/graphics` is consumed as a tsc-built `dist/`** (`pnpm --filter @lynx-skity/graphics build`), not as raw source. The vendored `flatbuffers.ts` re-exports type-only symbols (`Offset`/`Table`/interfaces) from `types.js`; tsc whole-program erases those re-exports at emit time, but a bundler (rspack/swc, `isolatedModules`) cannot, so raw source fails to link under rspeedy (`module has no exports`). The build keeps `isolatedModules` off deliberately; Lynx packages stay source-only and import the compiled `dist`.

> **Lynx JSC lacks `TextEncoder` / `TextDecoder`** (web APIs). The vendored flatbuffers runtime instantiates them in its `Builder` / `ByteBuffer` constructors, so `parsePath` / `parseTransform` would otherwise throw at builder construction and blank the page. `@lynx-skity/graphics`'s entry installs a hand-written polyfill; the nested FlatBuffers carry only numbers, so `encode` is effectively unused.

## 6. Viewport coordinate system (SVG viewBox semantics)

A front-end `width={100}` is a **logical pixel**; `skity-canvas` declares the logical coordinate system via the `viewPort` prop (`{x,y,width,height}`, forwarded to native as four scalar props) with a fixed `preserveAspectRatio` (xMidYMid meet), and the renderer maps it to physical pixels.

- Child coordinates stay as **logical-pixel values** in the FlatBuffer; the transform is applied once at the root canvas → front-end parsers and binary data are uniformly in logical pixels, clean and consistent.
- **The viewport transform is applied by the renderer `SkityRenderer::Draw`** (scale/translate on the skity Canvas before drawing), not on the front end, because physical size / density are only known after layout — the front end doesn't have them at render time. This neatly sidesteps the layout-timing problem that "front end builds the whole tree bytes" would run into.
- The renderer already does a `density` scale; extending it to `viewport` + `preserveAspectRatio` is straightforward.

## 7. Native-side changes

- **Delete** the semantic parsing in `SkityPropParser` (Android `.kt` / iOS `.m`).
- Variable-length field setters take a **base64 string** (Lynx props don't marshal `byte[]` / `NSData`); the setter decodes and mechanically copies the bytes into the FlatBuffer vector. Enum setters take a **number** (parsers already mapped the friendly string → skityrt byte in JS).
- `SkityCanvasShadowNode.measure()` is **kept** (compute layout + collect scalars + ferry bytes + build the `ViewBox` / `PreserveAspectRatio`); the renderer applies the viewport transform.
- The packed-int color prop is unchanged.

## 8. Work breakdown

Dependency-ordered; each step is independently reviewable:

1. **schema extension** (viewport + nested_flatbuffer fields) → regenerate stubs. Backward compatible; consumers untouched for now. **✓ done**
2. **`@lynx-skity/graphics`** (pure-JS shared layer): color→int, enum→byte, path d→nested FlatBuffer, transform→nested FlatBuffer (full SVG command set incl. H/V/S/T/A + relative). Vitest round-trip tests. **✓ done**
3. **native slim-down**: delete `SkityPropParser`; variable-length setters take a base64 string → decode → memcpy (Lynx props don't marshal binary); enum setters take a number; renderer applies the viewport transform and consumes `path_data` / `transform_data` via `nested_root` (+ MATRIX/SKEW). **✓ done**
4. **`@lynx-skity/react`**: thin wrapper components `<Circle>` that normalize then render `<skity-circle>`; reuse parsers. **✓ MVP done** — full SVG path + matrix/skew now flow through after Task 3; Paint/gradient/clip/`forwardRef`/animation still TBD.
5. **example** switches to the React component layer + a viewport demo. **✓ done**
6. **`@lynx-skity/vue`** (later): same wrapping; the base tags are framework-agnostic, so this works naturally.

**Plus (TBD):** Shader schema extension (needs the shader type confirmed first).

## 9. Cleanup backlog

- `shared/elements/` (`x-lynx-skity` C++ `LynxNativeView`): autolink default scaffold, unrelated to the graphics pipeline; clean up later.
- `polyline` / `polygon`: the renderer `SkityRenderer.cc` already dispatches by tag_name, but no tag is registered natively, no TS type exists, and the `points` prop is currently unused — wire these up together when they land.

## 10. Key file index

- Schema: `packages/native/schema/render_tree{,_common,_style}.fbs`
- Codegen: `packages/native/scripts/generate-fbs.mjs` (`pnpm --filter @lynx-skity/native generate-fbs`)
- Front-end tag types: `packages/native/src/elements.ts` (`declare module` augments `IntrinsicElements`)
- Parsers: `packages/graphics/` (`@lynx-skity/graphics`)
- Front-end usage: `packages/example/src/App.tsx`
- Native registration: Android `android/.../graphics/SkityBehavior.kt` + `SkityInit.kt`; iOS `ios/Classes/Node/SkityCanvasShadowNode.mm` + `SkityNodeBase.m`
- prop setters: Android `android/.../graphics/node/SkityNodeBase.kt`; iOS `ios/Classes/Node/SkityNodeBase.m`
- parser: **deleted** in Task 3 (was `node/SkityPropParser.kt` / `Node/SkityPropParser.m` — string parsing now lives in `@lynx-skity/graphics`)
- serialization: Android `android/.../graphics/node/SkityCanvasShadowNode.kt` (measure/buildRenderNode/buildStyle/buildPaint); iOS `ios/Classes/Node/SkityCanvasShadowNode.mm`
- renderer: `packages/native/shared/skity/SkityRenderer.cc` (cross-platform C++, `Draw(tree,canvas,density,W,H)` + viewport)
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
  SetPaint,       // fill/stroke color, strokeWidth, cap/join/miter/fillRule/opacity
  SetPathData,    // node_id + nested PathCommandList bytes (memcpy)
  SetTransform,   // node_id + nested TransformOpList bytes (memcpy)
  SetViewport,    // canvas viewBox
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

| Today (in `measure` / Phase 1)                                                     | Phase 2 owner                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Compute canvas size                                                                | **Deleted** — Lynx layout via `style`                                                                             |
| Build the `RenderTree` FlatBuffer (leaf→root)                                      | **Deleted** — command stream                                                                                      |
| `buildRenderNode` / `buildStyle` / `buildPaint`                                    | **Deleted**                                                                                                       |
| `SkityRenderBundle` + `getExtraBundle` + `updateExtraData` + `consumeRenderBundle` | **Deleted**                                                                                                       |
| `setCustomMeasureFunc` (Android) / `customMeasureDelegate` (iOS)                   | **Kept registered** (Step 3b: only the snapshot _body_ is deleted; the registration is the flush trigger — §11.7) |
| `density` capture in measure                                                       | Render thread reads it locally (it already is the single source of truth in `Draw`)                               |
| Canvas physical size in bundle                                                     | `onSurfaceTextureSizeChanged` / `onSizeChanged` → `session.updateSize` (already exists)                           |

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
   `measure`, `buildRenderNode`, `extraBundle`, `SkityRenderBundle`. Lynx layout
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
     `SkityRenderBundle` + `SyncFromSnapshot` + `nativeSetRenderTree`; `measure`'s
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

- Android (`SkityRenderThread.kt`): a process-wide `HandlerThread` + a `Handler`
  bound to its `Looper`. Any thread holding `SkityRenderThread.handler` calls
  `handler.post { … }` to enqueue work on the render thread.
- iOS (`SkityMetalContext.mm`): a shared _serial_ GCD queue
  (`dispatch_queue_create("com.skity.lynx.queue", DISPATCH_QUEUE_SERIAL)`). Any
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
on the UI side (`SkityCanvasView` → session → handler); the shadow node cannot
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
