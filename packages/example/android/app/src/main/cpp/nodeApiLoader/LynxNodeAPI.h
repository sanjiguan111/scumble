// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Derived from LynxExplorer's explorer/cpp/LynxNodeAPI.h. Host-side NAPI addon
// loader: dlopen's a component's addon .so and calls its
// napi_register_module_v1 with a real napi_env obtained from the host runtime,
// so a component's NAPI addon can run on a public Lynx build where the PrimJS
// NAPI loader (getNapiLoader) is compiled out.
#ifndef NODE_API_LOADER_LYNX_NODE_API_H_
#define NODE_API_LOADER_LYNX_NODE_API_H_

#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>

namespace lynx {
namespace explorer {

class LynxNodeAPI {
public:
  static LynxNodeAPI &GetInstance() {
    static LynxNodeAPI instance;
    return instance;
  }

  // Require (load + init) the named addon under the given napi_env, publishing
  // its exports to globalThis.__lynx_node_addon_exports__[addon_name].
  void RequireNodeAddon(void *napi_env_ptr, const std::string &addon_name);

private:
  LynxNodeAPI() = default;
  ~LynxNodeAPI() = default;

  struct NodeAddon {
    void *moduleHandle = nullptr; // dlopen handle
    void *init = nullptr;         // napi_register_module_v1
    std::string generatedName;    // key under __lynx_node_addon_exports__
  };

  bool LoadNodeAddon(NodeAddon &addon, const std::string &library_name) const;
  bool InitializeNodeModule(void *env_ptr, NodeAddon &addon);

  std::mutex env_mutex_;
  std::unordered_map<std::string, NodeAddon> nodeAddons_;
};

} // namespace explorer
} // namespace lynx

#endif // NODE_API_LOADER_LYNX_NODE_API_H_
