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
        // Register skity elements (skity-canvas + virtual shapes) + future
        // global skity init, in one place.
        SkityInit.init(LynxEnv.inst())
        // Turn on Lynx Debug
        LynxEnv.inst().enableLynxDebug(true)
        // Turn on Lynx DevTool
        LynxEnv.inst().enableDevtool(true)
        // Turn on Lynx LogBox
        LynxEnv.inst().enableLogBox(true)
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
