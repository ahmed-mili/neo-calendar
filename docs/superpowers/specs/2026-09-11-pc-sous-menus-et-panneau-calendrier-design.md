# PC : sous-menus en cascade et panneau d'un calendrier

## Demande

Ahmed, le 11 septembre 2026 au soir, après la 1.75.0 :

- « sur pc c'est abusé » : le rappel d'un calendrier s'ouvrait dans une modale
  centrée avec voile et flou ; il veut « juste un petit sous-menu qui apparaît
  au survol ».
- Les liens ICS : « le lien ICS garde le modal si on ne peut pas simplifier à
  un sous-menu, mais dans ce cas il faut mieux le styliser ». La fenêtre porte
  des champs à écrire (nom, URL, adresse) : elle reste une fenêtre, restylée.
- « On garde tout sur PC » : aucune fonction ne disparaît.
- Le panneau d'un calendrier, sur PC : « en haut y a du vide, il faut prendre
  cette place » ; « son fond doit être transparent, on ne doit rien voir
  derrière comme la colonne all day » ; « sa transition est trop abusée, on
  doit en mettre une plus simple » ; « il faut mieux le styliser sur PC ».

Android ne change pas : pas de survol, les dialogues actuels restent.

## 1. Le menu d'un calendrier apprend les sous-menus

`src/ui/calendar/CalendarItemMenu.tsx`, le menu de la colonne, devient
capable de cascade. Une entrée peut porter :

- `children: CalendarMenuItem[]` : un sous-menu, signalé par un chevron à
  droite. Il s'ouvre au survol (après 150 ms d'intention), au clic, et au
  clavier par flèche droite / Entrée ; flèche gauche et Échap referment le
  niveau courant. Il est posé à droite de l'entrée, première ligne alignée sur
  elle, et bascule à gauche quand la fenêtre manque de place. Passer de
  l'entrée à son sous-menu ne le referme pas : 320 ms de délai de sortie et
  3 px de recouvrement, les mêmes chiffres que `DesktopAppMenu`.
- `checked: boolean` : une coche à droite, pour les listes de choix.
- `note: string` : une seconde ligne en petit sous le libellé (« 5 minutes
  avant » sous « Réglage de l'application »).
- `content: React.ReactNode` : un bloc libre rendu à la fin du sous-menu
  (le champ personnalisé du rappel).
- `keepOpen: boolean` : le clic n'efface pas le menu (le champ personnalisé).
- `onClick` devient optionnel : une entrée à `children` n'a rien à faire
  elle-même.

Un seul sous-menu ouvert par niveau. Le menu garde son portail sur `body` et
son calage dans la fenêtre. La grammaire visuelle est celle de
`DesktopAppMenu.css` (lignes de 28 px, chevron calé à droite, survol en surface
pleine) transposée dans `CalendarSidebar.css`, où vit déjà `.nc-cal-menu`.

`DesktopAppMenu` n'est pas fusionné avec lui : il est lié aux commandes de
l'application et à son propre modèle d'entrées, et son en-tête explique déjà
pourquoi il n'a pas repris `ContextMenu`. Les deux partagent les constantes et
la grammaire, pas le code.

### Le menu « ⋯ » du panneau passe sur le même composant

`CalendarEventsPanel` rend aujourd'hui son propre menu (`nc-cep-menu-row`).
Il construit désormais des `CalendarMenuItem` et les donne à
`CalendarItemMenu` : Couleur (pastille), Définir par défaut, N'afficher que
cette vue, Afficher les totaux (`checked`), puis les entrées fournies par
l'application, puis Retirer la vue de la liste (danger). Une seule
implémentation de menu de calendrier.

### Une seule prop pour ce que l'application ajoute

`onManageIcsFeeds`, `onManagePrayerTimes` et `onManageReminder` (colonne,
panneau, `CalendarLayout`) sont remplacés par une seule prop optionnelle :

```ts
extraMenuItems?: (calendarId: string) => CalendarMenuItem[];
```

Le composant partagé insère ces entrées après « Ouvrir le dossier » pour un
calendrier local, telles quelles. C'est l'application (Windows / Android) qui
sait ce qu'elle peut enregistrer et sur quelle surface elle tourne : elle
construit les entrées complètes. Le plugin Obsidian ne passe rien et n'a rien
de plus qu'aujourd'hui.

Les entrées sont construites dans un nouveau module
`apps/windows/src/calendarMenuItems.tsx`, testé seul :

| Entrée | PC | Android |
|---|---|---|
| Rappel | sous-menu (§2) | ouvre `ReminderChoiceDialog` |
| Liens ICS | ouvre `IcsFeedsPanel` restylé (§3) | ouvre `IcsFeedsPanel` |
| Horaires de prière | ouvre `PrayerMosqueDialog`, seulement si `isPrayerCalendarName` | idem |

## 2. Rappel ▸

Le sous-menu reprend exactement la liste du dialogue :

1. Réglage de l'application, note = le délai global en toutes lettres
   (`reminderDelayLabel`), coché quand le calendrier n'a rien enregistré ;
2. Aucun rappel ; 5, 10, 15, 30 minutes avant ; 1 heure avant — coché sur la
   valeur enregistrée ;
3. Personnalisé, coché quand la valeur enregistrée n'est pas dans la liste,
   `keepOpen` ; et en `content` le champ nombre + minutes / heures / jours.

Le champ est extrait de `ReminderChoiceDialog` dans un composant
`ReminderCustomField` (`apps/windows/src/ReminderCustomField.tsx`) que le
dialogue Android et le sous-menu PC utilisent tous deux ; ses classes
`nc-reminder-custom*` et son brouillon tenu en référence ne bougent pas.

Choisir une ligne écrit la préférence comme aujourd'hui (`calendarReminderMinutes`,
clé = chemin, retirer l'entrée pour « Réglage de l'application ») et referme
le menu ; écrire dans le champ écrit à chaque modification et laisse le menu
ouvert.

