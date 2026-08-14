import { describe, it, expect } from "vitest";

import { buildClipList } from "../clip.js";
import { ClipList } from "../generated/skityrt/clip-list.js";
import { Clip } from "../generated/skityrt/clip.js";
import { ClipOp } from "../generated/skityrt/clip-op.js";
import { ClipType } from "../generated/skityrt/clip-type.js";
import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { Path2D } from "../path.js";

function readBack(bytes: ArrayBuffer): ClipList {
  return ClipList.getRootAsClipList(new flatbuffers.ByteBuffer(new Uint8Array(bytes)));
}

describe("buildClipList", () => {
  it("returns null for an empty list (no clip)", () => {
    expect(buildClipList([])).toBeNull();
  });

  it("serializes rect/rrect geometry + default intersect op", () => {
    const list = readBack(buildClipList([{ kind: "rect", x: 1, y: 2, width: 30, height: 40 }])!);
    expect(list.clipsLength()).toBe(1);
    const c = new Clip();
    expect(list.clips(0, c)!.type()).toBe(ClipType.RECT);
    expect(list.clips(0, c)!.op()).toBe(ClipOp.INTERSECT);
    expect(list.clips(0, c)!.x()).toBe(1);
    expect(list.clips(0, c)!.width()).toBe(30);
  });

  it("serializes rrect radii + difference op", () => {
    const list = readBack(
      buildClipList([
        { kind: "rrect", x: 0, y: 0, width: 10, height: 10, rx: 4, ry: 2, op: "difference" },
      ])!,
    );
    const c = list.clips(0, new Clip())!;
    expect(c.type()).toBe(ClipType.RRECT);
    expect(c.op()).toBe(ClipOp.DIFFERENCE);
    expect(c.rx()).toBe(4);
    expect(c.ry()).toBe(2);
  });

  it("nests PathCommandList bytes for path clips (d string or Path2D)", () => {
    const specs = [
      { kind: "path" as const, path: "M0 0 L10 10 Z" },
      { kind: "path" as const, path: new Path2D().moveTo(0, 0).lineTo(10, 10) },
    ];
    for (const spec of specs) {
      const list = readBack(buildClipList([spec])!);
      const c = list.clips(0, new Clip())!;
      expect(c.type()).toBe(ClipType.PATH);
      expect(c.pathLength()).toBeGreaterThan(0); // nested PathCommandList bytes
    }
  });
});
