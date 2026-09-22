// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ParagraphBuilder, Skia } from "../Skia.js";

// "Press Start 2P" (see the graphics font-metrics suite): every advance is a
// full em and ascent=1000/descent=0 → at 24px, width = 24·chars and
// lineHeight = 24.
const FONT_URI = readFileSync(
  new URL(
    "../../../graphics/src/__tests__/fixtures/press-start-2p-ascii.data-uri.txt",
    import.meta.url,
  ),
  "utf8",
).trim();

// @lat: [[tests#Skia compat layer#Paragraph builder shim]]
describe("ParagraphBuilder (the multi-line label lane)", () => {
  it("measures laid-out width/height from font metrics", () => {
    const b = Skia.ParagraphBuilder.Make();
    b.pushStyle({ fontSize: 24, fontFamily: FONT_URI, color: "#000" });
    b.addText("Hello!");
    b.pop();
    const p = b.build();
    expect(p.getMaxIntrinsicWidth()).toBe(24 * 6);
    p.layout(500);
    expect(p.getWidth()).toBe(500);
    expect(p.getLongestLine()).toBe(24 * 6);
    expect(p.getHeight()).toBe(24);
  });

  it("counts explicit newlines as extra lines", () => {
    const b = Skia.ParagraphBuilder.Make();
    b.pushStyle({ fontSize: 24, fontFamily: FONT_URI });
    b.addText("ab\ncd");
    expect(b.build().getHeight()).toBe(48);
  });

  it("heuristic-sizes spans whose family carries no metrics", () => {
    const b = Skia.ParagraphBuilder.Make({} as never);
    b.pushStyle({ fontSize: 10, fontFamily: "Roboto" });
    b.addText("abcd");
    const p = b.build();
    expect(p.getMaxIntrinsicWidth()).toBe(4 * 10 * 0.6);
    expect(p.getHeight()).toBe(10);
  });

  it("exposes spans for the shim Paragraph to render", () => {
    const b = new ParagraphBuilder();
    b.pushStyle({ fontSize: 12 });
    b.addText("x");
    const p = b.build();
    expect(p.spans).toEqual([{ text: "x", style: { fontSize: 12 } }]);
  });
});
