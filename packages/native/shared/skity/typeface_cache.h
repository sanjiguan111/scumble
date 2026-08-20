// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Process-wide cache of custom fonts inlined as `data:` URIs (base64 ttf/otf,
// the v1 custom-font channel — TEXT_PARAGRAPH_DESIGN.md §4). A span's
// fontFamily may carry one; the layout backends ask this cache to turn it
// into a real skity::Typeface (Typeface::MakeFromData), decoded once and kept
// for the process lifetime. Same threading as the FontRegistry: written and
// read on the TASM thread (inside layout), mutex-guarded anyway.

#ifndef SKITYRT_TYPEFACE_CACHE_H_
#define SKITYRT_TYPEFACE_CACHE_H_

#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include <skity/text/typeface.hpp>

namespace skityrt {

class TypefaceCache {
public:
  static TypefaceCache &Instance();

  // A fontFamily value that is an inline font payload, not a family name.
  static bool IsDataUri(const std::string &family) { return family.rfind("data:", 0) == 0; }

  // "data:[<mime>][;base64],<payload>" → Typeface (cached per URI, including
  // failures — a nullptr result is sticky so a broken payload decodes once).
  // Only ;base64 URIs are supported; anything else returns nullptr (the
  // caller falls back to the default font).
  std::shared_ptr<skity::Typeface> FindOrLoad(const std::string &data_uri);

private:
  TypefaceCache() = default;

  std::mutex mutex_;
  // nullptr entries = known-bad URIs (decode/parse failures).
  std::unordered_map<std::string, std::shared_ptr<skity::Typeface>> cache_;
};

} // namespace skityrt

#endif // SKITYRT_TYPEFACE_CACHE_H_
