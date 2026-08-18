// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Image shader: fill (or stroke) a shape with a bitmap. A declarative
 * data-only child like the gradients — the parent shape's resolvePaint
 * extracts these props and emits them as intrinsic paint props, so this
 * component never mounts.
 */

export function ImageShader(_props: import("../types").ImageShaderProps): null {
  // Data-only component; consumed by the parent shape's resolvePaint. Returning
  // null is harmless because the parent extracts the props and emits a
  // childless intrinsic element, so this child is never rendered.
  return null;
}
