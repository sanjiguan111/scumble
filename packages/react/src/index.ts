// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Importing lynx-skity/elements augments @lynx-js/types IntrinsicElements with
// the <skity-*> tags this package renders. Consumers transitively get the types
// via @lynx-js/types once this side-effect import is in the program.
import "lynx-skity/elements";

export { Canvas } from "./Canvas";
export { Group } from "./Group";
export { Circle } from "./shapes/Circle";
export { Rect } from "./shapes/Rect";
export { RRect } from "./shapes/RRect";
export { Path } from "./shapes/Path";

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
} from "./types";

// TODO(Task 3 / native support): Paint (multi-pass), LinearGradient /
// RadialGradient / ConicGradient / SweepGradient, ColorFilter, Ellipse, Line —
// these react-native-skity components are withheld until the native renderer
// supports them (gradients/shaders) or the tags are wired (ellipse/line props).
