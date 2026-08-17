// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Type declarations for the skity intrinsic elements (<skity-canvas>,
// <skity-rect>, ...). No React component wrappers are provided — consumers use
// the intrinsic tags directly. Importing this module (or `@lynx-skity/native`)
// augments `@lynx-js/types` IntrinsicElements so the tags are accepted in JSX.
//
// The native side never parses strings. Variable-length fields (path d,
// transform) are pre-serialized FlatBuffer bytes from @lynx-skity/graphics
// (PathCommandList / TransformOpList); enums are numbers already mapped to
// skityrt bytes. See RENDER_ARCHITECTURE.md §3/§5.
import type { StandardProps } from "@lynx-js/types";

// ---- Props (numeric colors, numeric geometry) ----

export interface SkityPaintProps {
  /** Fill color, 0xAARRGGBB. Omit for no fill. */
  fill?: number;
  /** Stroke color, 0xAARRGGBB. Omit for no stroke. */
  stroke?: number;
  strokeWidth?: number;
  /** LineCap byte (BUTT=0, ROUND=1, SQUARE=2) from @lynx-skity/graphics. */
  strokeCap?: number;
  /** LineJoin byte (MITER=0, ROUND=1, BEVEL=2) from @lynx-skity/graphics. */
  strokeJoin?: number;
  strokeMiter?: number;
  /** FillRule byte (NONZERO=0, EVENODD=1) from @lynx-skity/graphics. */
  fillRule?: number;
  opacity?: number;
  /** Base64-encoded TransformOpList bytes (@lynx-skity/graphics); native decodes + memcpys. */
  transform?: string;
  /** Base64-encoded Gradient bytes (@lynx-skity/graphics); the fill paint's shader. */
  fillGradient?: string;
  /** Base64-encoded Gradient bytes; the stroke paint's shader. */
  strokeGradient?: string;
  /**
   * Base64-encoded little-endian float32 dash intervals `[on, off, ...]` (even
   * count, positive sum). Empty string clears the pattern (solid stroke).
   */
  strokeDash?: string;
  /** Phase offset into the dash pattern (px). */
  strokeDashOffset?: number;
  /**
   * Base64-encoded Filter bytes (@lynx-skity/graphics) — the paint's filter
   * slots (fill/stroke × color/image/mask). Native decodes + memcpys, then
   * builds skity filter objects at paint construction. Empty string clears
   * the slot.
   */
  fillColorFilter?: string;
  strokeColorFilter?: string;
  fillImageFilter?: string;
  strokeImageFilter?: string;
  fillMaskFilter?: string;
  strokeMaskFilter?: string;
  /** BlendMode byte (skityrt::BlendMode == skity::BlendMode order); shared by
   *  the fill and stroke paints. */
  blendMode?: number;
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
  /** Base64-encoded PathCommandList bytes (@lynx-skity/graphics); native decodes + memcpys. */
  d?: string;
  /**
   * Base64-encoded PathOpList bytes (@lynx-skity/graphics `Path2D.op` — a lazy
   * boolean composition); native decodes + memcpys, then evaluates the ops at
   * render time (skity PathOp::Execute left fold). An empty payload clears it
   * — the node falls back to `d`.
   */
  op?: string;
  /** Path trim start, normalized [0,1]. */
  pathStart?: number;
  /** Path trim end, normalized [0,1]. */
  pathEnd?: number;
}
export interface SkityPolylineProps extends SkityCommonProps {
  /** Base64-encoded little-endian float32 vertices `[x0,y0,x1,y1,...]`
   *  (@lynx-skity/graphics `floatsToBase64`); native decodes + memcpys. Empty
   *  string clears the vertices. */
  points?: string;
  /** Path trim start, normalized [0,1]. */
  pathStart?: number;
  /** Path trim end, normalized [0,1]. */
  pathEnd?: number;
}
/** Same props as polyline — the closed shape is implied by the tag name. */
export type SkityPolygonProps = SkityPolylineProps;
export interface SkityGroupProps extends SkityCommonProps {
  /** Base64-encoded ClipList bytes (@lynx-skity/graphics); the group's clip
   *  sequence, applied after the transform, before the subtree. Omit = no clip. */
  clip?: string;
}
export interface SkityImageProps extends SkityCommonProps {
  /** Source uri (http(s) URL or data URI) — doubles as the ImageStore key.
   *  Setting it also fires the platform image load (async; the node stays
   *  blank until pixels land, then shows up on the next draw). Empty string
   *  clears the source. */
  image?: string;
  /** BoxFit byte (skityrt::BoxFit, command_batch.fbs order); resolved against
   *  the bitmap's intrinsic size at render time. Default 1 = CONTAIN. */
  fit?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// ---- Intrinsic element type declarations ----

declare module "@lynx-js/types" {
  interface IntrinsicElements {
    "skity-canvas": SkityCanvasProps;
    "skity-rect": SkityRectProps;
    "skity-circle": SkityCircleProps;
    "skity-ellipse": SkityEllipseProps;
    "skity-line": SkityLineProps;
    "skity-path": SkityPathProps;
    "skity-polyline": SkityPolylineProps;
    "skity-polygon": SkityPolygonProps;
    "skity-group": SkityGroupProps;
    "skity-image": SkityImageProps;
  }
}
