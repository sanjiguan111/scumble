# Feature parity with React Native Skia

> Snapshot: 2026-08-14. Covers **geometry drawing** (`<Rect>`/`<Circle>`/`<Path>` …, paint, transform, clip) — the focus so far. Non-geometry surfaces (Image / Text / Vertices …) are listed for completeness but are out of scope of the current phase.
>
> Cross-reference: native architecture & command-stream details live in [`packages/native/RENDER_ARCHITECTURE.md`](packages/native/RENDER_ARCHITECTURE.md). Status legend: ✅ implemented · ⚠️ partial · ❌ missing.

---

## A. Shape geometry

| Capability                                     | Status | Notes                                                                                                                                  |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Rect / RRect                                   | ✅     | RRect = rect + `rx`/`ry`                                                                                                               |
| Circle                                         | ✅     |                                                                                                                                        |
| Path (`d` string / Path2D)                     | ✅     | Full SVG command set M/L/H/V/C/S/Q/T/A/Z; + `start`/`end` trim                                                                         |
| **Ellipse**                                    | ⚠️     | **Native already supports it** (DrawShape `ellipse` branch + intrinsic `skity-ellipse`); only the react `<Ellipse>` wrapper is missing |
| **Line**                                       | ⚠️     | **Native already supports it** (`line` branch + `skity-line`); only the react wrapper is missing                                       |
| **Polyline / Polygon**                         | ⚠️     | Native supports (points vector + branch); no react wrapper. RN-Skia equivalent is `<Points>`                                           |
| **Points (`pointMode`: points/lines/polygon)** | ❌     | RN-Skia's Points draw modes unsupported                                                                                                |

> The cheapest geometric gap: `Ellipse` / `Line` / `Polyline`/`Polygon` have working native backends — they only lack react-side wrappers.

## B. Paint

| Capability                                                                           | Status                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| fill / stroke / color / strokeWidth / strokeCap / strokeJoin / strokeMiter / opacity | ✅                                                                                                                                            |
| Gradient (linear / radial / sweep / two-point-conical) on fill **and** stroke        | ✅                                                                                                                                            |
| `<Paint>` declarative child (independent fill & stroke paint)                        | ✅                                                                                                                                            |
| **BlendMode**                                                                        | ❌ Declared on `GraphicProps` but dropped in `resolvePaint`; not honored natively                                                             |
| **dash array / dashOffset (dashes)**                                                 | ❌ `ComputedStyle` schema has `stroke_dasharray`/`stroke_dashoffset`, but `SetPaint` does not carry them; `MakeStrokePaint` dashes are a TODO |
| **ColorFilter / ImageFilter / MaskFilter**                                           | ❌ No schema fields; unsupported                                                                                                              |
| per-shape antiAlias toggle                                                           | ❌ Hard-wired `true`                                                                                                                          |

## C. Transform / clip / layering

| Capability                                               | Status                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| translate / scale / rotate / matrix / skew               | ✅                                                                                                    |
| **Group clip (clipRect / clipPath / RRect)**             | ❌ Group has no clip; `DrawNode` only Save/Restores the transform, never calls ClipRect/ClipPath      |
| **Group paint inheritance** (color / opacity to subtree) | ❌ Documented caveat in `Group.tsx` — no inheritance                                                  |
| **Exact group opacity (saveLayer)**                      | ⚠️ Approximate — folded into each paint's color alpha; exact for leaves, lossy for overlapping groups |

## D. Path advanced

| Capability                                | Status                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `start`/`end` trim                        | ✅ Single contour; multi-contour (cumulative-length) trim is a TODO           |
| Path ops (union / intersect / diff / xor) | ❌ RN-Skia uses SkOpBuilder; none here                                        |
| dash PathEffect                           | ❌ (same as B)                                                                |
| corner / discrete / trim-as-effect        | ❌ skity `path_effect.hpp` exposes only `MakeDiscrete` + `MakeDash` factories |

## E. Non-geometry surfaces (listed for completeness)

❌ All missing: **Image**, **Text / Paragraph** (schema explicitly notes "no font/text"), **Vertices / Mesh / Patch**, **Atlas**, **Picture**, and non-gradient **Shader** (ImageShader, FractalNoise, …).

---

## Suggested roadmap (cost/benefit order)

1. **`<Ellipse>` / `<Line>` wrappers** — native ready; react-only, smallest change, immediate visible win.
2. **Dashes** — schema field already exists; gap is `SetPaint` transport + `MakeStrokePaint` calling skity's `MakeDashPathEffect`.
3. **Group clip + paint inheritance** — big composition win, but larger native change (`DrawNode` ClipRect/ClipPath, ComputedStyle inheritance semantics).
4. **BlendMode** — `SetPaint` field + `Paint::SetBlendMode`; medium.
5. Bigger blocks (ColorFilter, Path ops, Image, Text) — scope as separate features.
