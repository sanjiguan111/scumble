// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Friendly API surface types for @lynx-skity/react. These are the
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

/** The parser also accepts the hyphenated "even-odd"; native uses "evenodd". */
export type FillRule = "nonzero" | "even-odd";

// BlendMode mirrors @lynx-skity/graphics' BlendModeLiteral (Skia/skity's 28
// modes, kebab-case); parseBlendMode maps it to the skityrt byte.
export type BlendMode = import("@lynx-skity/graphics").BlendModeLiteral;

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
  /**
   * Stroke dash intervals in px — `[on, off, on, off, ...]` (Skia-style; an odd
   * array is repeated once to make it even, SVG `stroke-dasharray` semantics).
   * Stroke-only; ignored unless the shape draws a stroke. An invalid pattern
   * (empty / negative values / zero sum) is dropped (solid stroke).
   */
  dash?: number[];
  /** Phase offset into the dash pattern (px). See {@link dash}. */
  dashOffset?: number;
  /**
   * Blend mode (Skia's 28 modes), applied to the shape's fill **and** stroke
   * paints — how it composites onto what's below it. Inheritable from a
   * {@link Group}.
   */
  blendMode?: BlendMode;
  /** z-index. Accepted for parity; native z-ordering follows tree order today. */
  zIndex?: number;
  /** Child shaders (e.g. `<LinearGradient>`) and `<Paint>` overrides consumed
   * by the shape's paint. */
  children?: ReactNode;
}

/** A 2D point — the shape returned by {@link vec}. */
export type Vec = { x: number; y: number };

/**
 * Props for {@link LinearGradient}. `start`/`end` are **absolute user-space
 * pixels** (not 0–1 normalized) — the same coordinate space the painted
 * shape uses.
 */
export interface LinearGradientProps {
  start: import("@lynx-skity/graphics").Point;
  end: import("@lynx-skity/graphics").Point;
  colors: import("@lynx-skity/graphics").Color[];
  positions?: number[];
  mode?: "clamp" | "repeat" | "mirror";
}

/**
 * Props for {@link ImageShader} — an image used as a shape's fill (or stroke)
 * texture. `rect` places the bitmap in user space: with it, `fit` crops the
 * bitmap into the rect (same semantics as `<Image fit>`, resolved at render
 * time against the intrinsic size) and tiling outside the fitted area follows
 * `tx`/`ty`; without it the bitmap tiles 1:1 at its intrinsic size. An empty
 * `image` clears the slot (the shape draws nothing for that paint).
 */
export interface ImageShaderProps {
  /** The bitmap: a `useImage()` handle or a bare uri string. `null`/empty
   *  clears the slot (that paint draws nothing), matching `<Image image>`. */
  image: ImageHandle | string | null;
  /** How the bitmap is inscribed into `rect` (CSS object-fit family). Defaults to `"contain"`; ignored when `rect` is omitted. */
  fit?: import("@lynx-skity/graphics").Fit;
  /** Destination rect in user space. Omit for 1:1 tiling at the bitmap's intrinsic size. */
  rect?: { x?: number; y?: number; width: number; height: number };
  /** Horizontal tiling outside the fitted area. Defaults to `"clamp"`. */
  tx?: import("@lynx-skity/graphics").TileMode;
  /** Vertical tiling outside the fitted area. Defaults to `"clamp"`. */
  ty?: import("@lynx-skity/graphics").TileMode;
}

/**
 * Props for {@link RadialGradient} — a center + radius radial gradient (a
 * focal/two-circle gradient is a separate
 * {@link TwoPointConicalGradient}). `c`/`r` are **absolute user-space pixels**.
 */
export interface RadialGradientProps {
  /** Center of the circle (absolute user-space px). */
  c: import("@lynx-skity/graphics").Point;
  /** Circle radius in px; must be positive. */
  r: number;
  colors: import("@lynx-skity/graphics").Color[];
  positions?: number[];
  mode?: "clamp" | "repeat" | "mirror";
}

/**
 * Props for {@link SweepGradient} — an angular sweep around `c`. `c` is in
 * **absolute user-space pixels**; `start`/`end` are **degrees** (this repo
 * standardizes on degrees, matching `rotate`), mapping to stop offsets 0/1.
 * Defaults 0–360.
 */
export interface SweepGradientProps {
  /** Center of the sweep (absolute user-space px). */
  c: import("@lynx-skity/graphics").Point;
  /** Start angle in degrees. Defaults to 0. */
  start?: number;
  /** End angle in degrees. Defaults to 360. */
  end?: number;
  colors: import("@lynx-skity/graphics").Color[];
  positions?: number[];
  mode?: "clamp" | "repeat" | "mirror";
}

/**
 * Props for {@link TwoPointConicalGradient} — two circles: stop
 * offset 0 sits on the start circle, offset 1 on the end circle. All geometry
 * is **absolute user-space pixels**.
 */
