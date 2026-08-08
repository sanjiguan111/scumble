// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { parseColor } from "../color.js";

describe("parseColor", () => {
  it("passes a number through (unsigned)", () => {
    expect(parseColor(0xffff0000)).toBe(0xffff0000);
  });

  it("parses hex colors", () => {
    expect(parseColor("#ff0000")).toBe(0xffff0000);
    expect(parseColor("#f00")).toBe(0xffff0000);
    expect(parseColor("#0f0")).toBe(0xff00ff00);
    expect(parseColor("#4a90e2")).toBe(0xff4a90e2);
    // #RRGGBBAA (CSS Color 4 alpha hex)
    expect(parseColor("#ff0000aa")).toBe(0xaaff0000);
    // 4-digit shorthand #RGBA
    expect(parseColor("#f00a")).toBe(0xaaff0000);
  });

  it("parses rgb() / rgba()", () => {
    expect(parseColor("rgb(255,0,0)")).toBe(0xffff0000);
    expect(parseColor("rgba(255,0,0,0.5)")).toBe(0x80ff0000);
    expect(parseColor("rgb(255 0 0)")).toBe(0xffff0000); // modern syntax
  });

  it("parses hsl() / hsla()", () => {
    expect(parseColor("hsl(0,100%,50%)")).toBe(0xffff0000);
    expect(parseColor("hsl(120,100%,50%)")).toBe(0xff00ff00);
    expect(parseColor("hsla(0,100%,50%,0.5)")).toBe(0x80ff0000);
  });

  it("parses named colors", () => {
    expect(parseColor("red")).toBe(0xffff0000);
    expect(parseColor("blue")).toBe(0xff0000ff);
    expect(parseColor("transparent")).toBe(0x00000000);
    expect(parseColor("WHITE")).toBe(0xffffffff); // case-insensitive
  });

  it("parses {r,g,b,a?} objects", () => {
    expect(parseColor({ r: 255, g: 0, b: 0 })).toBe(0xffff0000);
    expect(parseColor({ r: 255, g: 0, b: 0, a: 0.5 })).toBe(0x80ff0000);
  });

  it("parses [r,g,b,a?] tuples", () => {
    expect(parseColor([255, 0, 0])).toBe(0xffff0000);
    expect(parseColor([255, 0, 0, 0.5])).toBe(0x80ff0000);
  });

  it("throws on unknown formats", () => {
    expect(() => parseColor("not-a-color")).toThrow();
    expect(() => parseColor("#12345")).toThrow(); // bad hex length
  });
});
