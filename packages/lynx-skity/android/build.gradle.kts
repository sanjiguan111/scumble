plugins {
  id("com.android.library")
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

  defaultConfig {
    minSdkVersion(23)


    externalNativeBuild {
      cmake {
        arguments(
          "-DLYNX_PRIMJS_JNI_DIR=${layout.buildDirectory.dir("primjs-native/jni").get().asFile.absolutePath}"
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
}

dependencies {
  implementation("org.lynxsdk.lynx:lynx:4.0.1")
  implementation("androidx.annotation:annotation:1.8.2")
  implementation("org.lynxsdk.lynx:service-api:4.0.1")
  annotationProcessor("org.lynxsdk.lynx:lynx-processor:4.0.1")

  implementation("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion")
  primjsNativeAar("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion@aar")
}


tasks.configureEach {
  if (name.startsWith("configureCMake")
      || name.startsWith("generateJsonModel")
      || name.startsWith("externalNativeBuild")) {
    dependsOn(extractPrimjsNativeLibraries)
  }
}
