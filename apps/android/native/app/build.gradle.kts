plugins { id("com.android.application") }

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
 compileSdk = 35
 defaultConfig {
  applicationId = "com.ahmed.neocalendar"
  minSdk = 26
  targetSdk = 35
  versionCode = 95
 buildFeatures { buildConfig = true }

  versionName = "1.38.36"
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
 implementation("androidx.core:core:1.15.0")
}
