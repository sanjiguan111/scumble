// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { PathCommandList } from "../generated/skityrt/path-command-list.js";
import { PathCommandType } from "../generated/skityrt/path-command-type.js";
import { Path2D, parsePath, parsePoints } from "../path.js";

// Read the nested-flatbuffer bytes back as a PathCommandList — this is exactly
// what the native render side does via path_data_nested_root(). These tests
// prove the JS-built bytes round-trip cleanly (the nested-flatbuffer contract).
function readBack(bytes: ArrayBuffer): PathCommandList {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return PathCommandList.getRootAsPathCommandList(bb);
}

describe("parsePath → nested FlatBuffer round-trip", () => {
  it("builds a parseable PathCommandList for a simple absolute path", () => {
    const bytes = parsePath("M10 10 L20 20 Z");
    expect(bytes).not.toBeNull();
    const list = readBack(bytes!);

    expect(list.commandsLength()).toBe(3);

    const m = list.commands(0)!;
    expect(m.type()).toBe(PathCommandType.MOVE_TO);
    expect(m.args(0)).toBe(10);
    expect(m.args(1)).toBe(10);

    const l = list.commands(1)!;
    expect(l.type()).toBe(PathCommandType.LINE_TO);
    expect(l.args(0)).toBe(20);
    expect(l.args(1)).toBe(20);

    expect(list.commands(2)!.type()).toBe(PathCommandType.CLOSE);
  });

  it("resolves relative moveto/lineto against the current point", () => {
    const list = readBack(parsePath("m10 10 l20 20")!);
    expect(list.commandsLength()).toBe(2);
    expect(list.commands(0)!.type()).toBe(PathCommandType.MOVE_TO);
    expect(list.commands(0)!.args(0)).toBe(10);
    expect(list.commands(1)!.type()).toBe(PathCommandType.LINE_TO);
    expect(list.commands(1)!.args(0)).toBe(30); // 10 + 20
    expect(list.commands(1)!.args(1)).toBe(30);
  });

  it("lowers H/V to LINE_TO keeping the orthogonal coordinate", () => {
    const list = readBack(parsePath("M10 10 H20 V30")!);
    expect(list.commandsLength()).toBe(3);
    expect(list.commands(1)!.type()).toBe(PathCommandType.LINE_TO);
    expect(list.commands(1)!.args(0)).toBe(20);
    expect(list.commands(1)!.args(1)).toBe(10); // cy unchanged
    expect(list.commands(2)!.args(0)).toBe(20); // cx unchanged
    expect(list.commands(2)!.args(1)).toBe(30);
  });

  it("reflects the previous control point for S (smooth cubic)", () => {
    // C's second control (20,20); current point becomes (30,30); S's first
    // control is the reflection: 2*(30,30) - (20,20) = (40,40).
    const list = readBack(parsePath("M0 0 C10 10 20 20 30 30 S50 50 60 60")!);
    const s = list.commands(2)!;
    expect(s.type()).toBe(PathCommandType.CUBIC_TO);
    expect(s.args(0)).toBe(40);
    expect(s.args(1)).toBe(40);
    expect(s.args(2)).toBe(50);
    expect(s.args(3)).toBe(50);
    expect(s.args(4)).toBe(60);
    expect(s.args(5)).toBe(60);
  });

  it("handles repeated implicit commands (M 10 10 L 1 2 3 4)", () => {
    const list = readBack(parsePath("M10 10 L1 2 3 4")!);
    expect(list.commandsLength()).toBe(3);
    expect(list.commands(1)!.args(0)).toBe(1);
    expect(list.commands(2)!.args(0)).toBe(3);
  });

  it("parses floats and scientific notation", () => {
    const list = readBack(parsePath("M10.5 20.75e-1 L30.5 .75e3")!);
    expect(list.commands(0)!.args(0)).toBe(10.5);
    expect(list.commands(0)!.args(1)).toBeCloseTo(2.075, 3);
    expect(list.commands(1)!.args(1)).toBe(750);
  });

  it("reflects the previous control point for T (smooth quad)", () => {
    // Q's control (20,20); current point (30,30); T's control reflected:
    // 2*(30,30) - (20,20) = (40,40).
    const list = readBack(parsePath("M0 0 Q20 20 30 30 T50 50")!);
    const t = list.commands(2)!;
    expect(t.type()).toBe(PathCommandType.QUAD_TO);
    expect(t.args(0)).toBe(40);
    expect(t.args(1)).toBe(40);
    expect(t.args(2)).toBe(50);
    expect(t.args(3)).toBe(50);
  });

  it("parses arc with space-separated flags", () => {
    const list = readBack(parsePath("M80 80 A45 45 0 0 1 125 125")!);
    const a = list.commands(1)!;
    expect(a.type()).toBe(PathCommandType.ARC_TO);
    expect(a.args(0)).toBe(45); // rx
    expect(a.args(3)).toBe(0); // large-arc-flag
    expect(a.args(4)).toBe(1); // sweep-flag
    expect(a.args(5)).toBe(125); // x
  });

  it("parses arc with concatenated flags (large=1 sweep=1 as '11')", () => {
    // SVG spec allows the two single-digit flags with no separator; a naive
    // number tokenizer would merge "11" into one value and drop the arc.
    const list = readBack(parsePath("M80 80A45 45 0 11125 125")!);
    expect(list.commandsLength()).toBe(2);
    const a = list.commands(1)!;
    expect(a.type()).toBe(PathCommandType.ARC_TO);
    expect(a.args(3)).toBe(1); // large-arc-flag
    expect(a.args(4)).toBe(1); // sweep-flag
    expect(a.args(5)).toBe(125); // x not glued into the flags
    expect(a.args(6)).toBe(125);
  });

  it("parses arc with concatenated flags '00' and a relative end point", () => {
    const list = readBack(parsePath("M80 80a45 45 0 0045 45")!);
    const a = list.commands(1)!;
    expect(a.type()).toBe(PathCommandType.ARC_TO);
    expect(a.args(3)).toBe(0);
    expect(a.args(4)).toBe(0);
    expect(a.args(5)).toBe(125); // 80 + 45
    expect(a.args(6)).toBe(125);
  });

  it("parses repeated implicit arc commands", () => {
    const list = readBack(parsePath("M0 0 A10 10 0 0 1 20 20 40 40 0 1 1 60 60")!);
    expect(list.commandsLength()).toBe(3);
    expect(list.commands(1)!.type()).toBe(PathCommandType.ARC_TO);
    expect(list.commands(2)!.type()).toBe(PathCommandType.ARC_TO);
    expect(list.commands(2)!.args(3)).toBe(1); // second arc large=1
  });

  it("returns null for empty / whitespace-only input", () => {
    expect(parsePath("")).toBeNull();
    expect(parsePath("   ")).toBeNull();
  });
});

