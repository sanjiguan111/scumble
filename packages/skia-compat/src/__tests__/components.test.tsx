// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ClipRect, ClipRRect } from "@scumble/react";

import { fillTypeToFillRule, pathPropsToScumble } from "../components/Path.js";
import { groupPropsToScumble, clipDefToElement } from "../components/Group.js";
import { linePropsToScumble } from "../components/Line.js";
import { textPropsToScumble } from "../components/Text.js";
import { extractDash, resolveShimPaint, styleToScumble } from "../components/common.js";
import { DashPathEffect } from "../components/DashPathEffect.js";
import { matchFont, useFont } from "../useFont.js";
import { Skia } from "../Skia.js";
import { PaintStyle } from "../types.js";

// Same fixture as the graphics font-metrics suite ("Press Start 2P", OFL):
// unitsPerEm 1000, all advances 1000, ascent 1000/descent 0 → at size 24 a
// glyph is 24px wide and the ascent lift is 24.
const FONT_URI = readFileSync(
  new URL(
    "../../../graphics/src/__tests__/fixtures/press-start-2p-ascii.data-uri.txt",
    import.meta.url,
  ),
  "utf8",
).trim();

// @lat: [[tests#Skia compat layer#Compat component and font mapping]]
describe("paint prop plumbing", () => {
  it("converts PaintStyle enums and strings to scumble style values", () => {
    expect(styleToScumble(PaintStyle.Stroke)).toBe("stroke");
    expect(styleToScumble(PaintStyle.Fill)).toBe("fill");
    expect(styleToScumble("stroke")).toBe("stroke");
    expect(styleToScumble(undefined)).toBeUndefined();
  });

  it("extracts DashPathEffect children into dash/dashOffset", () => {
    const children = [{ type: DashPathEffect, props: { intervals: [4, 2], phase: 1 } }];
    expect(extractDash(children)).toEqual({ dash: [4, 2], dashOffset: 1 });
    expect(extractDash(undefined)).toEqual({});
  });

  it("merges paint-object state under explicit props", () => {
    const paint = Skia.Paint();
    paint.setColor("#111111");
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(9);
    const resolved = resolveShimPaint({ paint, color: "#222222" });
    expect(resolved.color).toBe("#222222"); // explicit wins
    expect(resolved.style).toBe("stroke"); // from the paint object
    expect(resolved.strokeWidth).toBe(9);
  });
});

describe("Path / Line / Group mappers", () => {
  it("maps an SkPath + paint props onto scumble Path props", () => {
    const p = Skia.Path.Rect(0, 0, 4, 4);
    p.fillType = 1;
    const props = pathPropsToScumble({
      path: p,
      color: "#0f0",
      style: PaintStyle.Stroke,
      strokeWidth: 2,
      children: [{ type: DashPathEffect, props: { intervals: [3, 3] } }],
    });
    expect(props.path).toBe(p.p2d);
    expect(props.fillRule).toBe("even-odd");
    expect(props.style).toBe("stroke");
    expect(props.dash).toEqual([3, 3]);
    expect(props.color).toBe("#0f0");
    expect(fillTypeToFillRule(0)).toBeUndefined();
  });

  it("maps p1/p2 endpoints to x1/y1/x2/y2", () => {
    const props = linePropsToScumble({ p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 }, color: "#f00" });
    expect(props.x1).toBe(1);
    expect(props.y1).toBe(2);
    expect(props.x2).toBe(3);
    expect(props.y2).toBe(4);
  });

  it("passes Matrix4 transforms through untouched", () => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1];
    expect(groupPropsToScumble({ transform: m }).transform).toEqual(m);
    const ignored = groupPropsToScumble({
      transform: m,
      isHeadless: true,
      explicitSize: { w: 1 },
      origin: { x: 0, y: 0 },
    });
    expect(ignored).not.toHaveProperty("isHeadless");
  });

  it("builds scumble clip elements from ClipDefs", () => {
    const rectEl = clipDefToElement({ rect: [0, 0, 10, 10] }) as {
      type: typeof ClipRect;
      props: Record<string, unknown>;
    };
    expect(rectEl.type).toBe(ClipRect);
    expect(rectEl.props).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
    const rrectEl = clipDefToElement({
      rrect: { rect: { x: 1, y: 2, width: 30, height: 40 }, topLeft: { x: 3, y: 3 } },
      op: "difference",
    }) as { type: typeof ClipRRect; props: Record<string, unknown> };
    expect(rrectEl.type).toBe(ClipRRect);
    expect(rrectEl.props).toMatchObject({ x: 1, y: 2, width: 30, height: 40, op: "difference" });
    expect(rrectEl.props.radii).toEqual([
      { x: 3, y: 3 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe("useFont + Text mapping (fixture-verified)", () => {
  it("measures synchronously from the font binary", () => {
    const font = useFont(FONT_URI, 24);
    expect(font.getSize()).toBe(24);
    expect(font.measureText("Hello!")).toBe(144);
    expect(font.getGlyphWidths([9, 32])).toEqual([24, 24]);
    expect(font.getTextWidth("o")).toBe(24);
  });

  it("throws guidance for metrics-less family-name fonts", () => {
    const font = matchFont({ fontFamily: "Roboto", fontSize: 12 });
    expect(() => font.measureText("hi")).toThrow(/no metrics/);
  });

  it("maps RN-Skia baseline y onto a lifted, unwrapped paragraph", () => {
    const font = useFont(FONT_URI, 24);
    const props = textPropsToScumble({ text: "Hi!", x: 10, y: 100, color: "#333", font });
    // Ascent 1000/1000 em → lift 24px: the paragraph box top sits at 76 so
    // the glyph BASELINE lands on y=100 (RN-Skia semantics).
    expect(props.y).toBe(100 - 24);
    expect(props.x).toBe(10);
    expect(props.width).toBe(24 * 3 + 1); // measured width + 1px no-wrap slack
    expect(props.maxLines).toBe(1);
    expect(props.span).toMatchObject({ text: "Hi!", fontSize: 24, color: "#333" });
  });

  it("falls back to a wide box + size lift for unmeasured fonts", () => {
    const font = matchFont({ fontFamily: "System", fontSize: 16 });
    const props = textPropsToScumble({ text: "hello", x: 0, y: 50, font });
    expect(props.y).toBe(50 - 16);
    expect(props.width).toBe(4096);
    expect(props.span.fontSize).toBe(16);
  });
});
