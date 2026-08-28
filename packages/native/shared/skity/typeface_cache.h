// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Process-wide cache of custom fonts. A span's fontFamily may carry:
//   - an inline `data:...;base64,...` URI — decoded synchronously here
//     (layout never waits on IO for these);
//   - any other schemed URI (http(s)://, file://, host schemes) — loaded
//     ASYNCHRONOUSLY by the platform font loader, whose bytes land in
//     StoreBytes() from any thread; until then lookups report kMiss and the
//     layout falls back to the default font (fonts are a layout INPUT, so a
//     late byte arrival must also trigger a re-layout — the platform
//     controller's job, see ScumbleFontController / ScumbleFontLoaderRegistry).
//
// Failures are sticky per URI (a nullptr entry): a broken payload or a
// loader failure resolves once and never re-requests. Same threading stance
// as the FontRegistry: mutex-guarded, TASM reads, loader callbacks write.

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

  // Any OTHER schemed URI (contains "://") — handed to the platform font
  // loader (built-in http(s)/file plus whatever the host injects). Plain
  // family names ("sans-serif") never match.
  static bool IsLoadableUri(const std::string &family);

  // Lookup outcome for an asynchronous-source URI.
  enum class Lookup {
    kMiss,   // not loaded yet — request it and fall back for this layout
    kReady,  // *out holds the typeface
    kFailed, // known-bad URI (decode or load failure) — sticky, use fallback
  };

  // Query a loadable URI without triggering anything (TASM thread, layout).
  static Lookup LookupUri(const std::string &uri, std::shared_ptr<skity::Typeface> *out);

  // Decode an inline base64 payload (TASM thread, layout): "data:[<mime>]
  // [;base64],<payload>" → Typeface, cached per URI including failures.
  // Returns nullptr on a malformed/undecodable URI (caller falls back).
  std::shared_ptr<skity::Typeface> FindOrLoad(const std::string &data_uri);

  // Deliver loader bytes for a loadable URI (ANY thread — mutex-guarded).
  // Decodes into a Typeface and caches it; empty/null bytes record a sticky
  // failure so the URI never re-requests.
  void StoreBytes(const std::string &uri, const void *data, size_t length);

private:
  TypefaceCache() = default;

  std::shared_ptr<skity::Typeface> DecodeAndCacheLocked(const std::string &uri,
                                                        const std::vector<uint8_t> &bytes);

  std::mutex mutex_;
  // nullptr entries = known-bad URIs (decode/load failures).
  std::unordered_map<std::string, std::shared_ptr<skity::Typeface>> cache_;
};

} // namespace skityrt

#endif // SKITYRT_TYPEFACE_CACHE_H_
