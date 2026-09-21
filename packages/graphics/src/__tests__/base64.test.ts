import { describe, it, expect } from "vitest";

import { base64ToBytes, bytesToBase64, floatsToBase64 } from "../base64.js";

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

describe("base64ToBytes", () => {
  it("round-trips every length mod 3", () => {
    for (let n = 0; n <= 9; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      const decoded = base64ToBytes(bytesToBase64(bytes.buffer));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it("decodes unpadded input and skips ASCII whitespace", () => {
    expect(Array.from(base64ToBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes("AQ\nID"))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes(" AQID \n"))).toEqual([1, 2, 3]);
  });

  it("throws on invalid characters and undecodable trailing groups", () => {
    expect(() => base64ToBytes("AQ!D")).toThrow(/invalid character/);
    expect(() => base64ToBytes("A")).toThrow(/invalid length/);
    expect(() => base64ToBytes("AAAAA")).toThrow(/invalid length/);
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
