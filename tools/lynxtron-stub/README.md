# lynxtron stub

This empty package replaces `@lynx-js/lynxtron` in the workspace dependency
graph via `pnpm.overrides` in the root `package.json`.

## Why

`@scumble/native` depends on `@lynx-js/lynx-library-headers` (Lynx embedder
C/C++ headers + CMake helpers, needed at Android build time). Upstream
(`github.com/lynx-family/lynxtron`) lists `@lynx-js/lynxtron` — a desktop
debugger — as a **dependency** of every published version since 0.0.2, so it
lands in our tree transitively:

- its npm tarball is ~180 MB,
- its postinstall downloads another ~22 MB desktop binary, which 404s on
  Linux (no linux release asset) and intermittently hangs on macOS.

scumble never uses it: the two CMake helpers that touch lynxtron
(`lynx_resolve_lynxtron_import_library`, `lynx_link_lynxtron_runtime`) are
no-ops unless `WIN32`, and scumble only builds for iOS/Android.

## Scope

The override only affects **this repo** (pnpm overrides are install-side and
do not travel through the published packages). Consumers should add

```json
{ "pnpm": { "neverBuiltDependencies": ["@lynx-js/lynxtron"] } }
```

to their own root manifest — see the installation guide's troubleshooting
section.

Remove this stub once upstream moves lynxtron out of the headers package's
`dependencies`.
