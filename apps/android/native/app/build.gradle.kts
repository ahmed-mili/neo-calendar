plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val signingEnvironment = mapOf(
    "keystore" to System.getenv("ANDROID_KEYSTORE_PATH"),
    "storePassword" to System.getenv("ANDROID_KEYSTORE_PASSWORD"),
    "keyAlias" to System.getenv("ANDROID_KEY_ALIAS"),
    "keyPassword" to System.getenv("ANDROID_KEY_PASSWORD"),
)
val missingSigningValues = signingEnvironment
    .filterValues { it.isNullOrBlank() }
    .keys
val releaseRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

if (releaseRequested && missingSigningValues.isNotEmpty()) {
    throw GradleException(
        "Release signing is not configured. Missing: " +
            missingSigningValues.sorted().joinToString(", ")
    )
}

android {
 namespace = "com.ahmed.neocalendar"
 compileSdk = 37
 defaultConfig {
  applicationId = "com.ahmedmili.neocalendar"
  minSdk = 26
  targetSdk = 35
  versionCode = 204
 buildFeatures { buildConfig = true }

  versionName = "1.91.5"
  // Le moteur de synchronisation (libsyncthingnative.so) n'existe que pour ces trois ABI.
  ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
 }

 // Le binaire Syncthing se lance depuis nativeLibraryDir : il doit être EXTRAIT à l'installation, pas lu dans l'APK.
 packaging { jniLibs { useLegacyPackaging = true } }

 signingConfigs {
  if (missingSigningValues.isEmpty()) {
   create("distribution") {
    storeFile = file(signingEnvironment.getValue("keystore")!!)
    storePassword = signingEnvironment.getValue("storePassword")
    keyAlias = signingEnvironment.getValue("keyAlias")
    keyPassword = signingEnvironment.getValue("keyPassword")
   }
  }
 }

 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }

 buildTypes {
  debug { isMinifyEnabled = false }
  release {
   isMinifyEnabled = false
   if (missingSigningValues.isEmpty()) {
    signingConfig = signingConfigs.getByName("distribution")
   }
  }
 }
}

dependencies {
 implementation("androidx.core:core:1.15.0")
 implementation(project(":core"))
 // BOM 2026.09.00 : ui/foundation 1.12.1, material3 1.4.0 (aar-metadata verifies, cf. rapport).
 implementation(platform("androidx.compose:compose-bom:2026.09.00"))
 implementation("androidx.compose.material3:material3")
 implementation("androidx.compose.foundation:foundation")
 implementation("androidx.compose.ui:ui")
 implementation("androidx.activity:activity-compose:1.13.0")
 implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
 // Client HTTP de l'interface REST du moteur (socket Unix, voir sync/UnixSocketFactory.kt).
 implementation("com.squareup.okhttp3:okhttp:4.12.0")
 // QR code de l'identifiant d'appareil : dessin (zxing) et lecture (scanner de Google, services Google Play, sans permission caméra).
 implementation("com.google.zxing:core:3.4.1")
 implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
 // Le scanner de Google tire fragment 1.0.0 ; `registerForActivityResult` exige au moins 1.3.0 (lint de la version signée).
 implementation("androidx.fragment:fragment:1.8.9")
}

// Une release sans le moteur ne doit pas partir : les .so se compilent avec syncthing/build-syncthing.sh (cache en CI).
val checkSyncthingLibs = tasks.register("checkSyncthingLibs") {
    val libs = listOf("arm64-v8a", "armeabi-v7a", "x86_64").map { layout.projectDirectory.file("src/main/jniLibs/$it/libsyncthingnative.so") }
    doLast {
        val missing = libs.filter { !it.asFile.isFile }
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Moteur Syncthing absent : " + missing.joinToString { it.asFile.path } +
                    ". Lancer apps/android/native/syncthing/build-syncthing.sh.",
            )
        }
    }
}
// Accroché à l'étape qui embarque les .so dans l'APK, pas au début de la release : la validation AAPT2 de la CI
// compile les ressources release (mergeReleaseResources) sans construire le moteur.
tasks.matching { it.name == "mergeReleaseNativeLibs" }.configureEach { dependsOn(checkSyncthingLibs) }
