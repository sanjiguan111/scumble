# Project overview

scumble brings react-native-skia-style declarative 2D graphics to the Lynx ecosystem, rendered on the skity GPU backend (Android OpenGL ES / Vulkan, iOS Metal).

This file is the knowledge-base entry point: what the project is, how the packages layer, and where the long-form design docs live.

## What scumble is

A React component library — `<Canvas>` plus 11 shape components, `<Paint>` / gradient / filter children, `Path2D`, image and paragraph components — whose props resolve in JS and ship to one shared C++ renderer as FlatBuffer bytes.

The API tracks @shopify/react-native-skia (baseline 2.11.0): same component names, same props, same semantics where the backends agree — the renderer lives in `packages/native/shared/skity/` (see [[overview#Package layout]]). Feature-by-feature status and the gap taxonomy live in `FEATURE_PARITY.md` (see [[rendering#Parity gap taxonomy]]).

Why skity and not Skia: skity is a purpose-built GPU 2D library (~90K lines of C++, roughly a tenth of Skia, no PDF/SVG backends or image codecs). Release builds of scumble's entire native side strip to ~12 MB across the four Android ABIs (~3.1 MB on arm64) against the ~41 MB APK increase react-native-skia documents, while the parity matrix stands at 90–95%.

## Package layout

Dependency direction is a single DAG; nothing skips a layer:

- **@scumble/react** (`packages/react`) — the user-facing React layer: ergonomic components with friendly props, plus the animation React API. Entry: [[packages/react/src/Canvas.tsx#Canvas]].
- **@scumble/graphics** (`packages/graphics`) — framework-agnostic pure-JS core: color / enum / path / transform parsers, `Path2D`, and the FlatBuffer builders for gradients, filters, clips, spans, animation tracks. Entry: [[packages/graphics/src/color.ts#parseColor]], [[packages/graphics/src/path.ts#parsePath]].
- **@scumble/native** (`packages/native`) — the native Lynx library: intrinsic `<scumble-*>` tags, the `skityrt` FlatBuffer schema (`packages/native/schema/*.fbs`), and the cross-platform C++ core in `packages/native/shared/skity/`.
- **example** (`packages/example`) — rspeedy demo app with 20 demo pages under `packages/example/src/demos/`, used for on-device verification.
- **website** (`packages/website`) — VitePress docs site (GitHub Pages), built from `packages/website/docs/`.

All three published packages are consumed through a bundler (rspeedy/rspack); `@scumble/graphics` ships a tsc-built `dist/` (raw source fails to link under `isolatedModules` because the vendored flatbuffers runtime re-exports types), while react/native ship TS sources.

## Core principle: the native side never parses strings

Every user-facing string — CSS colors, paint enums, SVG path `d`, CSS `transform` lists — is parsed in front-end JS by `@scumble/graphics` into ints, floats, or FlatBuffer bytes.

The native setters receive numbers or base64 strings and only memcpy. This principle governs the responsibility split in [[architecture#Binary transport]] and explains why there is no string-parsing code anywhere under `packages/native/shared/`.

## Continuous integration

Three workflows run on GitHub Actions: `ci.yml` (host-side test matrix) and `native-build.yml` (compile smoke tests) on develop pushes and PRs — README badges pin those — plus `release.yml` on `v*` tags for tokenless npm publishing.

`ci.yml` (ubuntu-latest): the single `tests` job runs `tools/hab sync` (habitat deps are gitignored; cached by `hashFiles('DEPS.py')` with the OS in the key — flatc is a per-OS binary), `pnpm install --frozen-lockfile`, `generate-fbs`, then `pnpm test` (graphics + react: `tsc --noEmit` + vitest) and `pnpm --filter @scumble/native test:native` (desktop gtest via cmake/ctest).

`native-build.yml` covers what the gtests cannot see (they link neither skity nor platform SDKs): `android-build` assembles the example app on ubuntu (all ABIs, externalNativeBuild, prefab + JNI in scope), `ios-build` runs pod install + xcodebuild on macos. Both jobs still need `hab sync` + `generate-fbs` — Android statically links SheenBidi and compiles the generated `.cc` stubs; the iOS pod's header search paths point into `third_party/flatbuffers` and the generated headers. Pods are cached by `Podfile.lock` hash.

A dependency-graph pitfall found on first run: turbo builds its task graph from `dependencies`/`devDependencies` only — it ignores `peerDependencies`, so `react#test` never waited for `graphics#build` and tsc raced against dist generation. `@scumble/graphics` is therefore dual-declared in react's peer+dev dependencies, and `turbo.json`'s `test` task uses `dependsOn: ["^build", "build"]`. Any future cross-package dependency must follow the same dual-declaration rule or the race comes back.

`release.yml` publishes via npm trusted publishing (OIDC): each package has a trusted-publisher entry on npmjs.com binding sanjiguan111/scumble to this workflow filename, so the job needs only `id-token: write` and an npm CLI ≥ 11.5.1 (node 22 bundles 10.x, hence a global upgrade step) — no `NPM_TOKEN` secret exists to leak. The trusted-publisher entries are stage-only ("Allow npm publish" unchecked): the workflow runs `npm stage publish`, and tarballs go live only after a maintainer approves them with a 2FA challenge on npmjs.com — a compromised workflow cannot push a public version past that gate. pnpm is kept off the publish path: pnpm 9 `pack` supports no `-r`/`--filter`, `workspace:^` ranges are rewritten at pack time (verified), and pnpm v11's native publish regressed OIDC — so the workflow packs per package (`pnpm build` first, since pack skips `prepublishOnly`; native's generate-fbs outputs are git-tracked, making that skip safe) and lets npm ship the tarballs. Like `ci.yml`, the workflow needs `hab sync` + `generate-fbs` before building — graphics' `src/generated` FlatBuffer stubs are gitignored flatc products, and tsc fails without them on a clean checkout. A second job creates the GitHub Release body from git-cliff (`cliff.toml`, conventional-commit grouping) under `contents: write`; milestone notes can be rewritten locally via `gh release edit`. npm versions are immutable — a re-run against a live version fails by design.

## Design doc index

The long-form documents stay in place; this knowledge base links into them rather than duplicating them:

- `packages/native/RENDER_ARCHITECTURE.md` — the authoritative render-pipeline history and per-feature designs (§11 retained tree, §14 animation, §15 build cache, §16/§17 group opacity and layers). Summarized in [[architecture]].
- `packages/native/ANIMATION_DESIGN.md` and `packages/native/ANIMATION_CONTROL_DESIGN.md` — animation engine and playback control designs. Summarized in [[animation]].
- `TEXT_PARAGRAPH_DESIGN.md` — text/paragraph layout design. Summarized in [[rendering#Text and paragraphs]].
- `FEATURE_PARITY.md` — RN-Skia parity matrix and roadmap. Summarized in [[rendering#Parity gap taxonomy]].
