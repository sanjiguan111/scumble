// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Friendly API surface types for @scumble/react. These are the
// "friendly" props users write; the component layer normalizes them into the
// numeric/string values the skity intrinsic tags (<scumble-*>) consume.
//
// Color parsing is delegated to @scumble/graphics (parseColor); this package
// does not reinvent it.

import type { ReactElement, ReactNode } from "@lynx-js/react";
import type { StandardProps } from "@lynx-js/types";

export type { Color } from "@scumble/graphics";

/** Fill or stroke. Defaults to "fill" at the component layer. */
export type PaintStyle = "fill" | "stroke";

export type StrokeCap = "butt" | "round" | "square";

export type StrokeJoin = "miter" | "round" | "bevel";

/** The parser also accepts the hyphenated "even-odd"; native uses "evenodd". */
export type FillRule = "nonzero" | "even-odd";

// BlendMode mirrors @scumble/graphics' BlendModeLiteral (Skia/skity's 28
// modes, kebab-case); parseBlendMode maps it to the skityrt byte.
export type BlendMode = import("@scumble/graphics").BlendModeLiteral;

/**
 * Paint + compositing attributes every shape (and `Canvas` / `Group`) may carry.
 *
 * `color` is resolved with `@scumble/graphics`'s `parseColor` and routed to
 * the native `fill` or `stroke` prop according to `style` (default `"fill"`).
 * The stroke attributes apply only when `style === "stroke"`.
 */
export interface GraphicProps {
  /**
   * Fill or stroke color — any CSS color string (`"red"` / `"#fff"` /
   * `"rgb(..)"`), a packed `0xAARRGGBB` number, an `{r,g,b,a?}` object, or an
   * `[r,g,b,a?]` tuple. Omit for a transparent (no-op) shape.
   */
  color?: import("@scumble/graphics").Color;
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
  /**
   * Transform applied to this node's own drawing (shapes) and its whole
   * subtree (groups) — standard 2D scene-graph semantics: nested transforms
   * CASCADE (each node's matrix pre-multiplies onto the inherited one, inside
   * the canvas `viewPort` matrix). A single op object, a 4×4 column-major
   * matrix, or an array of ops composed left-to-right
   * (`[translate, rotate]` = translate first, then rotate). See
   * {@link TransformProp}.
   */
  transform?: TransformProp;
  /**
   * Declarative native animations — one track per property, many tracks per
   * node (`{ property, from, to, duration, easing, loop… }`). The tracks ride
   * the command stream once; the render thread interpolates them per vsync
   * (zero JS work per frame — ANIMATION_DESIGN.md). `null`/`false` entries in
   * an array are filtered; an EMPTY array (or `null`) CLEARS the node's
   * animations.
   */
  animate?: AnimationProp;
  /** Child shaders (e.g. `<LinearGradient>`) and `<Paint>` overrides consumed
   * by the shape's paint. */
  children?: ReactNode;
}

/** One animation track spec (see {@link GraphicProps.animate}). */
export type AnimationSpec = import("@scumble/graphics").AnimationTrackSpec;
/** A single track, or several (with `null`/`false` holes filtered out). */
export type AnimationProp = AnimationSpec | (AnimationSpec | null | false)[] | null;

/** A 2D point — the shape returned by {@link vec}. */
export type Vec = { x: number; y: number };

/**
 * Props for {@link LinearGradient}. `start`/`end` are **absolute user-space
 * pixels** (not 0–1 normalized) — the same coordinate space the painted
 * shape uses.
 */
export interface LinearGradientProps {
  start: import("@scumble/graphics").Point;
  end: import("@scumble/graphics").Point;
  colors: import("@scumble/graphics").Color[];
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
  fit?: import("@scumble/graphics").Fit;
  /** Destination rect in user space. Omit for 1:1 tiling at the bitmap's intrinsic size. */
  rect?: { x?: number; y?: number; width: number; height: number };
  /** Horizontal tiling outside the fitted area. Defaults to `"clamp"`. */
  tx?: import("@scumble/graphics").TileMode;
  /** Vertical tiling outside the fitted area. Defaults to `"clamp"`. */
  ty?: import("@scumble/graphics").TileMode;
}

/**
 * Props for {@link TextSpan} — one styled run of source text inside a
 * {@link Paragraph}. A data-only declarative child (like the shaders); the
 * parent collects these props and serializes them into its `spans` payload.
 * Fields left unset fall back to the parent `<Paragraph>`'s defaults.
 */
