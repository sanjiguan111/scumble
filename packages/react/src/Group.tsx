// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolveTransform } from "./internal/transform";
import type { GroupProps } from "./types";

/**
 * Grouping node — applies a `transform` to its subtree via the native
 * `<skity-group>`.
 *
 * `transform` accepts a single translate/scale/rotate object (rotate in degrees)
 * or a 4×4 column-major matrix, the react-native-skity shape.
 *
 * Caveat: the native skity-group does NOT inherit paint (`color` / `style` /
 * `opacity`) to children today, and has no clip — matching current
 * react-native-skity behavior.
 *
 * @example
 * <Group transform={{ translateX: 10, translateY: 10 }}>
 *   <Circle cx={0} cy={0} radius={20} color="red" />
 * </Group>
 * <Group transform={{ rotate: 45, x: 50, y: 50 }}>
 *   <Rect x={0} y={0} width={100} height={20} color="blue" />
 * </Group>
 */
export function Group({ transform, children }: GroupProps) {
  return <skity-group transform={resolveTransform(transform)}>{children}</skity-group>;
}
