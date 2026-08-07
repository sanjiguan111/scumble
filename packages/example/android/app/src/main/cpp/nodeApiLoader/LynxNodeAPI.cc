// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Derived from LynxExplorer's explorer/cpp/LynxNodeAPI.cc (Apache 2.0).
// Android-only host-side NAPI addon loader.
#include "LynxNodeAPI.h"

#include <dlfcn.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "node_api.h"

namespace lynx {
namespace explorer {

namespace {

bool EndsWith(const std::string &s, const char *suffix) {
  const size_t s_len = s.size();
  const size_t suf_len = std::strlen(suffix);
  if (suf_len > s_len) return false;
  return s.compare(s_len - suf_len, suf_len, suffix) == 0;
}

bool StartsWith(const std::string &s, const char *prefix) {
  const size_t pre_len = std::strlen(prefix);
  if (pre_len > s.size()) return false;
  return s.compare(0, pre_len, prefix) == 0;
}

bool ContainsPathSeparator(const std::string &s) {
  return s.find('/') != std::string::npos || s.find('\\') != std::string::npos;
}

void AddUnique(std::vector<std::string> &out, std::string v) {
  if (v.empty()) return;
  if (std::find(out.begin(), out.end(), v) != out.end()) return;
  out.emplace_back(std::move(v));
}

// Build dlopen candidate names for an addon (Android resolves lib<name>.so
// from the app's nativeLibraryDir without an absolute path).
std::vector<std::string> BuildAddonCandidates(const std::string &library_name) {
  std::vector<std::string> candidates;
  AddUnique(candidates, library_name);

  const bool has_path = ContainsPathSeparator(library_name) || StartsWith(library_name, "@");
  const bool has_ext = EndsWith(library_name, ".node") || EndsWith(library_name, ".so") ||
                       EndsWith(library_name, ".dylib") || EndsWith(library_name, ".dll");
  if (has_path) {
    if (!has_ext) {
      AddUnique(candidates, library_name + ".node");
      AddUnique(candidates, library_name + ".so");
    }
    return candidates;
  }

  const std::string &name = library_name;
  if (EndsWith(name, ".node")) {
    AddUnique(candidates, name.substr(0, name.size() - 5) + ".so");
  }
  if (!has_ext) {
    if (StartsWith(name, "lib")) {
      AddUnique(candidates, name + ".so");
      AddUnique(candidates, name + ".node");
    } else {
      AddUnique(candidates, "lib" + name + ".so");
      AddUnique(candidates, "lib" + name + ".node");
    }
  }
  return candidates;
}

struct PosixLoader {
  using Module = void *;
  using Symbol = void *;
  static Module loadLibrary(const char *filePath) {
    return dlopen(filePath, RTLD_NOW | RTLD_LOCAL);
  }
  static Symbol getSymbol(Module library, const char *name) { return dlsym(library, name); }
  static void unloadLibrary(Module library) {
    if (library != nullptr) dlclose(library);
  }
};

} // namespace

void LynxNodeAPI::RequireNodeAddon(void *napi_env_ptr, const std::string &addon_name) {
  if (napi_env_ptr == nullptr) return;

  NodeAddon addon;
  {
    std::lock_guard<std::mutex> lock(env_mutex_);
    auto [it, inserted] = nodeAddons_.try_emplace(addon_name);
    NodeAddon &cached_addon = it->second;
    if (inserted) {
      if (!LoadNodeAddon(cached_addon, addon_name)) {
        nodeAddons_.erase(it);
        return; // Load failed
      }
    }
    addon = cached_addon;
  }

  InitializeNodeModule(napi_env_ptr, addon);
}

// Note: the dynamic library loading here is for demonstration purposes only.
// In production use, strong constraints and fallback mechanisms must be
// implemented to prevent attempts to load unexpected shared libraries.
bool LynxNodeAPI::LoadNodeAddon(NodeAddon &addon, const std::string &libraryName) const {
  // Reject untrusted addon names that could be used for path traversal or
  // loading unexpected libraries. Only allow [A-Za-z0-9_.-].
  if (libraryName.empty() || libraryName.size() > 128 ||
      libraryName.find("..") != std::string::npos || libraryName.find('/') != std::string::npos ||
      libraryName.find('\\') != std::string::npos || libraryName.find('@') != std::string::npos ||
      libraryName.find(':') != std::string::npos || libraryName.find('\0') != std::string::npos ||
      libraryName.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"
                                    "QRSTUVWXYZ0123456789_.-") != std::string::npos) {
    std::fprintf(stderr, "Failed to load Node Addon: invalid name '%s'\n", libraryName.c_str());
    return false;
  }

  const std::vector<std::string> candidates = BuildAddonCandidates(libraryName);
  const char *last_error = nullptr;

  for (const auto &path : candidates) {
    (void)dlerror(); // clear any previous dl error
    PosixLoader::Module library = PosixLoader::loadLibrary(path.c_str());
    if (library == nullptr) {
      last_error = dlerror();
      continue;
    }

    addon.moduleHandle = library;
    addon.generatedName = libraryName; // key under __lynx_node_addon_exports__

    PosixLoader::Symbol initFn = PosixLoader::getSymbol(library, "napi_register_module_v1");
    if (initFn != nullptr) {
      addon.init = initFn;
      return true;
    }

    // Loaded but missing expected symbol, unload and continue.
    PosixLoader::unloadLibrary(library);
    addon.moduleHandle = nullptr;
    addon.init = nullptr;
    last_error = dlerror();
  }

  if (last_error != nullptr) {
    std::fprintf(stderr, "Failed to load Node Addon '%s'. Last dlopen/dlsym error: %s\n",
                 libraryName.c_str(), last_error);
  }
  return false;
}

bool LynxNodeAPI::InitializeNodeModule(void *env_ptr, NodeAddon &addon) {
  if (addon.init == nullptr) return false;
  if (env_ptr == nullptr) return false;

  napi_env env = reinterpret_cast<napi_env>(env_ptr);

  napi_value exports;
  if (napi_create_object(env, &exports) != napi_ok) return false;

  // Call the addon init function to populate the "exports" object.
  auto init = reinterpret_cast<napi_value (*)(napi_env, napi_value)>(addon.init);
  exports = init(env, exports);

  napi_value global;
  if (napi_get_global(env, &global) != napi_ok) return false;

  napi_value exports_obj;
  napi_status status =
      napi_get_named_property(env, global, "__lynx_node_addon_exports__", &exports_obj);

  napi_valuetype type;
  if (status != napi_ok) {
    type = napi_undefined;
  } else {
    if (napi_typeof(env, exports_obj, &type) != napi_ok) {
      type = napi_undefined;
    }
  }

  // Ensure __lynx_node_addon_exports__ is an object; otherwise create it.
  if (type != napi_object) {
    if (napi_create_object(env, &exports_obj) != napi_ok) return false;
    if (napi_set_named_property(env, global, "__lynx_node_addon_exports__", exports_obj) != napi_ok)
      return false;
  }

  status = napi_set_named_property(env, exports_obj, addon.generatedName.c_str(), exports);
  return status == napi_ok;
}

} // namespace explorer
} // namespace lynx
