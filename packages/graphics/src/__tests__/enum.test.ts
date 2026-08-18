// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { parseBlendMode, parseFit, parseImageFilterMode, parseImageMipmapMode } from "../enum.js";

import { parseFillRule, parseStrokeCap, parseStrokeJoin } from "../enum.js";

describe("paint enum parsers", () => {
  it("maps strokeCap to LineCap bytes", () => {
    expect(parseStrokeCap("butt")).toBe(0);
    expect(parseStrokeCap("round")).toBe(1);
    expect(parseStrokeCap("square")).toBe(2);
    expect(parseStrokeCap("ROUND")).toBe(1); // case-insensitive
  });

  it("maps strokeJoin to LineJoin bytes", () => {
    expect(parseStrokeJoin("miter")).toBe(0);
    expect(parseStrokeJoin("round")).toBe(1);
    expect(parseStrokeJoin("bevel")).toBe(2);
  });

  it("maps fillRule to FillRule bytes", () => {
    expect(parseFillRule("nonzero")).toBe(0);
    expect(parseFillRule("evenodd")).toBe(1);
  });

  it("passes a number through as the raw byte", () => {
    expect(parseStrokeCap(2)).toBe(2);
    expect(parseFillRule(1)).toBe(1);
  });
});

describe("parseBlendMode", () => {
  it("maps the kebab-case literals to skityrt bytes", () => {
    expect(parseBlendMode("multiply")).toBe(24);
    expect(parseBlendMode("src-over")).toBe(3);
    expect(parseBlendMode("src-in")).toBe(5);
    expect(parseBlendMode("color-dodge")).toBe(18);
    expect(parseBlendMode("luminosity")).toBe(28);
    expect(parseBlendMode("XOR")).toBe(11); // case-insensitive
  });

  it("passes numbers through and falls back to SRC_OVER on unknown strings", () => {
    expect(parseBlendMode(14)).toBe(14);
    expect(parseBlendMode("nope")).toBe(3);
  });
});

describe("parseFit", () => {
  it("maps all seven Fit literals to their BoxFit bytes", () => {
    expect(parseFit("fill")).toBe(0);
    expect(parseFit("contain")).toBe(1);
    expect(parseFit("cover")).toBe(2);
    expect(parseFit("fitWidth")).toBe(3);
    expect(parseFit("fitHeight")).toBe(4);
    expect(parseFit("none")).toBe(5);
    expect(parseFit("scaleDown")).toBe(6);
  });

  it("is case-insensitive", () => {
    expect(parseFit("Cover")).toBe(2);
    expect(parseFit("FITWIDTH")).toBe(3);
    expect(parseFit("ScaleDown")).toBe(6);
  });

  it("passes bytes through and defaults unknown strings to CONTAIN", () => {
    expect(parseFit(2)).toBe(2);
    expect(parseFit(9999)).toBe(9999 & 0xff); // masked to a byte
    expect(parseFit("banana")).toBe(1);
  });
});

describe("parseImageFilterMode", () => {
  it("maps literals to their ImageFilterMode bytes (skity value order)", () => {
    expect(parseImageFilterMode("nearest")).toBe(0);
    expect(parseImageFilterMode("linear")).toBe(1);
  });

  it("is case-insensitive", () => {
    expect(parseImageFilterMode("Nearest")).toBe(0);
    expect(parseImageFilterMode("LINEAR")).toBe(1);
  });

  it("passes bytes through and defaults unknown strings to LINEAR", () => {
    expect(parseImageFilterMode(0)).toBe(0);
    expect(parseImageFilterMode(9999)).toBe(9999 & 0xff); // masked to a byte
    expect(parseImageFilterMode("banana")).toBe(1);
  });
});

describe("parseImageMipmapMode", () => {
  it("maps literals to their ImageMipmapMode bytes (skity value order)", () => {
    expect(parseImageMipmapMode("none")).toBe(0);
    expect(parseImageMipmapMode("nearest")).toBe(1);
    expect(parseImageMipmapMode("linear")).toBe(2);
  });

  it("is case-insensitive", () => {
    expect(parseImageMipmapMode("None")).toBe(0);
    expect(parseImageMipmapMode("NEAREST")).toBe(1);
    expect(parseImageMipmapMode("Linear")).toBe(2);
  });

  it("passes bytes through and defaults unknown strings to NONE", () => {
    expect(parseImageMipmapMode(2)).toBe(2);
    expect(parseImageMipmapMode(9999)).toBe(9999 & 0xff); // masked to a byte
    expect(parseImageMipmapMode("banana")).toBe(0);
  });
});
