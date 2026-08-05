# lynx-skity

A native Lynx library, organized as a pnpm + turbo monorepo.

## Structure

- `packages/lynx-skity` — the native Lynx library, discovered via `lynx.lib.json` and built with `@lynx-js/autolink-codegen`.
- `packages/example` — rspeedy demo app that consumes the library through `workspace:*`.

## Getting started

```bash
pnpm install
pnpm codegen   # regenerate native facades from types/
pnpm dev       # run the example app (turbo dev)
```
