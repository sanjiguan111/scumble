// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { CanvasProps } from "./types";

/**
 * Root canvas. Renders the native <skity-canvas> (GPU: Android OpenGL ES/Vulkan,
 * iOS Metal). Size comes from `style` like any Lynx view.
 *
 * `viewPort` is accepted for API parity but not yet wired to the native
 * RenderTree.viewport (caveat — TODO Task 3).
 */
export function Canvas({ children, style }: CanvasProps) {
  return <skity-canvas style={style}>{children}</skity-canvas>;
}
