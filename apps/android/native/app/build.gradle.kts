plugins { id("com.android.application") }

android {
 namespace = "com.ahmed.neocalendar"
 compileSdk = 35
 defaultConfig {
  applicationId = "com.ahmed.neocalendar"
  minSdk = 26
  targetSdk = 35
  versionCode = 3
  versionName = "1.0.2"
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 buildTypes { debug { isMinifyEnabled = false } }
}
