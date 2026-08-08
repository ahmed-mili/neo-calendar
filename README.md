# Neo Calendar Desktop

Ce dépôt contient désormais l'application autonome Neo Calendar.

## Installer

Les deux paquets sont publiés sur la page
[Releases](https://github.com/ahmed-mili/neo-calendar/releases) du dépôt :
prenez la dernière version, en haut.

- **PC** : `Neo Calendar Setup <version>.exe`. Windows affiche un avertissement
  SmartScreen — l'installateur n'est pas signé — : « Informations
  complémentaires », puis « Exécuter quand même ».
- **Android** : `neo-calendar-android-<version>.apk`. Téléchargez-le depuis le
  téléphone ; Android demande d'autoriser l'installation depuis cette
  source-là, une seule fois.

### Une désinstallation à faire une fois, en venant d'une version antérieure à 1.0.3

Android n'accepte une mise à jour que si elle porte la même signature que la
version déjà installée. Jusqu'à la 1.0.2, chaque machine signait avec sa propre
clé de débogage — celle du PC, puis celle, jetable, du serveur de build — et le
téléphone refusait : « le package est en conflit avec un package déjà présent ».

Depuis la 1.0.3, une clé fixe voyage avec le dépôt et signe tous les paquets,
d'où qu'ils viennent. Pour y passer, une seule fois : **désinstallez
l'application, puis installez le nouvel APK**. Les versions suivantes
s'installeront par-dessus, sans rien perdre.

## Publier une version

```powershell
npm run version:set 1.0.4        # monte les six fichiers, versionCode compris
git commit -am "Version 1.0.4"
git tag v1.0.4
git push origin main v1.0.4
```

L'étiquette déclenche la construction des deux paquets et leur publication
(`.github/workflows/release.yml`). Une branche `release/vX.Y.Z` fait la même
chose, pour le cas où l'on ne peut pousser que des branches.

Rien d'autre à toucher à la main : `version:set` s'occupe des trois
`package.json` et de leurs lockfiles, de `tauri.conf.json`, de `Cargo.toml`, du
`Cargo.lock`, du `versionName` Android et du `versionCode` — ce dernier
strictement croissant, faute de quoi le téléphone refuse la mise à jour.

## Structure

- `apps/windows/` : application React/Vite et backend Tauri/Rust.
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
cd C:\dev\neo-calendar
npm install        # sans drapeau : le conflit fast-check est réglé par overrides
npm test           # 500+ tests, la suite complète
npm run dev
npm run tauri      # installateur PC, copié dans Downloads
.\BUILD_ANDROID.ps1  # APK signé, à la racine du dépôt
```

Le chemin du SDK Android (`local.properties`) n'est plus versionné : Android
Studio l'écrit, `BUILD_ANDROID.ps1` le rédige s'il manque, et le serveur de
build se contente d'`ANDROID_HOME`.