Les Paramètres gardent leur dialogue : c'est un écran de réglages, pas un menu.

## 3. La fenêtre des liens ICS, restylée

Même contenu et mêmes actions qu'aujourd'hui : liste des liens avec nom, URL,
dernière synchro, fréquence, resynchroniser, supprimer ; adresse où mène le
lien ; formulaire d'ajout nom + URL. Ce qui change est la matière :

- la coque est celle des autres dialogues de l'application
  (`SettingsDialog` : `.nc-choice-backdrop` / `.nc-choice-dialog`, rayon
  16 px, surface de verre, titre en 17 px), au lieu d'une coque à part avec
  ses propres bordures ;
- les liens sont des lignes, pas des cartes bordées dans une carte bordée :
  une ligne par lien, séparées par un filet de 1 px, nom en 14 px semi-gras,
  URL et dernière synchro en 12 px secondaire sur une seule ligne tronquée ;
- la fréquence est un sélecteur compact aligné à droite ; resynchroniser et
  supprimer sont deux glyphes nus de 24 px, qui ne prennent une surface qu'au
  survol ;
- l'adresse est une ligne secondaire du lien (glyphe de lieu + texte, ou
  « Ajouter une adresse » en secondaire), éditée sur place au clic ;
- le formulaire d'ajout est une seule ligne en bas : deux champs sans bordure
  au repos (fond de champ, bordure au focus) et un bouton plein « Ajouter ».

Les classes `nc-ics-*` sont conservées et leurs règles réécrites dans
`App.css` ; rien dans la logique de `IcsFeedsPanel.tsx` ne change hors des
classes et de la coque.

## 4. Le panneau d'un calendrier, sur PC

### Il monte dans la barre de titre

Sur Windows, l'en-tête du panneau (icône et nom du calendrier, puis ses
boutons) est porté dans la barre unifiée, dans un segment de la largeur du
panneau placé juste après la bande latérale, comme les boutons de la colonne y
sont déjà. Le corps du panneau (recherche, cartes) commence donc au ras de la
barre : plus de vide au-dessus.

