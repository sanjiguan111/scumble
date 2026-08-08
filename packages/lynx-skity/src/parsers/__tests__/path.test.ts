// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { PathCommandList } from "../generated/skityrt/path-command-list.js";
import { PathCommandType } from "../generated/skityrt/path-command-type.js";
import { parsePath } from "../path.js";

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

  it("returns null for empty / whitespace-only input", () => {
    expect(parsePath("")).toBeNull();
    expect(parsePath("   ")).toBeNull();
  });
});
