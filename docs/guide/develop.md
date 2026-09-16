# Développer

## Structure

- `apps/windows/` : application React/Vite et backend Tauri/Rust.
- `apps/android/` : coque native Android et son pont vers la WebView.
- `src/ui/calendar/` : interface calendrier partagée.
- `src/core/` : moteur des événements.
- `src/calendars/` : formats et parseurs de calendriers.
- `src/types/` : types partagés.

Le dépôt historique `obsidian-neo-calendar` reste inchangé. Cette première
migration effectue la séparation physique sans réécrire immédiatement tous
les composants partagés qui utilisent encore le shim de compatibilité
Obsidian.

## Commandes

```powershell
cd neo-calendar
npm install        # sans drapeau : le conflit fast-check est réglé par overrides
npm test           # la suite complète
npm run dev
npm run tauri      # installateur PC, copié dans Downloads
.\BUILD_ANDROID.ps1  # APK signé avec le coffre local hors dépôt
```

Le chemin du SDK Android (`local.properties`) n'est plus versionné : Android
Studio l'écrit, `BUILD_ANDROID.ps1` le rédige s'il manque, et le serveur de
build se contente d'`ANDROID_HOME`.

Le build de dev PC exige la configuration de l'updater, absente du dépôt :
`node scripts/configure-tauri-updater.mjs` d'abord, et
`git checkout apps/windows/src-tauri/tauri.conf.json` après, ce fichier étant
suivi.

L'émulateur Android se lance par `scripts/launch-android-emulator.ps1`, ou par
le raccourci du bureau posé par `scripts/install-emulator-shortcut.ps1`.

## Ajouter un fond d'écran

```powershell
# 1. déposer le JPEG en pleine résolution
copy ma-photo.jpg apps\windows\public\themes\neo-wallpapers\montagne-bleue.jpg
# 2. fabriquer la vignette, l'empreinte et l'entrée du manifeste
npm run wallpapers
# 3. coller dans apps/windows/src/themes/wallpapers.ts le bloc que la commande
#    a imprimé (elle ne devine ni le libellé ni la description), puis committer
```

L'image n'entre pas dans l'APK : elle est lue sur `raw.githubusercontent.com`
et n'est donc disponible qu'une fois le commit poussé — mais elle l'est
aussitôt, sans attendre une version. Seules la vignette (23 Ko) et le
manifeste voyagent avec l'application, ce qui laisse le sélecteur s'ouvrir
hors ligne ; la pleine résolution est téléchargée quand quelqu'un choisit ce
fond, puis gardée dans `.neo-calendar/wallpapers/` du dossier de données —
où elle survit aux mises à jour et à une désinstallation.

`npm run wallpapers` est idempotent : il ne refabrique une vignette que si
elle manque ou si l'original a changé.
