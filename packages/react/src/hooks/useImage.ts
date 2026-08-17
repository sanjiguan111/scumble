// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useState } from "@lynx-js/react";

import { createImageHandle } from "../internal/image-handle";
import type { ImageHandle } from "../types";

export { createImageHandle };

/**
 * Resolve an image source into an {@link ImageHandle} . The handle is returned immediately — there is
 * no null-while-loading phase and no onError callback (no native→JS channel);
 * the platform loads the bitmap asynchronously and the `<Image>` node simply
 * shows up once pixels land. `null`/empty source returns null (draw nothing).
 *
 * @example
 * const image = useImage("https://picsum.photos/seed/x/300/200");
 * <Image image={image} x={0} y={0} width={300} height={200} />
 */
export function useImage(source: string | null | undefined): ImageHandle | null {
  const [handle, setHandle] = useState<ImageHandle | null>(() =>
    source ? createImageHandle(source) : null,
  );
  useEffect(() => {
    setHandle(source ? createImageHandle(source) : null);
  }, [source]);
  return handle;
}
