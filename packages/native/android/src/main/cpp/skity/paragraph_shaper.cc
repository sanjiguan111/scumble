// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "paragraph_shaper.h"

#include <SheenBidi/SheenBidi.h>
#include <flatbuffers/flatbuffers.h>
#include <harfbuzz/hb.h>

#include <algorithm>
#include <cstring>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "bidi_line.h"
#include "decoration.h"
#include "font_registry.h"
#include "generated/paragraph_runs_generated.h"
#include "line_breaker.h"
#include "typeface_cache.h"

namespace {

// Font URIs a shape pass found missing in the TypefaceCache, keyed by node.
// Written on the TASM thread (inside ShapeParagraph) and drained by the JNI
// nativeTakeMissedFontUris on the same thread right after — mutex only as a
// guard against future misuse.
std::mutex g_missed_mutex;
std::unordered_map<uint32_t, std::vector<std::string>> g_missed_fonts;

void RecordMissedFont(uint32_t node_id, const std::string &uri) {
  std::lock_guard<std::mutex> lock(g_missed_mutex);
  auto &uris = g_missed_fonts[node_id];
  if (std::find(uris.begin(), uris.end(), uri) == uris.end()) uris.push_back(uri);
}

} // namespace

#include <skity/graphic/paint.hpp>
#include <skity/text/font.hpp>
#include <skity/text/font_manager.hpp>
#include <skity/text/font_style.hpp>
#include <skity/text/typeface.hpp>
#include <skity/text/utf.hpp>

