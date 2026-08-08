// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Type declarations for the skity intrinsic elements (<skity-canvas>,
// <skity-rect>, ...). No React component wrappers are provided — consumers use
// the intrinsic tags directly. Importing this module (or `lynx-skity`)
// augments `@lynx-js/types` IntrinsicElements so the tags are accepted in JSX.
//
// The native side never parses strings. Variable-length fields (path d,
// transform) are pre-serialized FlatBuffer bytes from @lynx-skity/parsers
// (PathCommandList / TransformOpList); enums are numbers already mapped to
// skityrt bytes. See RENDER_ARCHITECTURE.md §3/§5.
import type { StandardProps } from "@lynx-js/types";

// ---- Props (react-native-skia-style: numeric colors, numeric geometry) ----

export interface SkityPaintProps {
  /** Fill color, 0xAARRGGBB. Omit for no fill. */
  fill?: number;
  /** Stroke color, 0xAARRGGBB. Omit for no stroke. */
  stroke?: number;
  strokeWidth?: number;
  /** LineCap byte (BUTT=0, ROUND=1, SQUARE=2) from @lynx-skity/parsers. */
  strokeCap?: number;
  /** LineJoin byte (MITER=0, ROUND=1, BEVEL=2) from @lynx-skity/parsers. */
  strokeJoin?: number;
  strokeMiter?: number;
  /** FillRule byte (NONZERO=0, EVENODD=1) from @lynx-skity/parsers. */
  fillRule?: number;
  opacity?: number;
  /** Base64-encoded TransformOpList bytes (@lynx-skity/parsers); native decodes + memcpys. */
  transform?: string;
}

export interface SkityCommonProps extends StandardProps, SkityPaintProps {}

export interface SkityCanvasProps extends SkityCommonProps {
  /** Logical viewport x (SVG viewBox). */
  viewportX?: number;
  /** Logical viewport y (SVG viewBox). */
  viewportY?: number;
  /** Logical viewport width (SVG viewBox). When >0 with height, child geometry
   *  is scaled to fit the canvas (preserveAspectRatio defaults to xMidYMid meet). */
  viewportWidth?: number;
  /** Logical viewport height (SVG viewBox). */
  viewportHeight?: number;
}
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
  /** Base64-encoded PathCommandList bytes (@lynx-skity/parsers); native decodes + memcpys. */
  d?: string;
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
