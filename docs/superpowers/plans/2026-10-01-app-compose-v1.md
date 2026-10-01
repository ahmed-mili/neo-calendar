# App Compose : première version native complète

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de l'activité Compose (`nativeapp/NativeActivity`) une app d'agenda complète qui remplace la WebView : grille de N jours, tiroir, listes, fiche d'évènement éditable, création / déplacement / suppression, liens ICS, réglages, rappels et widget natifs, puis bascule de l'icône principale vers elle.

**Architecture:** Tout le calcul passe par le noyau `:core` (notes, préférences, récurrence, grille, rappels, ICS), déjà porté et gardé par `conformance/`. `:app` ne contient que l'interface Compose, l'accès SAF (`SafWorkspaceStorage`) et le branchement aux services natifs Java existants (`ReminderScheduler`, `WidgetData`, `NeoCalendarWidget`, `AppUpdater`), qui restent en Java. Le comportement de référence est l'app actuelle, décrite dans `docs/superpowers/specs/2026-10-01-android-natif-inventaire.md` (à lire en entier avant chaque tâche). Un seul état d'écran : `NativeViewModel` (`androidx.lifecycle.ViewModel` + `StateFlow`), rechargé à l'ouverture et au retour dans l'app.

**Tech Stack:** Kotlin 2.4.20, AGP 9.3.1, compileSdk 37, targetSdk 35, Compose BOM 2026.09.00, Material 3, `activity-compose` 1.13.0, `lifecycle-runtime-ktx` 2.11.0 (déjà dans `:app`) ; `lifecycle-viewmodel-compose` (version selon la règle des Global Constraints) ; noyau `:core`.

**Spec:** note projet `Personal/Projets/Neo Calendar.md` (tâches 13 et 17 à 25) ; `docs/superpowers/specs/2026-10-01-android-natif-inventaire.md` ; `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md`.

## Global Constraints

