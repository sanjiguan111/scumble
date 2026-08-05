import type { StandardProps } from "@lynx-js/types";

/**
 * Props for the `<x-lynx-skity>` native element.
 *
 * Extends the standard Lynx element attributes. Add Skity-specific drawing
 * attributes (canvas config, paint commands, etc.) here as the native
 * element grows.
 */
export interface LynxSkityElementProps extends StandardProps {}

declare module "@lynx-js/types" {
  interface IntrinsicElements {
    "x-lynx-skity": LynxSkityElementProps;
  }
}