Mécanique : `DesktopTitlebar` rend un `div.nc-desktop-toolbar__panel` entre le
groupe gauche et l'espace de glissement, et en remonte l'élément par un
callback ref ; `DesktopCalendar` le passe à `CalendarLayout` en
`panelHeaderHost?: HTMLElement | null`, qui le passe à `CalendarEventsPanel`.
Quand l'hôte existe et qu'on n'est pas sur téléphone, le panneau porte son
`nc-cep-header` dans l'hôte par `createPortal` au lieu de le rendre en tête de
sa colonne. La barre peint ce segment de la teinte du panneau : le dégradé de
`.nc-desktop-titlebar` gagne un troisième arrêt, de `--nc-sidebar-width` à
`--nc-sidebar-width + --cep-width`, quand le panneau est ouvert
(`.nc-layout--panel-open` remonté sur le shell par un attribut `data-panel`).
Le segment a `pointer-events: auto` sur ses boutons, comme les autres
enfants de la barre ; le glissement de fenêtre continue autour.

Le bouton d'épinglage n'apparaît plus sur PC : le panneau y est toujours
épinglé (ci-dessous). Les autres boutons restent : menu, filtres, ajouter,
fermer.

### Il pousse la grille

Sur PC, `.nc-cep-slot` prend toujours sa largeur quand le panneau est ouvert
(le comportement actuel de `nc-cep-pinned`, sans le bouton). La grille, sa
colonne « journée entière » et ses évènements s'arrêtent au bord du panneau ;
rien ne passe derrière. Sur téléphone, le tiroir par-dessus la grille et sa
bande de fermeture ne changent pas.

### Fond transparent

Sur PC le panneau prend la teinte de la bande latérale,
`--nc-sidebar-container-background`, sans le flou de 28 px ni la surface
`--nc-float-surface-secondary` : le fond d'écran se voit à travers, et comme
la grille n'est plus derrière, il n'y a plus rien à cacher. Le filet droit
reste `--nc-sidebar-divider-color`, le même que celui de la colonne.

### Transition simple

Plus de glissement : la largeur s'applique d'un coup (pas de transition de
`width`, donc pas de re-mise en page par image), et le contenu du panneau fait
un fondu d'opacité de 150 ms à l'ouverture comme à la fermeture. Le démontage
attend la fin du fondu (180 ms au lieu de 320).

## Tests

- `CalendarItemMenu` : ouverture d'un sous-menu au survol après le délai, au
  clic, au clavier ; fermeture par flèche gauche et Échap ; passage souris
  parent → sous-menu sans fermeture ; coche ; `keepOpen` ; bascule à gauche
  quand la place manque à droite.
- `calendarMenuItems` : les trois entrées, PC et Android ; horaires de prière
  seulement pour le calendrier au bon nom ; le sous-menu Rappel coche la bonne
  ligne et écrit la bonne préférence, y compris « retirer l'entrée ».
- `CalendarSidebar` et `CalendarEventsPanel` : `extraMenuItems` inséré au bon
  endroit pour un calendrier local, absent sinon ; le menu du panneau rend ses
  entrées par `CalendarItemMenu` (les tests existants sur `nc-cep-menu-row` et
  sur les trois callbacks sont réécrits).
- `CalendarLayout` / `CalendarEventsPanel` : avec `panelHeaderHost`, l'en-tête
  est dans l'hôte et absent de la colonne ; sans, il est dans la colonne ;
  pas de bouton d'épinglage quand l'hôte existe.
- Tests de style (comme `CalendarSidebar.test.ts` lit le CSS) : le panneau PC
  n'a pas de transition de `width`, pas de `transform`, un fondu de 150 ms ;
  sa surface est le jeton de la bande latérale.
- `IcsFeedsPanel` : le contenu et les actions ne changent pas (les tests
  existants passent) ; la coque est `.nc-choice-dialog`.
- Vu tourner dans le build de dev Windows, WebView pilotée par CDP, captures :
  sous-menu Rappel ouvert au survol, fenêtre ICS, panneau ouvert sans vide en
  haut et sans grille derrière.

## Hors périmètre

- Android : rien ne change (dialogues, tiroir, épinglage).
- Le plugin Obsidian ne gagne aucune entrée.
- `DesktopAppMenu` n'est pas refondu.
- La liste des évènements du panneau (cartes, dates) n'est pas retouchée :
  Ahmed n'a pas répondu sur ce point, il reste dans `PROCHAINE_VERSION.md`.
