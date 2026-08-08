// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { PathCommand } from "./generated/skityrt/path-command.js";
import { PathCommandList } from "./generated/skityrt/path-command-list.js";
import { PathCommandType } from "./generated/skityrt/path-command-type.js";
import { PATH_COMMAND_TYPE, type CmdOp } from "./binary";

/**
 * SVG path "d" parser → a nested FlatBuffer (PathCommandList) carried as bytes.
 *
 * The tokenizer (PathScanner) follows react-native-skity/src/utils/path-parser.ts.
 * Unlike that parser — which only tokenizes and leaves geometric conversion to
 * native skity — this one also *normalizes*, because the lynx-skity FlatBuffer
 * PathCommand schema is the 6-command normalized form (MOVE_TO / LINE_TO /
 * CUBIC_TO / QUAD_TO / ARC_TO / CLOSE). So relative→absolute, H/V→LINE_TO,
 * S/T smooth-bezier reflection, and A→ARC_TO are resolved here.
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

interface PathToken {
  type: "cmd" | "number";
  value: string | number;
}

/** Character-level tokenizer: command letters + numbers (int / float / sci-notation). */
class PathScanner {
  readonly tokens: PathToken[] = [];

  constructor(d: string) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) {
      if (m[1] !== undefined) {
        this.tokens.push({ type: "cmd", value: m[1] });
      } else {
        this.tokens.push({ type: "number", value: parseFloat(m[2]!) });
      }
    }
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
  const t = new PathScanner(d).tokens;
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
  let i = 0;

  // Read the next number token; NaN when none is available (signals end of arg run).
  const num = (): number => {
    if (i < t.length && t[i].type === "number") return t[i++].value as number;
    return NaN;
  };

  while (i < t.length) {
    const tok = t[i];
    if (tok.type !== "cmd") {
      i++;
      continue;
    }
    const cmd = tok.value as string;
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    i++;

    switch (upper) {
      case "M": {
        // first pair is moveto; subsequent pairs are implicit lineto.
        let first = true;
        for (;;) {
          const x = num(),
            y = num();
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(x)) break;
          const ax = rel ? cx + x : x;
          ops.push({ type: L, args: [ax, cy] });
          cx = ax;
        }
        hasCubic = hasQuad = false;
        break;
      case "V":
        for (;;) {
          const y = num();
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(y)) break;
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
          if (Number.isNaN(y)) break;
          let ax = x,
            ay = y;
          if (rel) {
            ax += cx;
            ay += cy;
          }
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
      case "A":
        // ARC_TO args: [rx, ry, rotation, largeArcFlag, sweepFlag, x, y].
        // NOTE: like react-native-skity, unlabeled/concatenated arc flags are
        // not handled (flags must be space/comma separated).
        for (;;) {
          const rx = num(),
            ry = num(),
            rot = num(),
            large = num(),
            sweep = num(),
            x = num(),
            y = num();
          if (Number.isNaN(y)) break;
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
