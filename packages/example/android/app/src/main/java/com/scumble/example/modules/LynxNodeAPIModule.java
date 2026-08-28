// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Derived from LynxExplorer's
// explorer/android/lynx_explorer/src/main/java/com/lynx/explorer/modules/LynxNodeAPIModule.java.
// Host-side NAPI addon loader module. Registered by the host app as
// "LynxNodeAPI"; JS calls requireNodeAddon("<addon>") to trigger the native
// loader (liblynx_napi_addon_loader.so) which dlopen's the component's addon
// and publishes its exports to globalThis.__lynx_node_addon_exports__.
package com.scumble.example.modules;

import android.util.Log;
import com.lynx.jsbridge.LynxContextModule;
import com.lynx.jsbridge.LynxMethod;
import com.lynx.tasm.behavior.LynxContext;
import java.util.HashMap;
import java.util.Map;

public class LynxNodeAPIModule extends LynxContextModule {
  private static final String TAG = "LynxNodeAPIModule";
  private static volatile boolean sNativeAvailable = false;

  static {
    try {
      // Prefer host/engine integrated native loader if available; fall back to
      // System.loadLibrary when no loader hook is provided.
      com.lynx.tasm.LynxEnv env = com.lynx.tasm.LynxEnv.inst();
      Object loader = (env != null) ? env.getLibraryLoader() : null;
      if (loader instanceof com.lynx.tasm.INativeLibraryLoader) {
        ((com.lynx.tasm.INativeLibraryLoader) loader).loadLibrary("lynx_napi_addon_loader");
      } else {
        System.loadLibrary("lynx_napi_addon_loader");
      }
      sNativeAvailable = true;
    } catch (UnsatisfiedLinkError e) {
      Log.e(TAG, "Failed to load native library: lynx_napi_addon_loader", e);
    }
  }

  // runtimeId -> napi_env pointer (as long). Populated by the runtime attach
  // callback installed on each LynxView (see MainActivity).
  private static final Map<Long, Long> sRuntimeEnvMap =
      java.util.Collections.synchronizedMap(new HashMap<>());

  public LynxNodeAPIModule(LynxContext context, Object param) {
    super(context, param);
  }

  public static void putEnv(LynxContext token, long napiEnv) {
    if (token != null && napiEnv != 0) {
      Long runtimeId = token.getRuntimeId();
      if (runtimeId != null) {
        sRuntimeEnvMap.put(runtimeId, napiEnv);
      }
    }
  }

  public static void removeEnv(LynxContext token) {
    if (token != null) {
      Long runtimeId = token.getRuntimeId();
      if (runtimeId != null) {
        sRuntimeEnvMap.remove(runtimeId);
      }
    }
  }

  @LynxMethod
  public void requireNodeAddon(String addonName) {
    if (!sNativeAvailable) {
      Log.w(TAG, "Native addon loader unavailable; ignore requireNodeAddon: " + addonName);
      return;
    }

    if (mLynxContext != null) {
      Long runtimeId = mLynxContext.getRuntimeId();
      if (runtimeId == null) {
        Log.w(TAG,
            "requireNodeAddon failed: runtimeId is null. Ensure ENABLE_NAPI_BINDING is enabled "
                + "and the runtime attach callback has been received. addonName=" + addonName);
        return;
      }
      Long napiEnv = sRuntimeEnvMap.get(runtimeId);
      if (napiEnv != null && napiEnv != 0) {
        nativeRequireNodeAddon(napiEnv, addonName);
      } else {
        Log.w(TAG,
            "requireNodeAddon failed: napiEnv missing/invalid for runtimeId=" + runtimeId
                + ". Ensure ENABLE_NAPI_BINDING is enabled and the runtime attach callback has "
                + "been received. addonName=" + addonName);
      }
    } else {
      Log.w(TAG,
          "requireNodeAddon failed: mLynxContext is null. addonName=" + addonName);
    }
  }

  private native void nativeRequireNodeAddon(long napiEnv, String addonName);
}
