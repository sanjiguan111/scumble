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

import type { ClipDef, Matrix4, SkRect } from "../types.js";
import {
  normalizeRnTransform,
  read,
  resolveShimPaint,
  type MaybeAnimated,
  type RnTransformItem,
  type ShimShapeProps,
} from "./common.js";

export interface ShimGroupProps extends ShimShapeProps {
  /** 4×4 column-major Matrix4, an RN-Skia transform-item array, or either
   * wrapped in a SharedValue (read at render time — the reactive shim
   * re-renders on every write). */
  transform?: MaybeAnimated<Matrix4 | readonly RnTransformItem[]>;
  /** RN-Skia's matrix prop — resolved to scumble's transform. */
  matrix?: MaybeAnimated<Matrix4>;
  /** A ClipDef, or a bare `[x,y,w,h]` rect (RN-Skia allows both). */
  clip?: ClipDef | SkRect;
  origin?: { x: number; y: number };
  layer?: unknown;
  isHeadless?: boolean;
  explicitSize?: unknown;
}

/** One ClipDef (or bare rect) → a scumble clip child element. */
export function clipDefToElement(def: ClipDef | SkRect | undefined): ReactNode {
  if (!def) return undefined;
  if (Array.isArray(def)) return <ClipRect x={def[0]} y={def[1]} width={def[2]} height={def[3]} />;
  const op = "op" in def ? def.op : undefined;
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
  if ("path" in def) {
    return <ClipPath path={typeof def.path === "string" ? def.path : def.path.p2d} op={op} />;
  }
  return undefined;
}

/** Resolve transform/matrix (animated or not) onto scumble's transform prop. */
export function resolveGroupTransform(props: ShimGroupProps): {
  transform?: Parameters<typeof ScumbleGroup>[0]["transform"];
} {
  const matrix = read(props.matrix);
  const raw = read(props.transform) ?? matrix;
  if (raw === undefined) return {};
  if (Array.isArray(raw)) {
    const items = raw as readonly unknown[];
    const looksLikeMatrix = items.length === 16 && items.every((v) => typeof v === "number");
    if (looksLikeMatrix) return { transform: raw as Matrix4 };
    return {
      transform: normalizeRnTransform(
        raw as readonly RnTransformItem[],
        props.origin,
      ) as Parameters<typeof ScumbleGroup>[0]["transform"],
    };
  }
  return { transform: raw as Matrix4 };
}

/** The prop mapping, exported for tests. */
export function groupPropsToScumble(props: ShimGroupProps) {
  const {
    transform: _transform,
    matrix: _matrix,
    clip: _clip,
    origin: _origin,
    layer: _layer,
    isHeadless: _headless,
    explicitSize: _size,
    ...rest
  } = props;
  return { ...resolveGroupTransform(props), ...resolveShimPaint(rest) };
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
