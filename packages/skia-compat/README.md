# @scumble/skia-compat

The [`@shopify/react-native-skia`](https://github.com/Shopify/react-native-skia)
API surface over [scumble](https://github.com/sanjiguan111/scumble) — the
adapter layer for porting RN-Skia libraries to Lynx. **The porting target is
[Victory Native XL](https://github.com/FormidableLabs/victory-native-xl)**;
the surface was extracted from a full audit of its `lib/src` (v42, 165
files), so every import, component prop, and imperative call site it uses has
a shim here.

```tsx
import { Canvas, Group, Line, Path, Skia, Text, vec } from "@scumble/skia-compat";

const builder = Skia.PathBuilder.Make();
builder.addRect(Skia.XYWHRect(0, 0, 10, 10));
const rect = builder.build();

<Canvas style={{ flex: 1 }}>
  <Group transform={[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 8, 8, 0, 1]}>
    <Path path={rect} color="#f59e0b" />
    <Line p1={vec(0, 0)} p2={vec(40, 40)} color="#3b82f6" strokeWidth={2} />
    <Text x={0} y={14} text="hello" font={useFont(FONT_URI, 12)} color="#111" />
  </Group>
</Canvas>;
```

## What maps to what

- **Components**: `Canvas`, `Group`, `Path`, `Line`, `Text`,
  `DashPathEffect` — thin wrappers over `@scumble/react` (pure mappers are
  exported for testing). Notables: RN-Skia `<Text>` anchors `y` at the
  baseline while scumble positions a paragraph box by its top — the shim
  lifts by the font's ascent so baseline semantics survive; `clip` props and
  `DashPathEffect` children become scumble clip children / `dash` props;
  4×4 column-major `transform` passes through untouched (scumble's Group
  natively accepts the same layout).
- **`Skia` namespace**: `PathBuilder.Make` / `Path.Make|MakeFromSVGString|
Rect|Interpolate`, `XYWHRect`, `Color`, `Paint`, `ParagraphBuilder`,
  `TypefaceFontProvider` (registration is a no-op — scumble fonts are
  addressed by source URI).
- **Math**: `vec`, `rect`, `rrect`, `translate`, `scale`, `rotate`,
  `multiply4` — column-major, matching RN-Skia.
- **`useFont` / `matchFont`**: a font handle whose measurement
  (`getGlyphIDs`/`getGlyphWidths`/`measureText`/`getVerticalMetrics`) is
  synchronous JS-side font-metrics parsing of the SAME binary native renders
  (`@scumble/graphics`'s `createFontMetrics`). Family-name fonts render but
  throw on measurement — pass the font binary (`data:` URI or bytes).

## Deliberately absent

- **Reanimated and gesture-handler lanes** — no Lynx counterpart; the port
  swaps them (JS state + Lynx touch events). See the Victory port plan below.
- **`Skia.FontManager` / system-font matching** — measuring platform system
  fonts needs the skity table-prefetch lane (not built); bundle fonts.
- JSI-implying APIs (vertices, pictures, snapshots, pixel readback) — no
  native→JS channel exists (the Lynx public Android SDK compiles NAPI off).
- `CanvasRef` is a stored-but-inert stub (Victory's core never reads it).

## Victory port plan (tracked here)

- **W2 — font measurement** ✅ shipped (`@scumble/graphics` font metrics).
- **W1 — this package** ✅ (skia-compat).
- **Vertical slice** ✅ — `packages/example/src/demos/ChartDemo.tsx`: a line
  chart with d3 running unmodified, every visual element through the shim,
  y-label gutters measured in JS (tap to swap datasets).
- **W3 — Reanimated swap**: `useSharedValue` → plain state; data transitions
  via scumble's declarative animations (render-thread interpolation).
- **W4 — gesture layer**: Pan recognizer (activeOffset/failOffset/
  activateAfterLongPress) + Pinch over Lynx touch events.
- **W5 — fork & publish** as `@scumble/victory-native` (MIT upstream).
- **W1.5 — system-font prefetch** (optional): skity `Typeface::GetTableData`
  over the invoke+event lane, feeding the same `createFontMetrics`.

## License

[Apache License 2.0](https://github.com/sanjiguan111/scumble/blob/develop/LICENSE)
