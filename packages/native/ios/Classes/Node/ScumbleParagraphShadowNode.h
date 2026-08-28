// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// <scumble-paragraph> ShadowNode: rich text laid out with CoreText on the TASM
/// thread (inside the owning canvas's measure pass) and drawn as glyph runs
/// through the skity pipeline (TEXT_PARAGRAPH_DESIGN.md §3.1, iOS backend).
///
/// Layout input: the SpanList bytes on the base class (paragraphSpansData) +
/// paragraph-level style + the width geometry prop as the line constraint.
/// Layout output: glyph runs (CTRun walk — glyph IDs are CGGlyphs, the same
/// space as skity's CoreText typefaces) handed to the owning canvas for the
/// extra-bundle runs channel, plus an async "layout" LynxDetailEvent carrying
/// {height, lineCount} to JS.
#import "ScumbleNodeBase.h"

#include <memory>
#include <vector>

NS_ASSUME_NONNULL_BEGIN

/// One laid-out glyph run: a single DrawGlyphs call's worth of data.
struct ScumbleParagraphRun {
  std::vector<uint16_t> glyphs;
  std::vector<float> posX;
  std::vector<float> posY;
  uint32_t fontId = 0;          // FontRegistry key (post-fallback font)
  uint32_t color = 0xFF000000u; // 0xAARRGGBB (span color)
};

/// Layout result handed to the owning canvas (which serializes the runs of
/// all paragraph children into one ParagraphRunList per flush).
struct ScumbleParagraphResult {
  float height = 0.f;
  int lineCount = 0;
  std::vector<ScumbleParagraphRun> runs;
};

@interface ScumbleParagraphShadowNode : ScumbleNodeBase

/// The node's latest layout result (nil before the first layout). Kept so the
/// owning canvas can re-serialize the FULL runs snapshot every flush — the
/// extra-bundle delivery of individual flushes is best-effort, so runs ride
/// as an idempotent, overwrite-applied snapshot rather than one-shot payloads.
@property(nonatomic, readonly, nullable) std::shared_ptr<ScumbleParagraphResult> lastResult;

/// Run the CoreText layout if dirty (spans/width/style changed) and return the
/// current result (cached when not dirty; nullptr before the first layout or
/// when there is nothing to lay out). Runs on the TASM thread (called from
/// the canvas's measure pass); a re-layout also dispatches the "layout" event
/// when JS bound it.
- (std::shared_ptr<ScumbleParagraphResult>)layoutIfNeeded;

/// Layout outcome for a paragraph with no content — a 0-height/0-run entry
/// (NOT a nil result): an entry clears the retained node's previous runs,
/// a missing entry would keep the last layout alive.
- (std::shared_ptr<ScumbleParagraphResult>)emptyResult;

@end

NS_ASSUME_NONNULL_END
