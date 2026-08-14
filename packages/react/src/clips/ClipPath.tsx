// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { ClipPathProps } from "../types";

/**
 * Path clip — a **child** of a {@link Group}. `path` is an SVG `d` string or a
 * {@link Path2D}. See {@link ClipRect} for how clip children combine.
 *
 * @example
 * <Group>
 *   <ClipPath path="M0 0 L100 0 L100 100 Z" />
 *   <Rect width={200} height={200} color="#f59e0b" />
 * </Group>
 */
export function ClipPath(_props: ClipPathProps): null {
  return null;
}
