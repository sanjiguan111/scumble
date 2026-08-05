package com.skity.example

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var lynxView: LynxView
    private var hotReloadThread: Thread? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lynxView = buildLynxView()
        setContentView(lynxView)
        loadBundle()
        startHotReloadListener()
    }

    private fun loadBundle() {
        val uri = "http://localhost:3000/main.lynx.bundle"
        lynxView.renderTemplateUrl("${uri}?timestamp=${System.currentTimeMillis()}", "")
    }

    private fun startHotReloadListener() {
        hotReloadThread = Thread {
            val client = OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build()
            while (!Thread.currentThread().isInterrupted) {
                try {
                    val request = Request.Builder()
                        .url("http://localhost:3001/hot-reload")
                        .build()
                    val response = client.newCall(request).execute()
                    val reader = response.body?.byteStream()?.bufferedReader()
                    reader?.use {
                        while (!Thread.currentThread().isInterrupted) {
                            val line = it.readLine() ?: break
                            if (line.startsWith("data: reload")) {
                                Handler(Looper.getMainLooper()).post { loadBundle() }
                            }
                        }
                    }
                } catch (_: Exception) {
                }
                // Connection lost, retry after delay
                try {
                    Thread.sleep(2000)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
        hotReloadThread?.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        hotReloadThread?.interrupt()
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder: LynxViewBuilder = LynxViewBuilder()
        // lynx-skity library is not integrated yet, so no BehaviorBundle to register here.
        return viewBuilder.build(this)
    }
}
