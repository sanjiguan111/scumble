// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Synchronous JS-side font measurement: parse a TTF/OTF binary's `cmap` +
 * `hmtx` (+ `head`/`hhea`/`maxp`/`OS/2`) tables and answer text-width queries
 * without any platform involvement.
 *
 * Why this exists: paragraph LAYOUT lives in native because the Lynx public
 * Android SDK compiles NAPI off — there is no synchronous JSI channel, so JS
 * can never ask the platform shaper "how wide is this string" (the F.3 gap
 * bucket in FEATURE_PARITY.md). Chart-style callers (axis label gutters,
 * Victory-style libraries) nevertheless need widths synchronously. The way
 * out is to measure the SAME bytes the renderer consumes: a span
 * `fontFamily` data: URI is exactly the font binary native decodes, so JS
 * parsing the identical bytes agrees with the native layout by construction.
 *
 * What is measured: the sum of glyph ADVANCE widths (font units ×
 * fontSize/unitsPerEm), matching RN-Skia's `SkFont.getGlyphWidths` semantics —
 * no kerning, no shaping/ligatures, no GSUB. Monochrome widths for label
 * layout, not typesetting.
 *
 * Sources: `Uint8Array`/`ArrayBuffer` bytes always work (fetch or bundle the
 * font yourself for http(s)/file/host sources — JS has no synchronous channel
 * for those). A `data:...;base64,...` string (the inline `fontFamily` form)
 * is decoded here. WOFF/WOFF2 (zlib/brotli containers), TTC collections, and
 * variable-font instances are rejected with explicit errors; measure the
 * static TTF/OTF instead.
 */

import { base64ToBytes } from "./base64.js";

/** Vertical font metrics in px at one size; `descent`/`lineGap` are positive. */
export interface FontVerticalMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
  /** `(ascent + descent + lineGap)` — the font's natural single-line height. */
  lineHeight: number;
}

/** Options for {@link ScaledFontMetrics.measureText} / {@link FontMetrics.measureText}. */
export interface MeasureTextOptions {
  /**
   * Extra per-glyph spacing in px, mirroring the span `letterSpacing` input
   * (applied after every glyph, trailing one included — CSS letter-spacing
   * semantics). Default 0.
   */
  letterSpacing?: number;
}

/** A {@link FontMetrics} bound to one `fontSize` — the SkFont-shaped view. */
export interface ScaledFontMetrics {
  /** The bound size in px. */
  readonly size: number;
  /** Map `text` to glyph IDs (`.notdef` = 0 for unmapped code points). */
  getGlyphIDs(text: string): number[];
  /** Scaled advance width per glyph ID, in px. */
  getGlyphWidths(glyphIDs: number[]): number[];
  /** Total advance width of `text` at {@link ScaledFontMetrics.size}, in px. */
  measureText(text: string, options?: MeasureTextOptions): number;
  /** Vertical metrics scaled to {@link ScaledFontMetrics.size}. */
  getVerticalMetrics(): FontVerticalMetrics;
}

/** A parsed font binary — unscaled; call {@link FontMetrics.at} to bind a size. */
export interface FontMetrics {
  /** The font's design units per em square (16–16384). */
  readonly unitsPerEm: number;
  /** Bind a font size in px; the result caches per (instance, size) call. */
  at(fontSize: number): ScaledFontMetrics;
  /** Glyph ID for one Unicode code point (`.notdef` = 0 when unmapped). */
  getGlyphID(codePoint: number): number;
  /** Map `text` to glyph IDs (surrogate pairs merged; `.notdef` when unmapped). */
  getGlyphIDs(text: string): number[];
  /** Advance width per glyph ID in FONT UNITS (out-of-range IDs throw). */
  getGlyphWidthsInUnits(glyphIDs: number[]): number[];
  /** Total advance width of `text` at `fontSize`, in px. */
  measureText(text: string, fontSize: number, options?: MeasureTextOptions): number;
  /** Vertical metrics scaled to `fontSize`. */
  getVerticalMetrics(fontSize: number): FontVerticalMetrics;
}

/** What {@link createFontMetrics} accepts as a font binary source. */
export type FontMetricsSource = Uint8Array | ArrayBuffer | string;

// One parsed sfnt table — a view over the shared font bytes, bounds-checked.
interface SfntTable {
  offset: number;
  length: number;
}

class Reader {
  constructor(
    private view: DataView,
    private tables: Map<string, SfntTable>,
  ) {}

  u16(table: SfntTable, at: number): number {
    return this.view.getUint16(this.abs(table, at, 2));
  }
  i16(table: SfntTable, at: number): number {
    return this.view.getInt16(this.abs(table, at, 2));
  }
  u32(table: SfntTable, at: number): number {
    return this.view.getUint32(this.abs(table, at, 4));
  }
  private abs(table: SfntTable, at: number, width: number): number {
    const end = table.offset + at + width;
    if (at < 0 || end > table.offset + table.length || end > this.view.byteLength) {
      throw new Error(
        `font: read out of bounds (offset ${table.offset + at}, ${width} bytes) — truncated table`,
      );
    }
    return table.offset + at;
  }
}