- Copie de travail : `C:\dev\neo-calendar-compose` (branche `android-compose-app`). Ne JAMAIS toucher aux autres copies (`C:\dev\neo-calendar`, `C:\dev\neo-calendar-noyau-b`). Fichiers temporaires préfixés `compose-`.
- **Données d'Ahmed** : le dossier de notes est réel (Syncthing le synchronise avec le PC). Toute écriture passe par le noyau (`serializeEventMarkdown`, format figé par le corpus) : jamais de texte de note fabriqué à la main. Sur l'émulateur, ne tester l'écriture que dans un calendrier d'essai créé pour l'occasion (`Essai Compose`), jamais dans « Etudes » ni « Islam ».
- **Rien ne change pour la WebView** jusqu'à la Task 9 : `MainActivity.java` et les services Java gardent leur comportement ; ils peuvent recevoir des méthodes statiques d'entrée, pas de changement de logique.
- **Parité** : chaque écran reproduit l'inventaire (textes en français, mêmes valeurs, même ordre). Un écart voulu est écrit dans le rapport de tâche et dans la section « Écarts de la v1 » en bas de ce plan (le contrôleur la complète).
- **Visuel** : thème sombre Catppuccin Mocha de l'inventaire §6, police système (Inter en ressource si le poids reste < 1 Mo), bloc d'évènement comme §6, hauteur d'heure 72 dp au repos. Référence visuelle : capture de la WebView sur l'émulateur, à prendre dans une copie qui a les assets web (`C:\dev\neo-calendar`, `npm --prefix apps/android run build` + `android:sync`) si besoin ; sinon l'inventaire.
- **Performance** : rien de lourd sur le fil principal ; lecture du dossier en `Dispatchers.IO` ; listes en `LazyColumn` ; calcul des occurrences mémorisé par fenêtre visible.
- **Versions** : toute bibliothèque AndroidX ajoutée = la plus haute stable dont `aar-metadata.properties` dit `minCompileSdk` ≤ 37 et `minAndroidGradlePluginVersion` ≤ 9.3.1 ; consigner la preuve.
- **Tests** : la logique pure nouvelle va dans `:core` avec des tests JUnit (et au corpus si elle a un équivalent TypeScript) ; l'interface se vérifie sur l'émulateur Pixel_8 (`adb`, captures `adb exec-out screencap -p`, relues avec l'outil Read, décrites dans le rapport). `.\gradlew.bat :core:test assembleDebug` vert à chaque commit.
- Commandes : PowerShell dans `C:\dev\neo-calendar-compose\apps\android\native`, `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`. `adb` = `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`. Lancer l'écran natif : `adb shell am start -n com.ahmed.neocalendar/.nativeapp.NativeLauncher` (alias debug).
- Commit : français ; trailer `Co-Authored-By:` au nom du modèle réel, puis `Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR`.

## Review Focus

- Écrire une note : même texte, octet pour octet, que la WebView pour le même évènement (le noyau le garantit ; vérifier que `:app` ne le contourne pas).
- Évènement récurrent modifié ou supprimé : dialogue de portée, et « celui-ci seulement » n'altère pas la série.
- Dossier retiré, autorisation révoquée, fichier de préférences corrompu : message, pas de crash, pas d'écrasement des préférences par des défauts.
- Changement d'heure et évènement qui traverse minuit sur la grille.
- Lien ICS injoignable : erreur affichée sur le lien, notes existantes conservées.

---

### Task 1 (note 17) : grille de N jours, barre du haut, tiroir

**Files:** `app/src/main/java/com/ahmed/neocalendar/nativeapp/` : `NativeViewModel.kt`, `ui/Theme.kt`, `ui/TopBar.kt`, `ui/TimeGrid.kt`, `ui/AllDayBand.kt`, `ui/MonthSheet.kt`, `ui/Drawer.kt`, `ui/MiniCalendar.kt` ; `NativeActivity.kt` (remplace `NativeHome` par l'écran principal ; `NativeHome.kt` supprimé).

- Occurrences : `neoEventToDisplayEvents` (`core/.../recurrence`) sur la fenêtre visible ± quelques jours ; chevauchements `computeOverlapGroups`, bandes all-day `packAllDayLanes` / `visibleLaneCount` / `hiddenBarCountByDay` (`core/.../layout`), semaine `getISOWeek`, pastille `todayBadgeState`.
- Grille : colonnes de `dayCount` jours, heures 0-24, hauteur d'heure 72 dp au repos, pincer 32-320 ; glisser horizontal = un jour exactement (`freeScroll` des préférences : défilement libre) ; ligne de l'heure actuelle ; en-têtes de jours ; bande all-day repliable.
- Barre du haut et feuille du mois, bouton +, tiroir (choix du nombre de jours 1/2/3 + 4-9 + champ 1-60, gardé par appareil dans des `SharedPreferences` à part `neo_native`, mini-calendrier, liste des calendriers avec couleur et œil — l'œil n'écrit rien encore, il masque pour la session ; l'écriture vient en Task 5), comme l'inventaire §1.
- Appui sur un évènement : ouvre une feuille de lecture minimale (titre, horaire, calendrier) ; la vraie fiche vient en Task 3.
- [ ] Construire, installer, capturer : grille 2 jours, 1 jour, 3 jours ; feuille du mois ; tiroir ouvert ; pincement (capture avant / après) ; défilement d'un jour. Commit « App native : grille, barre du haut et tiroir ».

### Task 2 (note 18) : listes et recherche

**Files:** `ui/CalendarEventsList.kt`, `ui/TasksLists.kt`, `ui/SearchScreen.kt`, modifications du tiroir.

- Liste des évènements d'un calendrier (appui sur sa ligne), listes « À faire » / « Terminé » (tâches : `isTask`, `getTaskStatus` du noyau), recherche plein écran groupée par jour, comme l'inventaire §1. Appui sur un résultat : même feuille que la grille.
- [ ] Captures de chaque liste et d'une recherche. Commit « App native : listes et recherche ».

### Task 3 (note 19) : fiche d'évènement, lecture et édition

**Files:** `core/.../workspace/WorkspaceWriter.kt` (+ tests), `core/.../workspace/WorkspaceStorage.kt` (écriture ajoutée à part : interface `WritableWorkspaceStorage`), `SafWorkspaceStorage.kt`, `ui/EventSheet.kt`, `ui/fields/*.kt`.

- Écriture : port de `writeEvent`, `validName`, `uniqueName`, `findPath` (refus de `..`) de `MainActivity.java` dans le noyau, sur `WritableWorkspaceStorage` (`writeText`, `createFile`, `rename`, `delete`, `createDirectory`), tests JUnit d'après le Java (le Java fait foi). `SafWorkspaceStorage` l'implémente avec `DocumentsContract` comme le Java.
- Fiche en feuille de bas d'écran (poignée, trois ancrages) avec les champs de l'inventaire §2 : titre, dates / heures / durée / « un jour », toute la journée, répéter (préréglages et personnalisé via `recurrence.ts` porté si absent du noyau : le porter dans `core/.../recurrence/RecurrenceForm.kt` avec cas au corpus), calendrier, rappels, lieu + menu des cartes (liste des apps installées : même logique que `installed_maps_apps` du Java, déplacée dans une méthode statique appelable), description en texte Markdown éditable avec lignes à cocher rendues comme cases, liens et pièces jointes listés et ouvrables, statut. Enregistrement : `serializeEventMarkdown(event, previousContents)` puis écriture ; dialogue de portée pour une série (`recurringEdit*` à porter dans le noyau avec cas au corpus).
- Écart v1 accepté : pas de barre de mise en forme riche (gras, italique…) ; le texte Markdown reste intact.
- [ ] Sur l'émulateur, dans le calendrier `Essai Compose` : ouvrir, modifier le titre et l'heure, enregistrer, relire le fichier (`adb shell` + `run-as` impossible sur SAF : relire par l'app, et comparer au texte que produit la WebView pour le même évènement via le corpus). Commit « App native : fiche d'évènement éditable ».

### Task 4 (note 20) : créer, déplacer, supprimer

**Files:** `ui/TimeGrid.kt`, `ui/EventSheet.kt`, `core/.../workspace/WorkspaceWriter.kt`.

- Créer : bouton + et appui sur un créneau vide (brouillon calé au quart d'heure, `defaultEventsAsTasks`) ; nom de fichier `filenameForEvent` ; calendrier par défaut des préférences.
- Déplacer : appui long 220 ms puis glisser (jour et heure, pas de 15 min) ; redimensionner : double appui puis poignées.
- Supprimer (menu « … ») avec portée pour une série (`withOccurrenceRemoved` / `withFollowingRemoved`, noyau), dupliquer ; case à cocher d'une tâche sur le bloc.
- [ ] Émulateur, calendrier `Essai Compose` : créer, déplacer, redimensionner, cocher, dupliquer, supprimer ; captures. Commit « App native : créer, déplacer, supprimer ».

### Task 5 (notes 13 et 22) : préférences écrites, réglages, calendriers

**Files:** `ui/Settings*.kt`, `ui/Drawer.kt`.

- Écriture de `.neo-calendar/.neo-calendar.json` : **déjà faite dans le noyau** (tâche 13 de la note, `core/.../preferences/PreferencesWriter.kt` : `sharedPreferencesToWrite` puis `preferencesFileText`, format du téléphone figé au corpus `preferences.write`) ; l'appeler, ne rien réécrire. Écrire à l'emplacement et avec la même suppression des anciens noms que `savePreferences` du Java ; ne jamais écrire si la lecture a échoué (fichier corrompu).
- Tiroir : œil (masquer), couleur, calendrier par défaut, ordre, ajout / renommage / suppression de calendrier (dossier), comme l'inventaire §1.
- Réglages : page racine de l'inventaire §3 (sans les réglages PC) ; dossier de données (sélecteur SAF `ACTION_OPEN_DOCUMENT_TREE`, même clé `tree_uri`) ; rappel général et par calendrier.
- [ ] Émulateur : changer « Premier jour » et « Format 24 h », vérifier la grille ; masquer un calendrier ; captures. Commit « App native : réglages et calendriers ».

### Task 6 (note 21) : liens ICS et leur synchro

**Files:** `nativeapp/IcsSync.kt`, `ui/IcsLinksDialog.kt`.

- Synchro : au chargement, minuterie 60 s si des liens existent, bouton « Actualiser » ; téléchargement `HttpURLConnection` (délais 15 s / 20 s comme le Java) hors fil principal ; `parseIcsSnapshot` + `planIcsNoteSync` (noyau) ; écriture des notes du lien dans son sous-dossier (`ensure_desktop_ics_folder` : `SafeNames` du noyau) ; état par lien (dernière synchro, erreur).
- Dialogue des liens par calendrier (5 max, nom, URL, fréquence, actualiser, supprimer, adresse), comme l'inventaire §4.
- [ ] Émulateur : ajouter un lien ICS public dans `Essai Compose` (ex. jours fériés français d'un fournisseur public), synchroniser, voir les évènements, supprimer le lien. Commit « App native : liens ICS ».

### Task 7 (note 23) : rappels natifs

**Files:** `nativeapp/NativeReminders.kt`.

- À chaque chargement ou modification : `buildReminders` (noyau) sur 30 jours, sans « un jour » ni calendriers masqués, délais évènement → calendrier → app ; charge JSON identique à celle de la WebView (champs `id, key, atMs, title, body, details`) passée à `ReminderScheduler.write(context, json)` (Java inchangé). Permission `POST_NOTIFICATIONS` demandée une fois comme `MainActivity`.
- Appui sur une notification : `NativeActivity` lit `EXTRA_EVENT_ID` et ouvre la fiche.
- [ ] Émulateur : évènement d'essai dans 3 min avec rappel 1 min ; notification vue (capture) ; appui ouvre la fiche. Commit « App native : rappels ».

### Task 8 (note 24) : widget natif

**Files:** `core/.../widget/WidgetPayload.kt` (port de `apps/windows/src/platform/androidWidget.ts`, cas au corpus `conformance/widget/`), `nativeapp/NativeWidget.kt`.

- Charge identique à celle de la WebView, écrite par `WidgetData.write` puis `NeoCalendarWidget.refreshAll` (Java inchangé) à chaque chargement ou modification ; thème = couleurs Catppuccin de l'inventaire.
- Route `new-event` du « + » du widget et `EXTRA_EVENT_ID` d'une ligne : ouvrent le brouillon ou la fiche dans `NativeActivity`.
- **Lieu** (demande d'Ahmed, 2026-10-01) : chaque ligne du widget affiche le lieu de l'évènement sous son titre, sur une ligne, en couleur atténuée, rien s'il n'y en a pas. Champ `location` ajouté aux lignes de la charge (le port du noyau garde les cas au corpus pour les champs existants ; le lieu est un ajout du natif, testé en JUnit) ; `WidgetService.java` et sa mise en page l'affichent.
- [ ] Émulateur : ajouter le widget à l'écran d'accueil, capture (un évènement avec lieu, un sans) ; appui sur une ligne et sur « + ». Commit « App native : widget ».

### Task 9 (note 25) : bascule

**Files:** `AndroidManifest.xml` (main et debug), `NativeActivity.kt`, `NeoCalendarWidget.java` / `ReminderScheduler.java` (cible de l'intent seulement).

- `NativeActivity` devient l'activité `MAIN` / `LAUNCHER` et reçoit les liens profonds, les routes du widget et des notifications ; `MainActivity` perd son filtre `LAUNCHER` mais reste dans l'APK, ouvrable depuis Réglages → « Ancienne interface (WebView) » tant que la v1 n'a pas été éprouvée sur le téléphone. L'alias debug est retiré. `AppUpdater` (mise à jour intégrée) branché dans les Réglages natifs comme dans l'app actuelle (« Rechercher les mises à jour », pastille).
- Retour arrière : ferme feuille / tiroir / recherche avant de quitter.
- [ ] APK debug installé par-dessus : l'icône principale ouvre l'app native ; parcours complet de l'inventaire sur l'émulateur (grille, tiroir, listes, fiche, créer / déplacer / supprimer dans `Essai Compose`, réglages, lien ICS, rappel, widget, ancienne interface) avec captures ; manifeste release vérifié. Commit « App native : l'icône principale ouvre l'app Compose ».

---

### Task 10 (note 29) : widget, choisir les calendriers affichés

**Files:** `app/src/main/res/xml/` (fournisseur du widget), `nativeapp/WidgetConfigActivity.kt`, `WidgetService.java`, `NeoCalendarWidget.java`, `core/.../widget/WidgetPayload.kt`.

- Le plus simple possible : à la pose du widget, une activité de configuration (`android:configure`) montre la liste des calendriers à cocher (tous cochés par défaut) et un bouton « Ajouter » ; `widgetFeatures="reconfigurable"` (Android 12+) pour rouvrir la même liste par appui long → « Reconfigurer ». Un choix PAR widget (clé = `appWidgetId`, `SharedPreferences` `neo-calendar-widget-calendars`), supprimé quand le widget est retiré (`onDeleted`).
- Les lignes de la charge portent l'identifiant du calendrier (`calendarId`) ; `WidgetService` filtre à l'affichage selon le choix du widget.
- [ ] Émulateur : poser deux widgets, l'un avec « Etudes » seul, l'autre avec tout ; captures ; reconfigurer le premier. Commit « Widget : choix des calendriers affichés ».

---

## Écarts de la v1

(tenu par le contrôleur au fil des tâches)

- **Grille (T1)** : le pincement à deux doigts n'a pas pu être simulé sur l'émulateur (adb sans multitouch) ; le zoom lui-même est vérifié. Le glissé depuis le bord gauche ouvre le retour système de l'émulateur ; le bouton menu ouvre le tiroir.
- **Listes (T2)** : la liste d'un calendrier n'a que la recherche (pas les filtres statut / période / liens ICS, ni les totaux, ni le menu « … ») ; la recherche porte sur le titre seul, sans casse ni accents ; les évènements sans date vont dans un groupe « Sans date » en fin de liste (le PC les range sous aujourd'hui).
- **Langue** : français fixe (`AppLocale.current`), pas encore de réglage de langue.
- **Fiche (T3)** : enregistrement par un bouton « Enregistrer » (la WebView enregistrait au fil de l'eau) ; pas de barre de mise en forme riche ; pas d'ajout de lien ni de pièce jointe depuis la fiche (affichés et ouvrables seulement) ; pas de flèches d'occurrence précédente / suivante ; échéance non éditable ; la fiche se ferme à la rotation de l'écran.
- **Créer / déplacer (T4)** : pas d'aperçu du brouillon sur la grille ; pas de glisser depuis ou vers la bande « journée entière » ; un jour de série déplacé garde toute la fiche de la série (la WebView n'en recopiait que le titre et la description).
- **Réglages (T5)** : pas encore d'Apparence (thème, mode, fond d'écran), de fuseaux horaires ni de vue initiale ; menu de ligne sans Solo ni Horaires de prière ; préférences écrites clé par clé (la WebView réécrivait tout le fichier) ; messages d'erreur de dossier repris du Java.
- **Liens ICS (T6)** : pas de « Afficher seulement ce lien », pas de lien à la création d'un calendrier, pas de fréquence par défaut dans les Réglages ; la minuterie ne tourne que quand l'app est à l'écran ; une note dont le nom est déjà pris dans le dossier du lien reçoit « (1) » au lieu d'écraser (la WebView écrasait).
- **Rappels (T7)** : recalculés à chaque lecture du dossier, pas toutes les heures (le texte « Dans 1 h » peut vieillir jusqu'à la réouverture ; les heures d'alarme sont justes).
- **Widget (T8)** : lieu affiché sous l'heure ; fenêtre = le mois à venir de tous les calendriers visibles.
