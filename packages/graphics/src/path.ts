// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { PathCommand } from "./generated/skityrt/path-command.js";
import { PathCommandList } from "./generated/skityrt/path-command-list.js";
import { PathCommandType } from "./generated/skityrt/path-command-type.js";
import { PathOperand } from "./generated/skityrt/path-operand.js";
import { PathOpKind } from "./generated/skityrt/path-op-kind.js";
import { PathOpList } from "./generated/skityrt/path-op-list.js";
import { PATH_COMMAND_TYPE, type CmdOp } from "./binary";

/**
 * SVG path "d" parser → a nested FlatBuffer (PathCommandList) carried as bytes.
 *
 * The scanner (PathScanner) follows react-native-skity/src/utils/path-parser.ts
 * — a hand-written, character-level state machine (whitespace/comma skipping,
 * optional sign, integer+fraction, exponent). Unlike that parser — which only
 * tokenizes and leaves geometric conversion to native skity — this one also
 * *normalizes*, because the lynx-skity FlatBuffer PathCommand schema is the
 * 6-command normalized form (MOVE_TO / LINE_TO / CUBIC_TO / QUAD_TO / ARC_TO /
 * CLOSE). So relative→absolute, H/V→LINE_TO, and S/T smooth-bezier reflection
 * are resolved here. The scanner is interleaved with the parser (rather than
 * pre-tokenizing the whole string) precisely so that arc flags can be read as
 * exactly one digit each: the SVG spec allows the large-arc/sweep flags to be
 * written with no separator (`A 50 50 0 11 0 0` ⇠ large=1 sweep=1), which a
 * naive number tokenizer would merge into a single bogus value.
 *
 * The result is a finished PathCommandList FlatBuffer. The native side stores
 * it verbatim on RenderNode.path_data (nested_flatbuffer) and reads it back via
 * path_data_nested_root() — zero custom-format parsing on either side. Returns
 * null when the string holds no commands.
 */

const M = PATH_COMMAND_TYPE.MOVE_TO;
const L = PATH_COMMAND_TYPE.LINE_TO;
const C = PATH_COMMAND_TYPE.CUBIC_TO;
const Q = PATH_COMMAND_TYPE.QUAD_TO;
const A = PATH_COMMAND_TYPE.ARC_TO;
const Z = PATH_COMMAND_TYPE.CLOSE;

/**
 * Character-level scanner for SVG path data, interleaved with the parser so arc
 * flags can be consumed as single digits. Malformed runs report "no more data"
 * (null) instead of throwing, so a bad token just ends the current command
 * instead of aborting the whole path.
 */
class PathScanner {
  private readonly d: string;
  private i = 0;

  constructor(d: string) {
    this.d = d;
  }

  private static isWs(c: string): boolean {
    return c === " " || c === "\t" || c === "\n" || c === "\r" || c === ",";
  }

  private static isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private skipWs(): void {
    while (this.i < this.d.length && PathScanner.isWs(this.d[this.i])) this.i++;
  }

  /** Peek the next command letter (after ws/comma) without consuming it. */
  peekCommand(): string | null {
    this.skipWs();
    if (this.i >= this.d.length) return null;
    const c = this.d[this.i];
    const u = c.toUpperCase();
    if (
      u === "M" ||
      u === "L" ||
      u === "H" ||
      u === "V" ||
      u === "C" ||
      u === "S" ||
      u === "Q" ||
      u === "T" ||
      u === "A" ||
      u === "Z"
    ) {
      return c;
    }
    return null;
  }

  /** Consume and return the next command letter, or null if none remains. */
  readCommand(): string | null {
    const c = this.peekCommand();
    if (c !== null) this.i++;
    return c;
  }

