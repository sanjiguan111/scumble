// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * @scumble/react — the React component layer for scumble.
 *
 * A declarative canvas API on top of the
 * native skity intrinsic tags (`<scumble-canvas>`, `<scumble-rect>`, …). Components
 * accept friendly values — CSS color strings, paint enums, transform objects,
 * SVG path `d` strings (or a {@link Path2D}) — and normalize them into the
 * numeric / base64-byte props the native tags consume. All string parsing is
 * delegated to `@scumble/graphics`; the native side never parses strings.
 *
 * The intrinsic tags are registered by the `@scumble/native` library — importing
 * `@scumble/native/elements` once augments the JSX `IntrinsicElements` so the tags
 * type-check.
 *
 * @example
 * import { Canvas, Circle, Rect, Path, Group } from "@scumble/react";
 *
 * <Canvas style={{ width: 200, height: 200 }}>
 *   <Rect x={0} y={0} width={100} height={100} color="#ff0000" />
 *   <Circle cx={150} cy={50} radius={30} color="blue" />
 *   <Group transform={{ translateX: 10, translateY: 10 }}>
 *     <Path path="M0 0 L50 50 Z" color="#22c55e" />
 *   </Group>
 * </Canvas>
 */

// Importing @scumble/native/elements augments @lynx-js/types IntrinsicElements with
// the <scumble-*> tags this package renders. Consumers transitively get the types
// via @lynx-js/types once this side-effect import is in the program.
import "@scumble/native/elements";

// ---- containers ----
export { Canvas } from "./Canvas";
export { Group } from "./Group";
// Playback control (invoke lane; ANIMATION_CONTROL_DESIGN.md D6): a plain
// track spec with a minted handle — usable directly as `animate`, with
// `.controller` (pause/play/seekTo/cancel/onFinish) as the imperative surface.
export { createAnimation } from "./internal/animation-control";
export type { AnimationController, ControlledAnimationSpec } from "./internal/animation-control";
// ---- shapes ----
export { Circle } from "./shapes/Circle";
export { Ellipse } from "./shapes/Ellipse";
export { Line } from "./shapes/Line";
export { Rect } from "./shapes/Rect";
export { RRect } from "./shapes/RRect";
export { Polyline } from "./shapes/Polyline";
export { Polygon } from "./shapes/Polygon";
export { Points } from "./shapes/Points";
export { Path } from "./shapes/Path";
// ---- image ----
// <Image> draws a bitmap; useImage resolves a source
// uri into a stable handle. The bitmap loads asynchronously on the platform
// side — the node stays blank until pixels land (no null-phase/onError here).
export { Image } from "./shapes/Image";
export { useImage, createImageHandle } from "./hooks/useImage";
// Path2D (command-style path builder) is re-exported from the graphics core so
// callers can import it from @scumble/react alongside <Path>. Path2D.op
// builds lazy boolean compositions (Skia path ops) consumed by <Path>; the
// PathOpName type names the four operations it accepts.
export { Path2D } from "@scumble/graphics";
export type { PathOpName } from "@scumble/graphics";
// <Image> fit mode union + sampling option types.
export type {
  Fit,
  ImageCubicResampler,
  ImageFilterMode,
  ImageMipmapMode,
  ImageSamplingOptions,
  TileMode,
} from "@scumble/graphics";
// ---- shaders & paints ----
// Gradient shaders are declarative children of a shape: `<Rect><LinearGradient .../></Rect>`. vec() builds the {x,y} points
// they take.
export { LinearGradient } from "./shaders/LinearGradient";
export { RadialGradient } from "./shaders/RadialGradient";
export { SweepGradient } from "./shaders/SweepGradient";
export { TwoPointConicalGradient } from "./shaders/TwoPointConicalGradient";
// ImageShader fills (or strokes) a shape with a bitmap texture — same
// declarative-child pattern, flattening to uri/fit/tx/ty/rect paint props.
export { ImageShader } from "./shaders/ImageShader";
// <Paragraph> lays out rich text natively (CoreText / HarfBuzz); <TextSpan>
// is its data-only styled-text child (same pattern as the shaders).
export { Paragraph } from "./shapes/Paragraph";
export { TextSpan } from "./shapes/TextSpan";
// <Paint> is a declarative paint override child : it
// overrides the fill or stroke paint of its parent shape, and shaders nested
// inside it apply to that paint.
export { Paint } from "./Paint";
// Paint filter components are declarative children of a shape (or <Paint>),
// like shaders: <Blur>/<DropShadow> (image filters), <ColorMatrix>/
// <ColorBlend> (color filters), <MaskBlur> (mask filter). Several of the same
// kind compose in declaration order.
export { Blur, DropShadow, ColorMatrix, ColorBlend, MaskBlur } from "./filters/filters";
// <ClipRect>/<ClipRRect>/<ClipPath> are declarative clip children of <Group>
// : data-only, consumed by the Group into its `clip` prop.
export { ClipRect } from "./clips/ClipRect";
export { ClipRRect } from "./clips/ClipRRect";
export { ClipPath } from "./clips/ClipPath";
export { vec } from "./internal/vec";

export type {
  Color,
  GraphicProps,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  FillRule,
  BlendMode,
  Transform,
  TranslateProps,
  ScaleProps,
  RotateProps,
  CircleProps,
  EllipseProps,
  LineProps,
  RectProps,
  RRectProps,
  CornerRadius,
  CornerRadii,
  PolylineProps,
  PolygonProps,
  PointsProp,
  PointsProps,
  PointsMode,
  PathProps,
  GroupProps,
  ImageHandle,
  ImageProps,
  ClipOpProp,
  ClipRectProps,
  ClipRRectProps,
  ClipPathProps,
  CanvasProps,
  Vec,
  LinearGradientProps,
  RadialGradientProps,
  SweepGradientProps,
  TwoPointConicalGradientProps,
  ImageShaderProps,
  ParagraphProps,
  TextSpanProps,
  ParagraphLayoutDetail,
  PaintProps,
  BlurProps,
  DropShadowProps,
  ColorMatrixProps,
  ColorBlendProps,
  MaskBlurProps,
  MaskBlurStyleProp,
  FilterRadius,
} from "./types";

// Gradients (linear/radial/sweep/two-point-conical) work on BOTH the fill and
// stroke paints: a shader placed directly under a shape targets fill, while a
// shader inside a `<Paint style="stroke">` child targets stroke (the native
// renderer draws fill + stroke as two passes). Per-paint `opacity`/`blendMode`
// and more than one paint per style (multi-pass) are still TODO —
// the command stream has exactly one fill + one stroke paint slot.
