// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * The `Skia` namespace — the imperative entry points Victory calls
 * (`Skia.PathBuilder.Make`, `Skia.XYWHRect`, `Skia.Path.MakeFromSVGString`,
 * `Skia.Color`, `Skia.Paint`, `Skia.Path.Interpolate`). Everything delegates
 * to this package's shim objects over scumble; nothing touches a platform.
 */

import { Path2D, parseColor } from "@scumble/graphics";

import { SkPath } from "./SkPath.js";
import { SkPathBuilder } from "./PathBuilder.js";
import { createPaint, useFont, type SkFont, type SkPaint } from "./useFont.js";
import { rect } from "./math.js";
import type { SkParagraphStyle, SkRect, SkTextStyle } from "./types.js";

/**
 * The built paragraph RN-Skia's `ParagraphBuilder.build()` produces. Layout
 * numbers come from the same JS-side font metrics as {@link SkFont} — enough
 * for the axis-label lane (widths/heights) without a platform shaper.
 */
export interface SkParagraph {
  /** Layout at `width`: splits explicit newlines only (no platform wrapping). */
  layout(width: number): void;
  getWidth(): number;
  getHeight(): number;
  getMaxIntrinsicWidth(): number;
  getLongestLine(): number;
  /** The span props the shim's `<Paragraph>` renders. */
  readonly spans: ReadonlyArray<{ text: string; style: ReturnType<typeof spanStyleOf> }>;
  readonly paraStyle: SkParagraphStyle;
}

function spanStyleOf(style: SkTextStyle) {
  return style;
}

/** RN-Skia `ParagraphBuilder` — pushStyle/addText/pop, then `build()`. */
export class ParagraphBuilder {
  private spans: Array<{ text: string; style: SkTextStyle }> = [];
  private styleStack: SkTextStyle[] = [];

  static Make(_paraStyle?: SkParagraphStyle, _fontProvider?: unknown): ParagraphBuilder {
    return new ParagraphBuilder(_paraStyle);
  }

  private constructor(private paraStyle: SkParagraphStyle = {}) {}

  pushStyle(style: SkTextStyle): void {
    this.styleStack.push(style);
  }

  pop(): void {
    this.styleStack.pop();
  }

  addText(text: string): void {
    const style = this.styleStack[this.styleStack.length - 1] ?? {};
    this.spans.push({ text, style });
  }

  build(): SkParagraph {
    let width = 0;
    let laidOut = false;
    const intrinsic = (): number =>
      Math.max(
        0,
        ...this.spans.map(({ text, style }) => {
          const size = style.fontSize ?? 14;
          const family = style.fontFamily;
          if (family && family.startsWith("data:")) {
            try {
              return useFont(family, size).measureText(text);
            } catch {
              // A font binary that failed to parse — fall through to the
              // heuristic rather than killing the chart.
            }
          }
          return text.split("\n").reduce((max, line) => Math.max(max, line.length * size * 0.6), 0);
        }),
      );
    const lineHeightOf = (style: SkTextStyle): number => {
      const size = style.fontSize ?? 14;
      if (style.fontFamily?.startsWith("data:")) {
        try {
          return useFont(style.fontFamily, size).getVerticalMetrics().lineHeight;
        } catch {
          // heuristic below
        }
      }
      return size;
    };
    return {
      spans: this.spans,
      paraStyle: this.paraStyle,
      layout(w) {
        width = w;
        laidOut = true;
      },
      getWidth: () => (laidOut ? width : intrinsic()),
      getHeight: () =>
        this.spans.reduce(
          (h, { text, style }) => h + lineHeightOf(style) * (text.split("\n").length || 1),
          0,
        ),
      getMaxIntrinsicWidth: intrinsic,
      getLongestLine: intrinsic,
    };
  }
}

/** `Skia.TypefaceFontProvider` — scumble fonts are addressed by source, so registration is a no-op. */
const TypefaceFontProvider = {
  Make(): { registerFont(_data: unknown, _familyAlias: string): void } {
    return { registerFont() {} };
  },
};

/**
 * The `Skia` object — a plain namespace mirroring the used surface of
 * RN-Skia's global. `Skia.FontManager` is omitted (platform font managers
 * have no scumble counterpart yet); `TypefaceFontProvider.Make()` returns a
 * no-op registrar.
 */
export const Skia = {
  Path: {
    Make(): SkPath {
      return new SkPath();
    },
    /** Parse an SVG `d` string — null on an empty/blank string (RN-Skia semantics). */
    MakeFromSVGString(d: string): SkPath | null {
      const p = new SkPath(Path2D.fromDString(d));
      return p.toSVGString() === "" ? null : p;
    },
    Rect(x: number, y: number, w: number, h: number): SkPath {
      return new SkPath().addRect(rect(x, y, w, h));
    },
    /**
     * `a·(1−t) + b·t` (Skia's documented instance-method semantics). null on
     * a command-structure mismatch. See `Path2D.interpolate` for the Victory
     * argument-order note.
     */
    Interpolate(a: SkPath, b: SkPath, t: number): SkPath | null {
      const mixed = Path2D.interpolate(a.p2d, b.p2d, t);
      return mixed === null ? null : new SkPath(mixed);
    },
  },
  PathBuilder: {
    Make(): SkPathBuilder {
      return SkPathBuilder.Make();
    },
  },
  ParagraphBuilder,
  TypefaceFontProvider,
  Color(c: string | number): number {
    return typeof c === "number" ? c : parseColor(c);
  },
  Paint(): SkPaint {
    return createPaint();
  },
  XYWHRect(x: number, y: number, w: number, h: number): SkRect {
    return rect(x, y, w, h);
  },
};
