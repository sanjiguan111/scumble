// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { ImageHandle } from "../types";

// Module-level cache: the same uri always yields the same handle reference,
// so consumers can rely on `===` (memo deps, effect keys) and multiple
// <Image> nodes sharing a uri map to one store entry for free.
const handles = new Map<string, ImageHandle>();

/**
 * Get (or create) the {@link ImageHandle} for a source uri. Same uri → same
 * reference, for the lifetime of the module. Lives apart from useImage.ts so
 * the pure half stays importable in node (the hook pulls in @lynx-js/react).
 */
export function createImageHandle(uri: string): ImageHandle {
  let h = handles.get(uri);
  if (h === undefined) {
    h = { __kind: "scumble-image", uri };
    handles.set(uri, h);
  }
  return h;
}
