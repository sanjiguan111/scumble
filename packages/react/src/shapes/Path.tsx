// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolvePaint } from "../internal/paint";
import type { PathProps } from "../types";

/**
 * SVG path. `path` (string) maps to native `d`.
 *
 * Caveat: native SkityPropParser only renders absolute M/L/C/Q/Z today;
 * relative commands and H/V/S/T/A may mis-render until Task 3. `start`/`end`
 * trim and Path2D objects are not yet supported.
 */
export function Path({ path, fillRule, ...rest }: PathProps) {
  return (
    <skity-path
      d={path}
      fillRule={fillRule === "even-odd" ? "evenodd" : fillRule}
      {...resolvePaint(rest)}
    />
  );
}
