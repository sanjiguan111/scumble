// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Corner-radii normalization shared by the `<RRect>` shape and the
 * `<ClipRRect>` clip: the three authoring forms (number / `{x, y}` / 4-corner
 * array) resolve to the uniform rx/ry the wire has always carried, plus the
 * optional 8-float per-corner vector (skity `RRect::SetRectRadii` order:
 * TL, TR, BR, BL × x, y). Negatives and non-finite values clamp to 0; skity
 * ScaleRadii shrinks over-large radii to fit the rect at draw time.
 */

/** One corner's radii: x = horizontal, y = vertical (logical px). */
export interface CornerRadius {
  x: number;
  y: number;
}

/** [top-left, top-right, bottom-right, bottom-left] — skity RRect corner order. */
export type CornerRadii = [CornerRadius, CornerRadius, CornerRadius, CornerRadius];

/** The resolved wire form: uniform rx/ry always, per-corner vector only when authored. */
export interface ResolvedRadii {
  rx: number;
  ry: number;
  /**
   * 8 floats [tlx, tly, trx, try, brx, bry, blx, bly] when the 4-corner array
   * form was given (all sanitized); `undefined` for the uniform forms.
   */
  cornerRadii?: number[];
}

/** Clamp to a finite non-negative radius (0 for NaN/Infinity/negative). */
function sane(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Resolve the authoring forms of `radii`:
 * - `number` → uniform `{ rx: r, ry: r }`
 * - `{x, y}` → uniform per-axis
 * - 4-corner array → uniform falls back to top-left (rx/ry stay meaningful if
 *   the consumer ignores the vector) + the 8-float `cornerRadii` vector. Any
 *   other array length degrades to uniform-first-entry.
 *
 * @example
 * resolveCornerRadii(16);                          // { rx: 16, ry: 16 }
 * resolveCornerRadii({ x: 10, y: 20 });            // { rx: 10, ry: 20 }
 * resolveCornerRadii([{ x: 8, y: 8 }, { x: 0, y: 0 }, ...]); // + cornerRadii[8]
 */
export function resolveCornerRadii(
  radii: number | CornerRadius | CornerRadius[] | undefined,
): ResolvedRadii {
  if (radii === undefined) return { rx: 0, ry: 0 };
  if (typeof radii === "number") return { rx: sane(radii), ry: sane(radii) };
  if (Array.isArray(radii)) {
    const tl = radii[0] ?? { x: 0, y: 0 };
    const out: ResolvedRadii = { rx: sane(tl.x), ry: sane(tl.y) };
    if (radii.length === 4) {
      out.cornerRadii = radii.flatMap((c) => [sane(c?.x), sane(c?.y)]);
    }
    return out;
  }
  return { rx: sane(radii.x), ry: sane(radii.y) };
}
