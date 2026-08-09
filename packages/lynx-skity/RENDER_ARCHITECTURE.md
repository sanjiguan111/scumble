# lynx-skity Render Architecture & Roadmap

> Status: basic rendering + data flow are working (Android OpenGL ES/Vulkan + iOS Metal, green on 2026-08-07).
> This document captures the **functional-development phase**: target architecture, design principles, and work breakdown for ongoing work.

---

## 1. Target architecture

**Declarative tags + localized binary serialization + a viewport logical coordinate system.**

One-line guiding principle:

> **The native side never does "string → structure" parsing; all string parsing happens in front-end JS.**

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
        ┌───────▼───────────────────────────────┐
        │  lynx-skity  (base contract layer,    │  intrinsic tags + elements.ts types
        │  framework-agnostic)                   │  native accepts int/float/base64-string,
        │  <skity-circle cx cy r fill=0xAARRGGBB>│  zero string parsing
        │  ─── FlatBuffer skityrt::RenderTree ───│
        └─────────────────────────────────────────┘
```

Dependency direction is a single directed acyclic chain: `@lynx-skity/{react,vue}` → `@lynx-skity/graphics` → `lynx-skity` (tag contract).

## 3. Responsibility split

| Data nature                       | Examples                                                                  | Owner                                   | Transport                                     |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Parse-free scalars                | color `0xAARRGGBB`, geometry `cx/cy/r/x/y/w/h`, `strokeWidth`, enum bytes | base tag prop (unchanged)               | `@LynxProp` number                            |
| Parsed / nested structures        | path `d`, CSS `transform`, `Gradient`, `Shader`, `dasharray`, `points`    | **front-end parse → serialize**         | nested FlatBuffer bytes, base64 over a string prop (Lynx props don't marshal binary) |
| canvas-level coordinate transform | `viewport` (logical → physical px)                                        | canvas node declares + renderer applies | `RenderTree` top-level field                  |

Note: even enum strings like `strokeCap="round"` are front-loaded — the framework component accepts a friendly string, the parser maps it to a byte, the base prop receives a number. The native side is left with no enum parsing either; the principle stays consistent.

The "three states" of color `0xAARRGGBB` are a deliberate trade-off and stay as-is: the front-end API takes a packed int (compact, easy to pass) → the schema is an `RGBAColor` struct table (readable, 4-byte aligned, leaves room for gradients) → skity's `Paint` goes back to a packed int.

## 4. Schema status & extensions

The schema lives in `packages/lynx-skity/schema/render_tree*.fbs` (namespace `skityrt`); `scripts/generate-fbs.mjs` runs flatc to emit C++ (`shared/skity/generated/`), Java stubs (`android/.../fbs-gen/`), and TypeScript stubs (`packages/graphics/src/generated/`). iOS reuses the C++ stubs directly.

**Existing structures:**

- `RGBAColor { r,g,b,a:uint32 }`, `GradientStop`, `Gradient` (linear+radial+stops, complete), `ResolvedPaint { type: NONE/COLOR/GRADIENT; color; gradient }`
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

- Schema: `packages/lynx-skity/schema/render_tree{,_common,_style}.fbs`
- Codegen: `packages/lynx-skity/scripts/generate-fbs.mjs` (`pnpm --filter lynx-skity generate-fbs`)
- Front-end tag types: `packages/lynx-skity/src/elements.ts` (`declare module` augments `IntrinsicElements`)
- Parsers: `packages/graphics/` (`@lynx-skity/graphics`)
- Front-end usage: `packages/example/src/App.tsx`
- Native registration: Android `android/.../graphics/SkityBehavior.kt` + `SkityInit.kt`; iOS `ios/Classes/Node/SkityCanvasShadowNode.mm` + `SkityNodeBase.m`
- prop setters: Android `android/.../graphics/node/SkityNodeBase.kt`; iOS `ios/Classes/Node/SkityNodeBase.m`
- parser: **deleted** in Task 3 (was `node/SkityPropParser.kt` / `Node/SkityPropParser.m` — string parsing now lives in `@lynx-skity/graphics`)
- serialization: Android `android/.../graphics/node/SkityCanvasShadowNode.kt` (measure/buildRenderNode/buildStyle/buildPaint); iOS `ios/Classes/Node/SkityCanvasShadowNode.mm`
- renderer: `packages/lynx-skity/shared/skity/SkityRenderer.cc` (cross-platform C++, `Draw(tree,canvas,density,W,H)` + viewport)
- backends: Android `android/src/main/cpp/skity/{gles,vulkan}_render_backend.cpp`; iOS `ios/Classes/Render/`
