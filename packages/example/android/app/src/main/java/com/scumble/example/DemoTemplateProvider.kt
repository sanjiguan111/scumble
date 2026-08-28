package com.scumble.example

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Response
import retrofit2.Retrofit
import java.io.IOException


class DemoTemplateProvider(context: Context) : AbsTemplateProvider() {
    override fun loadTemplate(url: String, callback: Callback) {
        val retrofit = Retrofit.Builder().baseUrl("http://localhost:3000/").build()

        val templateApi: TemplateApi? = retrofit.create(TemplateApi::class.java)

        val call: Call<ResponseBody?>? = templateApi!!.getTemplate(url)

        call!!.enqueue(object : retrofit2.Callback<ResponseBody?> {
            public override fun onResponse(
                call: Call<ResponseBody?>?,
                response: Response<ResponseBody?>
            ) {
                try {
                    if (response.body() != null) {
                        callback.onSuccess(response.body()!!.bytes())
                    } else {
                    }
                } catch (e: IOException) {
                    e.printStackTrace()
                    callback.onFailed(e.toString())
                }
            }

            override fun onFailure(call: Call<ResponseBody?>, throwable: Throwable) {
                callback.onFailed(throwable.message)
            }
        })
    }
}