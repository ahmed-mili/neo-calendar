# Migration depuis le plugin Obsidian

## Fait pendant cette étape

- Création d'un dépôt indépendant dans `C:\dev\neo-calendar`.
- Copie de l'application Windows et du backend Tauri.
- Copie du moteur et des composants calendrier nécessaires.
- Exclusion des fichiers de distribution du plugin Obsidian.
- Conservation du dépôt original sans modification.
- Installation indépendante des dépendances.
- Vérification du build TypeScript/Vite.

## Étape suivante recommandée

Supprimer progressivement la couche de compatibilité Obsidian du nouveau
dépôt :

1. remplacer les imports `obsidian` restants par des interfaces Desktop ;
2. déplacer le code générique vers `src/calendar-core` ;
3. supprimer `obsidian`, `obsidian-daily-notes-interface` et les adaptateurs
   devenus inutiles des dépendances ;
4. archiver ensuite le dépôt du plugin en lecture seule.
