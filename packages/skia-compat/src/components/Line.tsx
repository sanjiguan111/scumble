// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Line p1 p2>` — RN-Skia's point-pair form over scumble's x1/y1/x2/y2.
 */

import { Line as ScumbleLine } from "@scumble/react";

import { resolveShimPaint, type ShimShapeProps } from "./common.js";
import type { SkPoint } from "../types.js";

export interface ShimLineProps extends ShimShapeProps {
  p1: SkPoint;
  p2: SkPoint;
}

/** The prop mapping, exported for tests. */
export function linePropsToScumble(props: ShimLineProps): Parameters<typeof ScumbleLine>[0] {
  const { p1, p2, ...rest } = props;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...resolveShimPaint(rest) };
}

export function Line(props: ShimLineProps) {
  return <ScumbleLine {...linePropsToScumble(props)} />;
}
