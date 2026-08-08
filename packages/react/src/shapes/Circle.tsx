// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import type { CircleProps } from "../types";

/** Circle. `radius` maps to the native `r`. */
export function Circle({ cx, cy, radius, ...rest }: CircleProps) {
  return <skity-circle cx={cx ?? 0} cy={cy ?? 0} r={radius} {...resolvePaint(rest)} />;
}
