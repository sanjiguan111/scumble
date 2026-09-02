---
lat:
  require-code-mention: true
---

# Test specifications

Host-side test suites (graphics / react vitest + native C++ gtest) anchor the semantics documented in [[rendering]], [[animation]], and [[architecture]]. This file registers the key cases; every leaf section must be referenced by exactly one `@lat:` comment placed next to the covering test.

## Graphics parsing layer

Vitest suites under `packages/graphics/src/__tests__/`, verifying parsers by round-trip through the generated TS FlatBuffer readers — proving bytes decode back to the authored values without a device.

### Color parsing

`color.test.ts` — any CSS Color 4 form resolves to a packed 0xAARRGGBB int: number passthrough, hex, rgb()/rgba(), hsl()/hsla(), named colors, {r,g,b,a?} objects, [r,g,b,a?] tuples; unknown formats throw.

### Path parsing and Path2D

`path.test.ts` — `parsePath` covers the full SVG command set; `Path2D` covers imperative building and lazy boolean ops.

Details: relative coords, H/V lowering, S/T control-point reflection, implicit repeats, scientific notation, arc flag forms; arcTo flags, addRect, addCircle as four béziers, addPath chaining; `parsePoints` separators; `Path2D.op` null/empty, chained left-fold flattening, right-nesting.

### Gradient building

`gradient.test.ts` — all four gradient kinds serialize to decodable bytes.

Details: absolute coords and {x,y} points, explicit positions, repeat mapping, <2-stop throw; sweep default full-circle and explicit degrees; two-point-conical focal/illegal-circle throw.

### Filter building

`filter.test.ts` — buildImageFilter (single blur, dropShadow color, declaration-order composition, none/bad kind → null); buildColorFilter (20-float matrix, colorBlend, illegal matrix dropped); buildMaskFilter (1-based BlurStyle, first-only).

### Animation serialization

`animation.test.ts` — `buildAnimationList` round-trips every track feature.

Details: from/to sugar → two keyframes, Infinity iterations, preset easing → cubic-bezier, per-keyframe easing fallback, missing offsets evenly spaced, color packing, multi-track order; zero tracks / <2 keyframes throw.

### Paragraph decoration serialization

`paragraph.test.ts` — `buildSpanList` round-trips the four decoration fields onto the `Span` table.

Details: schema defaults (decoration 0 / decorationColor 0 = follow text color / thickness 0 = metric default / SOLID); the bitfield resolves from names, arrays, and numeric passthrough ("underline"→1, underline+line-through→5, 6→6; case-insensitive, strikethrough/line_through aliases, unknown names contribute 0); `decorationStyle` maps names to the RN-Skia value order (wavy→4, double→1) with numbers masked through; decorationColor parses via `parseColor`, unset stays 0.

## React component layer

Vitest suites under `packages/react/src/__tests__/` (LEPUS globals stubbed) verifying the resolution layer that turns component trees into intrinsic props.

### Paint resolution

`paint.test.ts` — resolvePaint default fill, stroke routing, numeric colors, blendMode byte; resolveLayerEffect three states (undefined/true/false), multi-slot filters, non-Paint children ignored.

### Animation resolution and playback control

`animation.test.ts` — resolveAnimation (undefined → no command, array filtering, empty result clears, shape passthrough, handle passthrough); createAnimation handle uniqueness and finish-event routing by handle.

### Transform resolution

`transform.test.ts` — translate/scale/rotate (degrees, no pivot), 4x4 column-major → 2D affine, op-array left-to-right composition, no transform → undefined; shape transform passthrough.

## Native C++ core

Host-side gtest suites under `packages/native/tests/` — run on the desktop, no device or GPU surface needed.

### Animation engine

`animation_test.cc` — the overlay model end to end: delay freeze, iteration fold, infinite, autoReverse, fill none/forwards, conflict cancel, replace, clear, RemoveNode safety, multi-track, multi-keyframe.

### Retained tree versioning

`retained_tree_version_test.cc` — command-batch versioning and retained-tree state transitions: inserts/removes/moves keep the tree consistent and stale ids never validate.

### Render build cache

`render_cache_core_test.cc` — the §15 invalidation contract: paint/geom version bumps, structure epoch, animation ticks bump nothing, LRU caps degrade to uncached lanes.

### BiDi line assembly

`bidi_line_test.cc` — SheenBidi runs assemble into visual order per line; RTL output needs no second reversal; mixed-direction runs split correctly.
