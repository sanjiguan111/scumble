// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Find the clip declarations (<ClipRect>/<ClipRRect>/<ClipPath>) among a
// <Group>'s children and turn them into @scumble/graphics ClipSpecs. The
// components themselves are data-only (render null, like <Paint>); the Group
// consumes their props here and serializes them into its base64 `clip` prop.

import type { ClipSpec } from "@scumble/graphics";
import type { ReactNode } from "@lynx-js/react";

import { ClipPath } from "../clips/ClipPath";
import { ClipRect } from "../clips/ClipRect";
import { ClipRRect } from "../clips/ClipRRect";
import type { ClipPathProps, ClipRRectProps, ClipRectProps } from "../types";
import { childElements } from "./paint";

/** Collect the `<Clip*>` children of a `<Group>`, in document order. */
export function findClipSpecs(children?: ReactNode): ClipSpec[] {
  const specs: ClipSpec[] = [];
  for (const el of childElements(children)) {
    if (el.type === ClipRect) {
      const p = el.props as ClipRectProps;
      specs.push({ kind: "rect", op: p.op, x: p.x, y: p.y, width: p.width, height: p.height });
    } else if (el.type === ClipRRect) {
      const p = el.props as ClipRRectProps;
      const radii =
        typeof p.radii === "number" ? { x: p.radii, y: p.radii } : (p.radii ?? { x: 0, y: 0 });
      specs.push({
        kind: "rrect",
        op: p.op,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        rx: radii.x,
        ry: radii.y,
      });
    } else if (el.type === ClipPath) {
      const p = el.props as ClipPathProps;
      specs.push({ kind: "path", op: p.op, path: p.path });
    }
  }
  return specs;
}
