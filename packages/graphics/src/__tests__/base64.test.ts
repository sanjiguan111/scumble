import { describe, it, expect } from "vitest";

import { bytesToBase64, floatsToBase64 } from "../base64.js";

/** Decode base64 → raw LE float32s (mirror of floatsToBase64). */
function floatsFromBase64(s: string): number[] {
  const b = atob(s);
  const view = new DataView(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) view.setUint8(i, b.charCodeAt(i));
  const out: number[] = [];
  for (let i = 0; i + 4 <= b.length; i += 4) out.push(view.getFloat32(i, true));
  return out;
}

describe("bytesToBase64", () => {
  it("encodes with standard base64 padding", () => {
    expect(bytesToBase64(new Uint8Array([]).buffer)).toBe("");
    expect(bytesToBase64(new Uint8Array([0]).buffer)).toBe("AA==");
    expect(bytesToBase64(new Uint8Array([0, 0]).buffer)).toBe("AAA=");
    expect(bytesToBase64(new Uint8Array([1, 2, 3]).buffer)).toBe("AQID");
  });
});

describe("floatsToBase64", () => {
  it("round-trips dash intervals as little-endian float32", () => {
    expect(floatsFromBase64(floatsToBase64([8, 4]))).toEqual([8, 4]);
    expect(floatsFromBase64(floatsToBase64([1.5, -2.25, 1e3]))).toEqual([1.5, -2.25, 1e3]);
  });

  it("returns '' for empty input (native: clear dashes)", () => {
    expect(floatsToBase64([])).toBe("");
  });
});
