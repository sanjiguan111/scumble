// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { PathCommand } from "./generated/skityrt/path-command.js";
import { PathCommandList } from "./generated/skityrt/path-command-list.js";
import { PathCommandType } from "./generated/skityrt/path-command-type.js";
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
      u === "M" || u === "L" || u === "H" || u === "V" || u === "C" ||
      u === "S" || u === "Q" || u === "T" || u === "A" || u === "Z"
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
            x1 === null || y1 === null || x2 === null || y2 === null ||
            x === null || y === null
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
            rx === null || ry === null || rot === null || large === null ||
            sweep === null || x === null || y === null
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
