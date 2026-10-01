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
  versionCode = 191
 buildFeatures { buildConfig = true }

  versionName = "1.84.1"
 }

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
 implementation("androidx.core:core:1.19.1")
 implementation(project(":core"))
 // BOM 2026.09.00 : ui/foundation 1.12.1, material3 1.4.0 (aar-metadata verifies, cf. rapport).
 implementation(platform("androidx.compose:compose-bom:2026.09.00"))
 implementation("androidx.compose.material3:material3")
 implementation("androidx.compose.foundation:foundation")
 implementation("androidx.compose.ui:ui")
 implementation("androidx.activity:activity-compose:1.13.0")
 implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
}
