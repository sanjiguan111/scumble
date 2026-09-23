// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<Paragraph paragraph x y width>` — RN-Skia's Paragraph component over
 * scumble's: the {@link SkParagraph} built by `Skia.ParagraphBuilder` is a
 * plain JS record (spans + paraStyle — see Skia.ts), rendered here as a
 * scumble Paragraph + one TextSpan per recorded span. Multi-span styling is
 * preserved; wrapping/ellipsis ride scumble's native layout.
 */

import { Paragraph as ScumbleParagraph, TextSpan } from "@scumble/react";

import type { SkParagraph } from "../Skia.js";
import { textStyleToSpanProps } from "../useFont.js";

export interface ShimParagraphProps {
  paragraph: SkParagraph;
  x?: number;
  y?: number;
  width?: number;
  /** Extra scumble extension passthrough (maxLines/lineHeight). */
  maxLines?: number;
  opacity?: number;
}

export function Paragraph(props: ShimParagraphProps) {
  const { paragraph, x = 0, y = 0, width = 300, maxLines, opacity } = props;
  return (
    <ScumbleParagraph
      x={x}
      y={y}
      width={width}
      textAlign={paragraph.paraStyle.textAlign}
      maxLines={maxLines}
      opacity={opacity}
    >
      {paragraph.spans.map((span, i) => {
        const { color, ...rest } = textStyleToSpanProps(span.style);
        return (
          <TextSpan
            key={i}
            text={span.text}
            {...rest}
            color={color !== undefined ? String(color) : undefined}
          />
        );
      })}
    </ScumbleParagraph>
  );
}
