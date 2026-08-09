// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Shared enum-byte constants + the CmdOp type used by the path / transform
 * parsers during normalization.
 *
 * There is no custom wire-format serializer here anymore — path / transform are
 * built directly as nested FlatBuffers with flatbuffers.js (see path.ts /
 * transform.ts), so the native side memcpy's the bytes verbatim into
 * RenderNode.path_data / ComputedStyle.transform_data with zero parsing.
 * See RENDER_ARCHITECTURE.md §5.
 */

/**
 * `PathCommandType` enum bytes — mirrors `render_tree_style.fbs`. These are the
 * six normalized command kinds the native renderer consumes, *after* the parser
 * folds relative→absolute, H/V→line, S/T→reflection, etc. Order/indices must
 * match the FlatBuffer enum exactly.
 */
export const PATH_COMMAND_TYPE = {
  /** `moveTo(x, y)` — begin a new subpath. */
  MOVE_TO: 0,
  /** `lineTo(x, y)` — straight line to a point. */
  LINE_TO: 1,
  /** `cubicTo(c1x,c1y, c2x,c2y, x,y)` — cubic Bézier (two control points). */
  CUBIC_TO: 2,
  /** `quadTo(cpx,cpy, x,y)` — quadratic Bézier (one control point). */
  QUAD_TO: 3,
  /** `arcTo(rx,ry,rot,large,sweep, x,y)` — SVG-style elliptical arc. */
  ARC_TO: 4,
  /** `close()` — close the current subpath back to its moveTo. */
  CLOSE: 5,
} as const;

/**
 * `TransformType` enum bytes — mirrors `render_tree_style.fbs`. Order/indices
 * must match the FlatBuffer enum exactly.
 */
export const TRANSFORM_TYPE = {
  /** Full 2D affine — args `[a,b,c,d,e,f]` (SVG `matrix`). */
  MATRIX: 0,
  /** `translate(tx, ty)`. */
  TRANSLATE: 1,
  /** `scale(sx, sy)`. */
  SCALE: 2,
  /** `rotate(deg[, cx, cy])` — degrees; optional pivot. */
  ROTATE: 3,
  /** `skewX(deg)` — degrees; the renderer applies `tan(deg)`. */
  SKEW_X: 4,
  /** `skewY(deg)` — degrees; the renderer applies `tan(deg)`. */
  SKEW_Y: 5,
} as const;

/**
 * A single normalized command or transform op — a {@link PATH_COMMAND_TYPE} or
 * {@link TRANSFORM_TYPE} byte plus the float arguments the native renderer
 * reads positionally. Built by `parsePath` / `parseTransform` / `Path2D` and
 * packed into the nested FlatBuffer vectors.
 */
export interface CmdOp {
  type: number;
  args: number[];
}
