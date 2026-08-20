// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { buildSpanList, bytesToBase64 } from "@lynx-skity/graphics";
import type { SpanSpec } from "@lynx-skity/graphics";
import type { ReactNode } from "@lynx-js/react";

import { childElements, resolvePaint } from "../internal/paint";
import { TextSpan } from "./TextSpan";
import type { ParagraphProps, TextSpanProps } from "../types";

/** The paragraph slice of the skity intrinsic props (after span collection). */
export interface NormalizedParagraph {
  spans: string; // base64 SpanList bytes
  textAlign: number; // 0=left 1=center 2=right
  lineHeight: number;
  maxLines: number;
  x: number;
  y: number;
  width: number;
}

const TEXT_ALIGN_BYTES: Record<string, number> = { left: 0, center: 1, right: 2 };

/** Collect the `<TextSpan>` children's props in declaration order. */
export function collectSpans(children?: ReactNode): TextSpanProps[] {
  const spans: TextSpanProps[] = [];
  for (const el of childElements(children)) {
    if (el.type === TextSpan) spans.push(el.props as TextSpanProps);
  }
  return spans;
}

/**
 * Resolve a span's text: the `text` prop wins, then JSX children —
 * `<TextSpan text="hi" />` and `<TextSpan>hi</TextSpan>` are equivalent.
 * Child text is trimmed (JSX indentation whitespace is not meaningful);
 * nested elements inside a span are ignored (only plain text is collected).
 */
export function resolveSpanText(props: TextSpanProps): string {
  if (props.text !== undefined) return props.text;
  const c = props.children;
  if (typeof c === "string" || typeof c === "number") return String(c).trim();
  if (Array.isArray(c)) {
    return c
      .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
      .join("")
      .trim();
  }
  return "";
}

/**
 * Normalize {@link ParagraphProps} + span children into the flat props
 * `<skity-paragraph>` consumes: spans serialize to base64 SpanList bytes with
 * the paragraph-level defaults merged in (span fields win), alignment maps to
 * its byte, and x/y default to 0. Pure — unit-testable without JSX.
 */
export function normalizeParagraphProps(
  props: ParagraphProps,
  children?: ReactNode,
): NormalizedParagraph | null {
  const { width, textAlign = "left", lineHeight = 1, maxLines = 0, x = 0, y = 0 } = props;
  if (!(width > 0)) return null;
  const spans = collectSpans(children);
  const spec: SpanSpec[] = spans.map((s) => ({
    text: resolveSpanText(s),
    fontFamily: s.fontFamily ?? props.fontFamily,
    fontSize: s.fontSize ?? props.fontSize,
    fontWeight: s.fontWeight ?? props.fontWeight,
    italic: s.italic ?? props.italic,
    color: s.color ?? props.color,
    letterSpacing: s.letterSpacing ?? props.letterSpacing,
  }));
  return {
    spans: bytesToBase64(buildSpanList(spec.length > 0 ? spec : [{ text: "" }])),
    textAlign: TEXT_ALIGN_BYTES[textAlign] ?? 0,
    lineHeight,
    maxLines,
    x,
    y,
    width,
  };
}

/**
 * Width-constrained rich text, laid out natively in the TASM measure pass
 * (CoreText on iOS; HarfBuzz + a CJK-aware breaker on Android). The measured
 * height reaches JS asynchronously via `onLayout` (a Lynx `"layout"`
 * component event). Inherits opacity/blendMode like every shape.
 *
 * A gradient child (or `<Paint>` wrapping one) fills the whole paragraph
 * through skity's glyph atlas — the span colors then only contribute their
 * alpha; `<ColorMatrix>`/`<ColorBlend>` children apply as color filters.
 * Image-shader fills and blur/shadow filters are ignored by skity's text
 * pipeline (falls back to the span colors). Note `color` on a paragraph is
 * the SPAN default color, not a node fill — use `<Paint color>` for that.
 *
 * @example
 * <Paragraph x={0} y={0} width={300} fontSize={16} onLayout={(d) => console.log(d.height)}>
 *   <TextSpan text="Hello " />
 *   <TextSpan text="skity" color="#3b82f6" fontWeight={700} />
 * </Paragraph>
 *
 * @example
 * <Paragraph x={0} y={0} width={300} fontSize={22} fontWeight={700}>
 *   <LinearGradient start={[0, 0]} end={[300, 0]} colors={["#8b5cf6", "#ec4899"]} />
 *   <TextSpan>gradient text</TextSpan>
 * </Paragraph>
 */
export function Paragraph({ children, onLayout, ...rest }: ParagraphProps) {
  const n = normalizeParagraphProps(rest, children);
  if (n === null) return null;
  // resolvePaint routes the declarative shader/filter children onto the fill
  // slot (the only paint a paragraph draws with — text has no stroke). `color`
  // and `style` are neutralized before resolving: on a paragraph, `color`
  // means the SPAN default color (serialized into the spans payload), not a
  // node fill. resolvePaint also filters undefined number props (Android
  // marshals those to 0 — opacity 0 / blendMode CLEAR wipe the draw).
  const {
    opacity,
    blendMode,
    fill,
    fillGradient,
    fillColorFilter,
    fillImageFilter,
    fillMaskFilter,
  } = resolvePaint({ ...rest, color: undefined, style: undefined }, children);
  const paintProps = {
    ...(opacity !== undefined ? { opacity } : {}),
    ...(blendMode !== undefined ? { blendMode } : {}),
    ...(fill !== undefined ? { fill } : {}),
    ...(fillGradient !== undefined ? { fillGradient } : {}),
    ...(fillColorFilter !== undefined ? { fillColorFilter } : {}),
    ...(fillImageFilter !== undefined ? { fillImageFilter } : {}),
    ...(fillMaskFilter !== undefined ? { fillMaskFilter } : {}),
  };
  return (
    <skity-paragraph
      spans={n.spans}
      textAlign={n.textAlign}
      lineHeight={n.lineHeight}
      maxLines={n.maxLines}
      x={n.x}
      y={n.y}
      width={n.width}
      {...paintProps}
      bindlayout={
        onLayout !== undefined
          ? (e: { detail: { height: number; lineCount: number } }) => onLayout(e.detail)
          : undefined
      }
    />
  );
}