const SFNT_MAGIC = new Set([0x00010000, 0x74727565, 0x4f54544f]); // 1.0, 'true', 'OTTO'

// The Unicode-capable (platformID, encodingID) pairs we know how to read, in
// preference order — format 12/4 subtables only. (3,0) symbol fonts are not
// supported: their char codes are not Unicode.
const CMAP_PREFERENCES: ReadonlyArray<readonly [number, number]> = [
  [3, 10],
  [0, 6],
  [0, 4],
  [3, 1],
  [0, 3],
  [0, 2],
  [0, 1],
  [0, 0],
];

function parseFontBytes(bytes: Uint8Array): FontMetrics {
  if (bytes.length < 12) throw new Error("font: too short to be an sfnt font");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774f4646 || magic === 0x774f4632) {
    // 'wOFF' / 'wOF2'
    throw new Error(
      "font: WOFF/WOFF2 containers are not supported — measure the raw TTF/OTF bytes",
    );
  }
  if (magic === 0x74746366) {
    throw new Error("font: TTC collections are not supported — extract a single font first");
  }
  if (!SFNT_MAGIC.has(magic)) {
    throw new Error(`font: not an sfnt font (magic 0x${magic.toString(16).padStart(8, "0")})`);
  }

  const numTables = view.getUint16(4);
  const tables = new Map<string, SfntTable>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) throw new Error("font: truncated table directory");
    const tag = String.fromCharCode(
      view.getUint8(rec),
      view.getUint8(rec + 1),
      view.getUint8(rec + 2),
      view.getUint8(rec + 3),
    );
    const offset = view.getUint32(rec + 8);
    const length = view.getUint32(rec + 12);
    if (offset + length > bytes.length) {
      throw new Error(`font: table '${tag}' out of bounds — truncated font`);
    }
    tables.set(tag, { offset, length });
  }

  const missing = ["head", "hhea", "maxp", "hmtx", "cmap"].filter((t) => !tables.has(t));
  if (missing.length > 0) {
    throw new Error(`font: missing required table(s) ${missing.join(", ")}`);
  }
  const r = new Reader(view, tables);

  // head: unitsPerEm (offset 18) bounds the scale factor for every width.
  const head = tables.get("head")!;
  const unitsPerEm = r.u16(head, 18);
  if (unitsPerEm < 16 || unitsPerEm > 16384) {
    throw new Error(`font: implausible unitsPerEm ${unitsPerEm}`);
  }

  // hhea: numberOfHMetrics (offset 34) gates the hmtx sharing rule.
  const hhea = tables.get("hhea")!;
  const numberOfHMetrics = r.u16(hhea, 34);
  const maxp = tables.get("maxp")!;
  const numGlyphs = r.u16(maxp, 4);
  if (numberOfHMetrics < 1 || numberOfHMetrics > numGlyphs) {
    throw new Error(`font: numberOfHMetrics ${numberOfHMetrics} outside 1..numGlyphs ${numGlyphs}`);
  }

  // OS/2 vertical metrics win when the USE_TYPO_METRICS flag (fsSelection
  // bit 7) is set — the shaper-preferred line metrics; otherwise hhea's.
  const hheaAscent = r.i16(hhea, 4);
  const hheaDescent = r.i16(hhea, 6); // negative in the file
  const hheaLineGap = r.i16(hhea, 8);
  // `+ 0` normalizes −0 → +0 (a zero-valued file field would otherwise
  // surface as a -0 descent and break downstream equality checks).
  let ascentUnits = hheaAscent;
  let descentUnits = -hheaDescent + 0;
  let lineGapUnits = hheaLineGap;
  const os2 = tables.get("OS/2");
  if (os2 && os2.length >= 74 && (r.u16(os2, 8) & 0x80) !== 0) {
    ascentUnits = r.i16(os2, 68);
    descentUnits = -r.i16(os2, 70) + 0;
    lineGapUnits = r.i16(os2, 72);
  }

  const lookup = buildCmapLookup(r, tables.get("cmap")!);

  // Advance width in font units: glyphs at index ≥ numberOfHMetrics share the
  // LAST entry's advance (the hmtx packing rule for monospace tails).
  const hmtx = tables.get("hmtx")!;
  const advanceAt = (glyphID: number): number => {
    if (!Number.isInteger(glyphID) || glyphID < 0 || glyphID >= numGlyphs) {
      throw new Error(`font: glyph ID ${glyphID} outside 0..${numGlyphs - 1}`);
    }
    return r.u16(hmtx, Math.min(glyphID, numberOfHMetrics - 1) * 4);
  };

  const metrics: FontMetrics = {
    unitsPerEm,
    at(fontSize: number): ScaledFontMetrics {
      const scale = fontSize / unitsPerEm;
      const vertical = (): FontVerticalMetrics => {
        const ascent = ascentUnits * scale;
        const descent = descentUnits * scale;
        const lineGap = lineGapUnits * scale;
        return { ascent, descent, lineGap, lineHeight: ascent + descent + lineGap };
      };
      return {
        size: fontSize,
        getGlyphIDs: (text) => metrics.getGlyphIDs(text),
        getGlyphWidths: (glyphIDs) => glyphIDs.map((gid) => advanceAt(gid) * scale),
        measureText: (text, options) => metrics.measureText(text, fontSize, options),
        getVerticalMetrics: vertical,
      };
    },
    getGlyphID(codePoint: number): number {
      return lookup(codePoint);
    },
    getGlyphIDs(text: string): number[] {
      const ids: number[] = [];
      for (const cp of codePoints(text)) ids.push(lookup(cp));
      return ids;
    },
    getGlyphWidthsInUnits(glyphIDs: number[]): number[] {
      return glyphIDs.map(advanceAt);
    },
    measureText(text: string, fontSize: number, options?: MeasureTextOptions): number {
      const scale = fontSize / unitsPerEm;
      const spacing = options?.letterSpacing ?? 0;
      let units = 0;
      let count = 0;
      for (const cp of codePoints(text)) {
        units += advanceAt(lookup(cp));
        count++;
      }
      return units * scale + spacing * count;
    },
    getVerticalMetrics(fontSize: number): FontVerticalMetrics {
      return metrics.at(fontSize).getVerticalMetrics();
    },
  };
  return metrics;
}

