# Tâche 9 : la bascule

## Fait
- Manifeste : `NativeActivity` est `MAIN`/`LAUNCHER` et porte le lien profond `neo-calendar://event` (exportée) ; `MainActivity` n'a plus aucun filtre (non exportée, ouverte par intent explicite). Alias debug et `src/debug/AndroidManifest.xml` supprimés. `NativeActivity` reprend les `configChanges` de `MainActivity` (une rotation ne recrée plus l'activité, donc ne coupe pas un téléchargement de mise à jour).
- Cibles d'intent : widget (ligne, « + »), notifications de rappel et notification « Réessayer » de la mise à jour visent `NativeActivity`. `MainActivity.EXTRA_UPDATE_RETRY` passe en public.
- Mise à jour intégrée : `AppUpdater` devient public (constructeur et méthodes utilisées), plus `checkNow(callback)` (recherche manuelle sans repos de 2 min ; en debug répond « debug », comme `check` qui ne fait rien en debug). `NativeUpdates.kt` l'enveloppe en états Compose (version prête, pourcentage, résultat). Câblage : recherche au lancement une fois la grille lue, `resumePendingInstall` + `checkOnResume` à chaque reprise, « Réessayer » consommé en `onCreate`/`onNewIntent`.
- UI : pastille bleue sur le bouton menu, pastille « Mettre à jour » / pourcentage dans le tiroir (ligne à part sous l'en-tête, sinon le titre passe sur deux lignes), groupe « Application » des Réglages : « Installer la version X » (si prête), « Rechercher les mises à jour » (état à droite), « Ancienne interface (WebView) ».
- Splash système tenu jusqu'à la lecture du dossier (1,5 s au plus). Bords à bords et Retour déjà en place (tâches précédentes), vérifiés.

## Contrôles
- `:core:test assembleDebug` vert. `processReleaseManifest` : un seul `LAUNCHER` (NativeActivity), `MainActivity` sans filtre. `assembleRelease` construit avec clé jetable ; clé et APK release supprimés.
- Émulateur (debug installé par-dessus, `adb install -r`) : icône principale = `NativeActivity` (`resolve-activity`), grille, tiroir, Réglages, liste Etudes, fiche, Ancienne interface (« Asset introuvable : index.html », attendu : pas d'assets web dans cette copie), Retour depuis la WebView = app native, Retour ferme Réglages puis tiroir, fiche, liste, recherche puis quitte, appui sur une ligne du widget = fiche « Essai_geste », « + » du widget = brouillon. Rien n'a été écrit (brouillon fermé).
- Pastille et ligne « Installer » vues avec une version factice « 9.9.9 » codée temporairement (retirée avant le commit, `grep` vide) ; captures 16 (avant le déplacement de la pastille sur sa ligne) et 17 non conservée.

## Écarts / doutes
- La recherche de mise à jour ne peut pas être éprouvée en debug (`BuildConfig.DEBUG` la coupe, comme avant) : le téléchargement réel, la pastille en vrai et l'installation sont à confirmer sur le téléphone avec une release signée. Premier test à faire à la prochaine livraison.
- Appui réel sur une notification de rappel non rejoué ; même route que le widget (extra `EXTRA_EVENT_ID`).
- Le lien profond `neo-calendar://event` ouvre l'app sans parser l'URL (comme avant).
- L'ancienne interface partage la tâche : Retour y revient à l'app native.