export interface TwoPointConicalGradientProps {
  /** Center of the start (focal) circle (absolute user-space px). */
  start: import("@lynx-skity/graphics").Point;
  /** Start circle radius in px; must be ≥ 0. */
  startR: number;
  /** Center of the end circle (absolute user-space px). */
  end: import("@lynx-skity/graphics").Point;
  /** End circle radius in px; must be positive. */
  endR: number;
  colors: import("@lynx-skity/graphics").Color[];
  positions?: number[];
  mode?: "clamp" | "repeat" | "mirror";
}

/**
 * Props for {@link Paint} — the declarative paint: a data-only child of a
 * shape that overrides the paint properties for its `style`. Shaders placed
 * inside apply to that paint. Native slot limits: one fill paint + one stroke
 * paint per shape max, and `opacity` is not honored (see the {@link Paint}
 * docs).
 */
export interface PaintProps {
  /** Which paint this declaration targets. Defaults to `"fill"`. */
  style?: "fill" | "stroke";
  /** Paint color; overrides the shape's `color` for this style. */
  color?: import("@lynx-skity/graphics").Color;
  /**
   * Blend mode; overrides the shape's `blendMode`. NOTE: natively one blend
   * mode is shared by the fill and stroke paints (a per-paint mode is not
   * transportable today) — the last declaration wins.
   */
  blendMode?: BlendMode;
  /** Stroke width. Stroke-only. */
  strokeWidth?: number;
  /** Stroke cap. Stroke-only. */
  strokeCap?: StrokeCap;
  /** Stroke join. Stroke-only. */
  strokeJoin?: StrokeJoin;
  /** Miter limit. Stroke-only. */
  strokeMiter?: number;
  /** Dash intervals — see {@link GraphicProps.dash}. Stroke-only. */
  dash?: number[];
  /** Phase offset into the dash pattern. See {@link GraphicProps.dashOffset}. */
  dashOffset?: number;
  /** Shader children (e.g. `<LinearGradient>`) applied to this paint. */
  children?: ReactNode;
}

// ---- transforms (single object, degrees; or 4x4 matrix) ----

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
  /** Degrees (not radians). */
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

export interface EllipseProps extends GraphicProps {
  /** Center x (dp). Defaults to 0. */
  cx?: number;
  /** Center y (dp). Defaults to 0. */
  cy?: number;
  /** Horizontal radius (dp). Required. */
  rx: number;
  /** Vertical radius (dp). Required. */
  ry: number;
}

export interface LineProps extends GraphicProps {
  /**
   * Start point x (dp). Defaults to 0. The line's `color` always strokes —
   * a line has no interior to fill — so `style` defaults to `"stroke"` here
   * (unlike other shapes, which default to `"fill"`).
   */
  x1?: number;
  /** Start point y (dp). Defaults to 0. */
  y1?: number;
  /** End point x (dp). Defaults to 0. */
  x2?: number;
  /** End point y (dp). Defaults to 0. */
  y2?: number;
}

/** Coordinate pairs for {@link Polyline}/{@link Polygon}: an SVG `points` string or `{x,y}` pairs. */
export type PointsProp = string | Vec[];

export interface PolylineProps extends GraphicProps {
  /**
   * The vertices, as an SVG `points` string (`"0,0 20,30 50,10"`) or `{x,y}`
   * pairs (e.g. from {@link vec}). Compiled to MoveTo + LineTo×n path commands;
   * like {@link Line}, `style` defaults to `"stroke"` (an open polyline has no
   * interior), pass `style="fill"` to fill it as if closed.
   */
  points: PointsProp;
}

export interface PolygonProps extends GraphicProps {
  /**
   * The vertices, as an SVG `points` string or `{x,y}` pairs — the shape is
   * implicitly closed (a closing segment from the last to the first vertex).
   * Unlike {@link Polyline}, `style` defaults to `"fill"`.
   */
  points: PointsProp;
}

/** How {@link Points} interprets its vertices (Skia `drawPoints` PointMode). */
export type PointsMode = "points" | "lines" | "polygon";

export interface PointsProps extends GraphicProps {
  /** The vertices, as an SVG `points` string or `{x,y}` pairs. */
  points: PointsProp;
  /**
   * `"points"` (default) draws a dot per vertex — the dot's diameter is
   * `strokeWidth` and `strokeCap` defaults to `"round"` (a butt cap would
   * leave a zero-length segment invisible); `"lines"` draws a segment per
   * vertex pair; `"polygon"` strokes an open polyline through all vertices.
   * Stroked by default in every mode.
   */
  mode?: PointsMode;
}

