# App Compose : squelette, lecture du dossier et premier écran

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser l'app native Kotlin + Jetpack Compose à côté de l'app WebView, dans le même APK : une activité Compose, ouverte par une seconde icône « Neo Calendar natif » (build debug seulement pour l'instant), qui lit le même dossier de notes que la WebView et affiche les calendriers et les prochains évènements, calculés par le noyau `core`.

**Architecture:** Même APK, même `applicationId`, même dossier SAF (l'URI autorisée est déjà dans les `SharedPreferences` `neo_android` / clé `tree_uri`, posée par la WebView) : aucune donnée à migrer, aucun second choix de dossier. La WebView reste l'app lancée par l'icône principale jusqu'à la bascule (tâche 26 de la note projet). La lecture du dossier est découpée en une interface pure dans `core` (`WorkspaceStorage` + `loadWorkspace`, testée en JVM) et une implémentation SAF dans `:app`. Le premier écran n'est qu'une preuve de bout en bout (dossier → notes → noyau → Compose) ; les vraies vues viennent dans les plans suivants.

**Tech Stack:** AGP 9.3.1, Gradle 9.5.1, Kotlin 2.4.20, compileSdk 37 (déjà sur `main`) ; plugin `org.jetbrains.kotlin.plugin.compose` 2.4.20 ; Compose BOM, `activity-compose`, `material3` (versions à fixer à la Task 2 selon la règle des Global Constraints) ; noyau `:core`.

**Spec:** décision « Kotlin + Jetpack Compose » et plan en 28 tâches de la note projet `Personal/Projets/Neo Calendar.md` (tâches 15 et 16) ; `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md` pour le noyau.

## Global Constraints

- Copie de travail : `C:\dev\neo-calendar-compose` (branche `android-compose-app`). Ne JAMAIS toucher à `C:\dev\neo-calendar` ni à `C:\dev\neo-calendar-noyau-b`, où d'autres agents travaillent. Fichiers temporaires préfixés `compose-`.
- **L'app WebView ne change pas** : `MainActivity.java` et le reste du Java intacts, l'icône principale ouvre toujours la WebView, `applicationId`, `targetSdk` 35, signature, permissions, `versionCode`/`versionName` (forme exacte des lignes) inchangés.
- **La nouvelle icône n'existe qu'en debug** : déclarée dans `app/src/debug/AndroidManifest.xml` (fusionné au manifeste principal pour le seul build debug). L'APK release n'en contient aucune trace visible.
- **Lecture seule** : ce plan n'écrit JAMAIS dans le dossier de notes (ni note, ni préférences). Aucune méthode d'écriture dans `WorkspaceStorage`.
- **Versions** : pour chaque bibliothèque AndroidX ajoutée, prendre la plus haute version STABLE dont `META-INF/com/android/build/gradle/aar-metadata.properties` indique `minCompileSdk` ≤ 37 et `minAndroidGradlePluginVersion` ≤ 9.3.1 (lire l'AAR dans le cache Gradle ou sur `dl.google.com/android/maven2`). Consigner chaque version et sa preuve dans le rapport.
- Commandes : PowerShell, dans `C:\dev\neo-calendar-compose\apps\android\native` : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test assembleDebug --console=plain`. `adb` : `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`.
- Commit : message en français ; trailer `Co-Authored-By:` au nom du modèle réel, puis `Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR`.

## Review Focus

- Dossier jamais choisi, ou autorisation SAF révoquée : l'écran natif le dit en une phrase (mêmes messages que la WebView : `MainActivity.tree()`), sans planter.
- Fichier de préférences illisible : message d'erreur, jamais de valeurs par défaut affichées comme si c'étaient les vraies (comportement de `readPreferences` en Java).
- Dossier sans aucun sous-dossier : un seul calendrier « Default » avec les notes de la racine, comme le Java.
- Sous-dossiers d'un calendrier (dossiers des liens ICS) : leurs notes appartiennent au calendrier de tête, dossiers commençant par `.` ignorés.
- Lecture sur le fil principal : interdite (dossier de centaines de notes) ; l'écran montre un état de chargement.

---

### Task 1: `WorkspaceStorage` et `loadWorkspace` dans le noyau

Port de la LOGIQUE de `loadWorkspace`, `collectEvents` et `readPreferences` de `apps/android/native/app/src/main/java/com/ahmed/neocalendar/MainActivity.java` (le Java fait foi : c'est le comportement actuel du téléphone), séparée de SAF.

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceStorage.kt`
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/Workspace.kt`
- Create: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceTest.kt`

**Interfaces:**
- Produces :
```kotlin
package com.ahmed.neocalendar.core.workspace

/** Un dossier de notes, lu par chemins relatifs à sa racine ("" = racine). */
interface WorkspaceStorage {
    /** Enfants directs, triés comme le Java (nom en minuscules, Locale.ROOT). */
    fun list(relativeDir: String): List<Entry>
    /** Texte UTF-8 d'un fichier, ou null s'il n'existe pas. */
    fun readText(relativePath: String): String?
    data class Entry(val name: String, val isDirectory: Boolean)
}

data class WorkspaceCalendar(val relativePath: String, val name: String)
data class WorkspaceEventFile(val relativePath: String, val calendarPath: String, val fileName: String, val contents: String)
data class LoadedWorkspace(val calendars: List<WorkspaceCalendar>, val eventFiles: List<WorkspaceEventFile>, val preferences: kotlinx.serialization.json.JsonObject)

class UnreadablePreferencesException(message: String) : Exception(message)

fun loadWorkspace(storage: WorkspaceStorage): LoadedWorkspace
```
- `preferences` : l'objet JSON brut lu (`{}` si absent ou vide) ; `UnreadablePreferencesException` avec le texte `Le fichier de preferences est illisible: <détail>` s'il est corrompu. Ordre de recherche du fichier : `.neo-calendar/.neo-calendar.json`, puis `.neo-calendar.json`, puis `.neo-calendar-desktop.json` à la racine.

- [ ] **Step 1: Tests JUnit d'abord**, sur un `WorkspaceStorage` en mémoire écrit dans le fichier de test. Un test par règle lue dans le Java, nommé d'après elle : calendriers = dossiers de tête sans point, triés ; notes `.md` seulement (casse de l'extension ignorée) ; sous-dossiers descendus, calendrier = dossier de tête, `relativePath` complet ; dossiers à point ignorés à tous les niveaux ; racine sans dossier → calendrier `""`/`Default` avec les `.md` de la racine ; ordre de recherche des préférences ; fichier vide → `{}` ; JSON corrompu → exception et texte exact.
- [ ] **Step 2: Rouge** : `.\gradlew.bat :core:test --console=plain` échoue (références non résolues).
- [ ] **Step 3: Implémenter** `WorkspaceStorage.kt` et `Workspace.kt`.
- [ ] **Step 4: Vert** : `.\gradlew.bat :core:test --console=plain`.
- [ ] **Step 5: Commit** « Noyau : lecture d'un dossier de notes, séparée du stockage ».

---

### Task 2: Activité Compose, lecture SAF et premier écran

**Files:**
- Modify: `apps/android/native/build.gradle.kts` (plugin compose `apply false`)
- Modify: `apps/android/native/app/build.gradle.kts` (plugin compose, `buildFeatures { compose = true }` si AGP 9.3 l'exige encore, dépendances Compose, `implementation(project(":core"))`)
- Create: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/SafWorkspaceStorage.kt`
- Create: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeActivity.kt`
- Create: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeHome.kt`
- Create: `apps/android/native/app/src/main/AndroidManifest.xml` : déclarer `.nativeapp.NativeActivity`, `android:exported="false"`, SANS filtre d'intention
- Create: `apps/android/native/app/src/debug/AndroidManifest.xml` : un `<activity-alias>` `.nativeapp.NativeLauncher` qui cible `.nativeapp.NativeActivity`, `android:exported="true"`, libellé « Neo Calendar natif », filtre `MAIN` + `LAUNCHER`
- Modify: `apps/android/native/app/src/main/res/values/strings.xml` (libellés de l'écran, en français)

**Interfaces:**
- Consumes : `WorkspaceStorage`, `loadWorkspace` (Task 1) ; `parseStoredEvent`, `calendarIdFromPath` (`core/.../notes/`) ; `parseWorkspacePreferences` (`core/.../preferences/`).
- `SafWorkspaceStorage(context: Context, treeUri: Uri) : WorkspaceStorage` : `DocumentsContract`, même tri et mêmes règles que `MainActivity.list()` / `findChild()` / `readText()`.
- `NativeActivity` : lit `getSharedPreferences("neo_android", MODE_PRIVATE).getString("tree_uri", "")` ; vérifie l'autorisation persistée comme `MainActivity.tree()` (mêmes messages) ; charge dans une coroutine hors du fil principal (`lifecycleScope` + `Dispatchers.IO`) ; affiche `NativeHome`.
- `NativeHome(state)` : Material 3, thème sombre fixe proche de l'app actuelle (fond `#11111B`, celui de `MainActivity`) ; états : chargement, erreur (le message), prêt (nombre de notes lues, liste des calendriers avec leur nombre d'évènements valides, puis les 20 prochaines notes ponctuelles à venir triées par date, titre + date). La date du jour vient de `LocalDate.now()`.

- [ ] **Step 1: Versions** : relever et consigner les versions (règle des Global Constraints).
- [ ] **Step 2: Build** : ajouter plugin, dépendances, fichiers ; `.\gradlew.bat :core:test assembleDebug --console=plain` vert.
- [ ] **Step 3: Release intacte** : `.\gradlew.bat :app:processReleaseManifest --console=plain` puis vérifier que le manifeste release fusionné (`app/build/intermediates/merged_manifests/release/.../AndroidManifest.xml` ou chemin équivalent AGP 9) ne contient PAS `NativeLauncher`, et que `.nativeapp.NativeActivity` y est `exported="false"` sans filtre.
- [ ] **Step 4: Sur l'émulateur** : `powershell -File C:\dev\neo-calendar\scripts\launch-android-emulator.ps1 -Avd Pixel_8 -NoWait`, attendre `adb wait-for-device` puis `sys.boot_completed` = 1 ; `adb install -r app\build\outputs\apk\debug\app-debug.apk` ; `adb shell am start -n com.ahmed.neocalendar/.nativeapp.NativeActivity` ; attendre 5 s ; `adb exec-out screencap -p > $env:TEMP\compose-native.png` ; décrire l'écran dans le rapport (dossier choisi ou message d'absence). Puis `adb shell am start -n com.ahmed.neocalendar/.MainActivity` et une seconde capture `compose-webview.png` : la WebView doit toujours s'ouvrir. Laisser l'émulateur allumé.
- [ ] **Step 5: Commit** « App native : activité Compose qui lit le dossier de notes (debug) ».
