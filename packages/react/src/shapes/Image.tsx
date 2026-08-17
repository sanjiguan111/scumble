// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { parseFit } from "@lynx-skity/graphics";

import { resolvePaint } from "../internal/paint";
import type { ImageProps } from "../types";

/** What `<skity-image>` consumes after normalization. */
export interface NormalizedImageSource {
  /** Undefined = no source (the native prop clears the node). */
  uri: string | undefined;
  fit: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize {@link ImageProps} into the flat numeric/uri props `<skity-image>`
 * consumes: `rect` takes precedence over x/y/width/height (x/y default 0), a
 * bare string is accepted where a handle is, `fit` resolves to its
 * `skityrt.BoxFit` byte ("contain" default), and a missing image or rect
 * yields null (render nothing). Pure — unit-testable without JSX.
 */
export function normalizeImageProps(props: ImageProps): NormalizedImageSource | null {
  const { image, fit = "contain" } = props;
  const uri =
    image == null
      ? undefined
      : typeof image === "string"
        ? image.length > 0
          ? image
          : undefined
        : image.uri;
  const rect = props.rect;
  const x = rect?.x ?? props.x ?? 0;
  const y = rect?.y ?? props.y ?? 0;
  const width = rect?.width ?? props.width;
  const height = rect?.height ?? props.height;
  if (uri === undefined || width === undefined || height === undefined) return null;
  return { uri, fit: parseFit(fit), x, y, width, height };
}

/**
 * Draw a bitmap on the canvas . The source
 * is a `useImage()` handle (or a bare uri string); the bitmap loads
 * asynchronously on the platform side — the node stays blank until pixels
 * land, then appears on the next draw. `fit` (default `"contain"`) inscribes
 * the bitmap into the destination rect (x/y/width/height or a single `rect`
 * object); inherited opacity/blendMode/filters apply, fill color does not.
 *
 * @example
 * const image = useImage("https://picsum.photos/seed/oslo/300/200");
 * <Image image={image} x={0} y={0} width={300} height={200} fit="cover" />
 */
export function Image({ children, ...rest }: ImageProps) {
  const n = normalizeImageProps(rest);
  if (n === null) return null;
  const { uri, ...geometry } = n;
  return <skity-image image={uri} {...geometry} {...resolvePaint(rest, children)} />;
}
