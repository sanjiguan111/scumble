// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolveTransform } from "./internal/transform";
import type { GroupProps } from "./types";

/**
 * Grouping node. Applies a transform to its subtree via the native <skity-group>.
 *
 * Caveat: native skity-group does NOT inherit paint (color/style/opacity) to
 * children today, and has no clip — matching the current react-native-skity
 * behavior. Paint inheritance / clip arrive with Task 3 (native slim-down).
 */
export function Group({ transform, children }: GroupProps) {
  return <skity-group transform={resolveTransform(transform)}>{children}</skity-group>;
}
