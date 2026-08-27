// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useRef } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";

import { resolveAnimation } from "./internal/animation";
import {
  animationHandleOf,
  fireAnimationFinish,
  registerControlHost,
  unregisterControlHost,
} from "./internal/animation-control";
import type { CanvasProps } from "./types";

/**
 * Root canvas — renders the native `<gesso-canvas>` (GPU: Android OpenGL ES /
 * Vulkan, iOS Metal). Size comes from `style` like any Lynx view, and children
 * are positioned in that physical space by default.
 *
 * `viewPort` opts into a logical coordinate space (SVG `viewBox`): child
 * geometry authored in those logical pixels is scaled by the renderer to fit
 * the canvas (`preserveAspectRatio = xMidYMid meet`). Omit it for 1:1 physical
 * pixels.
 *
 * While mounted, the canvas is the transport for animation playback control
 * (`createAnimation().controller` dispatches `animateControl` through this
 * root's `invoke` lane — ANIMATION_CONTROL_DESIGN.md D6) and demuxes the
 * `gessoanimationfinish` events the native side emits here.
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
  const canvasRef = useRef<NodesRef | null>(null);
  useEffect(() => {
    // NodesRef.invoke's real shape is a single options object
    // `{ method, params }` (it is NOT (method, params) — the Lynx
    // nodes-ref.d.ts contract), and RefProxy is a chained selector API: the
    // call only queues a task, `.exec()` dispatches it.
    const host = {
      invokeAnimateControl: (params: {
        handle: string;
        action: "play" | "pause" | "seek" | "cancel";
        time?: number;
      }) => {
        const ref = canvasRef.current as unknown as {
          invoke?: (o: unknown) => { exec?: () => void };
        } | null;
        ref?.invoke?.({ method: "animateControl", params })?.exec?.();
      },
    };
    registerControlHost(host);
    return () => unregisterControlHost(host);
  }, []);
  return (
    <gesso-canvas
      ref={canvasRef}
      style={style}
      viewportX={viewPort?.x}
      viewportY={viewPort?.y}
      viewportWidth={viewPort?.width}
      viewportHeight={viewPort?.height}
      animationData={resolveAnimation(animate)}
      animationHandle={animationHandleOf(animate)}
      bindgessoanimationfinish={(e: { params?: { handle?: string } }) =>
        fireAnimationFinish(e?.params?.handle)
      }
    >
      {children}
    </gesso-canvas>
  );
}
