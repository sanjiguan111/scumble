// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Group clip serialization: a list of clip shapes (rect / rounded rect / path,
 * each intersect or difference) into a nested `ClipList` FlatBuffer.
 *
 * Same wire contract as path/transform/gradient (RENDER_ARCHITECTURE.md §5):
 * the bytes are built here in JS, base64-encoded onto the group's `clip`
 * string prop, and memcpy'd verbatim by the shadow nodes into a SetClip
 * command. The renderer applies the clips in order after the group's own
 * transform — clip geometry is in the group's local coordinate space — with
 * the canvas accumulating intersect/difference ops natively.
 */

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { Clip } from "./generated/skityrt/clip.js";
import { ClipList } from "./generated/skityrt/clip-list.js";
import { ClipOp } from "./generated/skityrt/clip-op.js";
import { ClipType } from "./generated/skityrt/clip-type.js";
import { Path2D, parsePath } from "./path.js";

/** How a clip shape combines with the clips before it. */
export type ClipCombineOp = "intersect" | "difference";

/** One clip shape — the props shape of the react `<ClipRect>`/`<ClipRRect>`/`<ClipPath>`. */
export interface ClipSpec {
  kind: "rect" | "rrect" | "path";
  /** Defaults to `"intersect"`. */
  op?: ClipCombineOp;
  /** Rect/rrect origin + size (logical px). Defaults 0 for x/y. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** RRect corner radii (uniform). */
  rx?: number;
  ry?: number;
  /** Path geometry for `kind: "path"` — an SVG `d` string or a Path2D. */
  path?: string | Path2D;
}

const OP_BYTES = { intersect: ClipOp.INTERSECT, difference: ClipOp.DIFFERENCE } as const;
const TYPE_BYTES = { rect: ClipType.RECT, rrect: ClipType.RRECT, path: ClipType.PATH } as const;

/**
 * Serialize clip shapes into a nested `ClipList` FlatBuffer (base64-encode for
 * the group's `clip` prop). Path clips are parsed here (`d` string or Path2D)
 * and nested as PathCommandList bytes.
 *
 * @returns ClipList FlatBuffer bytes, or `null` when `clips` is empty (no
 *   clip — pass no `clip` prop).
 *
 * @example
 * buildClipList([
 *   { kind: "rrect", x: 0, y: 0, width: 100, height: 100, rx: 16 },
 *   { kind: "path", path: "M0 0 L50 50", op: "difference" },
 * ]);
 */
export function buildClipList(clips: ClipSpec[]): ArrayBuffer | null {
  if (clips.length === 0) return null;
  const builder = new flatbuffers.Builder(128);
  const offsets: flatbuffers.Offset[] = [];
  for (const clip of clips) {
    const op = OP_BYTES[clip.op ?? "intersect"];
    let pathOffset = 0;
    if (clip.kind === "path" && clip.path !== undefined) {
      const bytes = typeof clip.path === "string" ? parsePath(clip.path) : clip.path.toBytes();
      if (bytes !== null) pathOffset = Clip.createPathVector(builder, new Uint8Array(bytes));
    }
    offsets.push(
      Clip.createClip(
        builder,
        TYPE_BYTES[clip.kind],
        op,
        clip.x ?? 0,
        clip.y ?? 0,
        clip.width ?? 0,
        clip.height ?? 0,
        clip.rx ?? 0,
        clip.ry ?? 0,
        pathOffset,
      ),
    );
  }
  const clipsVec = ClipList.createClipsVector(builder, offsets);
  const root = ClipList.createClipList(builder, clipsVec);
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}
