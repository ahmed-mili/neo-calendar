# Résultats de validation Android

Date: 2026-08-05

## Exécuté

- Archive source ouverte et dépôt inspecté : OK.
- Architecture React/TypeScript/Tauri/Rust cartographiée : OK.
- Vérification syntaxique JSON de `package.json` et `apps/android/package.json` : OK.
- Vérification de présence du manifeste, de l'activité Android, des adaptateurs TypeScript et du script de synchronisation : OK.
- Vérification statique des commandes natives requises (workspace, préférences, événements, calendriers, pièces jointes, ICS) : présentes.
- Contrôle de l'APK dans le répertoire de sortie : ABSENT.

## Tenté mais bloqué par l'environnement

- Installation npm : échec. Le miroir npm configuré répond 404 pour `vite@8.2.0`; le registre public est inaccessible par DNS (`EAI_AGAIN`).
- Compilation TypeScript et build Vite Android : non exécutables sans dépendances.
- Build Windows : non exécutable sans dépendances.
- Compilation Android/Gradle : non exécutable, car Android SDK et Gradle ne sont pas installés dans l'environnement et les téléchargements externes sont bloqués.
- Compilation Rust : non exécutée, Rust/Cargo absents et installation externe bloquée.

## Non testable sans build/appareil

- Démarrage réel de l'application.
- Sélection SAF sur appareil et persistance après redémarrage.
- Lecture/création/modification/suppression réelle des fichiers Markdown.
- Ouverture et édition du panneau événement.
- Rotation portrait/paysage et bouton retour sur appareil.
- Installation ADB.
- Régression Windows complète.

Aucun APK n'est annoncé comme généré : aucun fichier APK réel n'a été produit dans cet environnement.
