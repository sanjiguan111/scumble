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

/** PathCommandType bytes (render_tree_style.fbs). */
export const PATH_COMMAND_TYPE = {
  MOVE_TO: 0,
  LINE_TO: 1,
  CUBIC_TO: 2,
  QUAD_TO: 3,
  ARC_TO: 4,
  CLOSE: 5,
} as const;

/** TransformType bytes (render_tree_style.fbs). */
export const TRANSFORM_TYPE = {
  MATRIX: 0,
  TRANSLATE: 1,
  SCALE: 2,
  ROTATE: 3,
  SKEW_X: 4,
  SKEW_Y: 5,
} as const;

/** A parsed command/transform op: a type byte plus its float args. */
export interface CmdOp {
  type: number;
  args: number[];
}
