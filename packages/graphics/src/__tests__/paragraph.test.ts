// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { SpanList } from "../generated/skityrt/span-list.js";
import { buildSpanList } from "../paragraph.js";

// Read the SpanList bytes back — exactly what the native TASM side does via
// GetRoot<SpanList>(). Proves the JS-built bytes round-trip.
function readBack(bytes: ArrayBuffer): SpanList {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return SpanList.getRootAsSpanList(bb);
}

describe("buildSpanList → SpanList FlatBuffer round-trip", () => {
  it("serializes spans in declaration order with schema defaults", () => {
    const list = readBack(buildSpanList([{ text: "Hello " }, { text: "skity" }]));
    expect(list.spansLength()).toBe(2);

    const s0 = list.spans(0)!;
    expect(s0.text()).toBe("Hello ");
    expect(s0.fontFamily()).toBeNull(); // unset → platform default font
    expect(s0.fontSize()).toBe(14);
    expect(s0.fontWeight()).toBe(400);
    expect(s0.italic()).toBe(false);
    expect(s0.color()).toBe(0xff000000); // opaque black
    expect(s0.letterSpacing()).toBe(0);

    expect(list.spans(1)!.text()).toBe("skity");
  });

  it("round-trips explicit style fields", () => {
    const list = readBack(
      buildSpanList([
        {
          text: "bold",
          fontFamily: "serif",
          fontSize: 21.5,
          fontWeight: 700,
          italic: true,
          color: "#3b82f6",
          letterSpacing: 1.25,
        },
      ]),
    );
    const s = list.spans(0)!;
    expect(s.text()).toBe("bold");
    expect(s.fontFamily()).toBe("serif");
    expect(s.fontSize()).toBeCloseTo(21.5);
    expect(s.fontWeight()).toBe(700);
    expect(s.italic()).toBe(true);
    expect(s.color()).toBe(0xff3b82f6);
    expect(s.letterSpacing()).toBeCloseTo(1.25);
  });

  it("encodes supplementary-plane chars as UTF-8, not CESU-8", () => {
    // The Lynx JSC TextEncoder polyfill would emit CESU-8 here (each surrogate
    // half encoded separately) — native then sees lone surrogates that never
    // resolve a font. The portable encoder must emit one 4-byte sequence.
    const bytes = buildSpanList([{ text: "hi 😀!" }]);
    const s = readBack(bytes).spans(0)!;

    expect(s.text()).toBe("hi 😀!"); // a standard UTF-8 decode reverses it
    const raw = s.text(flatbuffers.Encoding.UTF8_BYTES) as Uint8Array;
    expect(Array.from(raw)).toEqual([
      0x68,
      0x69,
      0x20, // "hi "
      0xf0,
      0x9f,
      0x98,
      0x80, // 😀 = U+1F600, one 4-byte sequence
      0x21, // "!"
    ]);
  });

  it("round-trips CJK text (the primary non-Latin payload)", () => {
    const list = readBack(buildSpanList([{ text: "你好,skity" }]));
    expect(list.spans(0)!.text()).toBe("你好,skity");
  });

  it("throws on an empty span list (a paragraph needs at least one span)", () => {
    expect(() => buildSpanList([])).toThrow();
  });
});
