// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// react-native-gesture-handler → the skia-compat gesture lane. The builders
// and GestureDetector come straight from @scumble/skia-compat (RNGH-shaped
// recognizers over Lynx touch events); GestureHandlerRootView is a Lynx
// passthrough (no root-view registration exists under Lynx).

import { Gesture, GestureDetector, normalizeStyle } from "@scumble/skia-compat";
import type { ReactNode } from "@lynx-js/react";

import { StyleSheet } from "./react-native.js";

export { Gesture, GestureDetector } from "@scumble/skia-compat";
export type { TouchData } from "@scumble/skia-compat";

/** What Victory's code annotates as RNGH gesture objects. */
// Deep-path types Victory imports from RNGH internals.
export type UserSelect = "auto" | "none";
export type TouchAction = "auto" | "none";

export type PanGesture = ReturnType<typeof Gesture.Pan>;
export type PinchGesture = ReturnType<typeof Gesture.Pinch>;
export type GestureType = PanGesture | PinchGesture;
export type ComposedGesture =
  ReturnType<typeof Gesture.Race> | ReturnType<typeof Gesture.Simultaneous>;

// RNGH's RootView defaults to style {flex: 1} when none is given (see its
// GestureHandlerRootView.android.tsx styles.container) — that default is
// what lets Victory's flex chain inherit the consumer's height; without it
// the canvas and every ancestor collapse to height 0 on Lynx.
export function GestureHandlerRootView(props: { children?: ReactNode; [key: string]: unknown }) {
  const { children, style, ...rest } = props;
  const flat = StyleSheet.flatten((style ?? { flex: 1 }) as never);
  return (
    <view style={normalizeStyle(flat)} {...rest}>
      {children}
    </view>
  );
}
