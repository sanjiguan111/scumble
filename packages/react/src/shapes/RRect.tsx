// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import type { CornerRadius, RRectProps } from "../types";

function resolveRadii(radii: RRectProps["radii"]): { rx?: number; ry?: number } {
  if (radii === undefined) return {};
  if (typeof radii === "number") return { rx: radii, ry: radii };
  if (Array.isArray(radii)) {
    // Native only supports uniform rx/ry; per-corner radii collapse to top-left (caveat).
    const tl: CornerRadius = radii[0];
    return { rx: tl.x, ry: tl.y };
  }
  return { rx: radii.x, ry: radii.y };
}

/** Rounded rectangle. `radii` → native uniform rx/ry. */
export function RRect({ x, y, width, height, radii, ...rest }: RRectProps) {
  return (
    <skity-rect
      x={x ?? 0}
      y={y ?? 0}
      width={width}
      height={height}
      {...resolveRadii(radii)}
      {...resolvePaint(rest)}
    />
  );
}
