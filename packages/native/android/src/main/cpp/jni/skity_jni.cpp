// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// JNI bridge between SkityNative.kt and lynxskity::AppRenderer. Handle-based,
// mirroring Skity-Android's native_bridge.cpp. The render tree is driven solely
// by nativeApplyCommands (Step 3b retired the snapshot channel).
#include <jni.h>

#include <android/native_window.h>
#include <android/native_window_jni.h>

#include "skity/app_renderer.hpp"
#include "skity/shared_gl_context.hpp"

#include "image_store.h" // shared/skity (on the shared include path)
#include "typeface_cache.h"

#include "skity/paragraph_shaper.h"

#include <skity/gpu/gpu_context_vk.hpp>
#include <skity/io/data.hpp>
#include <vulkan/vulkan.h>

#include <cstdlib>
#include <cstring>

namespace {

lynxskity::AppRenderer *FromHandle(jlong handle) {
  return reinterpret_cast<lynxskity::AppRenderer *>(handle);
}

} // namespace

extern "C" {

JNIEXPORT jlong JNICALL Java_com_skity_graphics_SkityNative_nativeCreateRenderer(
    JNIEnv * /*env*/, jclass /*clazz*/, jint backend_type, jlong shared_gl_handle, jfloat density) {
  return reinterpret_cast<jlong>(
      new lynxskity::AppRenderer(backend_type, shared_gl_handle, density));
}

JNIEXPORT jlong JNICALL Java_com_skity_graphics_SkityNative_nativeCreateSharedGLContext(
    JNIEnv * /*env*/, jclass /*clazz*/) {
  auto *ctx = new lynxskity::SharedGLContext();
  if (!ctx->Init()) {
    delete ctx;
    return 0;
  }
  return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeDestroySharedGLContext(
    JNIEnv * /*env*/, jclass /*clazz*/, jlong handle) {
  delete reinterpret_cast<lynxskity::SharedGLContext *>(handle);
}

JNIEXPORT jboolean JNICALL Java_com_skity_graphics_SkityNative_nativeProbeVulkan(JNIEnv * /*env*/,
                                                                                 jclass /*clazz*/) {
  // Create a throwaway Vulkan GPU context to check whether Vulkan is usable on
  // this device (loader present, instance/device creation succeeds). The
  // unique_ptr releases it immediately.
  if (!skity::IsGPUBackendSupported(skity::GPUBackendType::kVulkan)) {
    return JNI_FALSE;
  }
  skity::GPUContextInfoVK info = {};
  info.get_instance_proc_addr = vkGetInstanceProcAddr;
  info.enable_debug_runtime = false;
  auto ctx = skity::CreateGPUContextVK(&info);
  return ctx != nullptr ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeDestroyRenderer(JNIEnv * /*env*/,
                                                                                 jclass /*clazz*/,
                                                                                 jlong handle) {
  delete FromHandle(handle);
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeSetSurface(JNIEnv *env,
                                                                            jclass /*clazz*/,
                                                                            jlong handle,
                                                                            jobject surface) {
  auto *renderer = FromHandle(handle);
  if (renderer == nullptr) {
    return;
  }
  if (surface == nullptr) {
    renderer->SetNativeWindow(nullptr);
    return;
  }
  // Vulkan path: attach the Surface as an ANativeWindow. GLES ignores it
  // (EGL is owned by GLSurfaceView).
  ANativeWindow *native_window = ANativeWindow_fromSurface(env, surface);
  renderer->SetNativeWindow(native_window);
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeOnSurfaceCreated(JNIEnv * /*env*/,
                                                                                  jclass /*clazz*/,
                                                                                  jlong handle) {
  if (auto *r = FromHandle(handle)) r->OnSurfaceCreated();
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeOnSurfaceChanged(
    JNIEnv * /*env*/, jclass /*clazz*/, jlong handle, jint width, jint height) {
  if (auto *r = FromHandle(handle)) r->OnSurfaceChanged(width, height);
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeOnSurfaceDestroyed(
    JNIEnv * /*env*/, jclass /*clazz*/, jlong handle) {
  if (auto *r = FromHandle(handle)) r->OnSurfaceDestroyed();
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeDrawFrame(JNIEnv * /*env*/,
                                                                           jclass /*clazz*/,
                                                                           jlong handle) {
  if (auto *r = FromHandle(handle)) r->DrawFrame();
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeApplyCommands(
    JNIEnv *env, jclass /*clazz*/, jlong handle, jbyteArray commands) {
  auto *renderer = FromHandle(handle);
  if (renderer == nullptr || commands == nullptr) {
    return;
  }
  jsize length = env->GetArrayLength(commands);
  jbyte *bytes = env->GetByteArrayElements(commands, nullptr);
  if (bytes == nullptr) {
    return;
  }
  renderer->ApplyCommands(reinterpret_cast<const uint8_t *>(bytes),
                          static_cast<std::size_t>(length));
  env->ReleaseByteArrayElements(commands, bytes, JNI_ABORT);
}

// Native animation tick — render thread only (the tree is single-threaded by
// contract). Returns whether any track is still live (the driver redraws on
// true and stops the Choreographer loop when every session goes idle).
JNIEXPORT jboolean JNICALL Java_com_skity_graphics_SkityNative_nativeTickAnimations(
    JNIEnv * /*env*/, jclass /*clazz*/, jlong handle, jlong now_nanos) {
  auto *renderer = FromHandle(handle);
  return renderer != nullptr && renderer->TickAnimations(static_cast<uint64_t>(now_nanos))
             ? JNI_TRUE
             : JNI_FALSE;
}

// <Paragraph> glyph-run snapshot — applied on the render thread right after
// the batch of the same flush (the runs reference nodes the batch inserts).
JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeApplyParagraphRuns(
    JNIEnv *env, jclass /*clazz*/, jlong handle, jbyteArray runs) {
  auto *renderer = FromHandle(handle);
  if (renderer == nullptr || runs == nullptr) {
    return;
  }
  jsize length = env->GetArrayLength(runs);
  jbyte *bytes = env->GetByteArrayElements(runs, nullptr);
  if (bytes == nullptr) {
    return;
  }
  renderer->ApplyParagraphRuns(reinterpret_cast<const uint8_t *>(bytes),
                               static_cast<std::size_t>(length));
  env->ReleaseByteArrayElements(runs, bytes, JNI_ABORT);
}

// <Paragraph> layout: shape + wrap the SpanList on the calling (TASM) thread,
// registering fonts with the shared FontRegistry. Returns a one-entry
// ParagraphRunList (height/line_count inside) or null for empty content.
JNIEXPORT jbyteArray JNICALL Java_com_skity_graphics_SkityNative_nativeShapeParagraph(
    JNIEnv *env, jclass /*clazz*/, jbyteArray spans, jint nodeId, jfloat width, jbyte align,
    jbyte direction, jfloat lineHeight, jint maxLines) {
  if (spans == nullptr) {
    return nullptr;
  }
  jsize length = env->GetArrayLength(spans);
  jbyte *bytes = env->GetByteArrayElements(spans, nullptr);
  if (bytes == nullptr) {
    return nullptr;
  }
  skityrt::ParagraphShapeResult result = skityrt::ShapeParagraph(
      reinterpret_cast<const uint8_t *>(bytes), static_cast<std::size_t>(length), (uint32_t)nodeId,
      width, (uint8_t)align, (uint8_t)direction, lineHeight, maxLines);
  env->ReleaseByteArrayElements(spans, bytes, JNI_ABORT);
  if (result.runsBytes.empty()) {
    return nullptr;
  }
  jbyteArray out = env->NewByteArray((jsize)result.runsBytes.size());
  if (out == nullptr) {
    return nullptr;
  }
  env->SetByteArrayRegion(out, 0, (jsize)result.runsBytes.size(),
                          reinterpret_cast<const jbyte *>(result.runsBytes.data()));
  return out;
}

// Custom-font plumbing: schemed font URIs the shaper found missing during
// layout (drained per shape on the same TASM thread), and loader bytes
// arriving from any thread.
JNIEXPORT jobjectArray JNICALL Java_com_skity_graphics_SkityNative_nativeTakeMissedFontUris(
    JNIEnv *env, jclass /*clazz*/, jint nodeId) {
  std::vector<std::string> uris = skityrt::TakeMissedFontUris((uint32_t)nodeId);
  jclass stringCls = env->FindClass("java/lang/String");
  if (stringCls == nullptr) return nullptr;
  auto out = (jobjectArray)env->NewObjectArray((jsize)uris.size(), stringCls, nullptr);
  for (size_t i = 0; out != nullptr && i < uris.size(); i++) {
    env->SetObjectArrayElement(out, (jsize)i, env->NewStringUTF(uris[i].c_str()));
  }
  return out;
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeStoreFontBytes(JNIEnv *env,
                                                                                jclass /*clazz*/,
                                                                                jstring uri,
                                                                                jbyteArray bytes) {
  const char *uriChars = env->GetStringUTFChars(uri, nullptr);
  if (uriChars == nullptr) return;
  std::string key(uriChars);
  env->ReleaseStringUTFChars(uri, uriChars);
  if (bytes == nullptr) {
    skityrt::TypefaceCache::Instance().StoreBytes(key, nullptr, 0);
    return;
  }
  jsize length = env->GetArrayLength(bytes);
  jbyte *data = env->GetByteArrayElements(bytes, nullptr);
  if (data == nullptr) {
    skityrt::TypefaceCache::Instance().StoreBytes(key, nullptr, 0);
    return;
  }
  skityrt::TypefaceCache::Instance().StoreBytes(key, data, (size_t)length);
  env->ReleaseByteArrayElements(bytes, data, JNI_ABORT);
}

// ImageStore entry points. Called on the active backend's render thread only
// (SkityImageController posts them there); the store itself is render-thread
// only. Pixels are premultiplied RGBA (ARGB_8888 Bitmap.copyPixelsToBuffer on
// the Kotlin side).
JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeStoreImage(
    JNIEnv *env, jclass /*clazz*/, jstring uri, jbyteArray rgba, jint width, jint height) {
  const char *uri_chars = env->GetStringUTFChars(uri, nullptr);
  if (uri_chars == nullptr || width <= 0 || height <= 0) {
    if (uri_chars != nullptr) {
      env->ReleaseStringUTFChars(uri, uri_chars);
    }
    return;
  }
  const std::string key(uri_chars);
  env->ReleaseStringUTFChars(uri, uri_chars);

  jsize length = env->GetArrayLength(rgba);
  jbyte *bytes = env->GetByteArrayElements(rgba, nullptr);
  if (bytes == nullptr || static_cast<jsize>(width) * height * 4 != length) {
    if (bytes != nullptr) {
      env->ReleaseByteArrayElements(rgba, bytes, JNI_ABORT);
    }
    skityrt::ImageStore::Instance().MarkFailed(key);
    return;
  }
  // Copy out of the JNI-managed array, then hand ownership to skity::Data.
  auto *px = std::malloc(static_cast<std::size_t>(length));
  std::memcpy(px, bytes, static_cast<std::size_t>(length));
  env->ReleaseByteArrayElements(rgba, bytes, JNI_ABORT);
  auto data = skity::Data::MakeWithProc(
      px, static_cast<std::size_t>(length),
      [](const void *ptr, void *) { std::free(const_cast<void *>(ptr)); }, nullptr);
  skityrt::ImageStore::Instance().StorePixels(key, std::move(data), static_cast<uint32_t>(width),
                                              static_cast<uint32_t>(height),
                                              /*premultiplied=*/true);
}

JNIEXPORT void JNICALL Java_com_skity_graphics_SkityNative_nativeMarkImageFailed(JNIEnv *env,
                                                                                 jclass /*clazz*/,
                                                                                 jstring uri) {
  const char *uri_chars = env->GetStringUTFChars(uri, nullptr);
  if (uri_chars == nullptr) {
    return;
  }
  skityrt::ImageStore::Instance().MarkFailed(std::string(uri_chars));
  env->ReleaseStringUTFChars(uri, uri_chars);
}

} // extern "C"
