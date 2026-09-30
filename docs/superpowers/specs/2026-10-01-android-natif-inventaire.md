# Android natif : ce que l'app fait aujourd'hui (référence des écrans Compose)

Relevé le 2026-09-30 dans le code de l'app WebView (interface du PC en
WebView + coque Java). C'est le comportement à reproduire en Compose ; les
écarts voulus sont dits dans chaque plan. Abréviations : `DC` =
`apps/windows/src/DesktopCalendar.tsx`, `UI` = `src/ui/calendar`, `MA` =
`apps/android/native/app/src/main/java/com/ahmed/neocalendar/MainActivity.java`,
`MC` = `apps/android/src/mobile.css`.

## 1. Vue, navigation, gestes

- **Une seule vue** : grille de `dayCount` jours (1 à 60, défaut 2), gardée
  par appareil (`DC` 495-652). Mois, semaine et liste ne sont pas atteignables
  sur Android.
- **Barre du haut** (`UI/CalendarHeader.tsx` 153-262), de gauche à droite :
  menu (pastille bleue si mise à jour), bouton nom du mois + chevron (ouvre
  la feuille du mois : `MiniCalendar` 7 colonnes, un appui saute à la date),
  « Semaine N » (ISO), loupe (recherche plein écran, résultats groupés par
  jour), pastille du jour (retour à aujourd'hui, état `todayBadgeState`).
- **Bouton +** : 56 px, rayon 18, couleur d'accent, en bas à droite ; ouvre un
  brouillon. Le « + » du widget fait pareil (route `new-event`).
- **Tiroir** (`UI/CalendarSidebar.tsx`, `UI/useDrawerSwipe.ts`) :
  `min(305px, 82vw)`, suit le doigt depuis le bord gauche. Haut : version,
  pastille de mise à jour, engrenage des réglages. Puis : choix du nombre de
  jours (1, 2, 3, « plus » : 4 à 9 et champ 1-60), `MiniCalendar`,
  Calendriers, Tâches.
- **Calendriers** : pastille de couleur (appui = calendrier par défaut, s'il
  est modifiable), nom, « Par défaut », œil afficher/masquer ; glisser pour
  réordonner ; appui = liste des évènements du calendrier
  (`CalendarEventsPanel`) ; menu de ligne : Couleur, Renommer, Modifier le
  lien, Solo, Retirer, Rappel, Liens ICS, Horaires de prière (calendrier
  « Islam » seulement). Bouton + : ajouter un calendrier.
- **Tâches** : groupes « À faire » / « Terminé » avec compteurs, listes
  cherchables, badges « En retard » / « Échéance », case à cocher.
- **Gestes** (`UI/useAxisLock.ts`, `useTimeGridSelection.ts`,
  `useTimeGridDrag.ts`) : défilement verrouillé sur un axe ; glisser à
  l'horizontale = un jour exactement (sauf réglage `freeScroll`) ; pincer =
  hauteur d'heure 32 à 320 px (repos 72) ; appui sur un créneau vide =
  brouillon calé au quart d'heure ; appui long 220 ms = déplacer ; double
  appui = mode redimensionnement (deux poignées) ; appui = fiche.
- **Rechargement** du dossier au retour dans l'app (focus / visibilité),
  400 ms minimum entre deux.

## 2. Fiche d'évènement (feuille de bas d'écran)

- Poignée, trois ancrages (bas, moitié, plein), fermeture par glissé.
- En-tête : Type (Évènement, Tâche, Anniversaire), menu « … » (Dupliquer,
  Supprimer), Fermer.
- Champs dans l'ordre : Titre ; dates et heures de début et de fin, durée,
  effacer la date (= « un jour ») ; Toute la journée ; Répéter (Une fois,
  Chaque jour, semaine, mois, année, Personnalisé : fréquence, jours,
  fin jamais / date / nombre) ; Calendrier (modifiables seulement) ;
  Rappels (horodaté : 0, 5, 10, 30, 60 min + personnalisé ; journée entière :
  -540, 900, 2340, 9540, soit 9 h le jour même ou 9 h 1, 2 ou 6 jours avant) ;
  Lieu (texte + « Ouvrir dans les cartes » : menu des apps installées, Google
  Maps, Citymapper, Moovit, Waze et toute app `geo:`, sauf si le réglage
  `mapsApp` n'est pas `ask` ; `mapsTravelMode` dans l'URL) ; Description
  (éditeur riche avec barre : gras, italique, souligné, listes, case à
  cocher, lien, pièce jointe, annuler/rétablir ; liens et pièces jointes en
  dessous) ; Statut « À faire » / « Terminé ».
- Sous-tâches = lignes à cocher de la description.
- Série : « Cet évènement seulement » / « Tous les évènements » à la
  modification ; à la suppression, celui-ci seulement ou celui-ci et les
  suivants.
- `defaultEventsAsTasks` : les nouveaux sont des tâches.

## 3. Réglages (`apps/windows/src/DesktopSettings.tsx`)

- Fichier partagé `.neo-calendar/.neo-calendar.json` (clés de
  `desktopWorkspacePreferences.ts`, version 5) ; réglages d'appareil
  (`viewType`, `dayCount`, `sidebarVisible`, `allDayCollapsed`) à part.
- Page racine : Premier jour de la semaine, Format 24 h, Défilement libre
  entre les jours, Rappel (dialogue), Mode de trajet, Application de cartes,
  Nouveaux évènements en tâches ; Apparence (thème, mode clair / sombre /
  système, langue) ; Calendriers, Fuseaux horaires ; Dossier de données
  (sélecteur SAF) ; version en pied.

## 4. Liens ICS

- Par calendrier, 5 liens maximum : nom, URL https ou webcal, fréquence
  (5, 15, 30, 60, 180, 360 min), « Actualiser », « Supprimer », adresse du
  lieu.
- Synchro : à chaque rechargement du dossier, minuterie de 60 s si des liens
  existent, et à la demande ; un lien est dû s'il n'a jamais été synchronisé,
  si c'est forcé, ou si sa fréquence est écoulée ; 2 liens en parallèle.
  Écrit les notes du lien dans son sous-dossier.

## 5. Rappels et widget

- Rappels : `buildReminders` sur les évènements visibles des 30 prochains
  jours, sans les « un jour » ni les calendriers masqués ; délais : ceux de
  l'évènement, sinon ceux du calendrier, sinon ceux de l'app (`[]` = silence) ;
  charge `{id, key, atMs, title, body, details}` écrite par
  `ReminderScheduler.write` (SharedPreferences `neo-calendar-reminders`,
  alarme exacte sur le plus proche, réarmée au démarrage et à la mise à jour ;
  canal `neo-calendar-reminders` ; un appui ouvre l'évènement,
  `EXTRA_EVENT_ID`).
- Widget : `buildWidgetPayload` (`apps/windows/src/platform/androidWidget.ts`)
  → `{updatedAt, rows[{id, startMs, endMs, dayKey, weekday, day, title, time,
  allDay, color}], weekdays[7], emptyLabel, theme{surface, text, muted,
  accent}}`, au plus 60 lignes sur 30 jours ; écrit par `WidgetData.write`
  puis `NeoCalendarWidget.refreshAll` ; « + » = route `new-event`.

## 6. Identité visuelle

- Thème par défaut Catppuccin Mocha : accent `#658ff2`, surface `#1e1e2e`,
  texte `#c6d0f5`, fond `#11111b` ; mode sombre par défaut ; 15 thèmes au
  total (`apps/windows/src/themes/registry.ts`).
- Police Inter (Geist en réserve).
- Hauteur d'heure 72 px ; cible tactile 48 px ; barre du haut 64 px.
- Bloc d'évènement : bande d'accent de 4 px à gauche, rayon 4, ombre
  `0 5px 14px rgba(0,0,0,.18)`, titre et heure 11 px.
- Fond d'écran : images portrait téléchargées dans `.neo-calendar/wallpapers/`
  (`WallpaperStore.java`), effets luminosité 0,7, flou 5, opacité 0,4.

## 7. Prière

- Ligne de la prochaine prière sur un calendrier « Islam » avec une mosquée
  choisie (`UI/prayerTimetables`), couleur `prayerColors`, Jumu'a le
  vendredi ; mise à jour chaque minute. Pas de rappel de prière sur le
  téléphone aujourd'hui.
