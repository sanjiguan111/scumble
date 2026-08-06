// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// JNI bridge between SkityNative.kt and lynxskity::AppRenderer. Handle-based,
// mirroring Skity-Android's native_bridge.cpp, plus nativeSetRenderTree to feed
// the FlatBuffer RenderTree produced by SkityCanvasShadowNode.
#include <jni.h>

#include <android/native_window.h>
#include <android/native_window_jni.h>

#include "skity/app_renderer.hpp"
#include "skity/shared_gl_context.hpp"

#include <skity/gpu/gpu_context_vk.hpp>
#include <vulkan/vulkan.h>

namespace {

lynxskity::AppRenderer* FromHandle(jlong handle) {
  return reinterpret_cast<lynxskity::AppRenderer*>(handle);
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_skity_graphics_SkityNative_nativeCreateRenderer(JNIEnv* /*env*/,
                                                          jclass /*clazz*/,
                                                          jint backend_type,
                                                          jlong shared_gl_handle) {
  return reinterpret_cast<jlong>(
      new lynxskity::AppRenderer(backend_type, shared_gl_handle));
}

JNIEXPORT jlong JNICALL
Java_com_skity_graphics_SkityNative_nativeCreateSharedGLContext(
    JNIEnv* /*env*/, jclass /*clazz*/) {
  auto* ctx = new lynxskity::SharedGLContext();
  if (!ctx->Init()) {
    delete ctx;
    return 0;
  }
  return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeDestroySharedGLContext(
    JNIEnv* /*env*/, jclass /*clazz*/, jlong handle) {
  delete reinterpret_cast<lynxskity::SharedGLContext*>(handle);
}

JNIEXPORT jboolean JNICALL
Java_com_skity_graphics_SkityNative_nativeProbeVulkan(JNIEnv* /*env*/,
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

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeDestroyRenderer(JNIEnv* /*env*/,
                                                          jclass /*clazz*/,
                                                          jlong handle) {
  delete FromHandle(handle);
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeSetSurface(JNIEnv* env,
                                                     jclass /*clazz*/,
                                                     jlong handle,
                                                     jobject surface) {
  auto* renderer = FromHandle(handle);
  if (renderer == nullptr) {
    return;
  }
  if (surface == nullptr) {
    renderer->SetNativeWindow(nullptr);
    return;
  }
  // Vulkan path: attach the Surface as an ANativeWindow. GLES ignores it
  // (EGL is owned by GLSurfaceView).
  ANativeWindow* native_window = ANativeWindow_fromSurface(env, surface);
  renderer->SetNativeWindow(native_window);
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeOnSurfaceCreated(JNIEnv* /*env*/,
                                                            jclass /*clazz*/,
                                                            jlong handle) {
  if (auto* r = FromHandle(handle)) r->OnSurfaceCreated();
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeOnSurfaceChanged(JNIEnv* /*env*/,
                                                            jclass /*clazz*/,
                                                            jlong handle,
                                                            jint width,
                                                            jint height) {
  if (auto* r = FromHandle(handle)) r->OnSurfaceChanged(width, height);
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeOnSurfaceDestroyed(JNIEnv* /*env*/,
                                                              jclass /*clazz*/,
                                                              jlong handle) {
  if (auto* r = FromHandle(handle)) r->OnSurfaceDestroyed();
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeDrawFrame(JNIEnv* /*env*/,
                                                     jclass /*clazz*/,
                                                     jlong handle) {
  if (auto* r = FromHandle(handle)) r->DrawFrame();
}

JNIEXPORT void JNICALL
Java_com_skity_graphics_SkityNative_nativeSetRenderTree(JNIEnv* env,
                                                        jclass /*clazz*/,
                                                        jlong handle,
                                                        jbyteArray data,
                                                        jfloat density) {
  auto* renderer = FromHandle(handle);
  if (renderer == nullptr || data == nullptr) {
    return;
  }
  jsize length = env->GetArrayLength(data);
  jbyte* bytes = env->GetByteArrayElements(data, nullptr);
  if (bytes == nullptr) {
    return;
  }
  renderer->SetRenderTree(reinterpret_cast<const uint8_t*>(bytes),
                          static_cast<std::size_t>(length), density);
  env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
}

}  // extern "C"
