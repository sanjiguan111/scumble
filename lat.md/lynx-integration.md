# Lynx integration constraints

The non-negotiable behaviors of the Lynx runtime (4.0.x) that shape scumble's design — marshalling rules, layout flushing, the NAPI wall, and platform integration traps.

Each constraint here is the "why" behind a design decision elsewhere in the knowledge base.

## Prop marshalling rules

`@LynxProp` setters marshal only `NSNumber` / `NSString` / `NSArray` — never binary (`NSData` / `byte[]`). Consequences:

- Variable-length data (path/transform/gradient/filter/clip/animation bytes) is base64-encoded into a string prop — [[architecture#Binary transport]].
- Enum strings are resolved in JS to skityrt bytes; enum setters receive a number (the native side has no enum parsing either).
- Reserved prop names collide: Lynx's StandardProps reserves `animation`, so the animation bytes prop is named `animationData`; the React prop stays `animate`/`createAnimation` for users.

## Setters must trigger layout

`@LynxProp` setters do NOT re-run layout by default. Because the flush point is the layout pass (see [[architecture#Flush via the layout pass]]), every setter must explicitly call `markDirty` (Android) / `setNeedsLayout` (iOS) or the command sits in the pending buffer forever. Traps:

- The root node's `onAfterUpdateTransaction` does NOT fire for child prop updates — it is per-node, not parent-fired; that is exactly why the per-setter markDirty → layout → measure path is used.
- Kotlin: `@LynxProp` in `.kt` files requires **kapt**, not `annotationProcessor` (the latter only scans Java); otherwise PropsSetter is not generated and the runtime fails at createUI.

## Null-means-keep prop contract

When a prop is removed, Lynx calls the setter with null; the nullable contract treats null as "leave state alone" rather than "clear".

This mirrors `setAnimationData` and is why clearing the `<Group layer>` effect requires an explicit `layer={false}` (full clear: force + empty slots) instead of just removing the prop. React components must emit explicit clear values for any stateful byte-slot prop.

## JSC runtime limits

Lynx's JSC lacks several web APIs, which `@scumble/graphics` works around at its entry:

- No `btoa` — base64 is hand-written ([[packages/graphics/src/base64.ts#bytesToBase64]]).
- No `TextEncoder` / `TextDecoder` — the vendored flatbuffers runtime instantiates them in Builder/ByteBuffer constructors, so the entry installs a polyfill before any parsing happens.
- The JSC `TextEncoder` polyfill emits CESU-8 for astral characters (emoji): a JS→native string crossing with isolated surrogates drops glyphs. Any string that must reach native as UTF-8 is hand-converted UTF-16→UTF-8, or passed as a `Uint8Array` via `createString` directly. Paragraph span text follows this rule.

Also: JS `requestAnimationFrame` is pipeline-decoupled from native redraws — it does not drive canvas repaints; `setInterval` is the current JS-driven ceiling, and the real animation lane is the native engine ([[animation#Frame drivers]]).

## The NAPI wall and the invoke lane

The publicly distributed Android Lynx SDK compiles with `ENABLE_NAPI_BINDING` off — no `napi_env`, no synchronous JSI on Android.

This is the root cause of the F.3 architecture limits (no imperative API, no shared values; see [[rendering#Parity gap taxonomy]]) and the reason the whole library is declarative + serialized command stream.

The one JS→native channel that bypasses NAPI is the UIMethod lane: `element.invoke(method, params[, callback])` (reachable from jsbridge `lynx.invokeUIMethod`, SelectorQuery `nodeRef.invoke`, and lepus `InvokeUIMethod`). Animation playback control rides it — [[animation#Playback control]]. Native→JS events (the animation finish event) ride the Lynx event channel instead.

## Android build integration

Gradle-side facts the host app and the library build must satisfy.

- Autolink: the Lynx Gradle plugin (library-settings/library-build 4.0.1) auto-integrates the library; the library needs `namespace`, androidx.annotation, and CMake ≥ 3.22.1.
- NAPI addon `.so` must be `System.loadLibrary`-loaded explicitly (primjs registers via dlopen constructor; autolink does not do it).
- prefab: skity-native is linked via prefab; AGP copies the prefab runtime `.so` into the library AAR's `jni/`, duplicating the copy skity-native already ships — the host resolves with `packaging { jniLibs { pickFirsts += "**/libskity.so" } }`.
- Generated FlatBuffer Java stubs land in `android/.../fbs-gen/` via `pnpm --filter @scumble/native generate-fbs`.

## iOS integration traps

CocoaPods and CoreText sharp edges specific to the iOS side.

- CocoaPods header maps resolve a bare `#include "animation.h"` against the Lynx pod's `core/animation/animation.h` first — the animation engine core is therefore named `node_animation.{h,cc}` ([[packages/native/shared/skity/node_animation.h]]). Any new header name should be checked for collisions with the Lynx pod before it sticks.
- Paragraph shaping holds a `CTFontFromTypeface` borrowed reference — the typeface must outlive the CTFont; the font/typeface caches in `packages/native/shared/skity/` are structured around this.
- The iOS build needs Ruby ≥ 3.0 for CocoaPods (`mise` provides 3.4.9; the 3.0.x branch is EOL on recent Xcode toolchains).
- Lynx codegen products (`addon_use.h` / `NapiWrapper.cc`) are user-owned once they exist: codegen will not update them, so changing types requires manually syncing the callback implementations.
