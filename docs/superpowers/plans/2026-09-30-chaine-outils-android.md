# Chaîne d'outils Android : AGP 9.3, Kotlin 2.4, compileSdk 37

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre le projet Gradle Android à une chaîne d'outils qui accepte Jetpack Compose actuel, sans changer le comportement de l'APK WebView livré.

**Architecture:** Compose UI 1.12 (BOM 2026.08) exige `minCompileSdk=37` et `minAndroidGradlePluginVersion=9.1.0` (lu dans l'`aar-metadata.properties` de `ui-android` 1.12.0, 2026-09-30). Kotlin 2.3.21 ne couvre AGP que jusqu'à 9.0.0 ; Kotlin 2.4.20 couvre AGP 8.5.2–9.3.1 et Gradle 7.6.3–9.7.0 (doc Kotlin, table KGP). AGP 9.3 demande au minimum Gradle 9.5.0 (doc Android, table AGP/Gradle). D'où : **AGP 9.3.x (≤ 9.3.1), Gradle 9.5.1, Kotlin 2.4.20, compileSdk 37 (`platforms;android-37.0`), targetSdk 35 INCHANGÉ** (le comportement de l'app au lancement ne dépend que de targetSdk).

**Tech Stack:** Gradle wrapper, AGP, Kotlin Gradle plugin ; projet `apps/android/native` (modules `:app` Java, `:core` Kotlin/JVM).

**Spec:** `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md` (le noyau `core` doit continuer de passer tout le corpus) et la décision « Kotlin + Jetpack Compose » de la note projet.

## Global Constraints

- Copie de travail : `C:\dev\neo-calendar-toolchain` (branche `android-toolchain`). Ne jamais toucher à `C:\dev\neo-calendar` ni à `C:\dev\neo-calendar-noyau-b`, où d'autres agents travaillent.
- **Aucun changement de comportement de l'APK** : `applicationId`, `namespace`, `minSdk` 26, `targetSdk` 35, `versionCode`, `versionName`, signature, permissions, manifeste inchangés. Les lignes `versionCode = N` et `versionName = "x"` gardent EXACTEMENT cette forme (lues par `scripts/set-version.mjs` et `scripts/generate-update-metadata.mjs`).
- Versions exactes : AGP la plus haute 9.3.x publiée qui soit ≤ 9.3.1 (compatibilité Kotlin 2.4.20), Gradle **9.5.1**, Kotlin **2.4.20** (plugin `org.jetbrains.kotlin.jvm` de `:core`), compileSdk **37** (plateforme `android-37.0`, installée localement). Toute autre version = la vérifier dans la doc officielle et le dire dans le rapport.
- JDK : local `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` ; CI Temurin 17. Si Gradle 9.5 ou AGP 9.3 exigent plus que 17, monter `java-version` dans les deux workflows et le dire.
- Pas de dépendance nouvelle. `:app` reste en Java ; si AGP 9 active son Kotlin intégré par défaut, le laisser tel quel s'il ne casse rien, sinon le désactiver par la propriété documentée.
- Commit en français ; trailer `Co-Authored-By:` au nom du modèle réel, puis `Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR`.

## Review Focus

- Le build de release signé : il doit toujours se configurer et se construire. Le vérifier avec une clé JETABLE (voir Task 1), jamais la vraie.
- `scripts/set-version.mjs` doit toujours trouver et réécrire `versionCode`/`versionName` (lancer ses tests Node).
- Les deux workflows (`release.yml`, `android-aapt2-validation.yml`) installent la bonne plateforme et le bon JDK.
- Le corpus Kotlin (`:core:test`) reste vert.
- L'APK debug s'installe PAR-DESSUS l'actuel sur l'émulateur sans perdre les données (même signature debug, même `applicationId`).

---

### Task 1: Monter la chaîne d'outils

**Files:**
- Modify: `apps/android/native/gradle/wrapper/gradle-wrapper.properties` (et le jar/scripts du wrapper si `gradle wrapper` les régénère)
- Modify: `apps/android/native/build.gradle.kts` (versions des plugins)
- Modify: `apps/android/native/app/build.gradle.kts` (compileSdk, et seulement ce que AGP 9 exige de changer au DSL)
- Modify: `apps/android/native/core/build.gradle.kts` si l'API `compilerOptions` change
- Modify: `apps/android/native/gradle.properties` si une propriété AGP 9 est nécessaire
- Modify: `.github/workflows/release.yml:170` et `.github/workflows/android-aapt2-validation.yml:31` (`platforms;android-37.0` ; build-tools : celle qu'AGP 9.3 utilise par défaut, relevée dans sa doc ou dans la sortie Gradle)

- [ ] **Step 1: État de départ mesuré.** Sous PowerShell, dans `apps/android/native` : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test assembleDebug --console=plain`. Consigner : BUILD SUCCESSFUL, taille de `app/build/outputs/apk/debug/app-debug.apk`, et la sortie de `& "$env:LOCALAPPDATA\Android\Sdk\build-tools\35.0.0\aapt2.exe" dump badging app\build\outputs\apk\debug\app-debug.apk` (package, versionCode, versionName, sdkVersion, targetSdkVersion, permissions), dans le rapport.
- [ ] **Step 2: Monter Gradle** : `.\gradlew.bat wrapper --gradle-version 9.5.1 --console=plain`, puis relancer le wrapper pour qu'il se régénère avec lui-même.
- [ ] **Step 3: Monter AGP et Kotlin** dans `build.gradle.kts` racine ; compileSdk 37 dans `app/build.gradle.kts`, avec la syntaxe qu'AGP 9.3 documente pour une plateforme `android-37.0`. Lire les notes de version AGP 9.0 à 9.3 (changements cassants du DSL) AVANT de corriger quoi que ce soit.
- [ ] **Step 4: Construire** : `.\gradlew.bat :core:test assembleDebug --console=plain` → vert. Corriger seulement ce que les erreurs demandent.
- [ ] **Step 5: Même APK** : relancer le `aapt2 dump badging` de l'étape 1 sur le nouvel APK (aapt2 des build-tools les plus récents installés) : package, versionCode, versionName, `sdkVersion` 26, `targetSdkVersion` 35 et permissions IDENTIQUES. Toute différence = arrêter et la signaler.
- [ ] **Step 6: Release avec une clé jetable** : `keytool -genkeypair -keystore $env:TEMP\toolchain-jetable.jks -storepass jetable123 -keypass jetable123 -alias jetable -keyalg RSA -keysize 2048 -validity 1 -dname "CN=jetable"`, puis avec `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` pointant dessus : `.\gradlew.bat assembleRelease --console=plain` → vert ; supprimer ensuite la clé jetable et l'APK release produit.
- [ ] **Step 7: Scripts de version** : à la racine du dépôt, `node --test scripts/*.test.mjs` → vert.
- [ ] **Step 8: Workflows** : mettre à jour les deux fichiers (plateforme 37.0, build-tools, JDK si besoin). Relire le diff ligne à ligne.
- [ ] **Step 9: Commit** « Chaîne d'outils Android : AGP 9.3, Gradle 9.5.1, Kotlin 2.4.20, compileSdk 37 ».
