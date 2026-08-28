cmake_minimum_required(VERSION 3.18.1)

project(ScumbleAddonAndroid LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

get_filename_component(
  LYNX_LIBRARY_PACKAGE_ROOT
  "${CMAKE_CURRENT_SOURCE_DIR}/.."
  ABSOLUTE
)

set(LYNX_LIBRARY_PLATFORM "android")
set(LYNX_LIBRARY_NODE_API_WEAK_SUFFIX OFF CACHE BOOL "Use weak suffix NAPI symbols")
set(LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE ON CACHE BOOL "Register NAPI modules through napi_module_register_xx" FORCE)
set(LYNX_SHARED_BUILD_ELEMENTS OFF CACHE BOOL "Do not build element sources for Android addon" FORCE)

if(NOT LYNX_PRIMJS_JNI_DIR)
  message(FATAL_ERROR "LYNX_PRIMJS_JNI_DIR is required. Build through the generated Gradle project.")
endif()

set(LYNX_PRIMJS_ABI_DIR "${LYNX_PRIMJS_JNI_DIR}/${ANDROID_ABI}")

add_library(lynx_primjs_napi SHARED IMPORTED)
set_target_properties(lynx_primjs_napi PROPERTIES
  IMPORTED_LOCATION "${LYNX_PRIMJS_ABI_DIR}/libnapi.so"
)

add_library(lynx_primjs_napi_adapter SHARED IMPORTED)
set_target_properties(lynx_primjs_napi_adapter PROPERTIES
  IMPORTED_LOCATION "${LYNX_PRIMJS_ABI_DIR}/libnapi_adapter.so"
)

add_subdirectory(
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared"
  "${CMAKE_CURRENT_BINARY_DIR}/shared"
)

add_library(ScumbleAddon SHARED
  $<TARGET_OBJECTS:${LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET}>
)

target_link_libraries(ScumbleAddon PRIVATE
  lynx_primjs_napi_adapter
  lynx_primjs_napi
)

set_target_properties(ScumbleAddon PROPERTIES
  OUTPUT_NAME "ScumbleModule"
)

# ---------------------------------------------------------------------------
# skity render library (libscumblerender.so)
#
# Consumes the skity-native prefab (find_package(skity)) and hosts the GLES
# backend + JNI bridge + cross-platform ScumbleRenderer. Loaded via
# ScumbleNative.kt (System.loadLibrary("scumblerender")). Mirrors Skity-Android's
# app CMakeLists. Vulkan backend sources are added once VulkanRenderBackend lands.
# ---------------------------------------------------------------------------
find_package(skity-native CONFIG REQUIRED)

# HarfBuzz text shaping (static prefab, MavenCentral) — <Paragraph> Android
# layout backend. The core `harfbuzz` module is self-contained (cairo/glib
# only serve the harfbuzz-cairo variant); libharfbuzz.a links statically into
# libscumblerender.so, no runtime .so reaches the APK.
find_package(harfbuzz CONFIG REQUIRED)

# SheenBidi — UAX #9 bidirectional algorithm for the <Paragraph> Android
# backend (iOS uses CoreText's built-in UAX #9, so the pod never links this).
# Pure C, zero deps, data tables compiled in; fetched by habitat (DEPS.py)
# into shared/third_party/sheenbidi and linked statically like HarfBuzz —
# no runtime .so reaches the APK.
set(SHEENBIDI_ROOT "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/third_party/sheenbidi")
if(NOT EXISTS "${SHEENBIDI_ROOT}/Headers/SheenBidi/SheenBidi.h")
  message(FATAL_ERROR "SheenBidi sources missing under shared/third_party/sheenbidi — run `tools/hab sync` (root DEPS.py) and rebuild.")
endif()
file(GLOB_RECURSE SHEENBIDI_SOURCES "${SHEENBIDI_ROOT}/Source/*.c")
add_library(sheenbidi STATIC ${SHEENBIDI_SOURCES})
target_include_directories(sheenbidi PUBLIC "${SHEENBIDI_ROOT}/Headers")
# Internal cross-includes use paths relative to Source/ (<API/...>, <Core/...>).
target_include_directories(sheenbidi PRIVATE "${SHEENBIDI_ROOT}/Source")
target_compile_options(sheenbidi PRIVATE -w) # third-party C, silence warnings

add_library(scumblerender SHARED
  src/main/cpp/skity/app_renderer.cpp
  src/main/cpp/skity/shared_gl_context.cpp
  src/main/cpp/skity/gles_render_backend.cpp
  src/main/cpp/skity/vulkan_render_backend.cpp
  src/main/cpp/skity/gl_proc_resolver.cpp
  # <Paragraph> Android layout backend: skity FontManager font resolution +
  # per-character fallback, HarfBuzz shaping against the same Typeface, and
  # the shared CJK-aware line breaker (Task 16).
  src/main/cpp/skity/paragraph_shaper.cc
  src/main/cpp/jni/scumble_jni.cpp
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/ScumbleRenderer.cc"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/retained_render_tree.cc"
  # Native animation engine (ANIMATION_DESIGN.md): easing curves + track
  # parsing/evaluation/tick; the tree-side state lives on RetainedNode.
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/node_animation.cc"
  # Render build cache (RENDER_ARCHITECTURE.md §15): interned shader/filter
  # payloads + cached paths/contour-resident trim measures.
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/render_cache.cc"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/easing.cc"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/image_store.cc"
  # TASM→render font bridge for <Paragraph> glyph runs (cross-platform C++;
  # the TASM side registers, DrawShape's paragraph branch reads).
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/font_registry.cc"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/line_breaker.cc"
  # BiDi visual-order mapping for the shaper's line assembly (UAX #9 levels
  # come from SheenBidi; this is the pure-std part the host tests cover).
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/bidi_line.cc"
  # custom-font channel: base64 payload decode + the process-wide
  # data-URI→Typeface cache (shared with the iOS backend).
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/base64.cc"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/typeface_cache.cc")

target_include_directories(scumblerender PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/skity"
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp"
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity"
  # C++ FlatBuffers stubs, generated by `npm run generate-fbs` (also runs on
  # postinstall via packages/native/scripts/generate-fbs.mjs). Not in CMake
  # so the same generator serves Android/iOS/Harmony from one place.
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/skity/generated"
  # FlatBuffers runtime headers (header-only), fetched by habitat (DEPS.py) into
  # shared/third_party/flatbuffers. The generated render_tree stubs
  # #include <flatbuffers/flatbuffers.h>.
  "${LYNX_LIBRARY_PACKAGE_ROOT}/shared/third_party/flatbuffers/include")

target_link_libraries(scumblerender PRIVATE
  skity-native::skity
  harfbuzz::harfbuzz
  sheenbidi
  EGL
  GLESv3
  vulkan
  android
  dl
  log)
