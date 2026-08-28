// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Process-wide decoded-image store backing the <Image> component. The key is
// the source uri itself (http(s) URL / data URI) — cross-node and cross-canvas
// dedup falls out for free.
//
// Threading discipline: the store logically belongs to the render thread.
// StorePixels/MarkFailed are only ever invoked ON the render thread — Android
// via nativeStoreImage (posted to the render handler), iOS via
// ScumbleStoreImageBytes (dispatched onto ScumbleMetalContext.renderQueue). No
// locks anywhere; violating this is a data race.
//
// Lifecycle of one entry: the TASM setter sees a uri and asks the platform
// image loader for pixels (dedup + retry policy live there, not here). Pixels
// arrive through the above ports, the next draw picks the image up. A failed
// load marks the entry permanently skipped (v1 has no retry): FindImage
// returns nullptr and the node simply draws nothing. TODO: LRU eviction —
// entries are resident for the process lifetime.
#ifndef SKITY_IMAGE_STORE_H_
#define SKITY_IMAGE_STORE_H_

#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>

#include <skity/gpu/gpu_context.hpp>
#include <skity/graphic/image.hpp>
#include <skity/io/data.hpp>
#include <skity/io/pixmap.hpp>

namespace skityrt {

class ImageStore {
public:
  static ImageStore &Instance();

  // Render thread only. `rgba` must outlive the call via the skity::Data
  // release proc (callers wrap malloc'd bytes with Data::MakeWithProc).
  void StorePixels(const std::string &uri, std::shared_ptr<skity::Data> rgba, uint32_t width,
                   uint32_t height, bool premultiplied);
  // Render thread only. Permanent failure — FindImage keeps returning nullptr.
  void MarkFailed(const std::string &uri);

  // Render thread only (called from ScumbleRenderer::DrawShape). Returns nullptr
  // while pending, after failure, or for an unknown uri — callers skip the
  // node. `ctx` MUST be the live GPU context of the calling backend:
  // Image::MakeImage(pixmap, nullptr) produces an undrawable image (verified
  // on Metal in the <Image> spike).
  std::shared_ptr<skity::Image> FindImage(const std::string &uri, skity::GPUContext *ctx);

private:
  struct Entry {
    std::shared_ptr<skity::Pixmap> pixmap; // CPU pixels (set when ready)
    bool failed = false;
    // GPU images are context-bound; cache lazily per context so the GL
    // process context and each Vulkan renderer context each get their own.
    std::unordered_map<skity::GPUContext *, std::weak_ptr<skity::Image>> gpu_cache;
  };

  std::unordered_map<std::string, Entry> entries_; // key = uri
};

} // namespace skityrt

#endif // SKITY_IMAGE_STORE_H_
