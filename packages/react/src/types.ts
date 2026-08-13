// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// react-native-skity-style API surface for @lynx-skity/react. These are the
// "friendly" props users write; the component layer normalizes them into the
// numeric/string values the skity intrinsic tags (<skity-*>) consume.
//
// Color parsing is delegated to @lynx-skity/graphics (parseColor); this package
// does not reinvent it.

import type { ReactNode } from "@lynx-js/react";
import type { StandardProps } from "@lynx-js/types";

export type { Color } from "@lynx-skity/graphics";

/** Fill or stroke. Defaults to "fill" at the component layer. */
export type PaintStyle = "fill" | "stroke";

export type StrokeCap = "butt" | "round" | "square";

export type StrokeJoin = "miter" | "round" | "bevel";

/** react-native-skity uses the hyphenated "even-odd"; native uses "evenodd". */
export type FillRule = "nonzero" | "even-odd";

// BlendMode is accepted for API parity with react-native-skity but is NOT
// honored by the native renderer today (TODO: Task 3 native slim-down).
export type BlendMode =
  | "clear"
  | "src"
  | "dst"
  | "src-over"
  | "dst-over"
  | "src-in"
  | "dst-in"
  | "src-out"
  | "dst-out"
  | "src-atop"
  | "dst-atop"
  | "xor"
  | "plus"
  | "modulate"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "multiply"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

/**
 * Paint + compositing attributes every shape (and `Canvas` / `Group`) may carry.
 *
 * `color` is resolved with `@lynx-skity/graphics`'s `parseColor` and routed to
 * the native `fill` or `stroke` prop according to `style` (default `"fill"`).
 * The stroke attributes apply only when `style === "stroke"`.
 */
export interface GraphicProps {
  /**
   * Fill or stroke color — any CSS color string (`"red"` / `"#fff"` /
   * `"rgb(..)"`), a packed `0xAARRGGBB` number, an `{r,g,b,a?}` object, or an
   * `[r,g,b,a?]` tuple. Omit for a transparent (no-op) shape.
   */
  color?: import("@lynx-skity/graphics").Color;
  /** Whether `color` fills or strokes the shape. Defaults to `"fill"`. */
  style?: PaintStyle;
  /** Stroke width (dp). Stroke-only. */
  strokeWidth?: number;
  /** Cap style for the open endpoints of a stroke. Stroke-only. */
  strokeCap?: StrokeCap;
  /** Join style for the corners of a stroke. Stroke-only. */
  strokeJoin?: StrokeJoin;
  /** Miter limit for `"miter"` joins. Stroke-only. */
  strokeMiter?: number;
  /** Shape opacity, 0–1 (folded into the paint's color alpha). */
  opacity?: number;
  /** Blend mode. Accepted for API parity but NOT honored natively yet (caveat). */
  blendMode?: BlendMode;
  /** z-index. Accepted for parity; native z-ordering follows tree order today. */
  zIndex?: number;
}

// ---- transforms (react-native-skity: single object, degrees; or 4x4 matrix) ----

export interface TranslateProps {
  /** Defaults to 0. */
  translateX?: number;
  /** Defaults to 0. */
  translateY?: number;
}

export interface ScaleProps {
  /** Defaults to 1 (or scaleY if only that is given). */
  scaleX?: number;
  /** Defaults to scaleX (or 1 if only that is given). */
  scaleY?: number;
}

export interface RotateProps {
  /** Degrees (matches react-native-skity; react-native-skia uses radians). */
  rotate: number;
  /** Pivot x. Native rotate-with-center support pending verification. */
  x?: number;
  /** Pivot y. */
  y?: number;
}

export type Transform = TranslateProps | ScaleProps | RotateProps | number[];

// ---- shape props ----

export interface CircleProps extends GraphicProps {
  /** Center x (dp). Defaults to 0. */
  cx?: number;
  /** Center y (dp). Defaults to 0. */
  cy?: number;
  /** Radius (dp). Required. */
  radius: number;
}

export interface RectProps extends GraphicProps {
  /** Left edge x (dp). Defaults to 0. */
  x?: number;
  /** Top edge y (dp). Defaults to 0. */
  y?: number;
  /** Width (dp). Required. */
  width: number;
  /** Height (dp). Required. */
  height: number;
}

export interface CornerRadius {
  x: number;
  y: number;
}

/** [top-left, top-right, bottom-right, bottom-left]. */
export type CornerRadii = [CornerRadius, CornerRadius, CornerRadius, CornerRadius];

export interface RRectProps extends RectProps {
  /**
   * Corner radii. number → uniform; {x,y} → uniform per-axis; [4 corners] →
   * native only supports uniform rx/ry today, so per-corner uses top-left (caveat).
   */
  radii?: number | CornerRadius | CornerRadii;
}

export interface PathProps extends GraphicProps {
  /** SVG path data string, or a Path2D object built command-style. */
  path: string | import("@lynx-skity/graphics").Path2D;
  fillRule?: FillRule;
}

export interface GroupProps extends GraphicProps {
  children?: ReactNode;
  /** A single translate/scale/rotate object (rotate in degrees) or a 4×4 column-major matrix, applied to the subtree. */
  transform?: Transform;
  // clip / clipIntersect from react-native-skity are intentionally omitted:
  // native skity-group has no clip today (caveat).
}

export interface CanvasProps {
  children?: ReactNode;
  style?: StandardProps["style"];
  /**
   * Logical viewport (SVG `viewBox`). When set, child geometry authored in this
   * logical pixel space is scaled by the renderer to fit the canvas
   * (`preserveAspectRatio = xMidYMid meet`). Omit for 1:1 physical pixels.
   */
  viewPort?: { x?: number; y?: number; width: number; height: number };
}