/**
 * Build the code point → glyph ID lookup from the best Unicode `cmap`
 * subtable (format 4 or 12 — the only formats the fonts in scope carry).
 */
function buildCmapLookup(r: Reader, cmap: SfntTable): (codePoint: number) => number {
  const numSubtables = r.u16(cmap, 2);
  interface Subtable {
    platformID: number;
    encodingID: number;
    offset: number;
  }
  const subtables: Subtable[] = [];
  for (let i = 0; i < numSubtables; i++) {
    subtables.push({
      platformID: r.u16(cmap, 4 + i * 8),
      encodingID: r.u16(cmap, 6 + i * 8),
      offset: r.u32(cmap, 8 + i * 8),
    });
  }

  let chosen: Subtable | undefined;
  let preference = Infinity; // lower index in CMAP_PREFERENCES = higher priority
  for (const sub of subtables) {
    const idx = CMAP_PREFERENCES.findIndex(
      ([p, e]) => p === sub.platformID && e === sub.encodingID,
    );
    if (idx >= 0 && idx < preference && isSupportedFormat(r, cmap, sub)) {
      chosen = sub;
      preference = idx;
    }
  }
  if (!chosen) {
    throw new Error(
      "font: no supported Unicode cmap subtable (need format 4 or 12; symbol cmaps are not supported)",
    );
  }
  const format = r.u16(cmap, chosen.offset);

  if (format === 4) return buildFormat4Lookup(r, cmap, chosen.offset);
  return buildFormat12Lookup(r, cmap, chosen.offset);
}

function isSupportedFormat(r: Reader, cmap: SfntTable, sub: { offset: number }): boolean {
  const format = r.u16(cmap, sub.offset);
  return format === 4 || format === 12;
}

/**
 * Format 4 — segmented BMP mapping. Both the linear `idDelta` shortcut and
 * the `idRangeOffset` glyph-id-array path are handled, including the
 * spec's self-referential addressing: `idRangeOffset[i]` is measured FROM ITS
 * OWN slot, so the glyph id lives at `&idRangeOffset[i] + idRangeOffset[i] +
 * 2 × (code − startCode[i])`.
 */
function buildFormat4Lookup(r: Reader, cmap: SfntTable, base: number): (cp: number) => number {
  const segCount = r.u16(cmap, base + 6) / 2;
  const endCode = base + 14;
  const startCode = endCode + segCount * 2 + 2; // +2 skips reservedPad
  const idDelta = startCode + segCount * 2;
  const idRangeOffset = idDelta + segCount * 2;

  return (cp: number): number => {
    if (cp > 0xffff) return 0;
    // Segments are disjoint and sorted, so the LEFTMOST segment whose
    // endCode ≥ cp is the only one that can hold cp (any later segment's
    // start is past this end; any earlier segment's end is below cp).
    for (let i = 0; i < segCount; i++) {
      const end = r.u16(cmap, endCode + i * 2);
      if (cp > end) continue;
      const start = r.u16(cmap, startCode + i * 2);
      if (cp < start) return 0; // cp sits in the gap before this segment
      const delta = r.u16(cmap, idDelta + i * 2); // stored u16; wraps via mod 65536
      const rangeOffset = r.u16(cmap, idRangeOffset + i * 2);
      if (rangeOffset === 0) return (cp + delta) % 65536;
      // idRangeOffset[i]'s own address, per the spec's self-referential trick.
      const gidAddress = idRangeOffset + i * 2 + rangeOffset + (cp - start) * 2;
      const gid = r.u16(cmap, gidAddress);
      return gid === 0 ? 0 : (gid + delta) % 65536;
    }
    return 0;
  };
}

