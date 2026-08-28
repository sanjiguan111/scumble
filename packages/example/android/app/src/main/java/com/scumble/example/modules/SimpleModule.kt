package com.scumble.example.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule

class SimpleModule(context: Context) : LynxModule(context) {

    @LynxMethod
    fun simpleMethod() {
    }
}