  /**
   * Consume one numeric token (optional sign, integer and/or fraction, optional
   * exponent). Returns null and leaves the cursor untouched if the cursor is
   * not at a number.
   */
  readNumber(): number | null {
    this.skipWs();
    if (this.i >= this.d.length) return null;
    const start = this.i;
    if (this.d[this.i] === "+" || this.d[this.i] === "-") this.i++;
    let hasDigits = false;
    while (this.i < this.d.length && PathScanner.isDigit(this.d[this.i])) {
      this.i++;
      hasDigits = true;
    }
    if (this.i < this.d.length && this.d[this.i] === ".") {
      this.i++;
      while (this.i < this.d.length && PathScanner.isDigit(this.d[this.i])) {
        this.i++;
        hasDigits = true;
      }
    }
    if (!hasDigits) {
      this.i = start; // not a number — leave the cursor untouched
      return null;
    }
    if (this.i < this.d.length && (this.d[this.i] === "e" || this.d[this.i] === "E")) {
      const saved = this.i;
      this.i++;
      if (this.i < this.d.length && (this.d[this.i] === "+" || this.d[this.i] === "-")) this.i++;
      let expDigits = false;
      while (this.i < this.d.length && PathScanner.isDigit(this.d[this.i])) {
        this.i++;
        expDigits = true;
      }
      if (!expDigits) this.i = saved; // the 'e' wasn't an exponent — back off
    }
    return parseFloat(this.d.substring(start, this.i));
  }

  /** Consume exactly one arc-flag digit (0 or 1). Returns null otherwise. */
  readFlag(): number | null {
    this.skipWs();
    if (this.i >= this.d.length) return null;
    const c = this.d[this.i];
    if (c === "0" || c === "1") {
      this.i++;
      return c === "1" ? 1 : 0;
    }
    return null;
  }
}

/** Build the normalized ops into a finished PathCommandList FlatBuffer. */
function buildPathCommandList(ops: CmdOp[]): ArrayBuffer {
  const builder = new flatbuffers.Builder(256);
  const offsets: flatbuffers.Offset[] = [];
  for (const op of ops) {
    const argsOff = PathCommand.createArgsVector(builder, op.args);
    offsets.push(PathCommand.createPathCommand(builder, op.type as PathCommandType, argsOff));
  }
  const commandsOff = PathCommandList.createCommandsVector(builder, offsets);
  const root = PathCommandList.createPathCommandList(builder, commandsOff);
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}

/** PathOpKind bytes for the PathOpName literals (skity PathOp::Op value order). */
const PATH_OP_KIND = {
  difference: PathOpKind.DIFFERENCE,
  intersect: PathOpKind.INTERSECT,
  union: PathOpKind.UNION,
  xor: PathOpKind.XOR,
} as const;

/**
 * Parse an SVG path `d` string into a nested PathCommandList FlatBuffer. See
 * the module doc above for the full command set and normalization rules
 * (relative→absolute, H/V→line, S/T control-point reflection, single-digit
 * arc flags).
 *
 * @param d An SVG path data string.
 * @returns PathCommandList FlatBuffer bytes, or `null` if `d` has no commands.
 *
 * @example
 * parsePath("M10 10 L20 20 Z");        // closed triangle, as bytes
 * parsePath("M0 0 a10 10 0 11 20 0");  // arc, concatenated flags (large=1 sweep=1)
 * parsePath("   ");                    // null
 */
