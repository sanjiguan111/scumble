// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { ClipRRectProps } from "../types";

/**
 * Rounded-rect clip — a **child** of a {@link Group}. `radii` is a number
 * (uniform), `{x, y}` (per-axis), or a 4-corner array `[tl, tr, br, bl]`
 * (per-corner — e.g. only the top corners rounded). See {@link ClipRect} for
 * how clip children combine.
 *
 * @example
 * <Group>
 *   <ClipRRect x={20} y={20} width={120} height={120} radii={16} />
 *   <Circle cx={80} cy={80} radius={70} color="#22c55e" />
 * </Group>
 */
export function ClipRRect(_props: ClipRRectProps): null {
  return null;
}
