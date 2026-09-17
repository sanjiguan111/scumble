// Licensed under the Apache License Version 2.0 that may not be used except in
// compliance with the License. You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.

/**
 * Multi-pass paint specs → a nested FlatBuffer (MultiPaintList) carried as
 * bytes.
 *
 * The RN-Skia multi-`<Paint>` wire contract (FEATURE_PARITY F.1.3 / roadmap
 * #13): a shape with several paints draws its geometry once per paint, each
 * pass carrying FULLY independent state — including `opacity`/`blendMode`,
 * which the single-slot SetPaint channel shares between fill and stroke. The
 * bytes are built here (flatbuffers.js), base64-encoded onto the node's
 * `multiPaint` string prop by the react layer, and memcpy'd verbatim by the
 * shadow nodes into a SetMultiPaint command; the renderer loops the passes
 * instead of the fixed fill+stroke double pass.
 *
 * Input is the already-resolved numeric form (packed colors, enum bytes,
 * raw Gradient/Filter buffers from this package's builders) — no string
 * parsing happens here.
 */

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { MultiPaintList } from "./generated/skityrt/multi-paint-list.js";
import { PaintPass } from "./generated/skityrt/paint-pass.js";
import { PaintSlot } from "./generated/skityrt/paint-slot.js";

/** Image shader description for one pass (mirrors SetPaint's image fields). */
export interface PaintPassImage {
  /** ImageStore key + platform loader request; `""` clears the slot. */
  uri: string;
  fit: number;
  tx: number;
  ty: number;
  /** `[x, y, w, h]`; omit for identity (1:1 tiling at intrinsic size). */
  rect?: number[];
}

/**
 * One drawing pass. Every field is optional per the FlatBuffer defaults; a
 * pass with no color/gradient/image is an inactive pass (draws nothing).
 */
export interface PaintPassSpec {
  style: "fill" | "stroke";
  /** Packed `0xAARRGGBB`. */
  color?: number;
  /** Raw Gradient bytes (this package's `build*Gradient` output). */
  gradient?: ArrayBuffer;
  image?: PaintPassImage;
  strokeWidth?: number;
  strokeCap?: number;
  strokeJoin?: number;
  strokeMiter?: number;
  fillRule?: number;
  /** Dash intervals in px (already normalized to an even count). */
  dash?: number[];
  dashOffset?: number;
  opacity?: number;
  /** skityrt::BlendMode byte. */
  blendMode?: number;
  /** Raw Filter bytes for the pass's color/image/mask filter slots. */
  colorFilter?: ArrayBuffer;
  imageFilter?: ArrayBuffer;
  maskFilter?: ArrayBuffer;
}

const STYLE_SLOT = { fill: PaintSlot.FILL, stroke: PaintSlot.STROKE } as const;
const PASS_TYPE = { color: 1, gradient: 2, image: 3 } as const;

function ubyteVector(builder: flatbuffers.Builder, bytes: ArrayBuffer | undefined): number {
  if (bytes === undefined || bytes.byteLength === 0) return 0;
  return builder.createByteVector(new Uint8Array(bytes));
}

/**
 * Append one spec as a leaf PaintPass table and return its offset. Children
 * (vectors/strings) are created first — flatbuffers requires children before
 * parents.
 */
function passOffset(builder: flatbuffers.Builder, spec: PaintPassSpec): flatbuffers.Offset {
  const style = STYLE_SLOT[spec.style];
  const type =
    spec.image !== undefined
      ? PASS_TYPE.image
      : spec.gradient !== undefined
        ? PASS_TYPE.gradient
        : spec.color !== undefined
          ? PASS_TYPE.color
          : 0;

  const gradientOff = ubyteVector(builder, spec.gradient);
  const colorFilterOff = ubyteVector(builder, spec.colorFilter);
  const imageFilterOff = ubyteVector(builder, spec.imageFilter);
  const maskFilterOff = ubyteVector(builder, spec.maskFilter);
  const dashOff =
    spec.dash !== undefined && spec.dash.length > 0
      ? PaintPass.createStrokeDashVector(builder, spec.dash)
      : 0;
  const rectOff =
    spec.image?.rect !== undefined && spec.image.rect.length >= 4
      ? PaintPass.createImageRectVector(builder, spec.image.rect)
      : 0;
  const uriOff = spec.image?.uri === undefined ? 0 : builder.createString(spec.image.uri);

  return PaintPass.createPaintPass(
    builder,
    style,
    type,
    spec.color ?? 0,
    gradientOff,
    uriOff,
    spec.image?.fit ?? 0,
    spec.image?.tx ?? 0,
    spec.image?.ty ?? 0,
    rectOff,
    spec.strokeWidth ?? 1.0,
    spec.strokeCap ?? 0,
    spec.strokeJoin ?? 0,
    spec.strokeMiter ?? 4.0,
    spec.fillRule ?? 0,
    dashOff,
    spec.dashOffset ?? 0,
    spec.opacity ?? 1.0,
    spec.blendMode ?? 3, // SRC_OVER
    colorFilterOff,
    imageFilterOff,
    maskFilterOff,
  );
}

/**
 * Serialize passes into one finished MultiPaintList FlatBuffer (declaration
 * order preserved — the renderer draws them in order). `null` when the list
 * is empty (the react layer omits-clears the prop instead).
 *
 * @example
 * buildMultiPaint([
 *   { style: "fill", color: 0xff112233 },
 *   { style: "stroke", color: 0xffffffff, strokeWidth: 2, opacity: 0.5 },
 * ]);
 */
export function buildMultiPaint(passes: PaintPassSpec[]): ArrayBuffer | null {
  if (passes.length === 0) return null;
  const builder = new flatbuffers.Builder(256);
  const offs = passes.map((p) => passOffset(builder, p));
  const vec = MultiPaintList.createPassesVector(builder, offs);
  MultiPaintList.startMultiPaintList(builder);
  MultiPaintList.addPasses(builder, vec);
  builder.finish(MultiPaintList.endMultiPaintList(builder));
  return builder.asUint8Array().slice().buffer;
}
