# Host-side unit tests for the pure-std pieces of the shared layer (line
# breaker, base64) — no skity, no platform SDKs, no device needed. GoogleTest
# comes from habitat (DEPS.py → shared/third_party/googletest; run
# `tools/hab sync` first). Configure/build/run everything via
# `pnpm --filter @lynx-skity/native test:native` (cmake + ctest).
cmake_minimum_required(VERSION 3.16)
project(skityrt_tests CXX)

enable_testing()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(GOOGLETEST_ROOT "${CMAKE_CURRENT_LIST_DIR}/../shared/third_party/googletest")
if(NOT EXISTS "${GOOGLETEST_ROOT}/CMakeLists.txt")
  message(FATAL_ERROR "GoogleTest not found under shared/third_party — run `tools/hab sync` first")
endif()

# Vendored and test-only: don't install, don't build gmock, don't run its
# own test suite.
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
add_subdirectory("${GOOGLETEST_ROOT}" googletest EXCLUDE_FROM_ALL)

# One target per test binary; list its extra (non-test) sources next to it.
add_executable(line_breaker_test line_breaker_test.cc ../shared/skity/line_breaker.cc)
target_link_libraries(line_breaker_test GTest::gtest_main)

add_executable(base64_test base64_test.cc ../shared/skity/base64.cc)
target_link_libraries(base64_test GTest::gtest_main)

add_executable(bidi_line_test bidi_line_test.cc ../shared/skity/bidi_line.cc)
target_link_libraries(bidi_line_test GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(line_breaker_test)
gtest_discover_tests(base64_test)
gtest_discover_tests(bidi_line_test)
