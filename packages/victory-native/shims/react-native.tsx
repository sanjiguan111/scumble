// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// react-native → Lynx shim: the RN surface Victory Native XL's library code
// touches (View, StyleSheet, a few types), mapped onto plain Lynx views.
// `onLayout` is bridged from Lynx's layoutchange event into the RN event
// shape Victory reads (e.nativeEvent.layout.width/height).

import { useRef } from "@lynx-js/react";
import type { ReactNode } from "@lynx-js/react";

import { normalizeStyle } from "@scumble/skia-compat";

export type ViewStyle = Record<string, string | number | undefined>;
/** RN-style style prop — array members may be null/false (conditional styles). */
export type StyleProp<T> =
  T | ReadonlyArray<T | undefined | null | false> | undefined | null | false;

export interface LayoutChangeEvent {
  nativeEvent: { layout: { width: number; height: number; x: number; y: number } };
}

export const StyleSheet = {
  create<T extends Record<string, ViewStyle>>(styles: T): T {
    return styles;
  },
  hairlineWidth: 1,
  /** Accepts the raw prop loosely — TS 5.6's contextual typing of JSX style
   * arrays against the StyleProp union misfires (members get checked against
   * the Record's value type); runtime flatten handles every legal shape. */
  flatten(style?: unknown): ViewStyle {
    if (!style) return {};
    const list = Array.isArray(style) ? style : [style];
    return list.filter(Boolean).reduce<ViewStyle>((acc, s) => ({ ...acc, ...s }), {});
  },
};

/** ViewProps — `style` is typed loosely (see StyleSheet.flatten's note). */
export interface ViewProps {
  style?: unknown;
  onLayout?: (e: LayoutChangeEvent) => void;
  children?: ReactNode;
  [key: string]: unknown;
}

export function View(props: ViewProps) {
  const { style, onLayout, children, ...rest } = props;
  const flat = normalizeStyle(StyleSheet.flatten(style));
  return (
    <view
      style={flat}
      {...(onLayout
        ? {
            bindlayoutchange: (e: {
              detail?: { width?: number; height?: number; left?: number; top?: number };
            }) => {
              const d = e.detail ?? {};
              onLayout({
                nativeEvent: {
                  layout: {
                    width: d.width ?? 0,
                    height: d.height ?? 0,
                    x: d.left ?? 0,
                    y: d.top ?? 0,
                  },
                },
              });
            },
          }
        : {})}
      {...rest}
    >
      {children}
    </view>
  );
}
