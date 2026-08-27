// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Type declarations for the skity intrinsic elements (<scumble-canvas>,
// <scumble-rect>, ...). No React component wrappers are provided — consumers use
// the intrinsic tags directly. Importing this module (or `@scumble/native`)
// augments `@lynx-js/types` IntrinsicElements so the tags are accepted in JSX.
//
// The native side never parses strings. Variable-length fields (path d,
// transform) are pre-serialized FlatBuffer bytes from @scumble/graphics
// (PathCommandList / TransformOpList); enums are numbers already mapped to
// skityrt bytes. See RENDER_ARCHITECTURE.md §3/§5.
import type { StandardProps } from "@lynx-js/types";

// ---- Props (numeric colors, numeric geometry) ----

export interface ScumblePaintProps {
  /** Fill color, 0xAARRGGBB. Omit for no fill. */
  fill?: number;
  /** Stroke color, 0xAARRGGBB. Omit for no stroke. */
  stroke?: number;
  strokeWidth?: number;
  /** LineCap byte (BUTT=0, ROUND=1, SQUARE=2) from @scumble/graphics. */
  strokeCap?: number;
  /** LineJoin byte (MITER=0, ROUND=1, BEVEL=2) from @scumble/graphics. */
  strokeJoin?: number;
  strokeMiter?: number;
  /** FillRule byte (NONZERO=0, EVENODD=1) from @scumble/graphics. */
  fillRule?: number;
  opacity?: number;
  /** Base64-encoded TransformOpList bytes (@scumble/graphics); native decodes + memcpys. */
  transform?: string;
  /** Base64-encoded Gradient bytes (@scumble/graphics); the fill paint's shader. */
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
   * Base64-encoded Filter bytes (@scumble/graphics) — the paint's filter
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
  /** Image shader slots — an image as the paint's texture (the
   *  `<ImageShader>` channel). The uri doubles as the ImageStore key AND the
   *  platform loader request (fired by the setter, like scumble-image's image
   *  prop); empty string clears the slot. */
  fillImageUri?: string;
  strokeImageUri?: string;
  /** BoxFit byte (skityrt::BoxFit); resolved at render time against the
   *  bitmap's intrinsic size. Default 1 = CONTAIN. */
  fillImageFit?: number;
  strokeImageFit?: number;
  /** TileMode bytes (skityrt::TileMode == skity::TileMode order). Default 0 =
   *  CLAMP. */
  fillImageTx?: number;
  fillImageTy?: number;
  strokeImageTx?: number;
  strokeImageTy?: number;
  /** Destination rect as "x,y,w,h" (4 comma-separated floats); omit for
   *  identity — 1:1 tiling at the bitmap's intrinsic size. */
  fillImageRect?: string;
  strokeImageRect?: string;
  /** BlendMode byte (skityrt::BlendMode == skity::BlendMode order); shared by
   *  the fill and stroke paints. */
  blendMode?: number;
  /**
   * Base64-encoded AnimationList bytes (@scumble/graphics) — native
   * animation tracks for this node, interpolated per vsync on the render
   * thread (ANIMATION_DESIGN.md). Empty string clears all animations. (Named
   * animationData, not animation — Lynx's StandardProps reserves `animation`
   * for its own CSS-animation shape.)
   */
  animationData?: string;
  /**
   * JS-minted playback-control address riding the SAME SetAnimation command
   * (ANIMATION_CONTROL_DESIGN.md D1). Stored by the native setter, never
   * dirties on its own. "" = uncontrolled node.
   */
  animationHandle?: string;
}

export interface ScumbleCommonProps extends StandardProps, ScumblePaintProps {}

