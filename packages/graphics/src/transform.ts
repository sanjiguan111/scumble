// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { TransformOp } from "./generated/skityrt/transform-op.js";
import { TransformOpList } from "./generated/skityrt/transform-op-list.js";
import { TransformType } from "./generated/skityrt/transform-type.js";
import { TRANSFORM_TYPE, type CmdOp } from "./binary";

/**
 * CSS `transform` list → nested FlatBuffer (TransformOpList) bytes.
 *
 * {@link parseTransform} recognizes the usual transform functions; the result
 * is stored verbatim by native on `ComputedStyle.transform_data` and read back
 * via `transform_data_nested_root()`, so the native side does no string parsing.
 */

/** Serialize normalized transform ops into a finished TransformOpList FlatBuffer. */
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

/**
 * Parse a CSS `transform` list into a nested TransformOpList FlatBuffer
 * (carried as bytes on the `transform` prop).
 *
 * Recognized functions (applied in source order, left-to-right):
 *
 * | function              | args                                         |
 * | --------------------- | -------------------------------------------- |
 * | `translate(tx)`       | `ty` defaults to `0`                         |
 * | `scale(sx)`           | `sy` defaults to `sx`                        |
 * | `rotate(deg)`         | degrees; optional `rotate(deg, cx, cy)` pivot |
 * | `skewX(deg)`/`skewY(deg)` | skew angle in degrees                    |
 * | `matrix(a,b,c,d,e,f)` | full 2D affine (6 values)                    |
 *
 * Unrecognized functions are skipped silently. Returns `null` when the string
 * holds no recognized ops, so the caller can omit the prop entirely.
 *
 * @returns TransformOpList FlatBuffer bytes, or `null`.
 *
 * @example
 * parseTransform("translate(10,5) scale(2) rotate(45,1,1)");
 */
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
      case "rotate": {
        // Expand rotate(deg[, cx, cy]) into an explicit 2D affine matrix instead
        // of emitting a ROTATE op. The native ROTATE path leans on skity
        // Canvas::Rotate's degree/radian + matrix-concat convention, which moved
        // the subtree off-screen for any non-zero angle (rotate(0) was the
        // identity, so only it rendered). A matrix is unambiguous — native just
        // Concats it (ScumbleRenderer ApplyTransform MATRIX).
        const deg = a[0] ?? 0;
        const cx = a[1] ?? 0;
        const cy = a[2] ?? 0;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // rotate about (cx,cy): x' = cos·x − sin·y + e, y' = sin·x + cos·y + f
        const e = cx * (1 - cos) + cy * sin;
        const f = cy * (1 - cos) - cx * sin;
        ops.push({ type: TRANSFORM_TYPE.MATRIX, args: [cos, sin, -sin, cos, e, f] });
        break;
      }
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
