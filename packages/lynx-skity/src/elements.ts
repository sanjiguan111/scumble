// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Type declarations for the skity intrinsic elements (<skity-canvas>,
// <skity-rect>, ...). No React component wrappers are provided — consumers use
// the intrinsic tags directly. Importing this module (or `lynx-skity`)
// augments `@lynx-js/types` IntrinsicElements so the tags are accepted in JSX.
import type { StandardProps } from "@lynx-js/types";

// ---- Props (react-native-skia-style: numeric colors, numeric geometry) ----

export interface SkityPaintProps {
  /** Fill color, 0xAARRGGBB. Omit for no fill. */
  fill?: number;
  /** Stroke color, 0xAARRGGBB. Omit for no stroke. */
  stroke?: number;
  strokeWidth?: number;
  strokeCap?: "butt" | "round" | "square";
  strokeJoin?: "miter" | "round" | "bevel";
  strokeMiter?: number;
  fillRule?: "nonzero" | "evenodd";
  opacity?: number;
  /** CSS/SVG-style transform, e.g. "translate(10,10) scale(2) rotate(45)". */
  transform?: string;
}

export interface SkityCommonProps extends StandardProps, SkityPaintProps {}

export interface SkityCanvasProps extends SkityCommonProps {}
export interface SkityRectProps extends SkityCommonProps {
  x?: number;
  y?: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}
export interface SkityCircleProps extends SkityCommonProps {
  cx: number;
  cy: number;
  r: number;
}
export interface SkityEllipseProps extends SkityCommonProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface SkityLineProps extends SkityCommonProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface SkityPathProps extends SkityCommonProps {
  /** SVG path data, e.g. "M10 10 L90 90 Z". MVP supports M/L/C/Q/Z. */
  d: string;
}
export interface SkityGroupProps extends SkityCommonProps {}

// ---- Intrinsic element type declarations ----

declare module "@lynx-js/types" {
  interface IntrinsicElements {
    "skity-canvas": SkityCanvasProps;
    "skity-rect": SkityRectProps;
    "skity-circle": SkityCircleProps;
    "skity-ellipse": SkityEllipseProps;
    "skity-line": SkityLineProps;
    "skity-path": SkityPathProps;
    "skity-group": SkityGroupProps;
  }
}
