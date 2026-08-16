# Feature parity with React Native Skia

> Snapshot: 2026-08-16. Covers **geometry drawing** (`<Rect>`/`<Circle>`/`<Path>` …, paint, transform, clip) — the focus so far. Non-geometry surfaces (Image / Text / Vertices …) are listed for completeness but are out of scope of the current phase.
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
| **Polyline / Polygon**                         | ✅     | `<Polyline>`/`<Polygon>` render via the native points channel (`SetGeometry.points` float vector, incremental updates; commits `7eccd03`/`a80b2a1`). Polyline defaults `stroke`, Polygon defaults `fill`                                                                                                                                                                                    |
| **Points (`pointMode`: points/lines/polygon)** | ✅     | `<Points mode>` compiled to path commands at the react layer — `points`: zero-length segments + `strokeCap="round"` (diameter = `strokeWidth`, how Skia's `drawPoints` works too); `lines`: point pairs; `polygon`: polyline. Defaults `style="stroke"`                                                                      |

> `parsePoints` (SVG `points` string → `{x,y}` pairs) now lives in `@lynx-skity/graphics` alongside the other string parsers.

## B. Paint

| Capability                                                                           | Status                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fill / stroke / color / strokeWidth / strokeCap / strokeJoin / strokeMiter / opacity | ✅                                                                                                                                                                                                                                                            |
| Gradient (linear / radial / sweep / two-point-conical) on fill **and** stroke        | ✅                                                                                                                                                                                                                                                            |
| `<Paint>` declarative child (independent fill & stroke paint)                        | ✅                                                                                                                                                                                                                                                            |
| **BlendMode**                                                                        | ✅ All 28 Skia modes on every shape, `<Paint>`, and `Group` (inheritable); one mode shared by the fill and stroke paints (`SetPaint.blend_mode`)                                                                                                              |
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
| `start`/`end` trim                        | ✅ Every contour trimmed independently against its own length (Skia `SkTrimPathEffect` semantics): one `PathMeasure` walked with `NextContour` + `GetSegment` appends exact curve segments |
| Path ops (union / intersect / diff / xor) | ❌ Not wired, but skity has `PathOp` (`path_op.hpp`, all four ops) — needs a transport/API design (render-time composition vs NAPI round-trip) |
| dash PathEffect                           | ✅ Same mechanism as B (skity `MakeDashPathEffect`); declarative `DashPathEffect` component not offered — `dash`/`dashOffset` props instead |
| corner / discrete / trim-as-effect        | ❌ skity `path_effect.hpp` exposes only `MakeDiscrete` + `MakeDash` factories                                                               |

## E. Non-geometry surfaces (listed for completeness)

❌ All missing: **Image**, **Text / Paragraph** (schema explicitly notes "no font/text"), **Vertices / Mesh / Patch**, **Atlas**, **Picture**, and non-gradient **Shader** (ImageShader, FractalNoise, …).

---

## Suggested roadmap (cost/benefit order)

1. ~~**`<Ellipse>` / `<Line>` wrappers**~~ — done, plus `Polyline`/`Polygon` (compiled to paths).
2. ~~**Dashes**~~ — done (`SetPaint.stroke_dash` transport + `MakeDashPathEffect`).
3. ~~**Group clip + paint inheritance**~~ — done (`SetClip` command + render-time inheritance via `explicit_paint`).
4. ~~**BlendMode**~~ — done (`SetPaint.blend_mode`, applied to both paints, inheritable).
5. ~~**`<Points pointMode>`**~~ — done (react-layer compilation to path commands; zero-length segments + round cap for `points` mode).
6. **Path ops** — skity `PathOp` is available; needs an API/transport decision (declarative render-time composition keeps the one-way command stream; an NAPI round-trip would break it).
7. Bigger blocks (ColorFilter, Image, Text) — scope as separate features.
