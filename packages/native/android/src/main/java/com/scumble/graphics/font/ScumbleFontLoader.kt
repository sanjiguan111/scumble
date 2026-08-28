// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.font

import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Host-injectable font loader for `<scumble-paragraph>` custom fonts. The
 * built-in [BuiltInScumbleFontLoader] covers `http(s)://` URLs and `file://`
 * paths; hosts with their own pipeline (cache/CDN/bundled assets) swap it
 * via [com.scumble.graphics.ScumbleInit.setFontLoader].
 *
 * Unlike images, fonts are a LAYOUT input: a miss falls back to the default
 * font for that layout, and the loaded bytes re-trigger layout through
 * [ScumbleFontController] once they arrive.
 */
fun interface ScumbleFontLoader {
  /** Raw ttf/otf bytes for the uri; `onResult(null)` = failure. May be called
   *  on any thread. */
  fun loadFont(uri: String, onResult: (ByteArray?) -> Unit)
}

/**
 * Built-in loader: `http(s)` via HttpURLConnection and `file://` paths (zero
 * third-party deps). IO happens on a background executor; results surface on
 * that thread (the controller re-dispatches). `data:` URIs never reach a
 * loader — they decode synchronously in the native TypefaceCache.
 */
class BuiltInScumbleFontLoader : ScumbleFontLoader {

  override fun loadFont(uri: String, onResult: (ByteArray?) -> Unit) {
    EXECUTOR.execute {
      onResult(
        try {
          when {
            uri.startsWith("http://") || uri.startsWith("https://") -> loadUrl(uri)
            uri.startsWith("file://") -> File(URL(uri).file).takeIf { it.isFile }?.readBytes()
            else -> null // host schemes: hosts provide their own loader
          }
        } catch (_: Exception) {
          null
        }
      )
    }
  }

  private fun loadUrl(uri: String): ByteArray? {
    val conn = URL(uri).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 15_000
    try {
      if (conn.responseCode / 100 != 2) return null
      return conn.inputStream.use { input ->
        ByteArrayOutputStream().use { out ->
          input.copyTo(out)
          out.toByteArray()
        }
      }
    } finally {
      conn.disconnect()
    }
  }

  companion object {
    private val EXECUTOR: ExecutorService = Executors.newSingleThreadExecutor { r ->
      Thread(r, "skity-font-loader").apply { isDaemon = true }
    }
  }
}
