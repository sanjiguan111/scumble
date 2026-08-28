# Path2D

`Path2D` is a command-style path builder, modeled on the Web Canvas one. It
accumulates the same commands a `d` string parses into, and every `path` prop
that accepts a string — `<Path>`, `<ClipPath>` — accepts a `Path2D`
interchangeably. Its static `Path2D.op()` adds lazy boolean combinations
(union / intersect / difference / xor), evaluated natively at render time.

## Building paths command-style

Methods are chainable; geometry is authored in the same logical space a `d`
string uses:

```tsx
import { Path, Path2D } from "@scumble/react";

const p = new Path2D()
  .moveTo(20, 20)
  .lineTo(100, 20)
  .quadTo(130, 20, 130, 50) // quadratic: control point + end
  .cubicTo(150, 80, 100, 120, 60, 110) // cubic: two controls + end
  .close();

<Path path={p} color="#3b82f6" />;
```

The command set:

| Method                                                | Meaning                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `moveTo(x, y)` / `lineTo(x, y)`                       | Move / line commands                                                      |
| `quadTo(cpx, cpy, x, y)`                              | Quadratic Bézier                                                          |
| `cubicTo(cp1x, cp1y, cp2x, cp2y, x, y)`               | Cubic Bézier                                                              |
| `arcTo(rx, ry, xAxisRotation, largeArc, sweep, x, y)` | SVG-style elliptical arc (endpoint form); `largeArc`/`sweep` are booleans |
| `close()`                                             | Close the current subpath                                                 |
| `addPath(other)`                                      | Append another Path2D's commands                                          |

You write the resolved absolute form directly — relative coordinates,
smooth-`S`/`T` reflection, and `H`/`V` are conveniences of the string syntax,
normalized away during parsing.

Convenience shape helpers build common subpaths:

```tsx
const shapes = new Path2D().addCircle(60, 100, 45);
const rrect = new Path2D().addRoundedRect(140, 55, 180, 90, 28);

<Path path={shapes} color="#22c55e" />
<Path path={rrect} color="#a855f7" />
```

- `addRect(x, y, w, h)` — a closed rectangle.
- `addCircle(cx, cy, r)` and `addOval(x, y, w, h)` — ellipses approximated by
  four cubic Béziers.
- `addRoundedRect(x, y, w, h, rx, ry = rx)` — via four elliptical arcs; radii
  clamp to half the width/height.
- `reset()` — empty the builder for reuse.

A star built in a loop is the classic use:

```tsx
function makeStar(cx: number, cy: number, outer: number, inner: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

<Path path={makeStar(150, 100, 58, 24)} color="#f59e0b" />;
```

## Boolean ops — `Path2D.op`

`Path2D.op(one, two, op)` combines two paths with a Skia path operation.
It is **lazy**: nothing is evaluated in JS — the composition is recorded, and
the native renderer evaluates it at render time. Operands accept a `d` string,
a `Path2D`, or another op result, so compositions nest:

```tsx
const CIRCLE = new Path2D().addCircle(120, 100, 60);
const SQUARE = new Path2D().addRect(120, 40, 120, 120);

<Path path={Path2D.op(CIRCLE, SQUARE, "union")} color="#3b82f6" />
<Path path={Path2D.op(CIRCLE, SQUARE, "intersect")} color="#22c55e" />
<Path path={Path2D.op(CIRCLE, SQUARE, "difference")} color="#f59e0b" />
<Path path={Path2D.op(CIRCLE, SQUARE, "xor")} color="#ef4444" />
```

The four operations — `"union"`, `"intersect"`, `"difference"` (left minus
right), `"xor"` (union minus intersection) — correspond to Skia's path ops.
`op()` returns a fresh `Path2D`; the operands are not modified.

### Chaining

Left-deep chains flatten into one operand fold — `op(op(star, circle,
"union"), hole, "difference")` is `(star ∪ circle) − hole`:

```tsx
<Path
  path={Path2D.op(
    Path2D.op(makeStar(180, 110, 70, 30), new Path2D().addCircle(180, 110, 42), "union"),
    new Path2D().addCircle(180, 110, 16),
    "difference",
  )}
  color="#8b5cf6"
/>
```

A composition on the **right** side nests as a sub-tree: `square − (circle ∩
square)` keeps its parenthesization:

```tsx
<Path
  path={Path2D.op(
    new Path2D().addRect(60, 40, 240, 120),
    Path2D.op(CIRCLE, SQUARE, "intersect"),
    "difference",
  )}
  color="#0ea5e9"
/>
```

### Ops results are ordinary paths

Fill them, stroke them, trim them — the boolean result feeds the same paint
pipeline as any path:

```tsx
<Path
  path={Path2D.op(CIRCLE, SQUARE, "xor")}
  color="#a855f7"
  style="stroke"
  strokeWidth={6}
  strokeCap="round"
  start={0.15}
  end={0.85}
/>
```

## Further reading

- [PathOpsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/PathOpsDemo.tsx)
  — the four ops, chains, right nesting, trimmed strokes, live
- [PathsDemo.tsx](https://github.com/sanjiguan111/scumble/blob/main/packages/example/src/demos/PathsDemo.tsx)
  — Path2D building next to equivalent `d` strings
- [Shapes](/guide/shapes) — the `d` string command set and path trimming
