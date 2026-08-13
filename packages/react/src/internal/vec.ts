// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { Vec } from "../types";

/**
 * Construct a 2D point `{x, y}` — the react-native-skia `vec` helper. Accepted
 * anywhere a gradient `start`/`end` is expected (alongside a `[x, y]` tuple).
 *
 * @example
 * <LinearGradient start={vec(0, 0)} end={vec(100, 100)} colors={["#f00", "#00f"]} />
 */
export function vec(x: number, y: number): Vec {
  return { x, y };
}
