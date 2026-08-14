// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { buildClipList, bytesToBase64 } from "@lynx-skity/graphics";

import { findClipSpecs } from "./internal/clip";
import { resolvePaint } from "./internal/paint";
import { resolveTransform } from "./internal/transform";
import type { GroupProps } from "./types";

/**
 * Grouping node — applies a `transform`, optional clip children, and paint
 * inheritance to its subtree via the native `<skity-group>`.
 *
 * `transform` accepts a single translate/scale/rotate object (rotate in
 * degrees) or a 4×4 column-major matrix, the react-native-skity shape.
 *
 * **Clipping** (react-native-skia style): `react-native-skia`'s declarative
 * clip children — {@link ClipRect}/{@link ClipRRect}/{@link ClipPath} — clip
 * the subtree; several clip children combine in document order
 * (`op="difference"` subtracts from the clips before it). Clip geometry is in
 * the group's local coordinate space (the group's own transform applies to the
 * clip too). The clip components are data-only and render nothing.
 *
 * **Paint inheritance**: a Group's `color`/`style`/`opacity`/stroke
 * attributes/`dash` (and a direct gradient child or `<Paint>` override) apply
 * to every descendant that doesn't set its own — e.g. a `color`-less
 * `<Circle>` under `<Group color="red">` fills red. `opacity` multiplies down
 * the tree. NOT inherited: `transform`, geometry, `display`/`visibility`.
 *
 * @example
 * <Group transform={{ translateX: 10, translateY: 10 }}>
 *   <Circle cx={0} cy={0} radius={20} color="red" />
 * </Group>
 * <Group color="#3b82f6" opacity={0.8}>
 *   <ClipRRect x={0} y={0} width={100} height={80} radii={12} />
 *   <Circle cx={50} cy={40} radius={45} />
 * </Group>
 */
export function Group({ transform, children, ...rest }: GroupProps) {
  const clipBytes = buildClipList(findClipSpecs(children));
  return (
    <skity-group
      transform={resolveTransform(transform)}
      clip={clipBytes ? bytesToBase64(clipBytes) : undefined}
      {...resolvePaint(rest, children)}
    >
      {children}
    </skity-group>
  );
}
