// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { TransformOp } from "./generated/skityrt/transform-op.js";
import { TransformOpList } from "./generated/skityrt/transform-op-list.js";
import { TransformType } from "./generated/skityrt/transform-type.js";
import { TRANSFORM_TYPE, type CmdOp } from "./binary";

/**
 * CSS/SVG transform-list parser → a nested FlatBuffer (TransformOpList) carried
 * as bytes.
 *
 * Mirrors native SkityPropParser.parseTransform, emitting TransformOp ops
 * (type byte + args) for translate/scale/rotate/skewX/skewY/matrix. The result
 * is a finished TransformOpList FlatBuffer; the native side stores it verbatim
 * on ComputedStyle.transform_data (nested_flatbuffer) and reads it back via
 * transform_data_nested_root() — zero custom-format parsing. Returns null when
 * the string holds no ops.
 *
 * Example: "translate(10,5) scale(2) rotate(45,1,1)".
 */

function buildTransformOpList(ops: CmdOp[]): ArrayBuffer {
  const builder = new flatbuffers.Builder(128);
  const offsets: flatbuffers.Offset[] = [];
  for (const op of ops) {
    const argsOff = TransformOp.createArgsVector(builder, op.args);
    offsets.push(TransformOp.createTransformOp(builder, op.type as TransformType, argsOff));
  }
  const opsOff = TransformOpList.createOpsVector(builder, offsets);
  const root = TransformOpList.createTransformOpList(builder, opsOff);
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}

function readNumbers(s: string): number[] {
  const re = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;
  return (s.match(re) ?? []).map(Number).filter((n) => !Number.isNaN(n));
}

export function parseTransform(s: string): ArrayBuffer | null {
  const ops: CmdOp[] = [];
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const name = m[1].toLowerCase();
    const a = readNumbers(m[2]);
    switch (name) {
      case "translate":
        ops.push({ type: TRANSFORM_TYPE.TRANSLATE, args: [a[0] ?? 0, a[1] ?? 0] });
        break;
      case "scale": {
        const sx = a[0] ?? 1;
        ops.push({ type: TRANSFORM_TYPE.SCALE, args: [sx, a[1] ?? sx] });
        break;
      }
      case "rotate":
        ops.push({ type: TRANSFORM_TYPE.ROTATE, args: [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0] });
        break;
      case "skewx":
        ops.push({ type: TRANSFORM_TYPE.SKEW_X, args: [a[0] ?? 0] });
        break;
      case "skewy":
        ops.push({ type: TRANSFORM_TYPE.SKEW_Y, args: [a[0] ?? 0] });
        break;
      case "matrix":
        if (a.length >= 6) ops.push({ type: TRANSFORM_TYPE.MATRIX, args: a.slice(0, 6) });
        break;
    }
  }
  return ops.length ? buildTransformOpList(ops) : null;
}
