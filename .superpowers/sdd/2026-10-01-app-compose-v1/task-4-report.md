# Tâche 4 : créer, déplacer, supprimer

Statut : DONE_WITH_CONCERNS (écarts et doutes plus bas).

## Fait
Deux commits : noyau + corpus, puis interface.

Noyau (`:core`)
- `grid/EventMove.kt` : pas de 15 min (`snappedMinutes`), jour visé (`dayShiftFromAnchor`), `movedSlot`, `resizedSlot` (bord jamais à moins de 15 min de l'autre), créneau d'un appui (`positionToDateTime`, `draftSlotAt` : début calé au quart d'heure, 30 min), écriture d'un déplacement/redimensionnement (`rescheduledRecord`, `resizedRecord`, `seriesOccurrenceRecord`).
- `EventWriter` : `reschedule` (ponctuel réécrit ; jour de série = copie ponctuelle écrite d'abord puis `skipDates`, comme « cet évènement seulement »), `setTaskDone` (case d'une tâche ; série : jour coché, `setOccurrenceStatus`). `delete` refuse une note absente ou REMPLACÉE par une autre (`NoteMovedException`, même message que la tâche 3, rien n'est touché) ; une note seulement modifiée ailleurs (même id, sinon même titre) part. `duplicate` refuse une note absente.
- `withOccurrenceRemoved` / `withFollowingRemoved` étaient déjà dans le noyau et au corpus (tâche 3).
- Corpus `conformance/drag/` (27 cas) et `conformance/tasks/` (7) : `grid.positionToDate`, `grid.dayShift`, `grid.projectMove` (le `projectGridDrag` réel), `grid.dragSingle` / `grid.resizeSingle` (les `applyEventDrag` / `applyEventResize` réels, cache factice), `tasks.setOccurrenceStatus`. Le runner Jest attend maintenant les opérations (`async`). README mis à jour.
- Discriminance : 7 mutations du TypeScript (arrondi du pas, arrondi de `positionToDate`, fraction du décalage, date de fin, redimensionnement qui perd la fiche, tri, retrait d'un jour) : toutes rouges (1 à 3 cas chacune), restaurées.
- JUnit sur `MemoryTree` : `EventWriterMoveTest` (21 tests), `EventMoveTest` (6). Rouge avant : en retirant les deux garde-fous (delete, duplicate), 3 tests échouent (note absente, note remplacée, duplicata d'une note absente) ; les tests de `reschedule`/`setTaskDone` ne compilaient pas avant.

Application
- `GridTouch.kt` : un seul lecteur de gestes posé sur le corps de la grille (au-dessus des colonnes, sous le défilement/pincement). Appui sans mouvement sur un créneau vide = brouillon (fiche, calendrier par défaut) ; appui long 220 ms (vibration) puis glisser = déplacer (jour et heure, pas de 15 min, bloc d'origine estompé, bloc fantôme sur le créneau visé, défilement automatique près des bords) ; double appui (340 ms) sur un bloc modifiable = mode redimensionnement (deux poignées, bord haut à droite, bord bas à gauche ; le mode se ferme quand les deux bouts ont été tirés, ou par un appui ailleurs, ou par un second double appui) ; un appui simple ouvre la fiche (après 340 ms pour un bloc modifiable, tout de suite sinon). Un doigt posé sur une grille qui glisse encore la freine, sans rien viser. Un glissé qui dépasse le seuil avant l'appui long rend la main au défilement.
- `EventBlock.kt` (sorti de `TimeGrid.kt`) : case à cocher sur le bloc d'une tâche (anneau pointillé / disque coché), poignées, sémantique « ouvrir » pour l'accessibilité. Titre et heure d'un bloc court dans un seul texte (l'heure est coupée d'abord).
- `AllDayBand` : appui sur la bande vide = brouillon « toute la journée » ; case à cocher sur les barres de tâches.
- `NativeViewModel` : `rescheduleEvent`, `setTaskDone` (écritures en série, relecture forcée). Toute écriture passe par `EventWriter`.
- Après le lâcher, le créneau reste dessiné jusqu'à la relecture du dossier (ou échec : il disparaît, message).
- Supprimer avec portée (ce jour / ce jour et les suivants), Dupliquer, menu « … » : déjà faits à la tâche 3, ici vérifiés sur l'émulateur.

## Décisions
- Déplacer/redimensionner un jour de série = « celui-ci seulement » sans dialogue (comme la WebView) ; la copie garde TOUTE la fiche de la série (lieu, rappels, description), là où le TypeScript n'en recopie que titre et description. Écart voulu, côté données.
- Redimensionnement : le bord reste dans le jour de son segment (pas de bord qui change de jour) ; un bord à minuit écrit `endTime: 00:00` + `endDate`. Le TypeScript n'écrit que les heures.
- Un évènement qu'on redimensionne ne se déplace pas (appui long refusé dans le mode), comme la WebView.
- `delete` : une note seulement modifiée par le PC part quand même (c'est l'intention de l'utilisateur) ; seule une note absente ou remplacée par une autre bloque.
- Pas d'aperçu du brouillon sur la grille (la fiche le recouvre et ne le met pas à jour quand on change l'heure) : écart, déjà noté à la tâche 3.
- Un jour de série déplacé change de nom d'évènement (nouvelle note ponctuelle) : son mode redimensionnement se ferme au rechargement.

## Contrôles
- `npx jest conformance` : 1474 verts ; `.\gradlew.bat :core:test assembleDebug` vert.
- Émulateur Pixel_8, calendrier `Essai Compose` UNIQUEMENT (le calendrier par défaut de l'app est « Islam » : le menu Calendrier de la fiche a été changé avant chaque enregistrement ; aucun geste n'a touché un évènement d'Etudes/Islam). Relu par `adb shell cat` :
  - appui sur un créneau vide (jeu 1 oct ~18:30) : fiche en Tâche (réglage), 18:30-19:00 ; enregistrée : `2026-10-01 Essai_geste.md`.
  - `input draganddrop` (appui long + glisser) : 18:30 -> 20:00 le 2 oct (296 px = 1,5 h), fichier renommé `2026-10-02 Essai_geste.md`, contenu : date, heures, `completed: false` seuls changés.
  - double appui puis poignée du bas : 20:30 -> 21:15 ; poignée du haut : 20:00 -> 19:30.
  - case à cocher : `completed: "2026-09-30T23:27:52.500Z"`, titre barré.
  - jour d'une série (mer 30, 10:00) déplacé à 11:00 : `2026-09-30 Sport serie.md` (ponctuel, lieu/rappels/description conservés), série intacte sauf `skipDates: ["2026-09-30"]`.
  - Dupliquer : `2026-09-30 Sport serie (1).md`. Supprimer une note ponctuelle : fichier parti. Supprimer un jour de série : dialogue « Que supprimer de cette série ? » ; « et toutes les suivantes » alors qu'il ne restait que ce jour : la note part (correct : plus rien).
- Captures (`captures\compose-t4-*.png`) : 01 fiche du créneau, 02 menu des calendriers, 03 brouillon titré, 04 grille après création, 05 après déplacement, 06 mode redimensionnement, 07 après redimensionnement, 08 poignée du haut, 09 case cochée, 10-11 série avant/après, 12-13 fiche et menu, 14 duplicata, 15-17 dialogues de suppression, 16 après suppression.
- Fichiers relus : `task-1..3-report.md`, `task-3-correctifs.md`, `NativeViewModel.kt`, `EventWriter.kt`, `WorkspaceWriter.kt`, `EventSheet.kt`, `TimeGrid.kt`, `GridState.kt`, `NativeScreen.kt`, `AllDayBand.kt`, TypeScript : `useTimeGridDrag.ts`, `useTimeGridResize.ts`, `useEventDragResize.ts`, `DraftPreview.tsx`, `dragProjection.ts`, `useTimeGridSelection.ts`, `androidDraftSelection.ts`, `recurrenceDeletion`/`recurringEdit`, `toggleTask` de `DesktopCalendar.tsx`.

## Écarts avec l'inventaire
- Pas de déplacement d'une barre « toute la journée » ni de dépôt d'un évènement horodaté sur la bande (le TypeScript convertit) ; pas de déplacement vers le panneau des tâches sans date.
- Pas d'aperçu du brouillon sur la grille ; pas de sélection multiple.
- Le défilement automatique du glissé est simple (vitesse fixe) ; pas d'auto-défilement pendant le redimensionnement.
- Les cases des listes de tâches (tiroir) restent non interactives (seuls le bloc de la grille et les barres « journée » cochent).

## Doutes
- Non vérifié à l'écran : défilement automatique du glissé aux bords, déplacement d'un évènement qui traverse minuit, changement d'heure, poignée sur un bloc très court (les deux zones de toucher 32x28 dp se chevauchent peu : haut à droite, bas à gauche), appui long sur un bloc non modifiable, retour à zéro après une écriture échouée (testé seulement par JUnit).
- `computeSnapped` (redimensionnement) vit dans un hook TypeScript non exporté : non couvert par le corpus, seulement par `EventMoveTest`.
- Le `reload` au retour dans l'app ne se déclenche pas quand l'activité est déjà au premier plan (constaté : il faut HOME puis relancer) : comportement de la tâche 1, non modifié.
- Le premier essai de `input swipe` pour déplacer ne marche pas (le doigt bouge avant 220 ms : défilement) ; `input draganddrop` fait l'appui long.

## Correctifs

Sept défauts de `revue-t4.md` corrigés, chacun avec un test JUnit sur `MemoryTree` (`EventWriterSafetyTest`, rouge avant, vert après).
- 1 : `detachOccurrence` relit la série avant d'écrire la copie ; jour déjà dans `skipDates` ou fichier qui n'est plus la même série (id, sinon titre) : `NoteMovedException`, rien d'écrit. Côté app, `WriteGate` (noyau) et `NativeViewModel.writing` : un geste pendant une écriture est ignoré (`WRITE_IGNORED`, ni succès ni message) ; Enregistrer, Dupliquer, Supprimer se désactivent ; le verrou tient jusqu'à la fin de la relecture du dossier. Il remplace le Mutex (file d'attente).
- 2 : `skipDates` et `completedDates` : le delta (ajout ou retrait du jour) s'applique à la liste du fichier relu dans `persist` (`DayChange`), jamais à celle de l'instantané.
- 3 : la copie d'un jour de série déplacé ou étiré au-delà de minuit porte `endDate`.
- 4 : « ce jour et les suivants » : début de série incalculable = erreur, la note n'est plus supprimée ; elle ne part que si le début est calculé et `>= date`.
- 5 : double appui sur Supprimer : le second est ignoré par le verrou.
- 6 : une note n'est renommée que si son nom voulu (titre, date) a changé ; « Titre (1).md » garde son nom.
- 7 : sans identifiant, une note modifiée au même chemin n'est pas supprimée. Le test `deletingANoteEditedElsewhereStillRemovesIt` utilise désormais une note avec id.

Contrôles : `:core:test assembleDebug` vert. Émulateur, `Essai Compose` seul : série quotidienne (fichier posé par adb, retiré ensuite) ; deux déplacements simultanés du même jour = une seule copie, série non renommée, `skipDates` correct ; double appui sur « Supprimer » = fichier parti, sans message.
Doute : si la 2e écriture échoue (série non mise à jour), une relance écrit encore une copie, le jour n'étant pas encore dans `skipDates` ; hors du correctif demandé.
