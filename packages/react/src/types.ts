// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// react-native-skity-style API surface for @lynx-skity/react. These are the
// "friendly" props users write; the component layer normalizes them into the
// numeric/string values the skity intrinsic tags (<skity-*>) consume.
//
// Color parsing is delegated to lynx-skity/parsers (parseColor); this package
// does not reinvent it.

import type { ReactNode } from "@lynx-js/react";
import type { StandardProps } from "@lynx-js/types";

export type { Color } from "@lynx-skity/parsers";

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

/** Paint attributes every shape (and Canvas/Group) may carry. */
export interface GraphicProps {
  /** Any CSS color string ("red"/"#fff"/"rgb(..)"), a 0xAARRGGBB number, {r,g,b,a?}, or [r,g,b,a?]. */
  color?: import("@lynx-skity/parsers").Color;
  style?: PaintStyle;
  strokeWidth?: number;
  strokeCap?: StrokeCap;
  strokeJoin?: StrokeJoin;
  strokeMiter?: number;
  opacity?: number;
  /** Accepted but not yet honored natively (caveat). */
  blendMode?: BlendMode;
  /** Accepted for API parity; native z-ordering follows tree order today. */
  zIndex?: number;
}

// ---- transforms (react-native-skity: single object, degrees; or 4x4 matrix) ----

export interface TranslateProps {
  translateX: number;
  translateY: number;
}

export interface ScaleProps {
  scaleX: number;
  scaleY: number;
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
  cx?: number;
  cy?: number;
  radius: number;
}

export interface RectProps extends GraphicProps {
  x?: number;
  y?: number;
  width: number;
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
  path: string | import("@lynx-skity/parsers").Path2D;
  fillRule?: FillRule;
}

export interface GroupProps extends GraphicProps {
  children?: ReactNode;
  transform?: Transform;
  // clip / clipIntersect from react-native-skity are intentionally omitted:
  // native skity-group has no clip today (caveat).
}

export interface CanvasProps {
  children?: ReactNode;
  style?: StandardProps["style"];
  /**
   * Logical viewport (SVG viewBox semantics). Accepted for API parity but NOT
   * yet wired to the native RenderTree.viewport (caveat — TODO Task 3).
   */
  viewPort?: { x?: number; y?: number; width: number; height: number };
}