export function parsePath(d: string): ArrayBuffer | null {
  const s = new PathScanner(d);
  const ops: CmdOp[] = [];
  let cx = 0,
    cy = 0; // current point
  let sx = 0,
    sy = 0; // subpath start (for close)
  let pcx = 0,
    pcy = 0; // previous cubic control point
  let qcx = 0,
    qcy = 0; // previous quadratic control point
  let hasCubic = false,
    hasQuad = false;

  const num = (): number | null => s.readNumber();
  const flag = (): number | null => s.readFlag();

  let cmd: string | null;
  while ((cmd = s.readCommand()) !== null) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;

    switch (upper) {
      case "M": {
        // First pair is moveto; subsequent pairs are implicit lineto.
        let first = true;
        for (;;) {
          const x = num(),
            y = num();
          if (x === null || y === null) break;
          let ax = x,
            ay = y;
          if (rel) {
            ax += cx;
            ay += cy;
          }
          ops.push({ type: first ? M : L, args: [ax, ay] });
          cx = ax;
          cy = ay;
          if (first) {
            sx = ax;
            sy = ay;
            first = false;
          }
        }
        hasCubic = hasQuad = false;
        break;
      }
      case "L":
        for (;;) {
          const x = num(),
            y = num();
          if (x === null || y === null) break;
          let ax = x,
            ay = y;
          if (rel) {
            ax += cx;
            ay += cy;
          }
          ops.push({ type: L, args: [ax, ay] });
          cx = ax;
          cy = ay;
        }
        hasCubic = hasQuad = false;
        break;
      case "H":
        for (;;) {
          const x = num();
          if (x === null) break;
          const ax = rel ? cx + x : x;
          ops.push({ type: L, args: [ax, cy] });
          cx = ax;
        }
        hasCubic = hasQuad = false;
        break;
      case "V":
        for (;;) {
          const y = num();
          if (y === null) break;
          const ay = rel ? cy + y : y;
          ops.push({ type: L, args: [cx, ay] });
          cy = ay;
        }
        hasCubic = hasQuad = false;
        break;
      case "C":
        for (;;) {
          const x1 = num(),
            y1 = num(),
            x2 = num(),
            y2 = num(),
            x = num(),
            y = num();
          if (
            x1 === null ||
            y1 === null ||
            x2 === null ||
            y2 === null ||
            x === null ||
            y === null
          ) {
            break;
          }
          let ax1 = x1,
            ay1 = y1,
            ax2 = x2,
            ay2 = y2,
            ax = x,
            ay = y;
          if (rel) {
            ax1 += cx;
            ay1 += cy;
            ax2 += cx;
            ay2 += cy;
            ax += cx;
            ay += cy;
          }
          ops.push({ type: C, args: [ax1, ay1, ax2, ay2, ax, ay] });
          pcx = ax2;
          pcy = ay2;
          cx = ax;
          cy = ay;
        }
        hasCubic = true;
        hasQuad = false;
        break;
      case "S":
        for (;;) {
          const x2 = num(),
            y2 = num(),
            x = num(),
            y = num();
          if (x2 === null || y2 === null || x === null || y === null) break;
          let ax2 = x2,
            ay2 = y2,
            ax = x,
            ay = y;
          if (rel) {
            ax2 += cx;
            ay2 += cy;
            ax += cx;
            ay += cy;
          }
          // Reflected first control point: mirror the previous cubic's 2nd cp.
          const ax1 = hasCubic ? 2 * cx - pcx : cx;
          const ay1 = hasCubic ? 2 * cy - pcy : cy;
          ops.push({ type: C, args: [ax1, ay1, ax2, ay2, ax, ay] });
          pcx = ax2;
          pcy = ay2;
          cx = ax;
          cy = ay;
        }
        hasCubic = true;
        hasQuad = false;
        break;
      case "Q":
        for (;;) {
          const x1 = num(),
            y1 = num(),
            x = num(),
            y = num();
          if (x1 === null || y1 === null || x === null || y === null) break;
          let ax1 = x1,
            ay1 = y1,
            ax = x,
            ay = y;
          if (rel) {
            ax1 += cx;
            ay1 += cy;
            ax += cx;
            ay += cy;
          }
          ops.push({ type: Q, args: [ax1, ay1, ax, ay] });
          qcx = ax1;
          qcy = ay1;
          cx = ax;
          cy = ay;
        }
        hasQuad = true;
        hasCubic = false;
        break;
      case "T":
        for (;;) {
          const x = num(),
            y = num();
          if (x === null || y === null) break;
          let ax = x,
            ay = y;
          if (rel) {
            ax += cx;
            ay += cy;
          }
          // Reflected control point: mirror the previous quad's cp.
          const ax1 = hasQuad ? 2 * cx - qcx : cx;
          const ay1 = hasQuad ? 2 * cy - qcy : cy;
          ops.push({ type: Q, args: [ax1, ay1, ax, ay] });
          qcx = ax1;
          qcy = ay1;
          cx = ax;
          cy = ay;
        }
        hasQuad = true;
        hasCubic = false;
        break;
      case "A": {
        // ARC_TO args: [rx, ry, rotation, largeArcFlag, sweepFlag, x, y].
        // Flags are read as single digits so concatenated forms like
        // `A 50 50 0 11 0 0` (large=1, sweep=1) parse per SVG spec.
        for (;;) {
          const rx = num(),
            ry = num(),
            rot = num();
          const large = flag(),
            sweep = flag();
          const x = num(),
            y = num();
          if (
            rx === null ||
            ry === null ||
            rot === null ||
            large === null ||
            sweep === null ||
            x === null ||
            y === null
          ) {
            break;
          }
          let ax = x,
            ay = y;
          if (rel) {
            ax += cx;
            ay += cy;
          }
          ops.push({ type: A, args: [rx, ry, rot, large, sweep, ax, ay] });
          cx = ax;
          cy = ay;
        }
        hasCubic = hasQuad = false;
        break;
      }
      case "Z":
        ops.push({ type: Z, args: [] });
        cx = sx;
        cy = sy;
        hasCubic = hasQuad = false;
        break;
      default:
        break;
    }
  }

  return ops.length ? buildPathCommandList(ops) : null;
}