/** Format 12 — segmented coverage over the FULL Unicode range (groups of 3×u32). */
function buildFormat12Lookup(r: Reader, cmap: SfntTable, base: number): (cp: number) => number {
  const nGroups = r.u32(cmap, base + 12);
  const groups = base + 16;

  return (cp: number): number => {
    let lo = 0;
    let hi = nGroups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = r.u32(cmap, groups + mid * 12);
      const end = r.u32(cmap, groups + mid * 12 + 4);
      if (cp < start) hi = mid - 1;
      else if (cp > end) lo = mid + 1;
      else return r.u32(cmap, groups + mid * 12 + 8) + (cp - start);
    }
    return 0;
  };
}

/**
 * Iterate a string's Unicode code points — surrogate pairs merged into one
 * astral code point (mirroring {@link paragraph}'s UTF-8 encoder), lone
 * surrogates passed through as their own code unit value (they will simply
 * miss every cmap segment and measure as `.notdef`, the same garbage-in
 * behavior the layout side shows).
 */
function* codePoints(text: string): Generator<number> {
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    yield code;
  }
}

function decodeSource(source: FontMetricsSource): Uint8Array {
  if (typeof source !== "string") {
    return source instanceof Uint8Array ? source : new Uint8Array(source);
  }
  const comma = source.indexOf(",");
  if (!source.startsWith("data:") || comma < 0) {
    throw new Error(
      "font: string sources must be data: URIs — fetch http(s)/file/host bytes and pass a Uint8Array (JS has no synchronous channel for them)",
    );
  }
  if (!/;base64$/i.test(source.slice(0, comma))) {
    throw new Error(
      "font: data: URI must carry ;base64 (percent-encoded font text is not a font binary)",
    );
  }
  return base64ToBytes(source.slice(comma + 1));
}

/**
 * Parse a font binary into a {@link FontMetrics}. Pure JS, synchronous, no
 * platform involvement — the point is width queries that stay on the JS side
 * (the F.3 architecture gap), measured from the same bytes native renders.
 *
 * @param source Raw TTF/OTF bytes, or the `data:...;base64,...` URI a span
 *   `fontFamily` accepts (decoded here). WOFF/WOFF2/TTC throw.
 * @returns Unscaled metrics; bind a size with `.at(fontSize)`.
 * @throws On any structurally invalid input, with a message naming the cause —
 *   a wrong font file should fail loudly, not measure silently as zero.
 *
 * @example
 * const metrics = createFontMetrics(FONT_DATA_URI);   // the same URI <TextSpan fontFamily> takes
 * metrics.at(14).measureText("1.2k");                 // px — axis-label gutter math in JS
 * metrics.at(14).getVerticalMetrics().lineHeight;
 */
export function createFontMetrics(source: FontMetricsSource): FontMetrics {
  return parseFontBytes(decodeSource(source));
}

// Per-source parse cache for the convenience entry: keyed by URI string
// (stable content) or the exact binary object (WeakMap — identity, no leak).
const cacheByString = new Map<string, FontMetrics>();
const cacheByObject = new WeakMap<object, FontMetrics>();

function metricsFor(source: FontMetricsSource): FontMetrics {
  if (typeof source === "string") {
    let m = cacheByString.get(source);
    if (!m) {
      m = createFontMetrics(source);
      cacheByString.set(source, m);
    }
    return m;
  }
  const key = source instanceof Uint8Array ? (source as object) : (source as object);
  let m = cacheByObject.get(key);
  if (!m) {
    m = createFontMetrics(source);
    cacheByObject.set(key, m);
  }
  return m;
}

/**
 * One-shot text width: parse (and cache) `source`, measure `text` at
 * `fontSize`. The `@scumble/react`-level convenience for callers that just
 * want a number — hold a {@link FontMetrics} yourself for repeated queries.
 *
 * @example
 * measureTextWidth(FONT_DATA_URI, "Q3 (est.)", 12);  // px
 */
export function measureTextWidth(
  source: FontMetricsSource,
  text: string,
  fontSize: number,
  options?: MeasureTextOptions,
): number {
  return metricsFor(source).measureText(text, fontSize, options);
}
