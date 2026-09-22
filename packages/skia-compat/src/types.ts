// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * RN-Skia-shaped type surface. Values are chosen so a library written against
 * `@shopify/react-native-skia` (Victory Native XL is the porting target — see
 * the package README) typechecks against this package with only its imports
 * rewritten. Where a type is structural (rects, points, matrices), the shape
 * is byte-identical to RN-Skia's; where RN-Skia carries a JSI-backed object
 * (SkPath, SkFont, SkPaint), this package's shim class satisfies the used
 * surface.
 */

/** Anything `parseColor` accepts — for props this shim passes straight through. */
export type Color = string | number;

/** `{x, y}` point — RN-Skia `SkPoint`, also what {@link vec} builds. */
export interface SkPoint {
  x: number;
  y: number;
}

/**
 * 4×4 COLUMN-MAJOR matrix, 16 numbers — RN-Skia's `Matrix4`. scumble's
 * `<Group transform>` accepts the same layout natively (resolveTransform
 * maps m0,m1,m4,m5,m12,m13 to the 2D affine), so transforms pass through
 * untouched.
 */
export type Matrix4 = number[];

/** `[x, y, width, height]` — what {@link rect} / `Skia.XYWHRect` build. */
export type SkRect = readonly number[];

/** One elliptical corner radius of a rounded rect. */
export interface RRectCorner extends SkPoint {}

/**
 * Rounded rect with per-corner elliptical radii — the value Victory's
 * `createRoundedRectPath` returns and `builder.addRRect` consumes.
 */
export interface NonUniformRRect {
  rect: { x: number; y: number; width: number; height: number };
  topLeft?: RRectCorner;
  topRight?: RRectCorner;
  bottomRight?: RRectCorner;
  bottomLeft?: RRectCorner;
}

/** RN-Skia `PaintStyle` — fill/stroke select; values match. */
export enum PaintStyle {
  Fill = 0,
  Stroke = 1,
}

/** RN-Skia `FillType` — winding/even-odd; values match scumble's fillRule byte. */
export enum FillType {
  Winding = 0,
  EvenOdd = 1,
}

/** What a `<Group clip={…}>` accepts — rect, rounded rect, or path. */
export type ClipDef =
  | { rect: SkRect; op?: "difference" | "intersect" }
  | { rrect: NonUniformRRect; op?: "difference" | "intersect" }
  | { path: import("./SkPath.js").SkPath | string; op?: "difference" | "intersect" };

/** RN-Skia's `<DashPathEffect intervals phase>` — carried to scumble `dash`. */
export interface DashPathEffectProps {
  intervals: number[];
  phase?: number;
}

/** Text style subset `ParagraphBuilder.pushStyle` accepts (SkTextStyle-ish). */
export interface SkTextStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: Color;
  letterSpacing?: number;
}

/** Paragraph-level style subset (`SkParagraphStyle`-ish). */
export interface SkParagraphStyle {
  textAlign?: "left" | "center" | "right";
}
