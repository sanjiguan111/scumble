# @scumble/victory-native — provenance & adaptations

This package adapts **Victory Native XL** (© Formidable Labs, MIT) to run on
[scumble](https://github.com/sanjiguan111/scumble) / Lynx. Upstream license:
MIT (see the upstream repository's LICENSE at
https://github.com/FormidableLabs/victory-native-xl).

## Layout

- `upstream/` — the pristine upstream tree, pinned in the scumble repo's
  `DEPS.py` (habitat git dependency, gitignored). **Never hand-edited.**
- `src/` — GENERATED from `upstream/lib/src` by `scripts/vendor.mjs`
  (gitignored): a byte-close copy apart from import specifiers rewritten
  onto the scumble lanes. **Never hand-edited** — fixes belong in `shims/`,
  the codemod rules, or (last resort) a fork branch.
- `dist/` — DECLARATIONS ONLY (`jsx: preserve` + `emitDeclarationOnly`):
  Lynx's JSX must reach the rspeedy/lynx plugin as JSX (it compiles to the
  element-template patch model — pre-compiled `jsx()` calls cannot create
  elements and render an empty patch, the second white-screen lesson), so
  bundlers consume `src/` TSX directly via the exports `default` condition
  while `types` points at the d.ts tree.
- `shims/` — the committed adaptation layer:
  - `react-native.tsx` — View/StyleSheet/types over Lynx views;
    `onLayout` bridged from `layoutchange`.
  - `reanimated.tsx` — the REACTIVE worklet-free Reanimated replacement:
    every `.value` write re-renders subscribers (one React render per
    animation/gesture frame — the per-frame-flush pattern validated by
    scumble's ChartDemo); `withTiming/withSpring/withDecay` drive real JS
    tweens. Spring/decay are eased-tween approximations.
  - `gesture-handler.tsx` — re-exports the RNGH-shaped gesture lane from
    `@scumble/skia-compat` + a passthrough `GestureHandlerRootView`.

## Verification

- The vendored tree is **unmodified upstream code** (import specifiers only)
  — zero behavioral changes.
- Upstream's own test suite runs green against the shims: 48 files /
  252 cases (`pnpm test`).

## Known type deltas

`pnpm typecheck``pnpm typecheck` carries 7 known errors in the vendored tree — generic
inference frictions where upstream leans on @shopify/react-native-skia
2.6.9's exact type shapes (Color generics in the stacked-bar/area paths,
tickValues narrowing in useBuildChartAxis, CandlestickOptions). They are
inert at runtime (the suite above is the functional gate) and are NOT
patched in src/ — fixing them properly means matching RN-Skia's exact
types in @scumble/skia-compat, tracked in the scumble repo.

## Upstream sync

1. Bump the tag in `DEPS.py` → run `tools/hab sync`.
2. `pnpm vendor` (wipes src/, re-copies, re-runs the codemod).
3. `pnpm test` (upstream suite) + `pnpm typecheck` (review the delta list).
