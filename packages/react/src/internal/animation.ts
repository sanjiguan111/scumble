// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Resolves {@link GraphicProps.animate} into the base64 `animation` prop —
 * the same pattern as {@link resolveTransform}: the spec serializes into a
 * nested AnimationList FlatBuffer (`@scumble/graphics`), base64-encoded for
 * Lynx's string-only prop channel; native memcpy's it into the node's parsed
 * tracks (render-thread per-vsync interpolation — ANIMATION_DESIGN.md).
 *
 * Semantics: `undefined` omits the prop entirely (no command); a spec / array
 * of specs serializes them; an empty result (`null`, `[]`, all-false array)
 * yields `""` — the native setter treats an empty payload as "clear all
 * animations on this node" (a REMOVED prop would never re-fire the setter, so
 * clearing is explicit).
 */

import { buildAnimationList, bytesToBase64 } from "@scumble/graphics";

import type { AnimationProp, AnimationSpec } from "../types";

export function resolveAnimation(animate: AnimationProp | undefined): string | undefined {
  if (animate === undefined) return undefined;
  const specs: AnimationSpec[] = (Array.isArray(animate) ? animate : [animate]).filter(
    (s): s is AnimationSpec => !!s,
  );
  if (specs.length === 0) return "";
  return bytesToBase64(buildAnimationList(specs));
}
