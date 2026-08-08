// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { CanvasProps } from "./types";

/**
 * Root canvas. Renders the native <skity-canvas> (GPU: Android OpenGL ES/Vulkan,
 * iOS Metal). Size comes from `style` like any Lynx view.
 *
 * `viewPort` declares the logical coordinate space (SVG viewBox): child geometry
 * authored in those logical pixels is scaled by the renderer to fit the canvas
 * physical size (preserveAspectRatio = xMidYMid meet). Omit for 1:1 physical px.
 */
export function Canvas({ children, style, viewPort }: CanvasProps) {
  return (
    <skity-canvas
      style={style}
      viewportX={viewPort?.x}
      viewportY={viewPort?.y}
      viewportWidth={viewPort?.width}
      viewportHeight={viewPort?.height}
    >
      {children}
    </skity-canvas>
  );
}
