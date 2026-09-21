// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createFontMetrics, measureTextWidth } from "../font-metrics.js";

// ---------------------------------------------------------------------------
// Synthetic sfnt builder — hand-assembles the minimal tables the parser reads
// (head / hhea / maxp / hmtx / OS/2 / cmap 4 / cmap 12) with exact advance
// widths and mappings, so every lookup path asserts against numbers we chose.
// Real-font ground truth (Press Start 2P) anchors the parser against an
// independently produced font below.
// ---------------------------------------------------------------------------

class Bytes {
  private buf: number[] = [];
  u16(v: number): this {
    this.buf.push((v >> 8) & 0xff, v & 0xff);
    return this;
  }
  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number): this {
    return this.u16((v >> 16) & 0xffff).u16(v & 0xffff);
  }
  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.buf.push(0);
    return this;
  }
  patch16(at: number, v: number): this {
    this.buf[at] = (v >> 8) & 0xff;
    this.buf[at + 1] = v & 0xff;
    return this;
  }
  out(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

/** Assemble an sfnt: header + sorted table directory + 4-byte-aligned tables. */
function buildSfnt(tables: Record<string, Uint8Array>): Uint8Array {
  const tags = Object.keys(tables).sort();
  let total = 12 + tags.length * 16;
  const offsets = new Map<string, number>();
  for (const tag of tags) {
    offsets.set(tag, total);
    total += tables[tag].length + ((4 - (tables[tag].length % 4)) % 4);
  }
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tags.length);
  tags.forEach((tag, i) => {
    const rec = 12 + i * 16;
    for (let c = 0; c < 4; c++) view.setUint8(rec + c, tag.charCodeAt(c));
    view.setUint32(rec + 8, offsets.get(tag)!);
    view.setUint32(rec + 12, tables[tag].length);
    out.set(tables[tag], offsets.get(tag)!);
  });
  return out;
}

function headBytes(unitsPerEm: number): Uint8Array {
  return new Bytes().u32(0x00010000).zeros(50).patch16(18, unitsPerEm).out();
}

function hheaBytes(ascent: number, descent: number, lineGap: number, numberOfHMetrics: number) {
  // descent follows the file convention: negative. 38 bytes — through numberOfHMetrics @34.
  return new Bytes().u32(0x00010000).i16(ascent).i16(descent).i16(lineGap).zeros(28).patch16(34, numberOfHMetrics).out();
}

function maxpBytes(numGlyphs: number): Uint8Array {
  return new Bytes().u32(0x00005000).u16(numGlyphs).out();
}

function hmtxBytes(advances: number[]): Uint8Array {
  const b = new Bytes();
  for (const a of advances) b.u16(a).i16(0);
  return b.out();
}

function os2Bytes(fsSelection: number, typoAscent: number, typoDescent: number, typoLineGap: number) {
  // 78 bytes — through sTypoLineGap; the parser only reads fsSelection/@8 and
  // the typo triple at @68.
  return new Bytes().u16(4).zeros(66).patch16(8, fsSelection).patch16(68, typoAscent).patch16(70, typoDescent).patch16(72, typoLineGap).out();
}

interface Segment4 {
  start: number;
  end: number;
  /** idDelta path (idRangeOffset = 0). */
  delta?: number;
  /** glyphIdArray path — one entry per code point in [start, end]; 0 = .notdef. */
  ids?: number[];
}

