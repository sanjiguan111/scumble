// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { floatsToBase64, resolveCornerRadii } from "@scumble/graphics";

import { resolveAnimation } from "../internal/animation";
import { animationHandleOf } from "../internal/animation-control";
import { resolvePaint } from "../internal/paint";
import { resolveTransform } from "../internal/transform";
import type { RRectProps } from "../types";

/**
 * Resolve the radii authoring forms onto the wire: uniform rx/ry always, plus
 * the per-corner 8 floats on the `radii` prop (base64 LE float32 — the same
 * string channel as `points`) when the 4-corner array form is given. The prop
 * is always emitted: an empty string clears stale per-corner state when the
 * form switches back to uniform.
 */
function resolveRadiiProps(radii: RRectProps["radii"]): { rx: number; ry: number; radii: string } {
  const r = resolveCornerRadii(radii);
  return { rx: r.rx, ry: r.ry, radii: r.cornerRadii ? floatsToBase64(r.cornerRadii) : "" };
}

/**
 * Rounded rectangle — a `<Rect>` with corner radii. `radii` is a `number`
 * (uniform), a `{x, y}` (uniform per-axis), or a 4-corner array
 * `[tl, tr, br, bl]` (per-corner).
 *
 * @example
 * <RRect x={10} y={10} width={80} height={80} radii={16} color="red" />
 * <RRect width={100} height={100} radii={{ x: 10, y: 20 }} color="blue" />
 * <RRect width={100} height={100} radii={[{ x: 16, y: 16 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 16, y: 16 }]} color="green" />
 */
export function RRect({
  x,
  y,
  width,
  height,
  radii,
  animate,
  transform,
  children,
  ...rest
}: RRectProps) {
  return (
    <scumble-rect
      x={x ?? 0}
      y={y ?? 0}
      width={width}
      height={height}
      {...resolveRadiiProps(radii)}
      transform={resolveTransform(transform)}
      animationData={resolveAnimation(animate)}
      animationHandle={animationHandleOf(animate)}
      {...resolvePaint(rest, children)}
    />
  );
}
