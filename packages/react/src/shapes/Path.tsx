// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Path2D, bytesToBase64, parseFillRule, parsePath } from "@lynx-skity/graphics";

import { resolvePaint } from "../internal/paint";
import type { PathProps } from "../types";

/**
 * SVG path. `path` may be a `d` string (parsed via @lynx-skity/graphics — full
 * SVG command set M/L/H/V/C/S/Q/T/A/Z, relative and absolute, incl. arc flag
 * concatenation) or a Path2D object built command-style. Either way it ends up
 * as PathCommandList bytes, base64-encoded for Lynx's string prop channel; the
 * native side decodes + memcpys the bytes (no string→structure parsing).
 *
 * A Path2D returned by `Path2D.op(one, two, op)` (lazy boolean composition)
 * rides a separate `op` prop instead — the native renderer evaluates the ops
 * at draw time (see `Path2D.op`).
 *
 * @example
 * // from an SVG d string
 * <Path path="M10 10 L90 90 Z" color="#22c55e" />
 * // from a Path2D (command-style)
 * const p = new Path2D().moveTo(10, 10).lineTo(90, 90).close();
 * <Path path={p} color="#22c55e" />
 * // boolean composition, evaluated natively at render time
 * const mask = Path2D.op(circle, square, "difference");
 * <Path path={mask} color="#3b82f6" />
 */
export function Path({ path, fillRule, start, end, children, ...rest }: PathProps) {
  // An op-composed Path2D serializes to a PathOpList (separate `op` prop);
  // everything else goes down the plain PathCommandList channel.
  const opBytes = typeof path === "string" ? null : path.toOpBytes();
  const pathBytes = opBytes === null ? (typeof path === "string" ? parsePath(path) : path.toBytes()) : null;
  return (
    <skity-path
      d={pathBytes ? bytesToBase64(pathBytes) : undefined}
      op={opBytes !== null ? bytesToBase64(opBytes) : undefined}
      fillRule={fillRule !== undefined ? parseFillRule(fillRule) : undefined}
      pathStart={start}
      pathEnd={end}
      {...resolvePaint(rest, children)}
    />
  );
}