export interface TextSpanProps {
  /** The span's text as a prop (may be empty). Alternative to JSX children —
   *  `<TextSpan text="hi" />` ≡ `<TextSpan>hi</TextSpan>`; the prop wins when
   *  both are given. */
  text?: string;
  /** The span's text as JSX children (`<TextSpan>hi</TextSpan>`); string
   *  content is trimmed (JSX indentation whitespace is not meaningful).
   *  Only plain text is collected — nested elements are ignored. */
  children?: string | number | ReadonlyArray<string | number>;
  /** Font family; unset = the paragraph's default, then the platform default.
   *  May instead be a font URI: `data:...;base64,...` (inline ttf/otf,
   *  decoded synchronously, process-cached) or any schemed URI — `http(s)`,
   *  `file`, host schemes (loaded asynchronously by the platform font
   *  loader, host-injectable; the paragraph first lays out with the default
   *  font and re-lays out when the bytes arrive). A broken payload is a
   *  sticky fallback to the default font. One file = one style (no
   *  weight/italic variants from a single URI). */
  fontFamily?: string;
  /** Font size in px. Unset = the paragraph's default (then 14). */
  fontSize?: number;
  /** CSS-style weight 100–900. Unset = the paragraph's default (then 400). */
  fontWeight?: number;
  italic?: boolean;
  /** Span color. Unset = the paragraph's default (then black). */
  color?: string;
  /** Extra letter spacing in px. */
  letterSpacing?: number;
  /** Text decoration: `"underline"`, `"overline"`, `"line-through"` (a.k.a.
   *  strikethrough), an array of those, or a numeric bitmask (1/2/4,
   *  combinable — RN-Skia's `TextDecoration`). The layout backend resolves
   *  each set bit into a line over this span's slice of each laid-out line. */
  decoration?: import("@scumble/graphics").TextDecorationProp;
  /** Decoration stroke color. Unset = the paragraph's default, then the text
   *  color. */
  decorationColor?: string;
  /** Decoration thickness in ABSOLUTE px (deliberate deviation from RN-Skia's
   *  multiplier). Unset/0 = the font's metric thickness. */
  decorationThickness?: number;
  /** Decoration stroke style: `"solid"` (default), `"double"`, `"dotted"`,
   *  `"dashed"`, `"wavy"`. Applies to every set {@link decoration} bit. */
  decorationStyle?: import("@scumble/graphics").TextDecorationStyleName;
}

/** Line/box details delivered by the async `onLayout` event of {@link Paragraph}. */
export interface ParagraphLayoutDetail {
  /** Laid-out content height in px. */
  height: number;
  /** Number of laid-out lines. */
  lineCount: number;
}

/**
 * Props for {@link Paragraph} — width-constrained rich text, laid out
 * natively (CoreText on iOS, HarfBuzz + a CJK-aware line breaker on Android;
 * see TEXT_PARAGRAPH_DESIGN.md). Layout runs in the TASM measure pass; the
 * measured height is available asynchronously via `onLayout`.
 */
export interface ParagraphProps extends GraphicProps {
  /** Left edge x (dp). Defaults to 0. */
  x?: number;
  /** Top edge y (dp). Defaults to 0. */
  y?: number;
  /** Layout width constraint (dp). Required — line breaking needs it. */
  width: number;
  /** Line alignment. Defaults to `"left"`. */
  textAlign?: "left" | "center" | "right";
  /** Base writing direction for bidi (UAX #9) reordering. `"auto"` picks the
   *  first strong directional character (LTR when there is none). Defaults to
   *  `"ltr"`. `textAlign` stays physical — left/right always mean the screen
   *  edges, regardless of direction. */
  direction?: "ltr" | "rtl" | "auto";
  /** Line-height multiplier (1 = font default). Defaults to 1. */
  lineHeight?: number;
  /** Maximum lines; 0 = unlimited. Overflow is ellipsized when set. */
  maxLines?: number;
  /** Default span style — spans override per field. `fontFamily` may be a
   *  font URI (inline `data:` or schemed remote/local — see
   *  TextSpanProps.fontFamily). */
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  color?: string;
  letterSpacing?: number;
  /** Default span decoration — see TextSpanProps.decoration. */
  decoration?: import("@scumble/graphics").TextDecorationProp;
  decorationColor?: string;
  /** Default decoration thickness (absolute px) — see TextSpanProps. */
  decorationThickness?: number;
  decorationStyle?: import("@scumble/graphics").TextDecorationStyleName;
  /** Async layout details (height/lineCount) — fires after each re-layout. */
  onLayout?: (detail: ParagraphLayoutDetail) => void;
}