/**
 * Parse an SVG `points` attribute (polyline/polygon) into `{x,y}` pairs.
 * Coordinates are separated by whitespace and/or commas — `x,y x,y` and
 * `x, y,x y` are all valid per the SVG grammar. An odd trailing coordinate is
 * ignored (SVG spec: "the last, odd coordinate is dropped").
 *
 * @param points An SVG points string, e.g. `"0,0 20,30 50,10"`.
 * @returns The coordinate pairs; `[]` for an empty/invalid string.
 *
 * @example
 * parsePoints("0,0 20,30 50,10"); // [{x:0,y:0},{x:20,y:30},{x:50,y:10}]
 * parsePoints("10 10 20 20");     // [{x:10,y:10},{x:20,y:20}]
 */
export function parsePoints(points: string): Array<{ x: number; y: number }> {
  const s = new PathScanner(points);
  const out: Array<{ x: number; y: number }> = [];
  for (;;) {
    const x = s.readNumber();
    const y = x === null ? null : s.readNumber();
    if (x === null || y === null) break;
    out.push({ x, y });
  }
  return out;
}

// Cubic-Bezier approximation constant for a quarter circle: 4·(√2−1)/3.
const PATH2D_KAPPA = 0.5522847498307936;

/**
 * Boolean operation names (Skia path ops). skity implements the four — its
 * `PathOp::Op` value order matches Skia's SkPathOp (no ReverseDifference).
 */
export type PathOpName = "difference" | "intersect" | "union" | "xor";

/** One node of the lazy boolean-composition tree held by an op-composed Path2D. */
interface OpSpec {
  left: string | Path2D;
  right: string | Path2D;
  op: PathOpName;
}

/**
 * Command-style path builder (a la the Web Canvas Path2D / skity Path2D).
 * Accumulates the six normalized commands the native renderer understands and
 * serializes to the same nested PathCommandList FlatBuffer that parsePath()
 * produces, so `<Path path={path2d} />` works interchangeably with a `d` string.
 * Methods are chainable. Geometry is authored in the same space as a `d` string
 * (logical pixels when the canvas has a viewPort).
 *
 * Relative commands, smooth-cubic/quad (S/T), and H/V are string-syntax
 * conveniences only — here you write the resolved absolute form directly
 * (moveTo/lineTo/cubicTo/quadTo/arcTo).
 */
