// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "paragraph_shaper.h"

#include <flatbuffers/flatbuffers.h>
#include <harfbuzz/hb.h>

#include <algorithm>
#include <cstring>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

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
  uint16_t glyphId;
  float advance; // includes letterSpacing
  float xOffset; // HarfBuzz in-glyph adjustment
  std::shared_ptr<Typeface> typeface;
  float fontSize;
  uint32_t color; // span color (0xAARRGGBB)
};

// Shape one fallback-homogeneous segment of a span against one typeface.
void ShapeSegment(const std::vector<uint32_t> &codepoints,
                  const std::shared_ptr<Typeface> &typeface, float fontSize, float letterSpacing,
                  uint32_t color, std::vector<ShapedGlyph> &out) {
  hb_font_t *font = FontForTypeface(typeface, fontSize);
  if (font == nullptr) return;

  hb_buffer_t *buffer = hb_buffer_create();
  hb_buffer_add_utf32(buffer, codepoints.data(), (int)codepoints.size(), 0, (int)codepoints.size());
  hb_buffer_guess_segment_properties(buffer);
  hb_shape(font, buffer, nullptr, 0);

  const unsigned glyphCount = hb_buffer_get_length(buffer);
  const hb_glyph_info_t *infos = hb_buffer_get_glyph_infos(buffer, nullptr);
  const hb_glyph_position_t *positions = hb_buffer_get_glyph_positions(buffer, nullptr);
  for (unsigned i = 0; i < glyphCount; i++) {
    // cluster indexes into the segment's code points; ligatures share one.
    const unsigned cluster = infos[i].cluster;
    ShapedGlyph g;
    g.firstCp = cluster < codepoints.size() ? codepoints[cluster] : 0;
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
                                    uint32_t nodeId, float width, uint8_t align, float lineHeight,
                                    int32_t maxLines) {
  ParagraphShapeResult result;
  if (spanListData == nullptr || spanListSize == 0 || !(width > 0.f)) return result;

  const auto *spanList = ::flatbuffers::GetRoot<skityrt::SpanList>(spanListData);
  const auto *spans = spanList != nullptr ? spanList->spans() : nullptr;
  if (spans == nullptr || spans->size() == 0) return result;

  auto fontManager = FontManager::RefDefault();

  // 1) Font resolution + fallback segmentation + shaping → glyph stream.
  std::vector<ShapedGlyph> glyphs;
  for (::flatbuffers::uoffset_t i = 0; i < spans->size(); i++) {
    const skityrt::Span *span = spans->Get(i);
    const char *text = span->text() != nullptr ? span->text()->c_str() : "";
    if (*text == '\0') continue;

    const std::string family =
        span->fontFamily() != nullptr ? span->fontFamily()->str() : std::string();
    const FontStyle style(span->fontWeight(), FontStyle::kNormal_Width,
                          span->italic() ? FontStyle::kItalic_Slant : FontStyle::kUpright_Slant);
    // Custom fonts: `data:` URIs decode synchronously; schemed URIs
    // (http/file/host) come back from the TypefaceCache when the platform
    // font loader has delivered them — a miss falls back to the default font
    // for THIS layout (recorded for SkityFontController, which re-triggers
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

    // UTF-8 → UTF-32 (skity's own decoder, same table TextBlobBuilder uses).
    std::vector<uint32_t> codepoints;
    skity::UTF::UTF8ToCodePoint(text, strlen(text), codepoints);
    if (codepoints.empty()) continue;

    // Split into fallback-homogeneous runs: a char stays on `base` while it
    // has a glyph there, otherwise MatchFamilyStyleCharacter picks the
    // system fallback (mirrors TextBlobBuilder's GenerateTextRuns walk, but
    // before shaping — a typeface change needs its own hb_font).
    std::vector<uint32_t> segment;
    std::shared_ptr<Typeface> segmentFace = base;
    std::unordered_map<uint32_t, std::shared_ptr<Typeface>> fallbackMemo;
    auto flush = [&]() {
      if (!segment.empty() && segmentFace != nullptr) {
        ShapeSegment(segment, segmentFace, span->fontSize(), span->letterSpacing(), span->color(),
                     glyphs);
      }
      segment.clear();
    };
    for (uint32_t cp : codepoints) {
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
      }
      if (face != nullptr) segment.push_back(cp);
      // A glyph-less char on every fallback face is dropped entirely.
    }
    flush();
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

  // 3) Line assembly: baselines, alignment, trailing-space trim, ellipsis.
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

    // Visual width excludes trailing spaces (they still render, off-margin).
    uint32_t contentEnd = end;
    float lineWidth = 0.f;
    for (uint32_t i = start; i < contentEnd; i++)
      lineWidth += glyphs[i].advance;
    for (uint32_t i = contentEnd; i > start && breakChars[i - 1].cls == BreakClass::kSpace;) {
      lineWidth -= glyphs[--i].advance;
    }

    // Ellipsis on the last kept line when maxLines clipped content: resolve
    // the "…" glyph from the line's tail font, then drop trailing glyphs
    // until it fits.
    bool hasEllipsis = false;
    skity::GlyphID ellGlyph = 0;
    float ellAdvance = 0.f;
    if (li == lastLineIndex && clipped && contentEnd > start) {
      const ShapedGlyph &tail = glyphs[contentEnd - 1];
      ellGlyph = tail.typeface->UnicharToGlyph(0x2026);
      if (ellGlyph != 0) {
        skity::Font font(tail.typeface, tail.fontSize);
        const skity::GlyphData *metric = nullptr;
        skity::Paint paint;
        paint.SetTextSize(tail.fontSize);
        font.LoadGlyphMetrics(&ellGlyph, 1, &metric, paint);
        ellAdvance = metric != nullptr ? metric->AdvanceX() : tail.fontSize * 0.5f;
        uint32_t back = contentEnd;
        while (back > start + 1 && lineWidth + ellAdvance > width) {
          back--;
          lineWidth -= glyphs[back].advance;
        }
        contentEnd = back;
        lineWidth += ellAdvance;
        hasEllipsis = true;
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

    // Emit runs: a run breaks when font id, color, or line changes.
    float cursor = 0.f;
    OutRun *run = nullptr;
    for (uint32_t i = start; i < contentEnd; i++) {
      const auto &g = glyphs[i];
      const uint32_t fontId = FontRegistry::Instance().Register(g.typeface, g.fontSize);
      if (run == nullptr || run->fontId != fontId || run->color != g.color) {
        outRuns.push_back(OutRun{fontId, g.color, {}, {}, {}});
        run = &outRuns.back();
      }
      run->glyphs.push_back(g.glyphId);
      run->px.push_back(x0 + cursor + g.xOffset);
      run->py.push_back(baseline);
      cursor += g.advance;
    }
    if (hasEllipsis) {
      // Append "…" with the tail glyph's font+color at the line's content end.
      const ShapedGlyph &tail = glyphs[end > start ? end - 1 : start];
      const uint32_t fontId = FontRegistry::Instance().Register(tail.typeface, tail.fontSize);
      outRuns.push_back(
          OutRun{fontId, tail.color, {(uint16_t)ellGlyph}, {x0 + cursor}, {baseline}});
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
  auto entry = skityrt::CreateParagraphLayout(fbb, (int32_t)nodeId, result.height, result.lineCount,
                                              runsOff);
  auto entries =
      fbb.CreateVector(std::vector<::flatbuffers::Offset<skityrt::ParagraphLayout>>{entry});
  auto root = skityrt::CreateParagraphRunList(fbb, entries);
  fbb.Finish(root);
  result.runsBytes.assign(fbb.GetBufferPointer(), fbb.GetBufferPointer() + fbb.GetSize());
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
