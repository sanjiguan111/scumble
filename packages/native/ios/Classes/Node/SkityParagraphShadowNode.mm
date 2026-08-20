// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// <skity-paragraph> iOS layout backend: CoreText does everything (shaping,
// line breaking, kinsoku, font fallback); we walk the resulting CTRuns for
// glyph IDs + positions and register the REAL post-fallback fonts with the
// shared FontRegistry. Glyph IDs are CGGlyphs — the same space as skity's
// CoreText typefaces (scaler_context_darwin casts them verbatim), so the
// runs feed skity's DrawGlyphs unchanged.

#import "SkityParagraphShadowNode.h"
#import "SkityCanvasShadowNode.h"

#import <Lynx/LynxComponentRegistry.h>

#include "font_registry.h"
#include "paragraph_runs_generated.h"

#include <algorithm>

#include <CoreText/CoreText.h>
#include <Lynx/LynxEventEmitter.h>
#include <Lynx/LynxUIContext.h>
#include <Lynx/LynxUIOwner.h>

#include <skity/text/ports/typeface_ct.hpp>

namespace {

using skityrt::FontRegistry;

// Custom attribute riding the attributed string: the span color (packed
// 0xAARRGGBB). CTRun attributes are uniform per run, so the run walk reads it
// straight back — no offset bookkeeping between UTF-8 (the SpanList) and
// UTF-16 (the NSAttributedString).
static NSString *const kSkitySpanColorKey = @"skitySpanColor";

// Map a span's family/weight/slant to a CTFont. Family empty → the system
// font; weight ≥ 600 or italic → symbolic traits on a copy.
CTFontRef SkitySpanFont(NSString *family, float size, int weight, bool italic) {
  CTFontRef base = family.length > 0
                       ? CTFontCreateWithName((CFStringRef)family, size, nullptr)
                       : CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, size, nullptr);
  if (base == nullptr) return nullptr;
  const bool bold = weight >= 600;
  if (!bold && !italic) return base;
  CTFontSymbolicTraits traits = (CTFontSymbolicTraits)0;
  if (bold) traits = (CTFontSymbolicTraits)(traits | kCTFontTraitBold);
  if (italic) traits = (CTFontSymbolicTraits)(traits | kCTFontTraitItalic);
  CTFontRef styled = CTFontCreateCopyWithSymbolicTraits(base, size, nullptr, traits, traits);
  CFRelease(base);
  return styled != nullptr ? styled : nullptr;
}

CTParagraphStyleRef SkityParagraphStyle(uint8_t align, float lineHeight) {
  CTTextAlignment alignment = kCTTextAlignmentNatural;
  if (align == 1) alignment = kCTTextAlignmentCenter;
  if (align == 2) alignment = kCTTextAlignmentRight;
  const CGFloat multiple = lineHeight > 0.f ? (CGFloat)lineHeight : 1.0;
  CTParagraphStyleSetting settings[] = {
      {kCTParagraphStyleSpecifierAlignment, sizeof(CTTextAlignment), &alignment},
      {kCTParagraphStyleSpecifierLineHeightMultiple, sizeof(CGFloat), &multiple},
  };
  return CTParagraphStyleCreate(settings, sizeof(settings) / sizeof(settings[0]));
}

} // namespace

@implementation SkityParagraphShadowNode {
  std::shared_ptr<SkityParagraphResult> _lastResult;
}

#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_SHADOW_NODE("skity-paragraph")
#else
LYNX_REGISTER_SHADOW_NODE("skity-paragraph")
#endif

- (std::shared_ptr<SkityParagraphResult>)lastResult {
  return _lastResult;
}

- (NSString *)skityTagName {
  return @"paragraph";
}

- (BOOL)needsEventSet {
  // Without this the eventSet stays nil and "layout" listeners are invisible.
  return YES;
}

