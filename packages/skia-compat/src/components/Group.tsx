// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Group>` — RN-Skia's Group over scumble's. `transform` passes through
 * untouched (scumble natively accepts the same 4×4 column-major Matrix4 and
 * CSS strings); `clip` (a `ClipDef`) becomes declarative scumble clip
 * children. Paint inheritance (color/style/strokeWidth/opacity cascading to
 * the subtree) is native on BOTH sides — a straight pass-through.
 *
 * RN-Skia `layer`-related props (`isHeadless`, `explicitSize`) are accepted
 * and ignored: scumble's group effects ride the `layer` prop instead, and no
 * Victory core path depends on them.
 */

import { ClipPath, ClipRect, ClipRRect, Group as ScumbleGroup } from "@scumble/react";
import type { CornerRadius } from "@scumble/graphics";
import type { ReactNode } from "@lynx-js/react";

import type { ClipDef, Matrix4 } from "../types.js";
import { resolveShimPaint, type ShimShapeProps } from "./common.js";

export interface ShimGroupProps extends ShimShapeProps {
  /** 4×4 column-major — the same Matrix4 scumble's Group transform takes. */
  transform?: Matrix4;
  clip?: ClipDef;
  origin?: { x: number; y: number };
  layer?: unknown;
  isHeadless?: boolean;
  explicitSize?: unknown;
}

/** One ClipDef → a scumble clip child element (data-only components). */
export function clipDefToElement(def: ClipDef | undefined): ReactNode {
  if (!def) return undefined;
  const op = def.op;
  if ("rect" in def) {
    const [x, y, width, height] = def.rect;
    return <ClipRect x={x} y={y} width={width} height={height} op={op} />;
  }
  if ("rrect" in def) {
    const r = def.rrect;
    // 4-corner array form: [topLeft, topRight, bottomRight, bottomLeft], each
    // an {x, y} elliptical radius.
    const radii: [CornerRadius, CornerRadius, CornerRadius, CornerRadius] = [
      { x: r.topLeft?.x ?? 0, y: r.topLeft?.y ?? 0 },
      { x: r.topRight?.x ?? 0, y: r.topRight?.y ?? 0 },
      { x: r.bottomRight?.x ?? 0, y: r.bottomRight?.y ?? 0 },
      { x: r.bottomLeft?.x ?? 0, y: r.bottomLeft?.y ?? 0 },
    ];
    return (
      <ClipRRect
        x={r.rect.x}
        y={r.rect.y}
        width={r.rect.width}
        height={r.rect.height}
        radii={radii}
        op={op}
      />
    );
  }
  return <ClipPath path={typeof def.path === "string" ? def.path : def.path.p2d} op={op} />;
}

/** The prop mapping, exported for tests. */
export function groupPropsToScumble(props: ShimGroupProps) {
  const {
    transform,
    clip: _clip,
    origin: _origin,
    layer: _layer,
    isHeadless: _headless,
    explicitSize: _size,
    ...rest
  } = props;
  return { transform, ...resolveShimPaint(rest) };
}

export function Group(props: ShimGroupProps & { children?: ReactNode }) {
  const { children, ...rest } = props;
  const clip = clipDefToElement(props.clip);
  return (
    <ScumbleGroup {...groupPropsToScumble(rest)}>
      {clip}
      {children}
    </ScumbleGroup>
  );
}
