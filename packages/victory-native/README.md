# @scumble/victory-native

[Victory Native XL](https://github.com/FormidableLabs/victory-native-xl)
(Formidable Labs, MIT) running on
[scumble](https://github.com/sanjiguan111/scumble) / Lynx — **zero upstream
code changes**: the tree is habitat-synced (`DEPS.py`), import-codemodded
onto `@scumble/skia-compat` at vendor time, and runs against Lynx shims for
Reanimated / gesture-handler / react-native.

> **Import by the upstream name.** App code can keep `import … from
"victory-native"` verbatim (RN code runs unmodified) — redirect the
> specifier to this adapter:
>
> - **Recommended — bundler alias** (the example app's setup):
>   `lynx.config.ts` → `resolve.alias["victory-native"] = "@scumble/victory-native"`,
>   plus an ambient `declare module "victory-native" { export * from "@scumble/victory-native"; }`
>   `.d.ts` for tsc (do NOT use tsconfig paths to the d.ts — rspack treats
>   it as a module target and gets "module has no exports").
> - **Alternative — package overrides** (no bundler config): redirect at
>   install time, e.g. pnpm `"overrides": { "victory-native": "npm:@scumble/victory-native@…" }`.
>   Fine for external apps; do NOT use inside this monorepo — the override
>   would also redirect this wrapper's own build-time devDependency on the
>   real package (its vendoring source) onto itself.

```tsx
import { CartesianChart, Line } from "victory-native"; // upstream name, aliased

<CartesianChart data={data} xKey="month" yKeys={["revenue"]}>
  {({ points }) => <Line points={points.revenue} color="#22c55e" strokeWidth={3} />}
</CartesianChart>;
```

- **Layout / sync / known type deltas**: see [NOTICE.md](./NOTICE.md).
- **How the adapter stack works** (skia-compat surface, font measurement,
  the reactive Reanimated model, the gesture lane): see
  [`@scumble/skia-compat`'s README](../skia-compat/README.md).
- **Verification**: upstream's own suite runs green against the shims —
  48 files / 252 cases (+ module-graph/polyfill smokes) — and the example
  app renders a real `CartesianChart` on device. Consumption note: pass
  `explicitSize` (measured width + fixed height) — RN flex-inheritance
  chains are fragile through the shim layers on Lynx.
