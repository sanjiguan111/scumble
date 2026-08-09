// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { TransformOpList } from "../generated/skityrt/transform-op-list.js";
import { TransformType } from "../generated/skityrt/transform-type.js";
import { parseTransform } from "../transform.js";

function readBack(bytes: ArrayBuffer): TransformOpList {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return TransformOpList.getRootAsTransformOpList(bb);
}

describe("parseTransform → nested FlatBuffer round-trip", () => {
  it("builds a parseable TransformOpList", () => {
    const bytes = parseTransform("translate(10,5) scale(2) rotate(45)")!;
    const list = readBack(bytes);

    expect(list.opsLength()).toBe(3);

    expect(list.ops(0)!.type()).toBe(TransformType.TRANSLATE);
    expect(list.ops(0)!.args(0)).toBe(10);
    expect(list.ops(0)!.args(1)).toBe(5);

    expect(list.ops(1)!.type()).toBe(TransformType.SCALE);
    expect(list.ops(1)!.args(0)).toBe(2);
    expect(list.ops(1)!.args(1)).toBe(2); // sy defaults to sx

    expect(list.ops(2)!.type()).toBe(TransformType.ROTATE);
    expect(list.ops(2)!.args(0)).toBe(45);
  });

  it("parses matrix", () => {
    const list = readBack(parseTransform("matrix(1,2,3,4,5,6)")!);
    expect(list.opsLength()).toBe(1);
    const op = list.ops(0)!;
    expect(op.type()).toBe(TransformType.MATRIX);
    expect(op.args(0)).toBe(1);
    expect(op.args(5)).toBe(6);
  });

  it("parses skewX / skewY", () => {
    const list = readBack(parseTransform("skewX(30) skewY(15)")!);
    expect(list.ops(0)!.type()).toBe(TransformType.SKEW_X);
    expect(list.ops(0)!.args(0)).toBe(30);
    expect(list.ops(1)!.type()).toBe(TransformType.SKEW_Y);
    expect(list.ops(1)!.args(0)).toBe(15);
  });

  it("returns null for empty input", () => {
    expect(parseTransform("")).toBeNull();
    expect(parseTransform("nothing-here")).toBeNull();
  });
});