/**
 * Props for {@link RadialGradient} — a center + radius radial gradient (a
 * focal/two-circle gradient is a separate
 * {@link TwoPointConicalGradient}). `c`/`r` are **absolute user-space pixels**.
 */
export interface RadialGradientProps {
  /** Center of the circle (absolute user-space px). */
  c: import("@scumble/graphics").Point;
  /** Circle radius in px; must be positive. */
  r: number;
  colors: import("@scumble/graphics").Color[];
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
  c: import("@scumble/graphics").Point;
  /** Start angle in degrees. Defaults to 0. */
  start?: number;
  /** End angle in degrees. Defaults to 360. */
  end?: number;
  colors: import("@scumble/graphics").Color[];
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
  start: import("@scumble/graphics").Point;
  /** Start circle radius in px; must be ≥ 0. */
  startR: number;
  /** Center of the end circle (absolute user-space px). */
  end: import("@scumble/graphics").Point;
  /** End circle radius in px; must be positive. */
  endR: number;
  colors: import("@scumble/graphics").Color[];
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
  color?: import("@scumble/graphics").Color;
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

/** A 4×4 column-major matrix — 16 numbers, m[col*4 + row]; the 2D affine
 *  part is m0,m1,m4,m5,m12,m13. Left loose (not a fixed-length tuple) so a
 *  plain `const m = [1,0,0,0, …]` literal assigns without a cast. */
export type Matrix4 = number[];

export type Transform = TranslateProps | ScaleProps | RotateProps | Matrix4;

/**
 * A `transform` prop value: a single {@link Transform} op (or 4×4
 * column-major matrix), or an array of ops composed left-to-right (Skia
 * canvas semantics — `[translate, rotate]` translates first, then rotates).
 * A matrix inside an array composes like any other op.
 */
export type TransformProp = Transform | Transform[];

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
  path: string | import("@scumble/graphics").Path2D;
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
  readonly __kind: "scumble-image";
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
  fit?: import("@scumble/graphics").Fit;
  /**
   * How texels are sampled when the bitmap is scaled. Defaults to
   * `{ filter: "linear", mipmap: "none" }`. `cubic` is transported but not
   * yet consumed by the released skity build — it takes effect once a
   * skity-native with CubicResampler ships (non-zero B/C then replaces
   * `filter`, Skia semantics).
   */
  sampling?: import("@scumble/graphics").ImageSamplingOptions;
}

/**
 * The value of {@link GroupProps.layer} (RN-Skia `<Group layer>`). `true`
 * composites the subtree offscreen with no effects; a {@link Paint} element
 * additionally applies its **filter children**
 * ({@link Blur}/{@link DropShadow}/{@link ColorMatrix}/{@link ColorBlend}/
 * {@link MaskBlur}) to that composite — the whole subtree rasterizes first,
 * then the effects run on the raster (gooey/liquid territory). The `<Paint>`'s
 * other props are ignored; the layer's alpha is the Group's own `opacity`.
 */
export type GroupLayer = boolean | ReactElement<PaintProps>;

export interface GroupProps extends GraphicProps {
  children?: ReactNode;
  /**
   * Group-level offscreen composite (RN-Skia `layer` semantics) — the ONLY
   * entrance to group-level effects. Filter children placed directly under
   * the Group keep their per-shape inheritance semantics (each descendant
   * applies them to its own drawing — a different, also valid behavior).
   * Set to `false` to clear explicitly; simply removing the prop leaves the
   * native layer state untouched (prop removal fires the setters with null,
   * which is a no-op).
   *
   * @example
   * // gooey: blur → alpha threshold → soften, applied to the composited subtree
   * <Group layer={<Paint><Blur blur={12} /><ColorMatrix matrix={GOOEY} /><Blur blur={2} /></Paint>}>
   *   <Circle cx={40} cy={60} radius={26} color="#ec4899" />
   *   <Circle cx={80} cy={60} radius={26} color="#ec4899" />
   * </Group>
   */
  layer?: GroupLayer;
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
  color: import("@scumble/graphics").Color;
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
  color: import("@scumble/graphics").Color;
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
  path: string | import("@scumble/graphics").Path2D;
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
  /**
   * Declarative native animations on the canvas ROOT node (whole-canvas
   * transform/opacity). Same semantics as {@link GraphicProps.animate}.
   */
  animate?: AnimationProp;
}
