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
    expect(s0.decoration()).toBe(0); // no decoration
    expect(s0.decorationColor()).toBe(0); // 0 = follow the text color
    expect(s0.decorationThickness()).toBe(0); // 0 = font-metrics default
    expect(s0.decorationStyle()).toBe(0); // SOLID

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

  // @lat: [[tests#Graphics parsing layer#Paragraph decoration serialization]]
  it("round-trips text decoration fields", () => {
    const list = readBack(
      buildSpanList([
        {
          text: "u",
          decoration: "underline",
          decorationColor: "#3b82f6",
          decorationThickness: 3,
          decorationStyle: "wavy",
        },
        { text: "combo", decoration: ["underline", "line-through"] },
        { text: "nums", decoration: 6, decorationStyle: 4 },
        { text: "case", decoration: "Underline" },
        { text: "alias", decoration: "strikethrough" },
        { text: "unknown", decoration: "blink", decorationStyle: "blink" },
      ]),
    );
    expect(list.spansLength()).toBe(6);

    const s0 = list.spans(0)!; // explicit everything
    expect(s0.decoration()).toBe(1); // UNDERLINE
    expect(s0.decorationColor()).toBe(0xff3b82f6);
    expect(s0.decorationThickness()).toBeCloseTo(3);
    expect(s0.decorationStyle()).toBe(4); // WAVY

    expect(list.spans(1)!.decoration()).toBe(5); // underline | line-through
    expect(list.spans(1)!.decorationColor()).toBe(0); // unset
    expect(list.spans(1)!.decorationStyle()).toBe(0); // solid default

    expect(list.spans(2)!.decoration()).toBe(6); // numeric passthrough
    expect(list.spans(2)!.decorationStyle()).toBe(4); // numeric passthrough

    expect(list.spans(3)!.decoration()).toBe(1); // case-insensitive
    expect(list.spans(4)!.decoration()).toBe(4); // strikethrough alias

    expect(list.spans(5)!.decoration()).toBe(0); // unknown name → no bits
    expect(list.spans(5)!.decorationStyle()).toBe(0); // unknown → SOLID
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
