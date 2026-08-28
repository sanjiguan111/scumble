package com.skity.example

import android.app.Application
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.imagepipeline.core.ImagePipelineConfig
import com.facebook.imagepipeline.memory.PoolConfig
import com.facebook.imagepipeline.memory.PoolFactory
import com.lynx.devtoolwrapper.LynxDevtoolGlobalHelper
import com.lynx.service.devtool.LynxDevToolService
import com.lynx.service.http.LynxHttpService
import com.lynx.service.image.LynxImageService
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter
import com.skity.example.modules.LynxNodeAPIModule
import com.skity.example.modules.SimpleModule
import com.skity.graphics.SkityInit
import com.skity.graphics.SkityNative

class ExampleApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initLynxService()
        initLynxEnv()
    }

    private fun initLynxService() {
        // init Fresco which is needed by LynxImageService
        val factory = PoolFactory(PoolConfig.newBuilder().build())
        val builder =
            ImagePipelineConfig.newBuilder(applicationContext).setPoolFactory(factory)
        Fresco.initialize(applicationContext, builder.build())

        LynxServiceCenter.inst().registerService(LynxImageService.getInstance())
        LynxServiceCenter.inst().registerService(LynxLogService)
        LynxServiceCenter.inst().registerService(LynxHttpService)

        // register devtool service
        LynxDevToolService.INSTANCE.enableAllSessions()
        LynxDevToolService.INSTANCE.lynxDebugPresetValue = true
        LynxDevToolService.INSTANCE.logBoxPresetValue = true
        LynxDevToolService.INSTANCE.loadQJSBridge = true
        LynxDevToolService.INSTANCE.loadV8Bridge = true
        LynxServiceCenter.inst().registerService(LynxDevToolService.INSTANCE)
    }

    private fun initLynxEnv() {
        LynxEnv.inst().init(
            this,
            null,
            DemoTemplateProvider(this),
            null
        )
        // Register the host-side NAPI addon loader (Explorer-style). JS calls
        // NativeModules.LynxNodeAPI.requireNodeAddon("<addon>") to trigger the
        // native loader (liblynx_napi_addon_loader.so), which dlopen's the
        // component's addon and publishes its exports to
        // globalThis.__lynx_node_addon_exports__. LynxNodeAPIModule lives in
        // this same package, so no import is needed.
        LynxEnv.inst().registerModule("SimpleModule", SimpleModule::class.java)
        LynxEnv.inst().registerModule("LynxNodeAPI", LynxNodeAPIModule::class.java)
        // Register skity elements (scumble-canvas + virtual shapes) + future
        // global skity init, in one place. Backend flip for A/B smoothness
        // testing: GLES (default) vs VULKAN (falls back to GLES when the
        // device can't probe a usable Vulkan context).
        SkityInit.init(LynxEnv.inst(), SkityNative.BACKEND_VULKAN)
        // SkityInit.init(LynxEnv.inst()) // GLES
        // Vulkan preferred per user request 2026-08-25; SkityInit falls back
        // to GLES when the device can't probe a usable Vulkan context (this
        // MI 6 logs image-alloc failures under Vulkan but runs).
        // Dev-mode switches — OFF for smoothness A/B (debug bridge, devtool
        // inspector and LogBox all add per-frame overhead on the Lynx side).
        // LynxEnv.inst().enableLynxDebug(true)
        // LynxEnv.inst().enableDevtool(true)
        // LynxEnv.inst().enableLogBox(true)
        // Create a Handler associated with the main thread's Looper
        val mainHandler = Handler(Looper.getMainLooper())
        // Register OpenCard for Lynx DevTool
        LynxDevtoolGlobalHelper.getInstance().registerCardListener { url ->
            mainHandler.post {
                val intent = Intent(
                    applicationContext,
                    DebugActivity::class.java
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                intent.putExtra("url", url)
                startActivity(intent)
            }
        }
    }
}
