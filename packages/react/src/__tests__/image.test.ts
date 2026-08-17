// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import { createImageHandle } from "../internal/image-handle";
import { normalizeImageProps } from "../shapes/Image";

describe("createImageHandle", () => {
  it("returns the same reference for the same uri", () => {
    expect(createImageHandle("https://x/y.png")).toBe(createImageHandle("https://x/y.png"));
  });

  it("returns distinct references for distinct uris", () => {
    expect(createImageHandle("https://x/a.png")).not.toBe(createImageHandle("https://x/b.png"));
  });
});

describe("normalizeImageProps", () => {
  it("defaults x/y to 0 and fit to contain (1)", () => {
    expect(normalizeImageProps({ image: "https://x/y.png", width: 100, height: 50 })).toEqual({
      uri: "https://x/y.png",
      fit: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it("accepts a bare string or an ImageHandle for image", () => {
    const handle = createImageHandle("https://x/h.png");
    expect(normalizeImageProps({ image: handle, width: 1, height: 1 })?.uri).toBe(
      "https://x/h.png",
    );
    expect(normalizeImageProps({ image: "https://x/s.png", width: 1, height: 1 })?.uri).toBe(
      "https://x/s.png",
    );
  });

  it("rect takes precedence over x/y/width/height", () => {
    expect(
      normalizeImageProps({
        image: "u",
        x: 9,
        y: 9,
        width: 9,
        height: 9,
        rect: { x: 4, y: 5, width: 60, height: 30 },
      }),
    ).toEqual({ uri: "u", fit: 1, x: 4, y: 5, width: 60, height: 30 });
  });

  it("rect may omit x/y (default 0)", () => {
    expect(normalizeImageProps({ image: "u", rect: { width: 8, height: 8 } })).toEqual({
      uri: "u",
      fit: 1,
      x: 0,
      y: 0,
      width: 8,
      height: 8,
    });
  });

  it("resolves every fit literal to its byte", () => {
    for (const [lit, byte] of [
      ["fill", 0],
      ["contain", 1],
      ["cover", 2],
      ["fitWidth", 3],
      ["fitHeight", 4],
      ["none", 5],
      ["scaleDown", 6],
    ] as const) {
      expect(normalizeImageProps({ image: "u", width: 1, height: 1, fit: lit })?.fit).toBe(byte);
    }
  });

  it("null image, empty string, or missing size render nothing", () => {
    expect(normalizeImageProps({ image: null, width: 1, height: 1 })).toBeNull();
    expect(normalizeImageProps({ image: "", width: 1, height: 1 })).toBeNull();
    expect(normalizeImageProps({ image: "u" })).toBeNull();
    expect(normalizeImageProps({ image: "u", width: 1 })).toBeNull();
  });
});
