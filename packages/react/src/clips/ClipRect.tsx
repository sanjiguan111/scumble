// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { ClipRectProps } from "../types";

/**
 * Rectangular clip — a **child** of a {@link Group}.
 * Clips the group's subtree to the rect; several clip children combine in
 * document order (`op="difference"` subtracts from what came before).
 *
 * Data-only: renders nothing itself; the parent {@link Group} consumes the
 * props and serializes them into its native `clip` prop.
 *
 * @example
 * <Group>
 *   <ClipRect x={20} y={20} width={120} height={120} />
 *   <Circle cx={80} cy={80} radius={70} color="#3b82f6" />
 * </Group>
 */
export function ClipRect(_props: ClipRectProps): null {
  return null;
}