/** Build a cmap with one format-4 subtable per encoding record. */
function cmap4Bytes(records: Array<{ platform: number; encoding: number; segments: Segment4[] }>): Uint8Array {
  const subs = records.map(({ segments }) => {
    const segs = [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
    const n = segs.length;
    const idsTotal = segs.reduce((sum, s) => sum + (s.ids?.length ?? 0), 0);
    const length = 16 + 8 * n + 2 * idsTotal;
    const b = new Bytes()
      .u16(4)
      .u16(length)
      .u16(0) // language
      .u16(n * 2) // segCountX2
      .u16(0)
      .u16(0)
      .u16(0); // searchRange / entrySelector / rangeShift — parser ignores
    for (const s of segs) b.u16(s.end);
    b.u16(0); // reservedPad
    for (const s of segs) b.u16(s.start);
    for (const s of segs) b.u16(s.delta ? (s.delta < 0 ? s.delta + 0x10000 : s.delta) : 0);
    // idRangeOffset per segment, then the glyphIdArray slices it points into.
    let sliceStart = 0;
    const offsets: number[] = [];
    for (let i = 0; i < n; i++) {
      const ids = segs[i].ids;
      if (ids) {
        // Address of this segment's slice minus the address of its own slot:
        // (16 + 8n + 2·sliceStart) − (16 + 6n + 2i).
        offsets.push(2 * n - 2 * i + 2 * sliceStart);
        sliceStart += ids.length;
      } else {
        offsets.push(0);
      }
    }
    for (const o of offsets) b.u16(o);
    for (const s of segs) if (s.ids) for (const gid of s.ids) b.u16(gid);
    return b.out();
  });

  const header = new Bytes().u16(0).u16(records.length);
  let offset = 4 + records.length * 8;
  const offsets = subs.map((bytes) => {
    const at = offset;
    offset += bytes.length;
    return at;
  });
  records.forEach((rec, i) => header.u16(rec.platform).u16(rec.encoding).u32(offsets[i]));
  const head = header.out();
  const total = new Uint8Array(offset);
  total.set(head, 0);
  subs.forEach((bytes, i) => total.set(bytes, offsets[i]));
  return total;
}

/** Build a cmap with one format-12 subtable (platform 3, encoding 10). */
function cmap12Bytes(groups: Array<{ start: number; end: number; glyph: number }>): Uint8Array {
  const sub = new Bytes()
    .u16(12)
    .u16(0)
    .u32(16 + groups.length * 12)
    .u32(0)
    .u32(groups.length);
  for (const g of groups) sub.u32(g.start).u32(g.end).u32(g.glyph);
  const subBytes = sub.out();
  const total = new Uint8Array(12 + subBytes.length);
  const view = new DataView(total.buffer);
  view.setUint16(0, 0); // version
  view.setUint16(2, 1); // one encoding record
  view.setUint16(4, 3); // platformID
  view.setUint16(6, 10); // encodingID
  view.setUint32(8, 12); // subtable offset, from cmap table start
  total.set(subBytes, 12);
  return total;
}

// A ready-made font exercising the delta path + hmtx sharing + hhea metrics.
// gids: 0=.notdef(500) 1..7 share 800 (numberOfHMetrics=2 tail packing);
// 'A'..'D' (0x41–0x44) map to gids 1–4 via idDelta −64.
function syntheticDeltaFont(): Uint8Array {
  return buildSfnt({
    head: headBytes(1000),
    hhea: hheaBytes(800, -200, 100, 2),
    maxp: maxpBytes(8),
    hmtx: hmtxBytes([500, 800]),
    cmap: cmap4Bytes([{ platform: 3, encoding: 1, segments: [{ start: 0x41, end: 0x44, delta: -64 }] }]),
  });
}

// Ground truth computed with fontTools 4.63 over the fixture binary
// (fixtures/press-start-2p-ascii.data-uri.txt — "Press Start 2P", OFL,
// ASCII-subset, the same payload ParagraphDemo ships):
//   unitsPerEm 1000 · hhea 1000/0/0 · OS/2 typo 1000/0/0 with fsSelection
//   bit 7 (useTypoMetrics) set · numGlyphs 109 · numberOfHMetrics 1
//   cmap subtables (0,3,4) and (3,1,4) · advances all 1000
//   gids: H=9 e=32 o=43 !=80 · .notdef advance 1000 · '中' unmapped
const FONT_URI = readFileSync(new URL("./fixtures/press-start-2p-ascii.data-uri.txt", import.meta.url), "utf8").trim();

// @lat: [[tests#Graphics parsing layer#Font metrics]]
describe("font metrics — synthetic sfnt", () => {
  it("maps codes via the format-4 idDelta path and shares hmtx tail advances", () => {
    const m = createFontMetrics(syntheticDeltaFont());
    expect(m.unitsPerEm).toBe(1000);
    expect(m.getGlyphIDs("AB")).toEqual([1, 2]);
    // gid 1 and 2 are ≥ numberOfHMetrics(2)? gid1 < 2 → own 800; gid2 → shared 800.
    expect(m.getGlyphWidthsInUnits([0, 1, 2, 7])).toEqual([500, 800, 800, 800]);
    expect(m.at(20).measureText("AB")).toBeCloseTo((800 + 800) * 0.02, 10);
    expect(m.measureText("", 20)).toBe(0);
  });

  it("walks the format-4 idRangeOffset path, including .notdef entries", () => {
    const m = createFontMetrics(
      buildSfnt({
        head: headBytes(1000),
        hhea: hheaBytes(800, -200, 0, 6),
        maxp: maxpBytes(6),
        hmtx: hmtxBytes([500, 600, 700, 750, 800, 900]),
        cmap: cmap4Bytes([{ platform: 3, encoding: 1, segments: [{ start: 0x61, end: 0x63, ids: [3, 0, 5] }] }]),
      }),
    );
    expect(m.getGlyphIDs("abc")).toEqual([3, 0, 5]); // 'b' unmapped → .notdef
    expect(m.measureText("abc", 10)).toBeCloseTo((750 + 500 + 900) / 100, 10);
  });

  it("reads format 12 with astral code points and merges surrogate pairs", () => {
    const m = createFontMetrics(
      buildSfnt({
        head: headBytes(2048),
        hhea: hheaBytes(1600, -400, 0, 10),
        maxp: maxpBytes(10),
        hmtx: hmtxBytes([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]),
        cmap: cmap12Bytes([
          { start: 0x41, end: 0x42, glyph: 1 },
          { start: 0x1f600, end: 0x1f601, glyph: 7 },
        ]),
      }),
    );
    expect(m.getGlyphIDs("A😀")).toEqual([1, 7]); // 😀 is one code point
    expect(m.getGlyphIDs("\ud800")).toEqual([0]); // lone surrogate misses
    expect(m.measureText("A😀", 16)).toBeCloseTo((200 + 800) * (16 / 2048), 10);
  });

  it("uses OS/2 typo metrics only when fsSelection bit 7 is set", () => {
    const withFlag = os2Bytes(0xc0, 700, -250, 50); // 0x80 useTypo | 0x40 italic
    const withoutFlag = os2Bytes(0x40, 700, -250, 50);
    const base = { head: headBytes(1000), hhea: hheaBytes(800, -200, 100, 1), maxp: maxpBytes(1), hmtx: hmtxBytes([500]), cmap: cmap4Bytes([{ platform: 3, encoding: 1, segments: [{ start: 0x41, end: 0x41, delta: -64 }] }]) };
    const typo = createFontMetrics(buildSfnt({ ...base, "OS/2": withFlag })).at(10).getVerticalMetrics();
    expect(typo).toEqual({ ascent: 7, descent: 2.5, lineGap: 0.5, lineHeight: 10 });
    const hhea = createFontMetrics(buildSfnt({ ...base, "OS/2": withoutFlag })).at(10).getVerticalMetrics();
    expect(hhea).toEqual({ ascent: 8, descent: 2, lineGap: 1, lineHeight: 11 });
    const absent = createFontMetrics(buildSfnt(base)).at(10).getVerticalMetrics();
    expect(absent).toEqual(hhea);
  });

  it("prefers (3,1) over (0,3) subtables and rejects symbol-only cmaps", () => {
    const base = { head: headBytes(1000), hhea: hheaBytes(800, -200, 0, 1), maxp: maxpBytes(1), hmtx: hmtxBytes([500]) };
    const dual = createFontMetrics(
      buildSfnt({
        ...base,
        cmap: cmap4Bytes([
          { platform: 0, encoding: 3, segments: [{ start: 0x41, end: 0x41, delta: -64 }] }, // 'A' → 1
          { platform: 3, encoding: 1, segments: [{ start: 0x41, end: 0x41, delta: -63 }] }, // 'A' → 2
        ]),
      }),
    );
    expect(dual.getGlyphID(0x41)).toBe(2);
    const symbolOnly = buildSfnt({
      ...base,
      cmap: cmap4Bytes([{ platform: 3, encoding: 0, segments: [{ start: 0x41, end: 0x41, delta: -64 }] }]),
    });
    expect(() => createFontMetrics(symbolOnly)).toThrow(/no supported Unicode cmap/);
  });

  it("applies letterSpacing per glyph (CSS semantics, trailing included)", () => {
    const m = createFontMetrics(syntheticDeltaFont());
    expect(m.measureText("AB", 20, { letterSpacing: 3 })).toBeCloseTo(32 + 6, 10);
  });

  it("throws on structurally invalid fonts and out-of-range glyph IDs", () => {
    expect(() => createFontMetrics(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
    expect(() => createFontMetrics(new Uint8Array(64))).toThrow(/not an sfnt font/);
    expect(() => createFontMetrics(new Bytes().u32(0x774f4646).zeros(32).out())).toThrow(/WOFF/);
    expect(() => createFontMetrics(new Bytes().u32(0x74746366).zeros(32).out())).toThrow(/TTC/);
    const noCmap = buildSfnt({ head: headBytes(1000), hhea: hheaBytes(800, -200, 0, 1), maxp: maxpBytes(1), hmtx: hmtxBytes([500]) });
    expect(() => createFontMetrics(noCmap)).toThrow(/missing required table\(s\) cmap/);
    const m = createFontMetrics(syntheticDeltaFont());
    expect(() => m.getGlyphWidthsInUnits([8])).toThrow(/glyph ID 8 outside/);
  });

  it("rejects string sources that are not base64 data: URIs", () => {
    expect(() => createFontMetrics("https://example.com/font.ttf")).toThrow(/data: URIs/);
    expect(() => createFontMetrics("data:font/ttf,%AA%BB")).toThrow(/;base64/);
    expect(() => createFontMetrics("data:font/ttf;base64,AA!A")).toThrow(/invalid character/);
    expect(() => createFontMetrics("data:font/ttf;base64,AAAAA")).toThrow(/invalid length/);
  });
});

// @lat: [[tests#Graphics parsing layer#Font metrics]]
describe("font metrics — real font (fontTools-verified)", () => {
  it("matches fontTools ground truth for gids, advances, and widths", () => {
    const m = createFontMetrics(FONT_URI);
    expect(m.unitsPerEm).toBe(1000);
    expect(m.getGlyphIDs("Heo!")).toEqual([9, 32, 43, 80]);
    expect(m.at(24).getGlyphWidths([9, 32, 43, 80])).toEqual([24, 24, 24, 24]); // numberOfHMetrics=1 → shared
    expect(m.at(24).measureText("Hello!")).toBe(144);
    const v = m.at(24).getVerticalMetrics(); // useTypoMetrics set; typo == hhea here
    expect(v).toEqual({ ascent: 24, descent: 0, lineGap: 0, lineHeight: 24 });
  });

  it("measures unmapped code points as .notdef advances", () => {
    const m = createFontMetrics(FONT_URI);
    expect(m.getGlyphID(0x4e2d)).toBe(0); // '中' — outside the ASCII subset
    expect(m.at(24).measureText("中")).toBe(24); // .notdef advance 1000 → 24px
  });

  it("accepts binary inputs and the one-shot convenience with caching", () => {
    const bytes = createFontMetrics(FONT_URI).at(24).getGlyphWidths([9]); // warm, unused
    expect(bytes).toEqual([24]);
    const uri = FONT_URI;
    expect(measureTextWidth(uri, "Hello!", 24)).toBe(144);
    expect(measureTextWidth(uri, "Hello!", 24, { letterSpacing: 2 })).toBe(156);
    const decoded = Uint8Array.from(
      atob(uri.slice(uri.indexOf(",") + 1)),
      (c) => c.charCodeAt(0),
    );
    expect(createFontMetrics(decoded).at(24).measureText("Hello!")).toBe(144);
    expect(createFontMetrics(decoded.buffer).at(24).measureText("Hello!")).toBe(144);
  });
});
