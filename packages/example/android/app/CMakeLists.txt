cmake_minimum_required(VERSION 3.22.1)

project(lynx_napi_addon_loader LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# primjs prebuilt napi runtime (.so), extracted by extractPrimjsNativeLibraries
# (see app/build.gradle.kts). Provides the napi C API implementation that the
# loader links against.
if(NOT LYNX_PRIMJS_JNI_DIR)
  message(FATAL_ERROR "LYNX_PRIMJS_JNI_DIR is required. Build through the Gradle project.")
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

# Resolve @lynx-js/weak-node-api headers (node_api.h) via node from the example
# package root. example/package.json must list @lynx-js/weak-node-api.
find_program(NODE_EXECUTABLE NAMES node)
if(NOT NODE_EXECUTABLE)
  message(FATAL_ERROR "Unable to find node. Install Node.js before configuring.")
endif()
execute_process(
  COMMAND "${NODE_EXECUTABLE}" -p "require('node:path').dirname(require.resolve('@lynx-js/weak-node-api/package.json'))"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../.."
  RESULT_VARIABLE _weak_node_res
  OUTPUT_VARIABLE _weak_node_pkg_root
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
if(NOT _weak_node_res EQUAL 0 OR NOT _weak_node_pkg_root)
  message(FATAL_ERROR "Unable to resolve @lynx-js/weak-node-api. Run pnpm install in packages/example.")
endif()
set(LYNX_WEAK_NODE_API_HEADERS_DIR "${_weak_node_pkg_root}/headers")

add_library(lynx_napi_addon_loader SHARED
  src/main/cpp/nodeApiLoader/LynxNodeAPI.cc
  src/main/cpp/nodeApiLoader/LynxNodeAPIJNI.cc
)

target_include_directories(lynx_napi_addon_loader PRIVATE
  src/main/cpp/nodeApiLoader
  "${LYNX_WEAK_NODE_API_HEADERS_DIR}"
)

target_link_libraries(lynx_napi_addon_loader PRIVATE
  lynx_primjs_napi_adapter
  lynx_primjs_napi
  log
)
