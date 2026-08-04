# Neo Calendar Desktop

Ce dépôt contient désormais l'application autonome Neo Calendar.

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
