// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { bytesToBase64, parseFillRule, parsePath } from "@lynx-skity/parsers";

import { resolvePaint } from "../internal/paint";
import type { PathProps } from "../types";

/**
 * SVG path. `path` (string) is parsed into PathCommandList bytes via
 * @lynx-skity/parsers, base64-encoded for Lynx's string prop channel, and
 * passed to native `d`; the native side decodes + memcpys the bytes (no
 * string→structure parsing). Supports the full SVG command set
 * (M/L/H/V/C/S/Q/T/A/Z, relative and absolute). `start`/`end` trim and Path2D
 * objects are not yet supported.
 */
export function Path({ path, fillRule, ...rest }: PathProps) {
  const pathBytes = parsePath(path);
  return (
    <skity-path
      d={pathBytes ? bytesToBase64(pathBytes) : undefined}
      fillRule={fillRule !== undefined ? parseFillRule(fillRule) : undefined}
      {...resolvePaint(rest)}
    />
  );
}
