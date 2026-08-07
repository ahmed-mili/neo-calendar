# Neo Calendar Android

Application Android native WebView partageant l'interface React et le moteur calendrier de `src/` et `apps/windows/src/`.

## Architecture

- `src/` : moteur calendrier, types, récurrences et composants React partagés.
- `apps/windows/` : application Windows Tauri/Rust existante, inchangée.
- `apps/android/src/platform/` : adaptateurs TypeScript remplaçant les API Tauri côté Android.
- `apps/android/native/` : hôte Android et adaptateur Storage Access Framework.

Le dossier de données Android est une URI SAF persistante. Aucun chemin Windows n'est simulé.

## Prérequis

- Node.js 20+
- JDK 17
- Android SDK Platform 35 et Build Tools 35
- Gradle 8.9+ ou Android Studio récent

## Build

```powershell
npm install
npm --prefix apps/windows install
npm --prefix apps/android install
npm --prefix apps/android run build
npm --prefix apps/android run android:sync
cd apps/android/native
gradle assembleDebug
Copy-Item app/build/outputs/apk/debug/app-debug.apk ../../../../neo-calendar-android.apk -Force
```

APK debug signé automatiquement par la clé debug Android. Min SDK 26 (Android 8.0), cible SDK 35, APK universel.