describe("Path2D → nested FlatBuffer", () => {
  it("builds a move/line/close path", () => {
    const p = new Path2D().moveTo(10, 10).lineTo(20, 20).close();
    const list = readBack(p.toBytes());
    expect(list.commandsLength()).toBe(3);
    expect(list.commands(0)!.type()).toBe(PathCommandType.MOVE_TO);
    expect(list.commands(1)!.type()).toBe(PathCommandType.LINE_TO);
    expect(list.commands(2)!.type()).toBe(PathCommandType.CLOSE);
  });

  it("serializes cubicTo / quadTo args", () => {
    const p = new Path2D().moveTo(0, 0).cubicTo(1, 2, 3, 4, 5, 6).quadTo(7, 8, 9, 10);
    const list = readBack(p.toBytes());
    const c = list.commands(1)!;
    expect(c.type()).toBe(PathCommandType.CUBIC_TO);
    expect(c.args(5)).toBe(6);
    const q = list.commands(2)!;
    expect(q.type()).toBe(PathCommandType.QUAD_TO);
    expect(q.args(3)).toBe(10);
  });

  it("converts arcTo booleans to 0/1 flag bytes", () => {
    const p = new Path2D().moveTo(0, 0).arcTo(50, 50, 0, true, true, 100, 100);
    const a = readBack(p.toBytes()).commands(1)!;
    expect(a.type()).toBe(PathCommandType.ARC_TO);
    expect(a.args(3)).toBe(1); // largeArc
    expect(a.args(4)).toBe(1); // sweep
  });

  it("addRect produces a closed rectangle subpath", () => {
    const list = readBack(new Path2D().addRect(1, 2, 30, 40).toBytes());
    expect(list.commandsLength()).toBe(5); // moveTo + 3 lineTo + close
    expect(list.commands(0)!.type()).toBe(PathCommandType.MOVE_TO);
    expect(list.commands(1)!.args(0)).toBe(31); // x+w
    expect(list.commands(4)!.type()).toBe(PathCommandType.CLOSE);
  });

  it("addCircle emits four cubic Béziers + close", () => {
    const list = readBack(new Path2D().addCircle(50, 50, 50).toBytes());
    expect(list.commandsLength()).toBe(6); // moveTo + 4 cubicTo + close
    for (let i = 1; i <= 4; i++) {
      expect(list.commands(i)!.type()).toBe(PathCommandType.CUBIC_TO);
    }
    expect(list.commands(5)!.type()).toBe(PathCommandType.CLOSE);
  });

  it("is chainable and resettable, and addPath appends", () => {
    const p = new Path2D();
    expect(p.moveTo(0, 0)).toBe(p); // chainable
    p.lineTo(1, 1);
    expect(readBack(p.toBytes()).commandsLength()).toBe(2);
    p.reset();
    expect(readBack(p.toBytes()).commandsLength()).toBe(0);

    const star = new Path2D().moveTo(0, 0).lineTo(5, 5);
    const combined = new Path2D().moveTo(1, 1).addPath(star);
    expect(readBack(combined.toBytes()).commandsLength()).toBe(3);
  });
});