- (std::shared_ptr<SkityParagraphResult>)layoutIfNeeded {
  if (!self.dirtyParagraph) return _lastResult;
  if (self.paragraphSpansData == nil || !(self.width > 0.f)) return _lastResult;
  self.dirtyParagraph = NO;

  // Decode the SpanList input (paragraph_runs.fbs).
  const auto *spanList =
      ::flatbuffers::GetRoot<skityrt::SpanList>((const uint8_t *)self.paragraphSpansData.bytes);
  const auto *spans = spanList != nullptr ? spanList->spans() : nullptr;
  if (spans == nullptr || spans->size() == 0) return nullptr;

  // Build the attributed string: one attribute dict per span (font, span
  // color as a custom attribute, letter spacing as kern, paragraph style).
  NSMutableAttributedString *text = [NSMutableAttributedString new];
  CTParagraphStyleRef paraStyle =
      SkityParagraphStyle(self.paragraphAlign, self.paragraphLineHeight);
  for (::flatbuffers::uoffset_t i = 0; i < spans->size(); i++) {
    const skityrt::Span *span = spans->Get(i);
    NSString *str =
        span->text() != nullptr ? [NSString stringWithUTF8String:span->text()->c_str()] : @"";
    CTFontRef font = SkitySpanFont(span->fontFamily() != nullptr
                                       ? [NSString stringWithUTF8String:span->fontFamily()->c_str()]
                                       : @"",
                                   span->fontSize(), span->fontWeight(), span->italic());
    if (font == nullptr) continue;
    NSMutableDictionary *attrs = [NSMutableDictionary dictionary];
    attrs[(NSString *)kCTFontAttributeName] = (__bridge id)font;
    attrs[kSkitySpanColorKey] = @(span->color());
    if (span->letterSpacing() != 0.f) {
      const CGFloat kern = (CGFloat)span->letterSpacing();
      attrs[(NSString *)kCTKernAttributeName] = @(kern);
    }
    attrs[(NSString *)kCTParagraphStyleAttributeName] = (__bridge id)paraStyle;
    [text appendAttributedString:[[NSAttributedString alloc] initWithString:str attributes:attrs]];
    CFRelease(font);
  }
  CFRelease(paraStyle);
  if (text.length == 0) return nullptr;

  // Lay out in a width-constrained, downward-extending frame. The negative-y
  // path trick makes the flip trivial: render y = -coretext y (the first
  // baseline sits at ≈ -ascent, so positive ys grow downward from 0).
  const CGFloat width = (CGFloat)self.width;
  CTFramesetterRef framesetter =
      CTFramesetterCreateWithAttributedString((CFAttributedStringRef)text);
  CGPathRef path = CGPathCreateWithRect(CGRectMake(0, -100000.f, width, 100000.f), nullptr);
  CTFrameRef frame = CTFramesetterCreateFrame(framesetter, CFRangeMake(0, 0), path, nullptr);

  auto result = std::make_shared<SkityParagraphResult>();
  CFArrayRef lines = CTFrameGetLines(frame);
  const CFIndex lineCount = lines != nullptr ? CFArrayGetCount(lines) : 0;
  const CFIndex maxLines = self.paragraphMaxLines > 0 ? (CFIndex)self.paragraphMaxLines : lineCount;

  std::vector<CGPoint> lineOrigins((size_t)std::max<CFIndex>(lineCount, 1));
  CTFrameGetLineOrigins(frame, CFRangeMake(0, lineCount), lineOrigins.data());

  CGFloat top = 0.f;
  for (CFIndex li = 0; li < lineCount && li < maxLines; li++) {
    CTLineRef line = (CTLineRef)CFArrayGetValueAtIndex(lines, li);
    // Last line of a maxLines-clamped paragraph gets end-ellipsis. The token
    // uses the tail run's font+size (Android resolves U+2026 on the line's
    // tail font the same way) — a fixed 14pt token shrank visibly in
    // large-print paragraphs.
    if (self.paragraphMaxLines > 0 && li + 1 == maxLines && li + 1 < lineCount) {
      CTFontRef tokenFont = nullptr;
      CFArrayRef runs = CTLineGetGlyphRuns(line);
      if (runs != nullptr && CFArrayGetCount(runs) > 0) {
        CTRunRef tailRun = (CTRunRef)CFArrayGetValueAtIndex(runs, CFArrayGetCount(runs) - 1);
        CTFontRef tailFont =
            (CTFontRef)CFDictionaryGetValue(CTRunGetAttributes(tailRun), kCTFontAttributeName);
        if (tailFont != nullptr) tokenFont = (CTFontRef)CFRetain(tailFont);
      }
      if (tokenFont == nullptr) {
        tokenFont = CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, 14, nullptr);
      }
      NSDictionary *tokenAttrs = @{(NSString *)kCTFontAttributeName : (__bridge id)tokenFont};
      CTLineRef token = CTLineCreateWithAttributedString(
          (CFAttributedStringRef)[[NSAttributedString alloc] initWithString:@"…"
                                                                 attributes:tokenAttrs]);
      CTLineRef truncated =
          CTLineCreateTruncatedLine(line, (double)width, kCTLineTruncationEnd, token);
      if (token != nullptr) CFRelease(token);
      CFRelease(tokenFont);
      if (truncated != nullptr) line = truncated;
    }
    const CGPoint origin = lineOrigins[(size_t)li];

    // Frame top edge (in CoreText's y-up space): the first line's baseline
    // plus its ascent. Measured from the line itself — NOT assumed to be 0 —
    // so the flip below is relative and immune to wherever CoreText actually
    // places the frame inside the path (observed to differ between the
    // cold-start and navigation mount orders).
    if (li == 0) {
      CGFloat ascent = 0, descent = 0, leading = 0;
      CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
      top = (CGFloat)(origin.y + ascent);
    }

    const CFArrayRef runs = CTLineGetGlyphRuns(line);
    const CFIndex runCount = runs != nullptr ? CFArrayGetCount(runs) : 0;
    for (CFIndex ri = 0; ri < runCount; ri++) {
      CTRunRef run = (CTRunRef)CFArrayGetValueAtIndex(runs, ri);
      const CFIndex glyphCount = CTRunGetGlyphCount(run);
      if (glyphCount == 0) continue;
      CFDictionaryRef attrs = CTRunGetAttributes(run);
      NSNumber *colorAttr = attrs != nullptr ? CFBridgingRelease(CFDictionaryGetValue(
                                                   attrs, (__bridge CFStringRef)kSkitySpanColorKey))
                                             : nil;
      const uint32_t runColor =
          colorAttr != nil ? (uint32_t)colorAttr.unsignedIntValue : 0xFF000000u;
      CTFontRef ctFont =
          attrs != nullptr ? (CTFontRef)CFDictionaryGetValue(attrs, kCTFontAttributeName) : nullptr;
      if (ctFont == nullptr) continue;
      auto typeface = skity::TypefaceCT::TypefaceFromCTFont(ctFont);
      const uint32_t fontId =
          typeface != nullptr
              ? FontRegistry::Instance().Register(typeface, (float)CTFontGetSize(ctFont))
              : 0;
      if (fontId == 0) continue;

      std::vector<CGGlyph> glyphs((size_t)glyphCount);
      std::vector<CGPoint> positions((size_t)glyphCount);
      CTRunGetGlyphs(run, CFRangeMake(0, 0), glyphs.data());
      CTRunGetPositions(run, CFRangeMake(0, 0), positions.data());

      SkityParagraphRun out;
      out.fontId = fontId;
      out.color = runColor;
      out.glyphs.reserve((size_t)glyphCount);
      out.posX.reserve((size_t)glyphCount);
      out.posY.reserve((size_t)glyphCount);
      for (CFIndex g = 0; g < glyphCount; g++) {
        out.glyphs.push_back(glyphs[(size_t)g]);
        out.posX.push_back((float)(origin.x + positions[(size_t)g].x));
        // Top-left render y = distance from the frame top, measured down to
        // the glyph's baseline (y-up → negate).
        out.posY.push_back((float)(top - (origin.y + positions[(size_t)g].y)));
      }
      result->runs.push_back(std::move(out));
    }

    // Content height = frame top down to the last laid line's baseline +
    // descent.
    if (li + 1 == maxLines || li + 1 == lineCount) {
      CGFloat ascent = 0, descent = 0, leading = 0;
      CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
      result->height = (float)(top - (origin.y - descent));
    }
    result->lineCount = (int)(li + 1);
  }

  CGPathRelease(path);
  CFRelease(frame);
  CFRelease(framesetter);

  [self dispatchLayoutEventWithHeight:result->height lineCount:result->lineCount];
  _lastResult = result;
  return result;
}

// Async "layout" LynxDetailEvent ({height, lineCount}) — only when JS bound
// bindlayout (eventSet gate), template: LynxTextShadowNode.
- (void)dispatchLayoutEventWithHeight:(float)height lineCount:(int)lineCount {
  if ([self.eventSet objectForKey:@"layout"] == nil) return;
  NSDictionary *detail = @{@"height" : @(height), @"lineCount" : @(lineCount)};
  LynxDetailEvent *event = [[LynxDetailEvent alloc] initWithName:@"layout"
                                                      targetSign:[self sign]
                                                          detail:detail];
  __weak __typeof__(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof__(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) return;
    [strongSelf.uiOwner.uiContext.eventEmitter sendCustomEvent:event];
  });
}

@end
