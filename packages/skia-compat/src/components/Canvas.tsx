// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Canvas>` — scumble's Canvas under the RN-Skia name (sizing from `style`,
 * children virtual). The RN-Skia `ref` (`CanvasRef`) is accepted but stubbed:
 * Victory's core stores the ref and never reads measuring methods off it
 * (`canvas.width` appears nowhere in the library), and snapshot/readPixels
 * have no scumble lane (no native→JS channel — the F.3 wall). The stub keeps
 * ported code running; anything beyond storage would need the event lane.
 */

import { Canvas as ScumbleCanvas } from "@scumble/react";
import type { ReactNode } from "@lynx-js/react";

/** RN-Skia's CanvasRef surface, stubbed (see module doc). */
export interface CanvasRef {
  width: number;
  height: number;
  redraw(): void;
}

/** scumble's own Canvas style prop, borrowed structurally (no react import). */
export type CanvasStyle = Parameters<typeof ScumbleCanvas>[0]["style"];

export interface ShimCanvasProps {
  style?: CanvasStyle;
  children?: ReactNode;
  ref?: { current: CanvasRef | null };
  mode?: "default" | "continuous";
  /**
   * scumble EXTENSION (no RN-Skia counterpart): SVG-viewBox logical coordinate
   * space — child geometry is specified in viewPort units and mapped
   * (xMidYMid meet) onto the style-sized surface. RN-Skia ports don't set it;
   * scumble-native demos use it for width-independent layout.
   */
  viewPort?: { x?: number; y?: number; width: number; height: number };
}

export function createCanvasRefStub(): CanvasRef {
  return { width: 0, height: 0, redraw() {} };
}

export function Canvas(props: ShimCanvasProps) {
  // scumble's Canvas owns its internal ref for the animation invoke lane;
  // the porting-target ref surface is inert (module doc), so it is dropped.
  const { ref: _ref, mode: _mode, style, viewPort, children } = props;
  return (
    <ScumbleCanvas style={style} viewPort={viewPort}>
      {children}
    </ScumbleCanvas>
  );
}