export class Path2D {
  private readonly ops: CmdOp[] = [];
  /**
   * Lazy boolean-composition descriptor (`Path2D.op`). Non-null only on
   * op-composed instances, which carry no commands — `toOpBytes()` serializes
   * the tree, `toBytes()` yields an empty PathCommandList (never used; the
   * component layer checks `toOpBytes()` first).
   */
  private opSpec: OpSpec | null = null;

  moveTo(x: number, y: number): this {
    this.ops.push({ type: M, args: [x, y] });
    return this;
  }

  lineTo(x: number, y: number): this {
    this.ops.push({ type: L, args: [x, y] });
    return this;
  }

  quadTo(cpx: number, cpy: number, x: number, y: number): this {
    this.ops.push({ type: Q, args: [cpx, cpy, x, y] });
    return this;
  }

  cubicTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
    this.ops.push({ type: C, args: [cp1x, cp1y, cp2x, cp2y, x, y] });
    return this;
  }

  /**
   * SVG-style arc. `largeArc`/`sweep` are booleans, serialized to the 0/1 flag
   * bytes the renderer expects (same as the A command in a `d` string).
   */
  arcTo(
    rx: number,
    ry: number,
    xAxisRotation: number,
    largeArc: boolean,
    sweep: boolean,
    x: number,
    y: number,
  ): this {
    this.ops.push({
      type: A,
      args: [rx, ry, xAxisRotation, largeArc ? 1 : 0, sweep ? 1 : 0, x, y],
    });
    return this;
  }

  close(): this {
    this.ops.push({ type: Z, args: [] });
    return this;
  }

  /** Append another Path2D's commands verbatim. */
  addPath(other: Path2D): this {
    for (const op of other["ops"]) this.ops.push({ type: op.type, args: op.args.slice() });
    return this;
  }

  /** Rectangle as a closed subpath. */
  addRect(x: number, y: number, w: number, h: number): this {
    return this.moveTo(x, y)
      .lineTo(x + w, y)
      .lineTo(x + w, y + h)
      .lineTo(x, y + h)
      .close();
  }

  /** Circle (center + radius) approximated by four cubic Béziers. */
  addCircle(cx: number, cy: number, r: number): this {
    return this.addOval(cx - r, cy - r, r * 2, r * 2);
  }

  /** Oval (ellipse) inscribed in (x,y,w,h), approximated by four cubic Béziers. */
  addOval(x: number, y: number, w: number, h: number): this {
    const rx = w / 2,
      ry = h / 2;
    const kx = PATH2D_KAPPA * rx,
      ky = PATH2D_KAPPA * ry;
    const cx = x + rx,
      cy = y + ry;
    this.moveTo(cx + rx, cy);
    this.cubicTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    this.cubicTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    this.cubicTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    this.cubicTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    return this.close();
  }

  /** Rounded rectangle (rx/ry corner radii) via four elliptical arcs. */
  addRoundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number = rx): this {
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    this.moveTo(x + rx, y);
    this.lineTo(x + w - rx, y);
    this.arcTo(rx, ry, 0, false, true, x + w, y + ry);
    this.lineTo(x + w, y + h - ry);
    this.arcTo(rx, ry, 0, false, true, x + w - rx, y + h);
    this.lineTo(x + rx, y + h);
    this.arcTo(rx, ry, 0, false, true, x, y + h - ry);
    this.lineTo(x, y + ry);
    this.arcTo(rx, ry, 0, false, true, x + rx, y);
    return this.close();
  }

  reset(): this {
    this.ops.length = 0;
    return this;
  }

  /**
   * Lazily combine two paths with a boolean operation (Skia path ops:
   * difference / intersect / union / xor). This is a lazy,
   * transport-side composition: nothing is evaluated in JS — the renderer
   * `Skia.Path.MakeFromOp` — which computes the result synchronously via JSI —
   * there is no channel back to JS here (the Lynx public SDK disables NAPI on
   * Android), so this only records the composition: `<Path path={…}>` detects
   * it via {@link toOpBytes} and the native renderer evaluates the tree per
   * frame with skity `PathOp::Execute` (left fold; an operand whose Execute
   * fails is skipped).
   *
   * Operands accept an SVG `d` string or a Path2D — including other
   * op-composed instances, so compositions nest arbitrarily:
   * `Path2D.op(Path2D.op(a, b, "union"), c, "difference")` is `((a ∪ b) − c)`.
   * Returns a fresh op-composed Path2D; the operands are not modified.
   *
   * @example
   * const mask = Path2D.op(circle, square, "difference");
   * <Path path={mask} color="#22c55e" />
   */
  static op(one: string | Path2D, two: string | Path2D, op: PathOpName): Path2D {
    const p = new Path2D();
    p.opSpec = { left: one, right: two, op };
    return p;
  }

  /**
   * Serialize a boolean composition to a nested PathOpList FlatBuffer; `null`
   * on a plain (command-style) instance. The operand chain is the tree's
   * left-fold form: an op node flattens into its left chain plus one operand
   * for its right side — nested as a sub-PathOpList when that side is itself
   * a composition (e.g. `(A−B) ∪ (C−D)` cannot flatten, the right union rides
   * the `nested` field).
   */
  toOpBytes(): ArrayBuffer | null {
    return this.opSpec !== null ? this.serializeOp(this.opSpec) : null;
  }

  /** True when `p` is itself an op-composed instance. */
  private isComposed(p: string | Path2D): p is Path2D {
    return typeof p !== "string" && p.opSpec !== null;
  }

  /** Serialize one sub-tree into a standalone PathOpList buffer. */
  private serializeOp(spec: OpSpec): ArrayBuffer {
    const builder = new flatbuffers.Builder(256);
    const offsets = this.appendOpChain(builder, spec);
    const operandsOff = PathOpList.createOperandsVector(builder, offsets);
    const root = PathOpList.createPathOpList(builder, operandsOff);
    builder.finish(root);
    return builder.asUint8Array().slice().buffer;
  }

  /**
   * Append the operand chain of an op node to `out` (builder offsets, in
   * order): the left side recurses (a composition flattens into its own
   * chain, a leaf becomes one commands operand), the right side becomes a
   * single operand with the node's op — commands for a leaf, nested bytes for
   * a composition.
   */
  private appendOpChain(builder: flatbuffers.Builder, spec: OpSpec): flatbuffers.Offset[] {
    const out: flatbuffers.Offset[] = [];
    if (this.isComposed(spec.left)) {
      out.push(...this.appendOpChain(builder, spec.left.opSpec!));
    } else {
      out.push(this.createOperand(builder, spec.left, PathOpKind.UNION));
    }
    if (this.isComposed(spec.right)) {
      const nested = new Uint8Array(this.serializeOp(spec.right.opSpec!));
      const nestedOff = PathOperand.createNestedVector(builder, nested);
      out.push(PathOperand.createPathOperand(builder, PATH_OP_KIND[spec.op], 0, nestedOff));
    } else {
      out.push(this.createOperand(builder, spec.right, PATH_OP_KIND[spec.op]));
    }
    return out;
  }

  /** One leaf operand: an optional commands payload (absent when empty). */
  private createOperand(
    builder: flatbuffers.Builder,
    leaf: string | Path2D,
    op: PathOpKind,
  ): flatbuffers.Offset {
    const bytes = typeof leaf === "string" ? parsePath(leaf) : leaf.toBytes();
    const commandsOff =
      bytes !== null ? PathOperand.createCommandsVector(builder, new Uint8Array(bytes)) : 0;
    return PathOperand.createPathOperand(builder, op, commandsOff, 0);
  }

  /** Serialize to a PathCommandList FlatBuffer (base64 it for the native prop). */
  toBytes(): ArrayBuffer {
    return buildPathCommandList(this.ops);
  }
}
