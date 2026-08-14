# Feature parity with React Native Skia

> Snapshot: 2026-08-14. Covers **geometry drawing** (`<Rect>`/`<Circle>`/`<Path>` …, paint, transform, clip) — the focus so far. Non-geometry surfaces (Image / Text / Vertices …) are listed for completeness but are out of scope of the current phase.
>
> Cross-reference: native architecture & command-stream details live in [`packages/native/RENDER_ARCHITECTURE.md`](packages/native/RENDER_ARCHITECTURE.md). Status legend: ✅ implemented · ⚠️ partial · ❌ missing.

---

## A. Shape geometry

| Capability                                     | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rect / RRect                                   | ✅     | RRect = rect + `rx`/`ry`                                                                                                                                                                                                                                                                                                                                                                 |
| Circle                                         | ✅     |                                                                                                                                                                                                                                                                                                                                                                                          |
| Path (`d` string / Path2D)                     | ✅     | Full SVG command set M/L/H/V/C/S/Q/T/A/Z; + `start`/`end` trim                                                                                                                                                                                                                                                                                                                           |
| **Ellipse**                                    | ✅     | `<Ellipse cx cy rx ry>` → `skity-ellipse` (native DrawShape `ellipse` branch)                                                                                                                                                                                                                                                                                                            |
| **Line**                                       | ✅     | `<Line x1 y1 x2 y2>` → `skity-line`; stroke-only (defaults `style="stroke"`, explicit fill ignored natively)                                                                                                                                                                                                                                                                             |
| **Polyline / Polygon**                         | ✅     | React compiles `points` (SVG string or `vec()` array) to MoveTo+LineTo(+Close) path commands — rides the `skity-path` channel. The native polyline/polygon DrawShape branch + `RetainedNode.points` stay unused (the points vector is not wired through shadow nodes / command stream; the compiled path is semantically identical). Polyline defaults `stroke`, Polygon defaults `fill` |
| **Points (`pointMode`: points/lines/polygon)** | ❌     | RN-Skia's Points draw modes unsupported                                                                                                                                                                                                                                                                                                                                                  |

> `parsePoints` (SVG `points` string → `{x,y}` pairs) now lives in `@lynx-skity/graphics` alongside the other string parsers.

## B. Paint

| Capability                                                                           | Status                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fill / stroke / color / strokeWidth / strokeCap / strokeJoin / strokeMiter / opacity | ✅                                                                                                                                                                                                                                                            |
| Gradient (linear / radial / sweep / two-point-conical) on fill **and** stroke        | ✅                                                                                                                                                                                                                                                            |
| `<Paint>` declarative child (independent fill & stroke paint)                        | ✅                                                                                                                                                                                                                                                            |
| **BlendMode**                                                                        | ❌ Declared on `GraphicProps` but dropped in `resolvePaint`; not honored natively                                                                                                                                                                             |
| **dash array / dashOffset (dashes)**                                                 | ✅ `dash`/`dashOffset` on every shape (and `<Paint style="stroke">`); transported as base64 LE float32 on `SetPaint.stroke_dash` + phase, applied via skity `MakeDashPathEffect`. Odd arrays repeat once (SVG semantics); invalid patterns fall back to solid |
| **ColorFilter / ImageFilter / MaskFilter**                                           | ❌ No schema fields; unsupported                                                                                                                                                                                                                              |
| per-shape antiAlias toggle                                                           | ❌ Hard-wired `true`                                                                                                                                                                                                                                          |

## C. Transform / clip / layering

| Capability                                               | Status                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| translate / scale / rotate / matrix / skew               | ✅                                                                                                                                                                                                                                                                                                      |
| **Group clip (clipRect / clipPath / RRect)**             | ✅ RN-Skia-style declarative children `<ClipRect>`/`<ClipRRect>`/`<ClipPath>` (`op: intersect\|difference`, combined in order); transported as a base64 ClipList on a new `SetClip` command, applied after the group's transform. ClipRRect radii: uniform / per-axis only (no per-corner)              |
| **Group paint inheritance** (color / opacity to subtree) | ✅ Render-time resolution via `RetainedComputedStyle.explicit_paint` (the SetPaint dirty bits): unset fields fall back to the nearest ancestor; opacity multiplies. Inherits fill/stroke paint (color + gradient), stroke attrs, dash, fillRule. NOT inherited: transform, geometry, display/visibility |
| **Exact group opacity (saveLayer)**                      | ⚠️ Approximate — folded into each paint's color alpha; exact for leaves, lossy for overlapping groups                                                                                                                                                                                                   |

## D. Path advanced

| Capability                                | Status                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`/`end` trim                        | ✅ Single contour; multi-contour (cumulative-length) trim is a TODO                                                                         |
| Path ops (union / intersect / diff / xor) | ❌ RN-Skia uses SkOpBuilder; none here                                                                                                      |
| dash PathEffect                           | ✅ Same mechanism as B (skity `MakeDashPathEffect`); declarative `DashPathEffect` component not offered — `dash`/`dashOffset` props instead |
| corner / discrete / trim-as-effect        | ❌ skity `path_effect.hpp` exposes only `MakeDiscrete` + `MakeDash` factories                                                               |

## E. Non-geometry surfaces (listed for completeness)

❌ All missing: **Image**, **Text / Paragraph** (schema explicitly notes "no font/text"), **Vertices / Mesh / Patch**, **Atlas**, **Picture**, and non-gradient **Shader** (ImageShader, FractalNoise, …).

---

## Suggested roadmap (cost/benefit order)

1. ~~**`<Ellipse>` / `<Line>` wrappers**~~ — done, plus `Polyline`/`Polygon` (compiled to paths).
2. ~~**Dashes**~~ — done (`SetPaint.stroke_dash` transport + `MakeDashPathEffect`).
3. ~~**Group clip + paint inheritance**~~ — done (`SetClip` command + render-time inheritance via `explicit_paint`).
4. **BlendMode** — `SetPaint` field + `Paint::SetBlendMode`; medium.
5. **`<Points pointMode>`** — needs a new points transport (or reuse the path channel with per-point marker drawing, which skity does not expose today).
6. Bigger blocks (ColorFilter, Path ops, Image, Text) — scope as separate features.
