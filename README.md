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
  source-là, une seule fois. L'APK est signé avec la clé de débogage, donc une
  version installée par-dessus une autre garde ses données, mais il faudra
  désinstaller pour passer un jour à une version signée autrement.

Chaque étiquette `vX.Y.Z` poussée sur le dépôt déclenche la construction des
deux paquets et leur publication (`.github/workflows/release.yml`).

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
npm run dev
```

```powershell
cd C:\dev\neo-calendar
npm run tauri
```

L'installateur reste copié automatiquement dans `Downloads` par le script
Tauri déjà présent dans `apps/windows/scripts/`.
