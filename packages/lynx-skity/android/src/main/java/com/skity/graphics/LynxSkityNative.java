package com.skity.graphics;

/**
 * Loads the lynx-skity NAPI addon ({@code libLynxSkityModule.so}).
 *
 * <p>The addon registers itself with the primjs runtime through a C constructor
 * ({@code _napi_register_xx_LynxSkityModule} -> {@code napi_module_register_xx}),
 * which only runs when the library is {@code dlopen}'d. Call {@link #ensureLoaded()}
 * once before any LynxView renders JS &mdash; typically in {@code Application.onCreate},
 * ahead of {@code LynxEnv.init}. Without this, the constructor never runs, primjs's
 * module list stays empty, {@code globalThis.__lynxNapiLoader.load("LynxSkityModule")}
 * returns undefined, and the JS facade throws.
 */
public final class LynxSkityNative {
    static {
        System.loadLibrary("LynxSkityModule");
    }

    /** Triggers the static initializer above (which loads the native library). */
    public static void ensureLoaded() {}

    private LynxSkityNative() {}
}
