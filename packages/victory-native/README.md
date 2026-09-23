# @scumble/victory-native

[Victory Native XL](https://github.com/FormidableLabs/victory-native-xl)
(Formidable Labs, MIT) running on
[scumble](https://github.com/sanjiguan111/scumble) / Lynx — **zero upstream
code changes**: the tree is habitat-synced (`DEPS.py`), import-codemodded
onto `@scumble/skia-compat` at vendor time, and runs against Lynx shims for
Reanimated / gesture-handler / react-native.

```tsx
import { CartesianChart, Line } from "@scumble/victory-native";

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
