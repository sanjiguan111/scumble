# @scumble/native

The native [Lynx](https://lynxjs.org/) library behind
[scumble](https://github.com/sanjiguan111/scumble): the intrinsic
`<scumble-*>` elements, the `skityrt` FlatBuffer schema, the NAPI renderer
addon, and one cross-platform C++ renderer (`ScumbleRenderer`) driving the
skity GPU backend — Android (OpenGL ES / Vulkan) and iOS (Metal).

## Installation

scumble ships as three peer-linked packages:

```bash
pnpm add @scumble/react @scumble/graphics @scumble/native
```

This package is discovered through `lynx.lib.json` by
[Lynx autolink](https://lynxjs.org/guide/autolink.html) — the host app needs
the standard Lynx autolink setup (Ruby gem `cocoapods-lynx-library` on iOS,
`org.lynxsdk.lynx.*` Gradle plugins on Android). See the
[installation guide](https://sanjiguan111.github.io/scumble/guide/installation)
for the full requirements and the scumble-specific Gradle/CocoaPods bits.

Documentation for the whole library lives at
<https://sanjiguan111.github.io/scumble>.

## Development

```bash
npm install
npm run codegen
```

Generated JS specs are written to `generated/`.

NAPI native module typings live in `types/napi-native-module.d.ts` and use a minimal shared C++ N-API callback stub.
Selected native files are written to `android/`, `ios/`, `harmony/`, and `shared/`. The package
is discovered by Lynx through `lynx.lib.json`.

## NAPI Native Module

Codegen creates `shared/nativeModule/ScumbleModule.cc` once and
preserves it on later runs. After changing the typings, rerun codegen to refresh
generated facade and registration files, then manually keep the user-owned C++
callbacks and exports in sync. If the module class is renamed, also rename or
remove the old C++ file and update the addon name in `lynx.lib.json`; codegen
does not delete stale user-owned files or rewrite the manifest.

On Android and iOS, import the package root in BTS to install the
generated `NativeModules.ScumbleModule` shim. The generated
TypeScript shim is only for the selected mobile runtimes; Lynxtron does not
import it.

Android source builds resolve `org.lynxsdk.lynx:primjs` using the Gradle
property `lynx.primjs.version`, defaulting to `4.+`. Set the property from
the host root build when the App needs to pin the same PrimJS runtime version
used by other Lynx dependencies.

## License

[Apache License 2.0](https://github.com/sanjiguan111/scumble/blob/develop/LICENSE)
