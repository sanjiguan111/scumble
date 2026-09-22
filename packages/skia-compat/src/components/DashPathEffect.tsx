// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<DashPathEffect intervals phase>` — data-only marker child. scumble has no
 * path-effect child lane; the dash pattern rides the shape's `dash` /
 * `dashOffset` props directly, so the shim's Path/Line components EXTRACT
 * these children via {@link extractDash} and never forward them.
 */

import type { DashPathEffectProps } from "../types.js";

export function DashPathEffect(_props: DashPathEffectProps): null {
  return null;
}
