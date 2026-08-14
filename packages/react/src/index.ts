// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * @lynx-skity/react — the React component layer for lynx-skity.
 *
 * A react-native-skia / react-native-skity-style declarative API on top of the
 * native skity intrinsic tags (`<skity-canvas>`, `<skity-rect>`, …). Components
 * accept friendly values — CSS color strings, paint enums, transform objects,
 * SVG path `d` strings (or a {@link Path2D}) — and normalize them into the
 * numeric / base64-byte props the native tags consume. All string parsing is
 * delegated to `@lynx-skity/graphics`; the native side never parses strings.
 *
 * The intrinsic tags are registered by the `@lynx-skity/native` library — importing
 * `@lynx-skity/native/elements` once augments the JSX `IntrinsicElements` so the tags
 * type-check.
 *
 * @example
 * import { Canvas, Circle, Rect, Path, Group } from "@lynx-skity/react";
 *
 * <Canvas style={{ width: 200, height: 200 }}>
 *   <Rect x={0} y={0} width={100} height={100} color="#ff0000" />
 *   <Circle cx={150} cy={50} radius={30} color="blue" />
 *   <Group transform={{ translateX: 10, translateY: 10 }}>
 *     <Path path="M0 0 L50 50 Z" color="#22c55e" />
 *   </Group>
 * </Canvas>
 */

// Importing @lynx-skity/native/elements augments @lynx-js/types IntrinsicElements with
// the <skity-*> tags this package renders. Consumers transitively get the types
// via @lynx-js/types once this side-effect import is in the program.
import "@lynx-skity/native/elements";

// ---- containers ----
export { Canvas } from "./Canvas";
export { Group } from "./Group";
// ---- shapes ----
export { Circle } from "./shapes/Circle";
export { Rect } from "./shapes/Rect";
export { RRect } from "./shapes/RRect";
export { Path } from "./shapes/Path";
// Path2D (command-style path builder) is re-exported from the graphics core so
// callers can import it from @lynx-skity/react alongside <Path>.
export { Path2D } from "@lynx-skity/graphics";
// ---- shaders ----
// Gradient shaders are declarative children of a shape (react-native-skia
// style): `<Rect><LinearGradient .../></Rect>`. vec() builds the {x,y} points
// they take.
export { LinearGradient } from "./shaders/LinearGradient";
export { RadialGradient } from "./shaders/RadialGradient";
export { SweepGradient } from "./shaders/SweepGradient";
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
  RectProps,
  RRectProps,
  CornerRadius,
  CornerRadii,
  PathProps,
  GroupProps,
  CanvasProps,
  Vec,
  LinearGradientProps,
  RadialGradientProps,
  SweepGradientProps,
} from "./types";

// Gradient FILL is supported for linear/radial/sweep (child shader → native
// Gradient FlatBuffer → skity Shader::MakeLinear/MakeRadial/MakeSweep). Still
// TODO: gradient stroke, the radial focal point (TwoPointConical), Paint
// (multi-pass), ColorFilter, and the Ellipse / Line component wrappers —
// pending native shader coverage or wiring.