export interface PathProps extends GraphicProps {
  /** SVG path data string, or a Path2D object built command-style. */
  path: string | import("@lynx-skity/graphics").Path2D;
  fillRule?: FillRule;
  /**
   * Trim the start of the path. Normalized path-length fraction in [0,1]
   * (default 0). Applied to both fill
   * and stroke via skity PathMeasure; each contour of a multi-contour path is
   * trimmed independently (Skia trim semantics).
   */
  start?: number;
  /** Trim the end of the path. [0,1] fraction (default 1). See {@link start}. */
  end?: number;
}

/**
 * Opaque handle to an image source. Built by
 * {@link useImage} / `createImageHandle`; the same uri always yields the same
 * reference (`===` stable), so it is safe as a dependency/equality key.
 */
export interface ImageHandle {
  readonly __kind: "skity-image";
  readonly uri: string;
}

export interface ImageProps extends GraphicProps {
  /**
   * The image to draw: a {@link ImageHandle} from `useImage()` or a bare uri
   * string (http(s) URL / data URI). `null`/`undefined` draws nothing. The
   * bitmap loads asynchronously — the node stays blank until pixels land.
   */
  image: ImageHandle | string | null;
  /** Left edge x (dp). Defaults to 0. */
  x?: number;
  /** Top edge y (dp). Defaults to 0. */
  y?: number;
  /** Destination width (dp). Required unless `rect` is given. */
  width?: number;
  /** Destination height (dp). Required unless `rect` is given. */
  height?: number;
  /**
   * Destination rect as one object; takes precedence over the
   * x/y/width/height props. x/y default to 0.
   */
  rect?: { x?: number; y?: number; width: number; height: number };
  /**
   * How the bitmap is inscribed into the destination rect (the
   * CSS object-fit family). Defaults to `"contain"`. Resolved against the
   * bitmap's intrinsic size at render time.
   */
  fit?: import("@lynx-skity/graphics").Fit;
  /**
   * How texels are sampled when the bitmap is scaled. Defaults to
   * `{ filter: "linear", mipmap: "none" }`. `cubic` is transported but not
   * yet consumed by the released skity build — it takes effect once a
   * skity-native with CubicResampler ships (non-zero B/C then replaces
   * `filter`, Skia semantics).
   */
  sampling?: import("@lynx-skity/graphics").ImageSamplingOptions;
}

export interface GroupProps extends GraphicProps {
  children?: ReactNode;
  /**
   * A single translate/scale/rotate object (rotate in degrees) or a 4×4
   * column-major matrix, applied to the subtree. Transforms are **not**
   * inherited across groups — each group's transform applies to its own
   * subtree only (as everywhere else).
   */
  transform?: Transform;
}

// ---- paint filters (declarative children of a shape / <Paint>) ----

/** Blur sigma in px — number → uniform, `{x,y}` → per-axis. */
export type FilterRadius = number | { x: number; y: number };

export interface BlurProps {
  /**
   * Blur sigma (px). Strokes/fills render into a layer first, then the layer
   * blurs — a number blurs uniformly, `{x,y}` per axis.
   */
  blur: FilterRadius;
}

export interface DropShadowProps {
  /** Shadow offset x (px). */
  dx: number;
  /** Shadow offset y (px). */
  dy: number;
  /** Shadow blur sigma (px, uniform). */
  blur: number;
  /** Shadow color. (`inner`/`shadowOnly` variants are not supported.) */
  color: import("@lynx-skity/graphics").Color;
}

export interface ColorMatrixProps {
  /**
   * 20 numbers, row-major 4×5 (Skia layout: R/G/B/A rows + translation
   * column). An invalid matrix (wrong length / non-finite) is dropped.
   */
  matrix: number[];
}

export interface ColorBlendProps {
  /** How the blend color combines with the source color. */
  mode: BlendMode;
  /** The blend color. */
  color: import("@lynx-skity/graphics").Color;
}

/** How a {@link MaskBlur} treats the inside of the mask (Skia BlurStyle). */
export type MaskBlurStyleProp = "normal" | "solid" | "outer" | "inner";

export interface MaskBlurProps {
  /** Feather radius (px). */
  blur: number;
  /** Defaults to `"normal"` (fuzzy inside and outside). */
  style?: MaskBlurStyleProp;
}

// ---- group clip (declarative children of <Group>) ----

/** How a clip shape combines with the clips before it. Defaults to `"intersect"`. */
export type ClipOpProp = "intersect" | "difference";

export interface ClipRectProps {
  /** Defaults to 0. */
  x?: number;
  /** Defaults to 0. */
  y?: number;
  width: number;
  height: number;
  op?: ClipOpProp;
}

export interface ClipRRectProps extends ClipRectProps {
  /** Corner radii. number → uniform; `{x, y}` → per-axis. */
  radii: number | CornerRadius;
}

export interface ClipPathProps {
  /** SVG path data string, or a Path2D object built command-style. */
  path: string | import("@lynx-skity/graphics").Path2D;
  op?: ClipOpProp;
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
