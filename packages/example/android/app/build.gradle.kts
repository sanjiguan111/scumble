plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("org.lynxsdk.lynx.library-build")
}

// primjs ships the prebuilt napi runtime (.so) needed to link the host's NAPI
// addon loader (liblynx_napi_addon_loader.so). Mirror the library's extraction.
val lynxPrimjsVersion = providers.gradleProperty("lynx.primjs.version").orElse("4.0.0").get()
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
    namespace = "com.skity.example"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.skity.example"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        externalNativeBuild {
            cmake {
                arguments(
                    "-DLYNX_PRIMJS_JNI_DIR=${layout.buildDirectory.dir("primjs-native/jni").get().asFile.absolutePath}",
                    // skity-native is built against the shared C++ STL (libc++_shared.so);
                    // every native module must match it or the linker rejects the ABI mix.
                    "-DANDROID_STL=c++_shared"
                )
            }
        }
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    externalNativeBuild {
        cmake {
            path = file("CMakeLists.txt")
            version = "3.22.1"
        }
    }
    packaging {
        jniLibs {
            pickFirsts += setOf("**/libnapi_adapter.so", "**/libnapi.so", "**/libc++_shared.so", "**/libskity.so")
        }
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.core.ktx)
    implementation(libs.lynx)
    implementation(libs.lynx.jssdk)
    implementation(libs.lynx.trace)
    implementation(libs.lynx.service.image)
    implementation(libs.lynx.service.log)
    implementation(libs.lynx.service.http)
    implementation(libs.lynx.devtool)
    implementation(libs.lynx.service.devtool)
    implementation("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion")

    // image-service dependencies, if not added, images cannot be loaded; if the host APP needs to use other image libraries, you can customize the image-service and remove this dependency
    implementation("com.facebook.fresco:fresco:2.3.0")
    implementation("com.facebook.fresco:animated-gif:2.3.0")
    implementation("com.facebook.fresco:animated-webp:2.3.0")
    implementation("com.facebook.fresco:webpsupport:2.3.0")
    implementation("com.facebook.fresco:animated-base:2.3.0")

    implementation("com.squareup.okhttp3:okhttp:4.9.0")
    implementation("com.squareup.okhttp3:okhttp-urlconnection:4.4.0")
    implementation("com.squareup.retrofit2:retrofit:2.7.0")

    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)

    primjsNativeAar("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion@aar")
}

tasks.configureEach {
    if (name.startsWith("configureCMake")
        || name.startsWith("generateJsonModel")
        || name.startsWith("externalNativeBuild")) {
        dependsOn(extractPrimjsNativeLibraries)
    }
}