export interface ScumbleCanvasProps extends ScumbleCommonProps {
  /**
   * `skityAnimationFinish` handler (ANIMATION_CONTROL_DESIGN.md D5): fired on
   * the canvas root when any descendant's (or the canvas's own) tracked
   * animation completes; `event.params.handle` identifies the node. The React
   * wrappers demux this by handle — raw intrinsic consumers read it directly.
   */
  bindscumbleanimationfinish?: (event: { params?: { handle?: string } }) => void;
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
export interface ScumbleRectProps extends ScumbleCommonProps {
  x?: number;
  y?: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}
export interface ScumbleCircleProps extends ScumbleCommonProps {
  cx: number;
  cy: number;
  r: number;
}
export interface ScumbleEllipseProps extends ScumbleCommonProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface ScumbleLineProps extends ScumbleCommonProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ScumblePathProps extends ScumbleCommonProps {
  /** Base64-encoded PathCommandList bytes (@scumble/graphics); native decodes + memcpys. */
  d?: string;
  /**
   * Base64-encoded PathOpList bytes (@scumble/graphics `Path2D.op` — a lazy
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
export interface ScumblePolylineProps extends ScumbleCommonProps {
  /** Base64-encoded little-endian float32 vertices `[x0,y0,x1,y1,...]`
   *  (@scumble/graphics `floatsToBase64`); native decodes + memcpys. Empty
   *  string clears the vertices. */
  points?: string;
  /** Path trim start, normalized [0,1]. */
  pathStart?: number;
  /** Path trim end, normalized [0,1]. */
  pathEnd?: number;
}
/** Same props as polyline — the closed shape is implied by the tag name. */
export type ScumblePolygonProps = ScumblePolylineProps;
export interface ScumbleGroupProps extends ScumbleCommonProps {
  /** Base64-encoded ClipList bytes (@scumble/graphics); the group's clip
   *  sequence, applied after the transform, before the subtree. Omit = no clip. */
  clip?: string;
}
export interface ScumbleImageProps extends ScumbleCommonProps {
  /** Source uri (http(s) URL or data URI) — doubles as the ImageStore key.
   *  Setting it also fires the platform image load (async; the node stays
   *  blank until pixels land, then shows up on the next draw). Empty string
   *  clears the source. */
  image?: string;
  /** BoxFit byte (skityrt::BoxFit, command_batch.fbs order); resolved against
   *  the bitmap's intrinsic size at render time. Default 1 = CONTAIN. */
  fit?: number;
  /** ImageFilterMode byte (skityrt::ImageFilterMode == skity::FilterMode
   *  order). Default 1 = LINEAR. */
  filterMode?: number;
  /** ImageMipmapMode byte (skityrt::ImageMipmapMode == skity::MipmapMode
   *  order). Default 0 = NONE. */
  mipmapMode?: number;
  /** Cubic resampler weights (reserved): transported through the command
   *  batch but not consumed until a skity build with CubicResampler ships. */
  cubicB?: number;
  cubicC?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ScumbleParagraphProps extends ScumbleCommonProps {
  /** Base64-encoded SpanList bytes (@scumble/graphics buildSpanList) —
   *  the layout input: text + span styles only, never glyph data. */
  spans?: string;
  /** Text alignment byte: 0=left, 1=center, 2=right. Default 0. */
  textAlign?: number;
  /** Base writing direction byte: 0=ltr, 1=rtl, 2=auto (first strong). Default 0. */
  direction?: number;
  /** Line-height multiplier. Default 1. */
  lineHeight?: number;
  /** Maximum lines; 0 = unlimited (overflow ellipsized when set). */
  maxLines?: number;
  x?: number;
  y?: number;
  /** Layout width constraint (dp); required for line breaking. */
  width?: number;
  /** Async layout event (Lynx "layout" component event): detail carries
   *  {height, lineCount}. */
  bindlayout?: (e: { type: string; detail: { height: number; lineCount: number } }) => void;
}

// ---- Intrinsic element type declarations ----

declare module "@lynx-js/types" {
  interface IntrinsicElements {
    "scumble-canvas": ScumbleCanvasProps;
    "scumble-rect": ScumbleRectProps;
    "scumble-circle": ScumbleCircleProps;
    "scumble-ellipse": ScumbleEllipseProps;
    "scumble-line": ScumbleLineProps;
    "scumble-path": ScumblePathProps;
    "scumble-polyline": ScumblePolylineProps;
    "scumble-polygon": ScumblePolygonProps;
    "scumble-group": ScumbleGroupProps;
    "scumble-image": ScumbleImageProps;
    "scumble-paragraph": ScumbleParagraphProps;
  }
}
