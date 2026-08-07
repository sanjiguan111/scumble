// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

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
