# @scumble/graphics

Framework-agnostic pure-JS value layer for
[scumble](https://github.com/sanjiguan111/scumble): it resolves friendly values
— CSS color strings, paint enums, CSS `transform` lists, SVG path `d` strings —
into the numeric / `ArrayBuffer` values the native skity tags consume. **The
native side never parses strings.**

Most consumers reach this package through `@scumble/react` (it re-exports the
useful parts). Direct use is mainly about `Path2D`:

```ts
import { Path2D } from "@scumble/graphics";

// command-style builder, like the Web Canvas one — interchangeable with a `d` string
const gear = new Path2D().moveTo(24, 8).lineTo(32, 8).lineTo(36, 16).closePath();

// lazy boolean ops, evaluated natively at render time
const cutout = Path2D.op(gear, hole, "difference");
```

> Built with `tsc` and consumed through a bundler (rspeedy/rspack) — the
> compiled `dist` uses extensionless relative imports, so plain Node ESM
> imports are not a supported consumption mode.

## Documentation

Guides, API reference (`Path2D`, color parsing, animation specs), and
architecture notes live at <https://sanjiguan111.github.io/scumble>.

## License

[Apache License 2.0](https://github.com/sanjiguan111/scumble/blob/develop/LICENSE)
