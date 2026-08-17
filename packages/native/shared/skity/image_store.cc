// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "image_store.h"

namespace skityrt {

ImageStore &ImageStore::Instance() {
  static ImageStore store;
  return store;
}

void ImageStore::StorePixels(const std::string &uri, std::shared_ptr<skity::Data> rgba,
                             uint32_t width, uint32_t height, bool premultiplied) {
  Entry &entry = entries_[uri];
  entry.failed = false; // a late success after a failure still wins
  entry.gpu_cache.clear();
  entry.pixmap = std::make_shared<skity::Pixmap>(
      std::move(rgba), static_cast<size_t>(width) * 4, width, height,
      premultiplied ? skity::AlphaType::kPremul_AlphaType : skity::AlphaType::kUnpremul_AlphaType,
      skity::ColorType::kRGBA);
}

void ImageStore::MarkFailed(const std::string &uri) {
  Entry &entry = entries_[uri];
  entry.pixmap = nullptr;
  entry.gpu_cache.clear();
  entry.failed = true;
}

std::shared_ptr<skity::Image> ImageStore::FindImage(const std::string &uri,
                                                    skity::GPUContext *ctx) {
  auto it = entries_.find(uri);
  if (it == entries_.end()) {
    return nullptr; // pending (or never requested)
  }
  Entry &entry = it->second;
  if (entry.failed || entry.pixmap == nullptr) {
    return nullptr;
  }
  auto &weak = entry.gpu_cache[ctx];
  std::shared_ptr<skity::Image> image = weak.lock();
  if (image == nullptr) {
    // nullptr ctx produces an undrawable image — callers must pass their live
    // backend context (see header). Guard anyway so a bad caller skips the
    // node instead of caching garbage.
    if (ctx == nullptr) {
      return nullptr;
    }
    image = skity::Image::MakeImage(entry.pixmap, ctx);
    weak = image;
  }
  return image;
}

} // namespace skityrt
