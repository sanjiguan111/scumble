// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * @scumble/skia-compat — the `@shopify/react-native-skia` API surface over
 * scumble, extracted from a full audit of Victory Native XL v42's library
 * code (`lib/src`, 165 files): every RN-Skia import, component prop, and
 * imperative call site maps to a shim here. A port rewrites the imports
 * (mechanically — the component names and call shapes are identical) and
 * swaps the Reanimated/gesture lanes, which have no scumble counterpart and
 * are handled in the porting layer, not this package.
 *
 * Not carried over (deliberate, with the porting note in the package
 * README): `Skia.FontManager`/system-font matching (measurement needs the
 * skity table-prefetch lane, not built — pass font binaries), JSI-backed
 * APIs that imply a synchronous native channel (vertices, pictures,
 * snapshots).
 */

// ---- components (RN-Skia names) ----
export {
  Canvas,
  createCanvasRefStub,
  type CanvasRef,
  type ShimCanvasProps,
} from "./components/Canvas.js";
export {
  Group,
  clipDefToElement,
  groupPropsToScumble,
  type ShimGroupProps,
} from "./components/Group.js";
export {
  Path,
  pathPropsToScumble,
  fillTypeToFillRule,
  type ShimPathProps,
} from "./components/Path.js";
export { Line, linePropsToScumble, type ShimLineProps } from "./components/Line.js";
export { Text, textPropsToScumble, type ShimTextProps } from "./components/Text.js";
export { DashPathEffect } from "./components/DashPathEffect.js";

// ---- imperative namespace ----
export { Skia, ParagraphBuilder, type SkParagraph } from "./Skia.js";

// ---- objects ----
export { SkPath, appendOvalArc, appendRRect } from "./SkPath.js";
export { SkPathBuilder } from "./PathBuilder.js";
export {
  useFont,
  matchFont,
  createPaint,
  textStyleToSpanProps,
  type SkFont,
  type SkPaint,
} from "./useFont.js";

// ---- math + types ----
export { vec, rect, rrect, translate, scale, rotate, multiply4, identity4 } from "./math.js";
export {
  FillType,
  PaintStyle,
  type Color,
  type ClipDef,
  type DashPathEffectProps,
  type Matrix4,
  type NonUniformRRect,
  type RRectCorner,
  type SkPoint,
  type SkRect,
  type SkParagraphStyle,
  type SkTextStyle,
} from "./types.js";
