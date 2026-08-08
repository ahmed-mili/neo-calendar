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

Le plus court, depuis la racine du dépôt : `.\BUILD_ANDROID.ps1`. À la main :

```powershell
npm install
npm --prefix apps/windows install
npm --prefix apps/android install
npm --prefix apps/android run build
npm --prefix apps/android run android:sync
cd apps/android/native
gradle assembleRelease
```

`assembleRelease` et non `assembleDebug` : la variante de release est signée par
`app/neo-calendar.jks`, la clé fixe du dépôt. C'est elle qui permet à une mise à
jour de s'installer par-dessus la version précédente, quelle que soit la machine
qui l'a construite — la clé de débogage, elle, diffère d'un poste à l'autre et
fait échouer l'installation sur « le package est en conflit avec un package déjà
présent ».

Le mot de passe de la clé est en clair dans `app/build.gradle.kts`, et c'est
assumé : le fichier est juste à côté dans un dépôt privé, le cacher ne
protégerait rien. Une publication sur le Play Store demanderait une clé gardée
ailleurs.

Min SDK 26 (Android 8.0), cible SDK 35, APK universel.
