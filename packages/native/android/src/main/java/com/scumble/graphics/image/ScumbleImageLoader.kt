// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
package com.scumble.graphics.image

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Decoded bitmap payload: premultiplied RGBA bytes (ARGB_8888
 * Bitmap.copyPixelsToBuffer order on Android is R,G,B,A — skity's kRGBA
 * layout) + dimensions.
 */
class ScumbleImagePixels(val rgba: ByteArray, val width: Int, val height: Int)

/**
 * Host-injectable image loader for `<skity-image>`. The built-in
 * [BuiltInScumbleImageLoader] covers `data:` URIs and `http(s)://` URLs; hosts
 * with their own pipeline (cache/CDN) swap it via
 * [com.scumble.graphics.ScumbleInit.setImageLoader].
 */
fun interface ScumbleImageLoader {
  /** `onResult(null)` = failure. May be called on any thread. */
  fun loadImage(uri: String, onResult: (ScumbleImagePixels?) -> Unit)
}

/**
 * Built-in loader: `data:image/...;base64,` URIs and `http(s)` URLs via
 * HttpURLConnection (zero third-party deps). Decoding happens on a background
 * executor; results surface on the same executor thread (the controller
 * re-dispatches to the render thread).
 */
class BuiltInScumbleImageLoader : ScumbleImageLoader {

  override fun loadImage(uri: String, onResult: (ScumbleImagePixels?) -> Unit) {
    EXECUTOR.execute {
      onResult(
        try {
          when {
            uri.startsWith("data:") -> decodeDataUri(uri)
            uri.startsWith("http://") || uri.startsWith("https://") -> decodeUrl(uri)
            else -> null // file/asset schemes: hosts provide their own loader
          }
        } catch (_: Exception) {
          null
        }
      )
    }
  }

  private fun decodeDataUri(uri: String): ScumbleImagePixels? {
    val marker = uri.indexOf("base64,")
    if (marker < 0) return null
    val data = Base64.decode(uri.substring(marker + "base64,".length), Base64.DEFAULT)
    return decodeBytes(data)
  }

  private fun decodeUrl(uri: String): ScumbleImagePixels? {
    val conn = URL(uri).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 15_000
    try {
      if (conn.responseCode / 100 != 2) return null
      val bytes = conn.inputStream.use { input ->
        ByteArrayOutputStream().use { out ->
          input.copyTo(out)
          out.toByteArray()
        }
      }
      return decodeBytes(bytes)
    } finally {
      conn.disconnect()
    }
  }

  private fun decodeBytes(data: ByteArray): ScumbleImagePixels? {
    val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, opts) ?: return null
    val w = bmp.width
    val h = bmp.height
    if (w <= 0 || h <= 0 || bmp.config != Bitmap.Config.ARGB_8888) return null
    // ARGB_8888 is premultiplied by default (inPremultiplied = true) and
    // copyPixelsToBuffer yields R,G,B,A bytes with rowBytes = w * 4.
    val buffer = ByteArray(w * h * 4)
    bmp.copyPixelsToBuffer(java.nio.ByteBuffer.wrap(buffer))
    bmp.recycle()
    return ScumbleImagePixels(buffer, w, h)
  }

  companion object {
    // Single shared decoder pool: image loads are rare (uri-keyed dedup
    // upstream) and small; one thread avoids a decode stampede while keeping
    // large base64/remote decodes off the TASM/UI threads.
    private val EXECUTOR: ExecutorService = Executors.newSingleThreadExecutor { r ->
      Thread(r, "skity-image-loader").apply { isDaemon = true }
    }
  }
}
