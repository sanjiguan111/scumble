# Installation

## Install the packages

Consumers install all three packages explicitly — `@scumble/react` declares
the other two as **peerDependencies**, so they are not pulled transitively
(the host owns the versions, no surprise nested copy):

```bash
pnpm add @scumble/react @scumble/graphics @scumble/native
```

That's it on the JS side. Importing `@scumble/react` registers the native
`<scumble-*>` intrinsic tags as a side effect — no provider, no manual
registration.

::: warning Bundler required
All packages are consumed through a bundler (rspeedy/rspack) —
`@scumble/react` and `@scumble/native` ship TS sources, and
`@scumble/graphics`' compiled `dist` uses extensionless relative imports
resolvable by bundlers only. Plain Node ESM imports are not a supported
consumption mode.
:::

## Troubleshooting: a ~200 MB `lynxtron` download you didn't ask for

Installing `@scumble/native` pulls in `@lynx-js/lynx-library-headers`
(Lynx embedder headers + CMake helpers — genuinely needed at Android build
time). Every published version of that package since 0.0.2 also lists
[`@lynx-js/lynxtron`](https://www.npmjs.com/package/@lynx-js/lynxtron) —
the **desktop** Lynx debugger — as a hard dependency, so it lands in your
tree transitively:

- its npm tarball alone is ~180 MB,
- its postinstall downloads another ~22 MB desktop binary — which **404s on
  Linux** (no linux release asset) and intermittently hangs on macOS.

scumble never uses it: the only CMake code paths that touch lynxtron are
no-ops unless the build target is `WIN32`, and scumble only builds for
iOS/Android. This is an upstream packaging issue; until it is fixed, work
around it on the host side.

### The fix: one line, any package manager

`@lynx-js/lynxtron@0.0.1` is the one published version without the
downloader — a 194-byte empty shell (no `scripts`, no `dependencies`). Pin
the whole tree to it via an override in your root `package.json`:

```json
{
  "overrides": { "@lynx-js/lynxtron": "0.0.1" }
}
```

```json
{
  "pnpm": {
    "overrides": { "@lynx-js/lynxtron": "0.0.1" }
  }
}
```

Works on npm ≥ 8.3 and pnpm ≥ 8; both verified against
`@lynx-js/lynx-library-headers@0.0.16`. (The scumble repo itself takes the
fully offline variant of the same idea —
[`tools/lynxtron-stub`](https://github.com/sanjiguan111/scumble/blob/develop/tools/lynxtron-stub)
linked via `pnpm.overrides` — which you don't need: the version pin is one
line and zero extra files.)

### Alternatives

- pnpm hosts who can't touch `overrides` can at least skip the postinstall
  with `neverBuiltDependencies: ["@lynx-js/lynxtron"]` — the download and
  the Linux 404 go away, but the ~180 MB tarball still lands in the store.
- npm hosts on npm < 8.3 can install with `--ignore-scripts`, which skips
  **all** lifecycle scripts — only viable if nothing else in your install
  relies on them.

## Host app integration

`@scumble/native` is not a plain JavaScript package — it is a **Lynx native
library**: an npm package that ships native code (the intrinsic
`<scumble-*>` elements and the NAPI renderer addon) and declares itself
through a `lynx.lib.json` manifest. Lynx's **autolink** mechanism discovers
it in `node_modules` and registers its elements and modules automatically
when the host initializes `LynxEnv` — no manual per-platform wiring for
elements or modules.

That means the host project must satisfy the
[Lynx autolink requirements](https://lynxjs.org/guide/autolink.html) first:

- The host app already integrates the Lynx SDK (see
  [Integrate with Existing Apps](https://lynxjs.org/guide/start/integrate-with-existing-apps.html)).
- The project root holds a `package.json` with the standard Lynx app layout —
  autolink resolves libraries from there:

  ```
  lynx-app/
  ├── package.json
  ├── android/
  │   ├── settings.gradle(.kts)
  │   └── app/build.gradle(.kts)
  ├── ios/
  │   └── Podfile
  └── src/
  ```

- Autolink scans every package in `node_modules` for a `lynx.lib.json`
  manifest (`@scumble/native` ships one) and generates the registry that
  `LynxEnv` loads at startup.
- The autolink toolchain comes from the **same Lynx release channel** as your
  SDK (Ruby gem `cocoapods-lynx-library` on iOS, Gradle plugins
  `org.lynxsdk.lynx.*` on Android).

With that in place, the only scumble-specific parts are the two snippets
below, taken from the [example app](https://github.com/sanjiguan111/scumble/tree/develop/packages/example).

### iOS

Install the `cocoapods-lynx-library` gem, then declare it in the Podfile.
The example's `Podfile` (see
[`packages/example/ios/Podfile`](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/ios/Podfile)):

```ruby
platform :ios, '13.0'

plugin 'cocoapods-lynx-library'

target 'ScumbleDemo' do
  use_frameworks! :linkage => :static

  # Lynx runtime pods the host owns:
  pod 'Lynx', '4.0.1', :subspecs => ['Framework']
  pod 'PrimJS', '4.0.0', :subspecs => ['quickjs', 'napi']
  pod 'LynxService', '4.0.1', :subspecs => ['Log', 'Http']

  # Autolinks every Lynx library in the node_modules graph,
  # including the `scumble` pod from @scumble/native.
  use_lynx_library!
end
```

- The `scumble` pod ships from `@scumble/native` via its podspec — you never
  reference it directly.
- `use_frameworks! :linkage => :static` is required by the Lynx pod family.
- The iOS build needs Ruby ≥ 3.0 for CocoaPods.

### Android

Three Gradle-side pieces. First, the library autolink plugin in
`settings.gradle.kts`:

```kotlin
plugins {
    id("org.lynxsdk.lynx.library-settings") version "4.0.1"
}
```

Second, the companion plugin on the app module — it generates the autolink
registry entry that `LynxEnv` loads:

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.lynxsdk.lynx.library-build")
}
```

Third, a packaging pick in `app/build.gradle.kts`. scumble links
skity-native via prefab, and AGP copies the prefab runtime `.so` into the
library AAR's `jni/` — duplicating the copy the skity-native AAR already
ships transitively. The files are identical, so the host just picks one at
merge time:

```kotlin
android {
    packaging {
        resources {
            pickFirsts += setOf("**/libskity.so")
        }
    }
}
```

(`libc++_shared.so` and the primjs `.so` files may need the same treatment if
the host doesn't configure them already — those duplicates come from the Lynx
toolchain, not from skity. The example app shows a
[full build file](https://github.com/sanjiguan111/scumble/blob/develop/packages/example/android/app/build.gradle.kts)
including the primjs AAR extraction and CMake arguments the Lynx toolchain
expects.)

## Building from source

To work on the repo itself (not needed to consume the npm packages), generate
the FlatBuffer stubs once after cloning (and after any `.fbs` change):

```bash
pnpm install
tools/hab sync                                # fetches flatc
pnpm --filter @scumble/native generate-fbs    # generates C++/Java/TS stubs
```

Then run the example app on a booted simulator / connected device:

```bash
pnpm example:ios       # iOS simulator
pnpm example:android   # Android
```
