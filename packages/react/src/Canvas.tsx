// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resolveAnimation } from "./internal/animation";
import type { CanvasProps } from "./types";

/**
 * Root canvas — renders the native `<skity-canvas>` (GPU: Android OpenGL ES /
 * Vulkan, iOS Metal). Size comes from `style` like any Lynx view, and children
 * are positioned in that physical space by default.
 *
 * `viewPort` opts into a logical coordinate space (SVG `viewBox`): child
 * geometry authored in those logical pixels is scaled by the renderer to fit
 * the canvas (`preserveAspectRatio = xMidYMid meet`). Omit it for 1:1 physical
 * pixels.
 *
 * @example
 * // 1:1 physical pixels
 * <Canvas style={{ width: 200, height: 100 }}>
 *   <Rect x={0} y={0} width={50} height={50} color="red" />
 * </Canvas>
 *
 * // logical 100×100 space scaled to fit
 * <Canvas style={{ width: "100%", height: 160 }} viewPort={{ width: 100, height: 100 }}>
 *   <Rect x={5} y={5} width={40} height={40} color="red" />
 * </Canvas>
 */
export function Canvas({ children, style, viewPort, animate }: CanvasProps) {
  return (
    <skity-canvas
      style={style}
      viewportX={viewPort?.x}
      viewportY={viewPort?.y}
      viewportWidth={viewPort?.width}
      viewportHeight={viewPort?.height}
      animationData={resolveAnimation(animate)}
    >
      {children}
    </skity-canvas>
  );
}
