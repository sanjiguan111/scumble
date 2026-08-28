# Path2D & Path Ops

[`Path2D`](#path2d) is a command-style path builder (re-exported from `@scumble/graphics`, the same shape as the Web Canvas `Path2D`) for authoring paths imperatively instead of via an SVG `d` string. A `Path2D` and a `d` string are interchangeable wherever a `path` prop is accepted — [`<Path>`](/api/shapes#path) and [`<ClipPath>`](/api/clipping#clippath).

```tsx
import { Path, Path2D } from "@scumble/react";
import type { PathOpName } from "@scumble/react";
```

Geometry is authored in the same space as a `d` string (logical pixels when the canvas has a `viewPort`). Relative commands, smooth-cubic/quad (`S`/`T`), and `H`/`V` are string-syntax conveniences only — here you write the resolved absolute forms directly.

## `Path2D`

All instance methods are chainable (`moveTo(…).lineTo(…).close()`).

```tsx
import { Canvas, Path, Path2D } from "@scumble/react";

const p = new Path2D().moveTo(10, 10).lineTo(90, 90).close();

<Canvas style={{ width: 200, height: 200 }}>
  <Path path={p} color="#22c55e" />
</Canvas>;
```

### Methods

| Method                                                | Returns               | Description                                                                                                                                     |
| ----------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `moveTo(x, y)`                                        | `this`                | Start a new subpath at `(x, y)`.                                                                                                                |
| `lineTo(x, y)`                                        | `this`                | Line from the current point to `(x, y)`.                                                                                                        |
| `quadTo(cpx, cpy, x, y)`                              | `this`                | Quadratic Bézier with control point `(cpx, cpy)` to `(x, y)`.                                                                                   |
| `cubicTo(cp1x, cp1y, cp2x, cp2y, x, y)`               | `this`                | Cubic Bézier with two control points to `(x, y)`.                                                                                               |
| `arcTo(rx, ry, xAxisRotation, largeArc, sweep, x, y)` | `this`                | SVG-style arc to `(x, y)`. `largeArc`/`sweep` are booleans (the 0/1 flag bytes the renderer expects — same as the `A` command in a `d` string). |
| `close()`                                             | `this`                | Close the current subpath.                                                                                                                      |
| `addPath(other)`                                      | `this`                | Append another `Path2D`'s commands verbatim.                                                                                                    |
| `addRect(x, y, w, h)`                                 | `this`                | Rectangle as a closed subpath.                                                                                                                  |
| `addCircle(cx, cy, r)`                                | `this`                | Circle (center + radius), approximated by four cubic Béziers.                                                                                   |
| `addOval(x, y, w, h)`                                 | `this`                | Ellipse inscribed in `(x, y, w, h)`, approximated by four cubic Béziers.                                                                        |
| `addRoundedRect(x, y, w, h, rx, ry?)`                 | `this`                | Rounded rectangle via four elliptical arcs; `ry` defaults to `rx`, and both are clamped to half the respective side.                            |
| `reset()`                                             | `this`                | Clear all commands.                                                                                                                             |
| `toBytes()`                                           | `ArrayBuffer`         | Serialize the commands to the nested `PathCommandList` FlatBuffer the native prop channel consumes (the component layer base64-encodes it).     |
| `toOpBytes()`                                         | `ArrayBuffer \| null` | Serialize a boolean composition (see `op` below) to a `PathOpList` FlatBuffer; `null` on a plain (command-style) instance.                      |

### `Path2D.op()` — boolean compositions

```ts
static op(one: string | Path2D, two: string | Path2D, op: PathOpName): Path2D;
```

Lazily combine two paths with a boolean operation (Skia path ops). Nothing is evaluated in JS: this only records the composition, and the native renderer evaluates the tree at draw time (skity `PathOp::Execute`, a left fold; an operand whose evaluation fails is skipped). There is no channel back to JS — that is why the composition is lazy and transport-side.

Operands accept an SVG `d` string or a `Path2D` — including other op-composed instances, so compositions nest arbitrarily:

```tsx
const circle = new Path2D().addCircle(50, 50, 40);
const square = new Path2D().addRect(10, 10, 80, 80);

// ((circle ∪ square) − circle): a square with a circular hole
const frame = Path2D.op(Path2D.op(circle, square, "union"), circle, "difference");

<Path path={frame} color="#3b82f6" />;
```

`op()` returns a fresh op-composed `Path2D`; the operands are not modified.

## `PathOpName`

The four boolean operation names (Skia/skity path ops — there is no `reverseDifference`):

```ts
type PathOpName = "difference" | "intersect" | "union" | "xor";
```

| Value          | Result                           |
| -------------- | -------------------------------- |
| `"difference"` | `one` minus `two`.               |
| `"intersect"`  | The area covered by both.        |
| `"union"`      | The area covered by either.      |
| `"xor"`        | The area covered by exactly one. |