namespace skityrt {

namespace {

using skity::FontManager;
using skity::FontStyle;
using skity::Typeface;

// ---------------------------------------------------------------------------
// HarfBuzz plumbing — hb_face per skity Typeface, built from the typeface's
// own file data so shaping and DrawGlyphs share one glyph-ID space.
// ---------------------------------------------------------------------------

struct HbFaceEntry {
  hb_face_t *face = nullptr;
  hb_blob_t *blob = nullptr;
  std::shared_ptr<skity::Data> data; // keeps the blob's bytes alive
};

std::mutex g_hb_face_mutex;
std::unordered_map<skity::TypefaceID, HbFaceEntry> g_hb_faces;

hb_face_t *FaceForTypeface(const std::shared_ptr<Typeface> &typeface) {
  const skity::TypefaceID id = typeface->TypefaceId();
  std::lock_guard<std::mutex> lock(g_hb_face_mutex);
  auto it = g_hb_faces.find(id);
  if (it != g_hb_faces.end()) return it->second.face;

  auto data = typeface->GetData();
  if (!data || data->Size() == 0) {
    g_hb_faces.emplace(id, HbFaceEntry{});
    return nullptr;
  }
  HbFaceEntry entry;
  entry.data = data;
  entry.blob = hb_blob_create((const char *)data->RawData(), (unsigned)data->Size(),
                              HB_MEMORY_MODE_READONLY, nullptr, nullptr);
  entry.face = hb_face_create(entry.blob, 0 /*collection index: skity already
                                                 resolves ttc members*/);
  hb_face_set_upem(entry.face, typeface->GetUnitsPerEm());
  g_hb_faces.emplace(id, entry);
  return entry.face;
}

hb_font_t *FontForTypeface(const std::shared_ptr<Typeface> &typeface, float size) {
  hb_face_t *face = FaceForTypeface(typeface);
  if (face == nullptr) return nullptr;
  hb_font_t *font = hb_font_create(face);
  hb_font_set_scale(font, (int)(size * 64.f + 0.5f), (int)(size * 64.f + 0.5f));
  // Variable fonts: skity's MatchStyle instantiates the axis settings —
  // mirror them so HarfBuzz advances match the rendered outlines.
  auto variation = typeface->GetVariationDesignPosition();
  const auto &coords = variation.GetCoordinates();
  if (!coords.empty()) {
    std::vector<float> values;
    values.reserve(coords.size());
    for (const auto &coord : coords)
      values.push_back(coord.value);
    hb_font_set_var_coords_design(font, values.data(), (unsigned)values.size());
  }
  return font;
}

// ---------------------------------------------------------------------------
// Font metrics (ascent/descent) per (typeface, size), layout-call local.
// ---------------------------------------------------------------------------

struct MetricsKey {
  skity::TypefaceID id;
  float size;
  bool operator==(const MetricsKey &o) const { return id == o.id && size == o.size; }
};

struct MetricsKeyHash {
  size_t operator()(const MetricsKey &k) const {
    return std::hash<uint64_t>()(((uint64_t)k.id << 32) ^ *(uint32_t *)&k.size);
  }
};

void GetAscentDescent(
    const std::shared_ptr<Typeface> &typeface, float size,
    std::unordered_map<MetricsKey, std::pair<float, float>, MetricsKeyHash> &cache, float *ascent,
    float *descent) {
  MetricsKey key{typeface->TypefaceId(), size};
  auto it = cache.find(key);
  if (it == cache.end()) {
    skity::Font font(typeface, size);
    skity::FontMetrics metrics;
    font.GetMetrics(&metrics);
    it = cache.emplace(key, std::make_pair(-metrics.ascent_, metrics.descent_)).first;
  }
  *ascent = it->second.first;
  *descent = it->second.second;
}

// ---------------------------------------------------------------------------
// The shaped glyph stream — one entry per output glyph, in logical order.
// ---------------------------------------------------------------------------

struct ShapedGlyph {
  uint32_t firstCp; // cluster's first code point (break classification)
  uint32_t cpIndex; // that code point's index in the full-text array (bidi)
  uint16_t glyphId;
  float advance; // includes letterSpacing
  float xOffset; // HarfBuzz in-glyph adjustment
  std::shared_ptr<Typeface> typeface;
  float fontSize;
  uint32_t color; // span color (0xAARRGGBB)
};

// Shape one fallback-homogeneous segment of a span against one typeface.
// `dir` is the segment's UAX #9 embedding direction (odd level → RTL) —
// HarfBuzz then emits the segment's glyphs in visual (left-to-right) order,
// which is exactly what the line assembly consumes. `cpBase` is the segment's
// first code point's index in the full-text array, so clusters map back to
// their bidi position.
void ShapeSegment(const std::vector<uint32_t> &codepoints, uint32_t cpBase, hb_direction_t dir,
                  const std::shared_ptr<Typeface> &typeface, float fontSize, float letterSpacing,
                  uint32_t color, std::vector<ShapedGlyph> &out) {
  hb_font_t *font = FontForTypeface(typeface, fontSize);
  if (font == nullptr) return;

  hb_buffer_t *buffer = hb_buffer_create();
  hb_buffer_add_utf32(buffer, codepoints.data(), (int)codepoints.size(), 0, (int)codepoints.size());
  hb_buffer_guess_segment_properties(buffer);
  hb_buffer_set_direction(buffer, dir);
  hb_shape(font, buffer, nullptr, 0);

  const unsigned glyphCount = hb_buffer_get_length(buffer);
  const hb_glyph_info_t *infos = hb_buffer_get_glyph_infos(buffer, nullptr);
  const hb_glyph_position_t *positions = hb_buffer_get_glyph_positions(buffer, nullptr);
  for (unsigned i = 0; i < glyphCount; i++) {
    // cluster indexes into the segment's code points; ligatures share one.
    const unsigned cluster = infos[i].cluster;
    ShapedGlyph g;
    g.firstCp = cluster < codepoints.size() ? codepoints[cluster] : 0;
    g.cpIndex = cpBase + cluster;
    g.glyphId = (uint16_t)infos[i].codepoint;
    g.advance = (float)positions[i].x_advance / 64.f + letterSpacing;
    g.xOffset = (float)positions[i].x_offset / 64.f;
    g.typeface = typeface;
    g.fontSize = fontSize;
    g.color = color;
    out.push_back(std::move(g));
  }
  hb_buffer_destroy(buffer);
  hb_font_destroy(font);
}

} // namespace

ParagraphShapeResult ShapeParagraph(const uint8_t *spanListData, size_t spanListSize,
                                    uint32_t nodeId, float width, uint8_t align, uint8_t direction,
                                    float lineHeight, int32_t maxLines) {
  ParagraphShapeResult result;
  if (spanListData == nullptr || spanListSize == 0 || !(width > 0.f)) return result;

  const auto *spanList = ::flatbuffers::GetRoot<skityrt::SpanList>(spanListData);
  const auto *spans = spanList != nullptr ? spanList->spans() : nullptr;
  if (spans == nullptr || spans->size() == 0) return result;

  auto fontManager = FontManager::RefDefault();

  // 1) Concatenate every span's text into one UTF-32 array — the coordinate
  // space UAX #9 (SheenBidi) resolves levels in, and the `cpIndex` every
  // shaped glyph carries back into it. Newlines become spaces first: SB treats
  // them as paragraph separators and would stop the paragraph at the first
  // one, while this backend's v1 semantics keep the whole payload one
  // paragraph (the line breaker classifies them as plain whitespace).
  std::vector<uint32_t> fullText;
  struct SpanText {
    const skityrt::Span *span;
    std::vector<uint32_t> codepoints; // span-local (original code points)
    uint32_t cpStart;                 // index into fullText
  };
  std::vector<SpanText> spanTexts;
  // Decoration params, index-parallel to spanTexts (only non-empty spans
  // enter, same filter as above). bits = Span.decoration bitfield.
  struct SpanDeco {
    uint32_t bits;
    uint32_t color;  // 0 = follow the span color
    float thickness; // <= 0 = font-metrics default
    uint8_t style;   // skityrt::DecorationStyle
  };
  std::vector<SpanDeco> spanDecos;
  spanTexts.reserve(spans->size());
  for (::flatbuffers::uoffset_t i = 0; i < spans->size(); i++) {
    const skityrt::Span *span = spans->Get(i);
    const char *text = span->text() != nullptr ? span->text()->c_str() : "";
    if (*text == '\0') continue;
    SpanText st;
    st.span = span;
    st.cpStart = (uint32_t)fullText.size();
    skity::UTF::UTF8ToCodePoint(text, strlen(text), st.codepoints);
    for (uint32_t cp : st.codepoints) {
      fullText.push_back(cp == '\n' || cp == '\r' ? ' ' : cp);
    }
    if (!st.codepoints.empty()) {
      spanDecos.push_back(SpanDeco{span->decoration(), span->decorationColor(),
                                   span->decorationThickness(), (uint8_t)span->decorationStyle()});
      spanTexts.push_back(std::move(st));
    }
  }

  // UAX #9 over the full text: one paragraph, base level from the `direction`
  // prop (0=ltr, 1=rtl, 2=auto → first strong, LTR when none). Levels are per
  // code point; shaping splits on level changes so HarfBuzz shapes each bidi
  // run in its own direction.
  SBCodepointSequence sequence = {SBStringEncodingUTF32, fullText.data(),
                                  (SBUInteger)fullText.size()};
  SBAlgorithmRef algorithm = SBAlgorithmCreate(&sequence);
  const SBLevel requestedLevel = direction == 1   ? (SBLevel)1
                                 : direction == 2 ? SBLevelDefaultLTR
                                                  : (SBLevel)0;
  SBParagraphRef paragraph =
      algorithm != nullptr
          ? SBAlgorithmCreateParagraph(algorithm, 0, (SBUInteger)fullText.size(), requestedLevel)
          : nullptr;
  const SBLevel *levels = paragraph != nullptr ? SBParagraphGetLevelsPtr(paragraph) : nullptr;
  const SBUInteger levelLength = paragraph != nullptr ? SBParagraphGetLength(paragraph) : 0;
  const SBLevel baseLevel = paragraph != nullptr ? SBParagraphGetBaseLevel(paragraph) : 0;
  const bool rtlBase = (baseLevel & 1) != 0;

  // 2) Font resolution + fallback segmentation + shaping → glyph stream.
  // Fallback segmentation now nests INSIDE one bidi level at a time: every
  // shaped segment is bidi-homogeneous, so HarfBuzz's visual-order output per
  // segment composes into the line assembly without further reordering.
  std::vector<ShapedGlyph> glyphs;
  for (const auto &st : spanTexts) {
    const skityrt::Span *span = st.span;
    const std::vector<uint32_t> &codepoints = st.codepoints;
    const uint32_t spanEnd = st.cpStart + (uint32_t)codepoints.size();

    const std::string family =
        span->fontFamily() != nullptr ? span->fontFamily()->str() : std::string();
    const FontStyle style(span->fontWeight(), FontStyle::kNormal_Width,
                          span->italic() ? FontStyle::kItalic_Slant : FontStyle::kUpright_Slant);
    // Custom fonts: `data:` URIs decode synchronously; schemed URIs
    // (http/file/host) come back from the TypefaceCache when the platform
    // font loader has delivered them — a miss falls back to the default font
    // for THIS layout (recorded for ScumbleFontController, which re-triggers
    // layout once the bytes land). One file = one style; broken payloads are
    // sticky failures, never dropped spans.
    std::shared_ptr<Typeface> base;
    if (TypefaceCache::IsDataUri(family)) {
      base = TypefaceCache::Instance().FindOrLoad(family);
    } else if (TypefaceCache::IsLoadableUri(family)) {
      std::shared_ptr<Typeface> hit;
      switch (TypefaceCache::LookupUri(family, &hit)) {
      case TypefaceCache::Lookup::kReady:
        base = hit;
        break;
      case TypefaceCache::Lookup::kMiss:
        RecordMissedFont(nodeId, family);
        break;
      case TypefaceCache::Lookup::kFailed:
        break;
      }
    } else if (family.empty()) {
      base = fontManager->GetDefaultTypeface(style);
    } else {
      base = fontManager->MatchFamilyStyle(family.c_str(), style);
    }
    if (base == nullptr) base = fontManager->GetDefaultTypeface(style);
    if (base == nullptr) continue;

    auto levelAt = [&](uint32_t cp) -> uint8_t {
      if (levels != nullptr && cp < levelLength) return levels[cp];
      return (uint8_t)baseLevel;
    };

    // Slice the span into bidi-level-homogeneous sub-ranges first…
    for (uint32_t bs = st.cpStart; bs < spanEnd;) {
      const uint8_t level = levelAt(bs);
      uint32_t be = bs + 1;
      while (be < spanEnd && levelAt(be) == level)
        be++;
      const hb_direction_t dir = (level & 1) != 0 ? HB_DIRECTION_RTL : HB_DIRECTION_LTR;

      // …then into fallback-homogeneous runs: a char stays on `base` while it
      // has a glyph there, otherwise MatchFamilyStyleCharacter picks the
      // system fallback (mirrors TextBlobBuilder's GenerateTextRuns walk, but
      // before shaping — a typeface change needs its own hb_font).
      std::vector<uint32_t> segment;
      std::shared_ptr<Typeface> segmentFace = base;
      uint32_t segmentCpBase = bs; // segment's first cp index in fullText
      std::unordered_map<uint32_t, std::shared_ptr<Typeface>> fallbackMemo;
      auto flush = [&]() {
        if (!segment.empty() && segmentFace != nullptr) {
          ShapeSegment(segment, segmentCpBase, dir, segmentFace, span->fontSize(),
                       span->letterSpacing(), span->color(), glyphs);
        }
        segment.clear();
      };
      for (uint32_t bi = bs; bi < be; bi++) {
        const uint32_t cp = codepoints[bi - st.cpStart];
        std::shared_ptr<Typeface> face = base;
        if (base->UnicharToGlyph(cp) == 0) {
          auto memo = fallbackMemo.find(cp);
          if (memo != fallbackMemo.end()) {
            face = memo->second;
          } else {
            face = fontManager->MatchFamilyStyleCharacter(family.empty() ? nullptr : family.c_str(),
                                                          style, nullptr, 0, cp);
            if (face == nullptr || face->UnicharToGlyph(cp) == 0) face = nullptr;
            fallbackMemo.emplace(cp, face);
          }
        }
        if (face != segmentFace) {
          flush();
          segmentFace = face;
          segmentCpBase = bi;
        }
        if (face != nullptr) segment.push_back(cp);
        // A glyph-less char on every fallback face is dropped entirely.
      }
      flush();
      bs = be;
    }
  }
  // The bidi-coordinate view of the glyph stream (parallel to `glyphs`).
  std::vector<uint32_t> glyphCp(glyphs.size());
  for (size_t i = 0; i < glyphs.size(); i++)
    glyphCp[i] = glyphs[i].cpIndex;
  // Owning span per glyph (for decoration intervals): a glyph's cpIndex is its
  // cluster's first cp, clusters never cross a span boundary (spans shape
  // independently), so a cp→span lookup resolves ownership exactly.
  std::vector<int32_t> glyphSpan(glyphs.size(), -1);
  if (!spanDecos.empty()) {
    std::vector<int32_t> cpSpan(fullText.size(), -1);
    for (size_t si = 0; si < spanTexts.size(); si++) {
      const uint32_t end = spanTexts[si].cpStart + (uint32_t)spanTexts[si].codepoints.size();
      for (uint32_t cp = spanTexts[si].cpStart; cp < end && cp < cpSpan.size(); cp++)
        cpSpan[cp] = (int32_t)si;
    }
    for (size_t i = 0; i < glyphs.size(); i++)
      glyphSpan[i] = glyphs[i].cpIndex < cpSpan.size() ? cpSpan[glyphs[i].cpIndex] : -1;
  }

  // 2) Line breaking over the glyph stream. Empty glyph content falls
  // through — see the note above the serialization: a 0-run entry must still
  // be produced so the retained runs clear.
  std::vector<BreakChar> breakChars;
  breakChars.reserve(glyphs.size());
  for (const auto &g : glyphs) {
    breakChars.push_back(BreakChar{g.firstCp, g.advance, ClassifyBreakChar(g.firstCp)});
  }
  std::vector<std::pair<uint32_t, uint32_t>> lines = BreakLines(breakChars, width);
  // Empty content (every span blank) falls THROUGH to the serialization: a
  // 0-run entry clears the retained node's previous runs, while an empty
  // payload would keep the last layout alive (the iOS backend's emptyResult
  // mirrors this). The line-assembly loop below is naturally safe on empty
  // lines/glyphs.
  const size_t totalLines = lines.size();
  if (maxLines > 0 && (int32_t)totalLines > maxLines) {
    lines.resize((size_t)maxLines);
  }
  // maxLines clipped real content → the last kept line gets an end-ellipsis
  // (same contract as the iOS backend's kCTLineTruncationEnd).
  const bool clipped = maxLines > 0 && (int32_t)totalLines > maxLines;

  // 3) Line assembly: baselines, bidi visual order, alignment, trailing-
  // space trim, ellipsis.
  std::unordered_map<MetricsKey, std::pair<float, float>, MetricsKeyHash> metricsCache;
  const float mult = lineHeight > 0.f ? lineHeight : 1.f;

  struct OutRun {
    uint32_t fontId;
    uint32_t color;
    std::vector<uint16_t> glyphs;
    std::vector<float> px;
    std::vector<float> py;
  };
  std::vector<OutRun> outRuns;
  // Decoration output entries — geometry resolved during line assembly below
  // (one entry per span × line × set decoration bit), serialized alongside
  // the runs.
  struct OutDeco {
    float x, width, y, thickness;
    uint32_t color;
    uint8_t style;
  };
  std::vector<OutDeco> outDecos;
  // Full FontMetrics per (typeface, size), for decoration line positions.
  std::unordered_map<MetricsKey, skity::FontMetrics, MetricsKeyHash> decoMetrics;
  auto decoMetricsFor = [&](const ShapedGlyph &g) -> skity::FontMetrics {
    const MetricsKey key{g.typeface->TypefaceId(), g.fontSize};
    auto it = decoMetrics.find(key);
    if (it == decoMetrics.end()) {
      skity::FontMetrics m;
      skity::Font font(g.typeface, g.fontSize);
      font.GetMetrics(&m);
      it = decoMetrics.emplace(key, m).first;
    }
    return it->second;
  };
  // FontRegistry::Register is idempotent per (typeface, size) — repeated
  // layouts return the existing id and don't grow the registry.

  float y = 0.f;
  int32_t lastLineIndex = (int32_t)lines.size() - 1;
  for (int32_t li = 0; li <= lastLineIndex; li++) {
    const uint32_t start = lines[li].first;
    const uint32_t end = lines[li].second;

    // Line metrics from every font on the line.
    float ascent = 0.f, descent = 0.f;
    for (uint32_t i = start; i < end; i++) {
      float a = 0.f, d = 0.f;
      GetAscentDescent(glyphs[i].typeface, glyphs[i].fontSize, metricsCache, &a, &d);
      ascent = std::max(ascent, a);
      descent = std::max(descent, d);
    }

    // Bidi visual order: the line's code-point range → SBLine (UAX #9 L1+L2
    // applied, runs already in visual order) → this line's glyph order,
    // leftmost first. `cpEnd` anchors on the NEXT line's first glyph so the
    // two lines' code-point ranges tile without cluster gaps.
    const uint32_t cpStart = glyphs[start].cpIndex;
    const uint32_t cpEnd =
        li < lastLineIndex ? glyphs[lines[li + 1].first].cpIndex : glyphs[end - 1].cpIndex + 1;
    std::vector<uint32_t> order;
    if (paragraph != nullptr && cpEnd > cpStart) {
      SBLineRef sbLine = SBParagraphCreateLine(paragraph, cpStart, cpEnd - cpStart);
      if (sbLine != nullptr) {
        const SBRun *sbRuns = SBLineGetRunsPtr(sbLine);
        const SBUInteger runCount = SBLineGetRunCount(sbLine);
        std::vector<BidiRun> bidiRuns((size_t)runCount);
        for (SBUInteger r = 0; r < runCount; r++) {
          bidiRuns[(size_t)r] = {(uint32_t)sbRuns[r].offset, (uint32_t)sbRuns[r].length,
                                 (uint8_t)sbRuns[r].level};
        }
        order = BuildLineVisualOrder(glyphCp, start, end, bidiRuns.data(), bidiRuns.size());
        SBLineRelease(sbLine);
      }
    }
    if (order.empty() && end > start) {
      // No bidi data (SheenBidi unavailable / empty line) — logical order,
      // which equals visual order for a pure-LTR paragraph.
      for (uint32_t i = start; i < end; i++)
        order.push_back(i);
    }

    // Visual width excludes the space run at the line's VISUAL edge — right
    // for an LTR paragraph, left for RTL (the logical tail either way). The
    // excluded spaces still render, off-margin.
    float lineWidth = 0.f;
    for (uint32_t i : order)
      lineWidth += glyphs[i].advance;
    size_t head = 0, tail = order.size();
    if (rtlBase) {
      while (head < tail && breakChars[order[head]].cls == BreakClass::kSpace) {
        lineWidth -= glyphs[order[head]].advance;
        head++;
      }
    } else {
      while (tail > head && breakChars[order[tail - 1]].cls == BreakClass::kSpace) {
        tail--;
        lineWidth -= glyphs[order[tail]].advance;
      }
    }

    // Ellipsis on the last kept line when maxLines clipped content: resolve
    // the "…" glyph from the line's logical-tail glyph's font, then drop
    // glyphs from the logical tail (visual edge per base direction) until it
    // fits.
    bool hasEllipsis = false;
    skity::GlyphID ellGlyph = 0;
    float ellAdvance = 0.f;
    uint32_t ellGlyphIdx = start;
    if (li == lastLineIndex && clipped && tail > head) {
      const uint32_t cutIdx = rtlBase ? order[head] : order[tail - 1];
      const ShapedGlyph &tailGlyph = glyphs[cutIdx];
      ellGlyph = tailGlyph.typeface->UnicharToGlyph(0x2026);
      if (ellGlyph != 0) {
        skity::Font font(tailGlyph.typeface, tailGlyph.fontSize);
        const skity::GlyphData *metric = nullptr;
        skity::Paint paint;
        paint.SetTextSize(tailGlyph.fontSize);
        font.LoadGlyphMetrics(&ellGlyph, 1, &metric, paint);
        ellAdvance = metric != nullptr ? metric->AdvanceX() : tailGlyph.fontSize * 0.5f;
        while (tail - head > 1 && lineWidth + ellAdvance > width) {
          if (rtlBase) {
            lineWidth -= glyphs[order[head]].advance;
            head++;
          } else {
            tail--;
            lineWidth -= glyphs[order[tail]].advance;
          }
        }
        lineWidth += ellAdvance;
        hasEllipsis = true;
        ellGlyphIdx = cutIdx;
      }
    }

    const float lineAdvance = (ascent + descent) * mult;
    const float extra = lineAdvance - (ascent + descent);
    const float baseline = y + extra * 0.5f + ascent;
    y += lineAdvance;

    float x0 = 0.f;
    if (align == 1) {
      x0 = (width - lineWidth) * 0.5f;
    } else if (align == 2) {
      x0 = width - lineWidth;
    }

    // Emit runs in visual order: a run breaks when font id or color changes.
    // RTL paragraphs place the ellipsis at the visual left edge (where the
    // logical tail was cut); LTR at the right.
    float cursor = 0.f;
    OutRun *run = nullptr;
    // Decoration interval accumulation for this line: one accumulator per
    // decorated span present on it, grown from the SAME pen positions the
    // glyphs render at (advance already includes letterSpacing, so the
    // interval covers tracked text; the ellipsis never enters — it emits
    // outside [head, tail)).
    struct DecoAcc {
      uint32_t spanIdx;
      float minX, maxX;
      uint32_t firstGlyph; // first VISUAL glyph (metrics font for the lines)
      bool init = false;
    };
    std::vector<DecoAcc> accs;
    auto emitEllipsis = [&]() {
      const ShapedGlyph &g = glyphs[ellGlyphIdx];
      const uint32_t fontId = FontRegistry::Instance().Register(g.typeface, g.fontSize);
      outRuns.push_back(OutRun{fontId, g.color, {(uint16_t)ellGlyph}, {x0 + cursor}, {baseline}});
      cursor += ellAdvance;
    };
    if (hasEllipsis && rtlBase) emitEllipsis();
    for (size_t oi = head; oi < tail; oi++) {
      const uint32_t gi = order[oi];
      const auto &g = glyphs[gi];
      const uint32_t fontId = FontRegistry::Instance().Register(g.typeface, g.fontSize);
      if (run == nullptr || run->fontId != fontId || run->color != g.color) {
        outRuns.push_back(OutRun{fontId, g.color, {}, {}, {}});
        run = &outRuns.back();
      }
      run->glyphs.push_back(g.glyphId);
      run->px.push_back(x0 + cursor + g.xOffset);
      run->py.push_back(baseline);
      if (!spanDecos.empty()) {
        const int32_t si = glyphSpan[gi];
        if (si >= 0 && spanDecos[(size_t)si].bits != 0) {
          DecoAcc *a = nullptr;
          for (auto &c : accs) {
            if (c.spanIdx == (uint32_t)si) {
              a = &c;
              break;
            }
          }
          if (a == nullptr) {
            accs.push_back(DecoAcc{(uint32_t)si, 0.f, 0.f, gi, false});
            a = &accs.back();
          }
          const float xL = x0 + cursor; // pen BEFORE this glyph's advance
          const float xR = xL + g.advance;
          if (!a->init) {
            a->minX = xL;
            a->maxX = xR;
            a->firstGlyph = gi; // visual order → the first hit is leftmost
            a->init = true;
          } else {
            a->minX = std::min(a->minX, xL);
            a->maxX = std::max(a->maxX, xR);
          }
        }
      }
      cursor += g.advance;
    }
    if (hasEllipsis && !rtlBase) emitEllipsis();

    // Resolve this line's decoration accumulators into output entries: one
    // per (span × line × set bit), y from the first visual glyph's font
    // metrics (mixed-fallback spans approximate — same stance as the line's
    // ascent/descent max above).
    for (const auto &a : accs) {
      if (!a.init) continue;
      const SpanDeco &sd = spanDecos[a.spanIdx];
      const ShapedGlyph &fg = glyphs[a.firstGlyph];
      const skity::FontMetrics m = decoMetricsFor(fg);
      for (uint8_t bit = 1; bit <= 4; bit <<= 1) {
        if ((sd.bits & bit) == 0) continue;
        float t = 0.f, yOff = 0.f;
        ResolveDecorationMetrics(m, fg.fontSize, sd.thickness, bit, &t, &yOff);
        outDecos.push_back(OutDeco{a.minX, a.maxX - a.minX, baseline + yOff, t,
                                   sd.color != 0 ? sd.color : fg.color, sd.style});
      }
    }
  }
  result.height = y;
  result.lineCount = (int32_t)lines.size();

  // 4) Serialize the ParagraphRunList (one entry, this node).
  ::flatbuffers::FlatBufferBuilder fbb(512);
  std::vector<::flatbuffers::Offset<skityrt::ParagraphGlyphRun>> runOffsets;
  for (const auto &r : outRuns) {
    auto glyphsOff = fbb.CreateVector(r.glyphs);
    auto pxOff = fbb.CreateVector(r.px);
    auto pyOff = fbb.CreateVector(r.py);
    runOffsets.push_back(
        skityrt::CreateParagraphGlyphRun(fbb, glyphsOff, pxOff, pyOff, r.fontId, r.color));
  }
  auto runsOff = fbb.CreateVector(runOffsets);
  std::vector<::flatbuffers::Offset<skityrt::TextDecorationRun>> decoOffsets;
  decoOffsets.reserve(outDecos.size());
  for (const auto &d : outDecos) {
    decoOffsets.push_back(skityrt::CreateTextDecorationRun(
        fbb, d.x, d.width, d.y, d.thickness, d.color, (skityrt::DecorationStyle)d.style));
  }
  auto decorsOff = fbb.CreateVector(decoOffsets);
  auto entry = skityrt::CreateParagraphLayout(fbb, (int32_t)nodeId, result.height, result.lineCount,
                                              runsOff, decorsOff);
  auto entries =
      fbb.CreateVector(std::vector<::flatbuffers::Offset<skityrt::ParagraphLayout>>{entry});
  auto root = skityrt::CreateParagraphRunList(fbb, entries);
  fbb.Finish(root);
  result.runsBytes.assign(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());

  if (paragraph != nullptr) SBParagraphRelease(paragraph);
  if (algorithm != nullptr) SBAlgorithmRelease(algorithm);
  return result;
}

std::vector<std::string> TakeMissedFontUris(uint32_t node_id) {
  std::lock_guard<std::mutex> lock(g_missed_mutex);
  auto it = g_missed_fonts.find(node_id);
  if (it == g_missed_fonts.end()) return {};
  std::vector<std::string> uris = std::move(it->second);
  g_missed_fonts.erase(it);
  return uris;
}

} // namespace skityrt
