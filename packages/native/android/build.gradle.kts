plugins {
  id("com.android.library")
  alias(libs.plugins.kotlin.android)
  // lynx-processor is a Java annotation processor; annotationProcessor() only
  // scans Java sources, so Kotlin @LynxProp setters (ShadowNode / UI) never get
  // a generated PropsSetter ("PropsSetter not generated for class …"). kapt
  // bridges the APT to Kotlin. Mirrors lynx-native-svg's android build.gradle.
  alias(libs.plugins.kotlin.kapt)
}

val lynxPrimjsVersion = providers.gradleProperty("lynx.primjs.version").orElse("4.+").get()
val primjsNativeAar by configurations.creating
val primjsNativeAarFiles = primjsNativeAar.incoming.artifactView {}.files
val extractPrimjsNativeLibraries by tasks.registering(Sync::class) {
  from(primjsNativeAarFiles.elements.map { files ->
    files.map { zipTree(it.asFile) }
  })
  include("jni/**/*.so")
  into(layout.buildDirectory.dir("primjs-native"))
}


android {
  namespace = "com.skity.graphics"
  compileSdk = 35

  // skity-native ships as a prefab-packaged AAR; enabling prefab lets the CMake
  // project consume it via find_package(skity) (added alongside SkityRenderer).
  buildFeatures {
    prefab = true
  }

  defaultConfig {
    // Vulkan backend requires API 24+ (libvulkan.so is unavailable in the NDK
    // sysroot before API 24). GLES runs on lower APIs, but linking the skity
    // native library needs libvulkan.so, so the floor is 24.
    minSdkVersion(24)


    externalNativeBuild {
      cmake {
        arguments(
          "-DLYNX_PRIMJS_JNI_DIR=${layout.buildDirectory.dir("primjs-native/jni").get().asFile.absolutePath}",
          // skity-native is built against the shared C++ STL (libc++_shared.so);
          // every native module must match it or the linker rejects the ABI mix
          // ("User is using a static STL but library requires a shared STL").
          "-DANDROID_STL=c++_shared"
        )
      }
    }
  }


  externalNativeBuild {
    cmake {
      path = file("CMakeLists.txt")
      version = "3.22.1"
    }
  }
  kotlinOptions {
    jvmTarget = "1.8"
  }
  sourceSets {
    getByName("main") {
      // FlatBuffers-generated Java stubs (package com.skity.graphics.skityrt),
      // produced by `npm run generate-fbs` from packages/native/schema/*.fbs.
      java.srcDir("src/main/fbs-gen")
      // FlatBuffers Java runtime (com.google.flatbuffers.*), vendored by habitat
      // (DEPS.py). The generated stubs extend its Table / FlatBufferBuilder.
      java.srcDir("../shared/third_party/flatbuffers/java/src/main/java")
    }
  }
  // skity-native's libskity.so reaches packaging from both the library's own
  // jni copy and the AAR transform; pick one to satisfy mergeNativeLibs.
  packaging {
    jniLibs {
      pickFirsts += setOf("**/libskity.so")
    }
  }
}

dependencies {
  implementation("org.lynxsdk.lynx:lynx:4.0.1")
  implementation("androidx.annotation:annotation:1.8.2")
  implementation("org.lynxsdk.lynx:service-api:4.0.1")
  kapt("org.lynxsdk.lynx:lynx-processor:4.0.1")

  implementation("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion")
  primjsNativeAar("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion@aar")

  // skity rendering engine (prefab). Consumed in CMake via find_package(skity);
  // see packages/native/shared/skity/SkityRenderer.
  implementation("org.lynxsdk.lynx:skity-native:1.1.0-alpha.3")
}


tasks.configureEach {
  if (name.startsWith("configureCMake")
      || name.startsWith("generateJsonModel")
      || name.startsWith("externalNativeBuild")) {
    dependsOn(extractPrimjsNativeLibraries)
  }
}
