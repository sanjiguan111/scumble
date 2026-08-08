// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Path2D, bytesToBase64, parseFillRule, parsePath } from "@lynx-skity/parsers";

import { resolvePaint } from "../internal/paint";
import type { PathProps } from "../types";

/**
 * SVG path. `path` may be a `d` string (parsed via @lynx-skity/parsers — full
 * SVG command set M/L/H/V/C/S/Q/T/A/Z, relative and absolute, incl. arc flag
 * concatenation) or a Path2D object built command-style. Either way it ends up
 * as PathCommandList bytes, base64-encoded for Lynx's string prop channel; the
 * native side decodes + memcpys the bytes (no string→structure parsing).
 */
export function Path({ path, fillRule, ...rest }: PathProps) {
  const pathBytes = typeof path === "string" ? parsePath(path) : path.toBytes();
  return (
    <skity-path
      d={pathBytes ? bytesToBase64(pathBytes) : undefined}
      fillRule={fillRule !== undefined ? parseFillRule(fillRule) : undefined}
      {...resolvePaint(rest)}
    />
  );
}