describe("parsePoints", () => {
  it("parses comma-and-space separated pairs", () => {
    expect(parsePoints("0,0 20,30 50,10")).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 30 },
      { x: 50, y: 10 },
    ]);
  });

  it("parses space-only pairs and mixed separators", () => {
    expect(parsePoints("10 10 20 20")).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    expect(parsePoints("1.5,-2  4e1,5")).toEqual([
      { x: 1.5, y: -2 },
      { x: 40, y: 5 },
    ]);
  });

  it("drops an odd trailing coordinate and returns [] for junk/empty", () => {
    expect(parsePoints("0,0 10,10 99")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(parsePoints("")).toEqual([]);
    expect(parsePoints("abc")).toEqual([]);
  });
});

// ---- Path2D.op (lazy boolean composition → nested PathOpList) ----

import { PathOpKind } from "../generated/skityrt/path-op-kind.js";
import { PathOpList } from "../generated/skityrt/path-op-list.js";

function readBackOp(bytes: ArrayBuffer): PathOpList {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return PathOpList.getRootAsPathOpList(bb);
}

function bytesEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const CIRCLE = new Path2D().addCircle(50, 50, 40);
const SQUARE = "M10 10 H90 V90 H10 Z";

describe("Path2D.op → nested PathOpList", () => {
  it("toOpBytes is null on a plain instance, and toBytes is empty when composed", () => {
    expect(new Path2D().moveTo(0, 0).toOpBytes()).toBeNull();
    const composed = Path2D.op(CIRCLE, SQUARE, "union");
    expect(composed.toOpBytes()).not.toBeNull();
    expect(readBack(composed.toBytes()!).commandsLength()).toBe(0);
  });

  it("serializes a two-operand op as a base leaf + one fold operand", () => {
    const list = readBackOp(Path2D.op(CIRCLE, SQUARE, "difference").toOpBytes()!);
    expect(list.operandsLength()).toBe(2);
    // Base operand: op ignored (defaults UNION), commands = the circle's bytes.
    const base = list.operands(0)!;
    expect(base.op()).toBe(PathOpKind.UNION);
    expect(bytesEqual(base.commandsArray(), new Uint8Array(CIRCLE.toBytes()))).toBe(true);
    expect(base.nestedLength()).toBe(0);
    // Fold operand: the d string parsed, combined with DIFFERENCE.
    const second = list.operands(1)!;
    expect(second.op()).toBe(PathOpKind.DIFFERENCE);
    expect(bytesEqual(second.commandsArray(), new Uint8Array(parsePath(SQUARE)!))).toBe(true);
  });

  it("flattens a left-deep chain: op(op(a, b, u), c, d) → [a, b:u, c:d]", () => {
    const hole = new Path2D().addCircle(50, 50, 10);
    const list = readBackOp(Path2D.op(Path2D.op(CIRCLE, SQUARE, "union"), hole, "xor").toOpBytes()!);
    expect(list.operandsLength()).toBe(3);
    expect(list.operands(1)!.op()).toBe(PathOpKind.UNION);
    expect(list.operands(2)!.op()).toBe(PathOpKind.XOR);
    expect(bytesEqual(list.operands(2)!.commandsArray(), new Uint8Array(hole.toBytes()))).toBe(true);
    // A flattened chain carries no nested sub-trees.
    for (let i = 0; i < 3; i++) expect(list.operands(i)!.nestedLength()).toBe(0);
  });

  it("rides the nested field for a right-nested composition ((A) op (B op C))", () => {
    const b = new Path2D().addRect(0, 0, 40, 40);
    const c = new Path2D().addRect(20, 20, 40, 40);
    const list = readBackOp(Path2D.op(CIRCLE, Path2D.op(b, c, "intersect"), "difference").toOpBytes()!);
    expect(list.operandsLength()).toBe(2);
    const right = list.operands(1)!;
    expect(right.op()).toBe(PathOpKind.DIFFERENCE);
    expect(right.commandsLength()).toBe(0);
    // The nested sub-tree round-trips as its own PathOpList (b leaf + c:INTERSECT).
    const nestedBytes = right.nestedArray();
    expect(nestedBytes).not.toBeNull();
    const nested = readBackOp(nestedBytes!.buffer.slice(
      nestedBytes!.byteOffset,
      nestedBytes!.byteOffset + nestedBytes!.byteLength,
    ) as ArrayBuffer);
    expect(nested.operandsLength()).toBe(2);
    expect(nested.operands(0)!.commandsArray()).not.toBeNull();
    expect(nested.operands(1)!.op()).toBe(PathOpKind.INTERSECT);
  });

  it("omits the commands payload for an operand with no commands", () => {
    const list = readBackOp(Path2D.op(CIRCLE, "", "union").toOpBytes()!);
    expect(list.operands(1)!.commandsLength()).toBe(0);
    expect(list.operands(1)!.nestedLength()).toBe(0);
  });
});
