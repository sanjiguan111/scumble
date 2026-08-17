// Licensed under the Apache License Version 2.0 that may not be used except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Paint filter specs → a nested FlatBuffer (Filter) carried as bytes.
 *
 * Same wire contract as path/transform/gradient (RENDER_ARCHITECTURE.md §5):
 * the bytes are built here in JS with flatbuffers.js, base64-encoded onto the
 * paint's `*Filter` string props, and memcpy'd verbatim by the shadow nodes
 * into a SetPaintFilter command. skity turns them into filter objects when
 * the paint is constructed (MakeFillPaint/MakeStrokePaint) and the HW canvas
 * applies them as filter passes (mask → image → color, per
 * hw_filters.cc ConvertPaintToHWFilter).
 *
 * Scope note: only the kinds skity's HW backend implements are modeled — no
 * morphology (Dilate/Erode are absent from the hw switch), no Offset /
 * DisplacementMap / runtime shaders.
 */

import * as flatbuffers from "./generated/flatbuffers/flatbuffers.js";
import { Filter } from "./generated/skityrt/filter.js";
import { FilterKind } from "./generated/skityrt/filter-kind.js";
import { BlurStyle } from "./generated/skityrt/blur-style.js";
import { parseBlendMode } from "./enum.js";
import { parseColor } from "./color.js";
import type { BlendModeLiteral } from "./enum.js";
import type { Color } from "./color.js";

/** Mask blur styles (skity::BlurStyle — "how the blur treats the inside"). */
export type MaskBlurStyle = "normal" | "solid" | "outer" | "inner";

// skity::BlurStyle starts at 1 (kNormal..kInner) — NOT Skia's 0-based order.
const BLUR_STYLE = {
  normal: BlurStyle.NORMAL,
  solid: BlurStyle.SOLID,
  outer: BlurStyle.OUTER,
  inner: BlurStyle.INNER,
} as const;

/**
 * One paint filter. `blur`/`dropShadow` are image filters (post-render
 * passes), `colorMatrix`/`colorBlend` are color filters (per-pixel color
 * math), `maskBlur` is a mask filter (alpha-mask feathering).
 */
export type FilterSpec =
  | { kind: "blur"; blur: number | { x: number; y: number } }
  | { kind: "dropShadow"; dx: number; dy: number; blur: number; color: Color }
  | { kind: "colorMatrix"; matrix: number[] }
  | { kind: "colorBlend"; color: Color; mode: BlendModeLiteral }
  | { kind: "maskBlur"; blur: number; style?: MaskBlurStyle };

/** True when the spec survives normalization (an invalid matrix is dropped). */
function isUsable(spec: FilterSpec): boolean {
  if (spec.kind === "colorMatrix") {
    return spec.matrix.length === 20 && spec.matrix.every(Number.isFinite);
  }
  return true;
}

/**
 * Append one spec as a leaf Filter table to the builder and return its
 * offset. The table's own sub-vectors (the colorMatrix) are created first —
 * flatbuffers requires children before parents.
 */
function leafOffset(builder: flatbuffers.Builder, spec: FilterSpec): flatbuffers.Offset {
  let kind = FilterKind.IMAGE_BLUR;
  let fx = 0,
    fy = 0,
    fz = 0;
  let color = 0;
  let mode = 0;
  let style = BlurStyle.NORMAL;
  let matrixOff = 0;
  switch (spec.kind) {
    case "blur": {
      const r = typeof spec.blur === "number" ? { x: spec.blur, y: spec.blur } : spec.blur;
      kind = FilterKind.IMAGE_BLUR;
      fx = r.x;
      fy = r.y;
      break;
    }
    case "dropShadow":
      kind = FilterKind.IMAGE_DROP_SHADOW;
      fx = spec.dx;
      fy = spec.dy;
      fz = spec.blur;
      color = parseColor(spec.color);
      break;
    case "colorMatrix":
      kind = FilterKind.COLOR_MATRIX;
      matrixOff = Filter.createMatrixVector(builder, spec.matrix);
      break;
    case "colorBlend":
      kind = FilterKind.COLOR_BLEND;
      color = parseColor(spec.color);
      mode = parseBlendMode(spec.mode);
      break;
    case "maskBlur":
      kind = FilterKind.MASK_BLUR;
      fx = spec.blur;
      style = BLUR_STYLE[spec.style ?? "normal"];
      break;
  }
  return Filter.createFilter(builder, kind, fx, fy, fz, color, mode, style, matrixOff, 0);
}

/**
 * Serialize specs into one finished Filter FlatBuffer. A single spec becomes
 * that filter directly; several compose — declaration order applies first
 * (`[0]` innermost, each later declaration wrapping the previous, i.e.
 * `ImageFilters::Compose(outer, inner)` with the *later* one outer). Specs
 * that don't survive normalization are dropped; `null` when none remain.
 */
function buildFilter(specs: FilterSpec[]): ArrayBuffer | null {
  const usable = specs.filter(isUsable);
  if (usable.length === 0) return null;
  const builder = new flatbuffers.Builder(128);
  const offs = usable.map((s) => leafOffset(builder, s));
  let root: flatbuffers.Offset;
  if (offs.length === 1) {
    root = offs[0]!;
  } else {
    const children = Filter.createChildrenVector(builder, offs);
    root = Filter.createFilter(
      builder,
      FilterKind.IMAGE_COMPOSE,
      0,
      0,
      0,
      0,
      0,
      BlurStyle.NORMAL,
      0,
      children,
    );
  }
  builder.finish(root);
  return builder.asUint8Array().slice().buffer;
}

/**
 * Serialize the image-filter specs (blur / dropShadow) for one paint slot.
 * Returns `null` when there are none (omit the prop).
 *
 * @example
 * buildImageFilter([{ kind: "blur", blur: 4 }]);
 * buildImageFilter([{ kind: "blur", blur: 2 }, { kind: "dropShadow", dx: 0, dy: 8, blur: 6, color: "#0003" }]);
 */
export function buildImageFilter(specs: FilterSpec[]): ArrayBuffer | null {
  return buildFilter(specs.filter((s) => s.kind === "blur" || s.kind === "dropShadow"));
}

/**
 * Serialize the color-filter specs (colorMatrix / colorBlend) for one paint
 * slot; several compose in declaration order. Returns `null` when none.
 *
 * @example
 * buildColorFilter([{ kind: "colorMatrix", matrix: GRAYSCALE_MATRIX }]);
 */
export function buildColorFilter(specs: FilterSpec[]): ArrayBuffer | null {
  return buildFilter(specs.filter((s) => s.kind === "colorMatrix" || s.kind === "colorBlend"));
}

/**
 * Serialize the mask-filter spec (maskBlur) for one paint slot. skity's
 * MaskFilter has no compose — only the first usable spec is taken. Returns
 * `null` when there is none.
 *
 * @example
 * buildMaskFilter([{ kind: "maskBlur", blur: 8, style: "normal" }]);
 */
export function buildMaskFilter(specs: FilterSpec[]): ArrayBuffer | null {
  const first = specs.find((s) => s.kind === "maskBlur" && isUsable(s));
  return first === undefined ? null : buildFilter([first]);
}
