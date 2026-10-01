# Android natif : parité visuelle avec l'ancienne interface (WebView)

Spécification de **contrat** : l'ancienne interface (WebView) fait foi, la nouvelle (Kotlin + Jetpack Compose) doit lui devenir identique, écran par écran et élément par élément. Relevé du 2026-10-01 sur la branche `android-parite` (version 1.83.1). Rien n'est codé ici.

Documents liés : inventaire fonctionnel `docs/superpowers/specs/2026-10-01-android-natif-inventaire.md` ; écarts connus de la v1 : section « Écarts de la v1 » de `docs/superpowers/plans/2026-10-01-app-compose-v1.md`.

## 0. Méthode, sources, limites

**Captures** (dossier local `.superpowers/parite/`, ignoré par git, 1080x2400 px, émulateur Pixel_8 API 37, densité 420 donc **1 dp = 1 px CSS = 2,625 px d'écran**) :
- `parite-ancien-NN-*.png` : l'ancienne interface sur l'appareil (Réglages, « Ancienne interface (WebView) »), mêmes données que la nouvelle ;
- `parite-nouveau-NN-*.png` : la nouvelle interface, même état (même jour, 2 jours, mêmes évènements ouverts) ;
- `parite-ancien-web-*.png` : rendu du **même code web** dans un navigateur (voir ci-dessous), pour les états que l'appareil ne montre pas facilement.

**Valeurs de l'ancienne** : l'APK de production n'est pas déboguable, donc les valeurs ne sont pas estimées sur capture mais **lues sur le code en exécution**. Le build web de l'application (`apps/android/dist`, mêmes sources que l'APK : aucun fichier de `apps/android/src`, `apps/windows/src` ou `src/ui` n'a changé depuis le 2026-09-29) a été servi localement et chargé dans Brave sans interface (processus lancés pour l'occasion puis arrêtés) avec : fenêtre 411 x 914 dp, densité 2,625, agent utilisateur Android tactile, `prefers-color-scheme: dark`, un pont `NeoAndroid` factice servant les trois calendriers de l'appareil (Islam, Etudes, Essai Compose) et leurs couleurs. Chaque valeur « exacte » ci-dessous est un `getComputedStyle` (couleur, police, graisse, rayon, ombre, marges, animation), croisé avec la règle CSS gagnante (`fichier:ligne`). Contrôle : les rendus web et les captures de l'appareil coïncident (tiroir, liste, fiche, réglages, le voile du tiroir, par exemple, assombrit de la même fraction sur l'appareil et dans le harnais : valeurs x 0,58, soit un noir à 42 %). Les unités des tableaux sont des dp (= px CSS).

**Limites connues** : (1) le poste utilise Segoe UI là où le téléphone retombe sur Roboto (pile `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto`) : les tailles sont exactes, les largeurs de texte non ; (2) le harnais n'a pas les évènements réels de l'appareil (par exemple « Scientific and Technical English ») ; (3) l'inset haut de l'appareil est d'environ 50,7 dp, 48 dp dans le harnais ; (4) la version intégrée dans `dist` est 1.82.1 alors que l'APK est 1.83.1 : seul le numéro diffère.

**Code de la nouvelle** : `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/` (abrégé `ui/...` ou nom de fichier ; `K` = ligne de la première occurrence du motif cité).

**Lecture des tableaux** : « ECART » = quelque chose à changer ; « OK » = identique ou équivalent (rien à faire). Pour chaque ligne : élément | ancienne (valeur exacte + source `fichier:ligne`, CSS gagnant ou composant) | nouvelle (valeur actuelle + source) | à faire.

**Trois remarques transverses**
1. *Interaction* : l'ancienne n'a pas d'ondulation Material : l'appui est un **fond plein** (`rgba(255,255,255,0.08)` pour les boutons de la barre, `rgb(49,50,68)` `#313244` pour les lignes de liste, échelle 0,94 / 0,96 pour le bouton + et la pastille du jour). `clickable` de Compose pose une ondulation par défaut : la remplacer par `indication = null` + fond d'appui sur chaque cible pour être identique.
2. *Polices* : calendrier = Roboto (pile système) ; Réglages, dialogues (ICS, ajout de calendrier, couleur, choix, fenêtre de tâches) = **Inter Variable** (écran 19).
3. *Orthographe* : l'ancienne écrit « événement » (accent aigu) ; la nouvelle « évènement » (écran 21).

## Table des matières et nombre d'écarts par écran

| N° | Écran | Lignes | Écarts |
|---|---|---|---|
| 01 | Barre du haut | 8 | **7** |
| 02 | Feuille du mois | 8 | **5** |
| 03 | En-têtes de jours et coin de la grille | 7 | **6** |
| 04 | Colonne des heures | 6 | **5** |
| 05 | Grille (lignes, colonnes, heure actuelle, défilement) | 11 | **9** |
| 06 | Blocs d'évènement | 12 | **6** |
| 07 | Bande « journée entière » | 7 | **6** |
| 08 | Bouton + | 5 | **4** |
| 09 | Tiroir (en-tête, jours, calendriers, tâches) | 21 | **21** |
| 10 | Dialogues de calendrier (couleur, renommer, ajouter, rappel, liens ICS, suppression) | 9 | **9** |
| 11 | Liste des évènements d'un calendrier | 7 | **6** |
| 12 | Listes de tâches (À faire, Terminé) | 5 | **4** |
| 13 | Recherche plein écran | 6 | **5** |
| 14 | Fiche d'évènement (feuille, en-tête, lignes, menus, sélecteurs, dialogues) | 24 | **24** |
| 15 | Brouillon : aperçu sur la grille et feuille de création | 3 | **2** |
| 16 | Réglages (racine, apparence, calendriers, fuseaux, synchronisation, dialogues de choix) | 14 | **14** |
| 17 | Widget | 3 | **1** |
| 18 | Écran de démarrage et premier lancement | 3 | **2** |
| 19 | Fond d'écran, effets et surfaces translucides | 5 | **5** |
| 20 | Barres système | 2 | **1** |
| 21 | Textes et orthographe | 5 | **3** |
| | **Total** | 171 | **145** |

## 1. Barre du haut

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **7** sur 8 lignes.

Remarque : l'ancienne affiche « October » / « Week 40 » en anglais alors que la langue est Français (clés de traduction absentes). La spécification demande le français (« Octobre », « Semaine 40 »), sauf contre-ordre d'Ahmed.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Emprise | Sous l'inset haut : 64 dp (`--nc-android-appbar-height`), padding `8px 7px`, gap 2 ; l'inset mesuré sur l'appareil est d'environ 50,7 dp (titre centré à y=82,7 dp), 48 dp dans le harnais <br>Source : `mobile.css:4387` | 64 dp, padding horizontal 7 dp, sous `safeDrawing` : même ordonnée de titre que l'ancienne sur les captures <br>Source : `ui/TopBar.kt:50`, `ui/NativeScreen.kt:142` | OK. Rien |
| Fond de la barre | `rgba(30,30,46,0.4)` (`--nc-chrome-container-background` = opacité des conteneurs 0,4 de `#1e1e2e`), sans bordure ni flou, sur le fond d'écran <br>Source : `src/ui/calendar/CalendarHeader.css:3`, `mobile.css:2922` | `Neo.Background` `#11111B` opaque (la colonne est posée sur un fond uni) <br>Source : `ui/NativeScreen.kt:127` | **ECART** Transparent à 40 % de `#1E1E2E` posé sur la couche de fond d'écran (voir écran 19) |
| Bouton menu (trois traits) | 48x48, rayon 13, icône Lucide `menu` 23x23 (traits de 17,3 de long), couleur `--text-muted` `rgb(161,168,201)`, appui : fond `rgba(255,255,255,0.08)`, pastille bleue de mise à jour en coin <br>Source : `src/ui/calendar/CalendarHeader.css:358`, `mobile.css:2957`, `src/ui/calendar/CalendarHeader.css:249`, `mobile.css:2922` | 48 dp, rayon 14, icône maison 23 dp teinte `Neo.Text` `#C6D0F5`, pastille 9 dp `Neo.Accent` en haut à droite (9 dp de marge), ondulation Material à l'appui <br>Source : `ui/TopBar.kt:57`, `ui/TopBar.kt:59` | **ECART** Teinte `rgb(161,168,201)`, rayon 13, appui = fond blanc 8 % (pas d'ondulation) |
| Bouton du mois | Hauteur 48, padding `0 7px`, gap 4, rayon 12 ; texte capitalisé, **29 px, graisse 750, interlettrage -0,045em (-1,305 px)**, couleur `rgb(198,208,245)` ; mois longs (septembre, décembre, novembre, février) : 24 px, interlettrage -0,05em ; chevron Lucide `chevron-down` 15 px (muted) ; actif ou ouvert : fond `rgba(255,255,255,0.09)` <br>Source : `mobile.css:3580`, `mobile.css:1355` | Hauteur 48, padding 7 dp, rayon 14 ; 22 sp SemiBold (18 sp si `needsCompactMonthType`), chevron 18 dp qui pivote de 180 degrés <br>Source : `ui/TopBar.kt:73` | **ECART** 29 sp, graisse 750 (ou Bold à défaut de police variable), `letterSpacing = -0.045.em`, 24 sp pour les mois longs, chevron 15 dp, rayon 12, fond d'appui 9 % |
| Libellé de semaine | 13 px / 19,5, graisse 400, couleur `rgb(214,221,248)`, marge gauche 8, texte « Week 40 » (traduction manquante dans l'ancienne : à écrire « Semaine 40 ») <br>Source : `mobile.css:4436` | 13 sp, `Neo.TextFaint` `#6C7086`, « Semaine N », marge gauche 8 <br>Source : `ui/TopBar.kt:88` | **ECART** Couleur `rgb(214,221,248)` |
| Loupe | 48x48, rayon 13, icône Lucide `search` 23x23, muted ; appui fond 8 % <br>Source : `mobile.css:2958` | 48 dp, rayon 14, icône 22 dp teinte `Neo.Text` <br>Source : `ui/TopBar.kt:98` | **ECART** Teinte muted, icône 23 dp, rayon 13 |
| Pastille du jour | 32x30, rayon 9, texte 17 px / 700 `rgb(198,208,245)` sur `rgba(255,255,255,0.14)` ; hors écran : fond `#f5544f` texte blanc ; zone de toucher 48x48 par `::after` (inset -9px -8px) ; appui : fond 16 % et échelle 0,94 ; **collée au bord droit : 7 dp** <br>Source : `mobile.css:2923` | 32x30, rayon 9, 17 sp Bold, fond `0x24FFFFFF` ; boîte de toucher de 48 dp centrée donc pastille à 15 dp du bord (8 dp de trop) ; sans indication d'appui <br>Source : `ui/TopBar.kt:106` | **ECART** Marge droite 7 dp (boîte de toucher débordante, pas centrée) ; appui : fond 16 % et échelle 0,94 |
| Ouverture du mois | Le bouton prend le fond « ouvert » ; la feuille glisse en `0.17s ease-out` (`nc-android-month-open`) <br>Source : `mobile.css:2968` | Chevron pivote d'un coup, feuille : `tween(170)`, glissement de 1/8 de sa hauteur + fondu <br>Source : `ui/MonthSheet.kt:42` | **ECART** Animer la rotation du chevron (170 ms), fond « ouvert » du bouton |

## 2. Feuille du mois

Captures de l'ancienne : `.superpowers/parite/parite-ancien-14-feuille-mois.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-14-feuille-mois.png`  
Écarts : **5** sur 8 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Surface | Sous la barre, pleine largeur, fond `rgb(30,30,46)` (`#1e1e2e`), bordure basse 1 px `rgba(255,255,255,0.08)`, ombre `0 18px 34px rgba(0,0,0,0.28)`, padding `2px 12px 13px`, z-index 90 <br>Source : `mobile.css:2968` | Fond `Neo.Background` `#11111B`, ombre 18 dp noire, padding `12 / 2 / 12 / 13`, sans bordure <br>Source : `ui/MonthSheet.kt:48`, `ui/MonthSheet.kt:49` | **ECART** Fond `#1E1E2E`, bordure basse 1 px blanche 8 %, ombre `0 18 34 rgba(0,0,0,.28)` |
| En-têtes des jours | Deux lettres minuscules (« lu ma me je ve sa di »), 11 px / 500, couleur muted `rgb(161,168,201)`, padding `2px 0`, hauteur 27, samedi et dimanche à opacité 0,75 <br>Source : `src/ui/calendar/CalendarSidebar.css:755`, `mobile.css:1456` | Une lettre majuscule (« L M M J V S D »), 11 sp, `TextSecondary` `#A6ADC8`, 27 dp, aucune atténuation du week-end <br>Source : `ui/MiniCalendar.kt:104` | **ECART** Initiales sur deux lettres en minuscules (français), week-end à 75 % |
| Grille des jours | 7 colonnes, gap `3px 2px`, cellules 53,6 x 39, rayon 9, nombre 13 px / 19,5 <br>Source : `src/ui/calendar/CalendarSidebar.css:730`, `mobile.css:1449`, `src/ui/calendar/CalendarSidebar.css:772`, `mobile.css:1512` | 7 colonnes, cellules `cellHeight 39 dp` (34 dans le tiroir), rayon 9, 13 sp <br>Source : `ui/MiniCalendar.kt:58` | OK. Rien (géométrie équivalente) |
| Jours des autres mois | Couleur muted `rgb(161,168,201)` | `Neo.TextFaint` `#6C7086` (plus sombre) <br>Source : `ui/MiniCalendar.kt:167` | **ECART** Couleur `rgb(161,168,201)` |
| Semaine en cours | Bande continue `::before` `rgba(255,255,255,0.09)`, rayon 8 aux extrémités (débord -2 px) | Bande `0x17FFFFFF` (9 %), rayon 9 dp, padding vertical 1 <br>Source : `ui/MiniCalendar.kt:119` | OK. Rien d'essentiel (rayon 8 au lieu de 9) |
| Aujourd'hui | Pastille 32x32, rayon 9, texte blanc 700, rouge `--nc-today` ; la barre du haut et le mini-calendrier utilisent `#f5544f` (mobile.css:4420) <br>Source : `src/ui/calendar/CalendarGrid.css:838`, `mobile.css:2719` | Pastille 32x32, rayon 9, `Neo.Today` `#F5544F`, SemiBold <br>Source : `ui/MiniCalendar.kt:155` | **ECART** Graisse 700 |
| Jour de repère | Aucune pastille propre : la semaine est la bande <br>Source : `src/ui/calendar/CalendarGrid.css:916` | Pastille `0x26FFFFFF` 15 % sur le jour de repère <br>Source : `ui/MiniCalendar.kt:156` | **ECART** Supprimer la pastille de repère |
| Fermeture | Appui hors de la feuille, ou sur un jour (saut et fermeture) <br>Source : `mobile.css:2968` | Idem (`onDismiss`, `onSelect`) <br>Source : `ui/MonthSheet.kt:38` | OK. Rien |

## 3. En-têtes de jours et coin de la grille

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **6** sur 7 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Hauteur | 59 dp (`min-height 58` + bordure basse 1), padding `7px 2px 6px` <br>Source : `src/ui/calendar/CalendarDebugLines.css:39`, `mobile.css:4451` | `HeaderHeight` 48 dp <br>Source : `ui/TimeGrid.kt:70` | **ECART** 59 dp, padding 7/2/6 |
| Disposition | Une seule ligne centrée : abréviation du jour puis nombre (« jeu [1] ») <br>Source : `src/ui/calendar/CalendarGrid.css:582`, `mobile.css:4452`, `src/ui/calendar/CalendarGrid.css:591`, `mobile.css:4453` | Deux lignes : jour au-dessus (11 sp), nombre dessous (17 sp SemiBold) <br>Source : `ui/TimeGrid.kt:224`, `ui/TimeGrid.kt:238` | **ECART** Une ligne : jour 12 sp / 650, nombre 12 sp / 500 dans une boîte 25x25 rayon 8 padding `0 4` |
| Couleurs | Jour et nombre : `rgb(214,221,248)` ; aujourd'hui : en-tête graisse 600, nombre blanc 600 sur `rgb(241,85,80)`, rayon 8 <br>Source : `mobile.css:4453`, `src/ui/calendar/CalendarGrid.css:838`, `mobile.css:2719` | Jour `#A6ADC8` (rouge `#F5544F` aujourd'hui) ; nombre `#C6D0F5` ; pastille rouge rayon 9, padding 7 x 1 <br>Source : `ui/TimeGrid.kt:225` | **ECART** Reprendre les couleurs et le rayon 8 ; plus de jour rouge |
| Bordure basse | 1 px `rgba(255,255,255,0.08)` sous chaque en-tête <br>Source : `src/ui/calendar/CalendarDebugLines.css:39`, `mobile.css:4451` | Aucune <br>Source : `ui/TimeGrid.kt:161` | **ECART** Ajouter le filet |
| Coin (fuseau principal) | Case 64x58 dans la gouttière : « GMT+2 » 13 px / 600, `rgb(214,221,248)`, rayon 4, padding `1px 2px`, centré ; filet bas 1 px `rgba(105,109,134,0.24)` <br>Source : `src/ui/calendar/CalendarGrid.css:202`, `mobile.css:4435`, `src/ui/calendar/CalendarGrid.css:193`, `mobile.css:3201` | Case vide `Box(Modifier.width(RailWidth))` <br>Source : `ui/TimeGrid.kt:164` | **ECART** Afficher le décalage horaire de l'appareil (`GMT+0` sur l'émulateur) ; fuseaux secondaires : voir Fonctions manquantes |
| Fond | Gouttière + coin : `rgba(30,30,46,0.4)` avec flou 4 px ; en-têtes sur le fond de la barre (0,4) <br>Source : `src/ui/calendar/CalendarGrid.css:24`, `mobile.css:2702` | Fond uni `#11111B` <br>Source : `ui/NativeScreen.kt:127` | **ECART** Fond transparent 40 % (voir écran 19) |
| Libellé du jour | `Intl` (« jeu », « Thu » selon la langue) ; casse minuscule <br>Source : `src/ui/calendar/CalendarGrid.css:582`, `mobile.css:4452` | `weekdayShort(date)` du noyau (« jeu ») <br>Source : `ui/TimeGrid.kt:217` | OK. Rien |

## 4. Colonne des heures

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **5** sur 6 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Largeur | 64 dp (54 de libellés + bordure droite 1 px `rgba(155,160,185,0.17)`) <br>Source : `src/ui/calendar/CalendarGrid.css:17`, `src/ui/calendar/CalendarDebugLines.css:23`, `mobile.css:3145` | `RailWidth` 48 dp <br>Source : `ui/TimeGrid.kt:69` | **ECART** 64 dp, bordure droite |
| Libellés d'heure | 10 px / interligne 1, graisse 400, `rgb(214,221,248)`, collés à droite à 8 px de la gouttière, centrés sur le trait (`translateY(-50%)`) ; « 01:00 » à « 23:00 », rien à minuit ; 12 h : « 1 AM » <br>Source : `src/ui/calendar/CalendarGrid.css:807`, `mobile.css:4449` | 11 sp, `TextSecondary` `#A6ADC8`, alignés à droite avec 6 dp, centrés sur le trait, 1 à 23 ; 12 h : « 9 AM » <br>Source : `ui/TimeGrid.kt:261`, `ui/TimeGrid.kt:267` | **ECART** 10 sp, `#D6DDF8`, marge droite 8 dp |
| Pastille de l'heure actuelle | `nc-now-label` : texte « 06:59 » blanc 10 px / 700 sur `rgb(241,85,80)`, padding `4px 6px 2px`, rayon 4, alignée à droite de la gouttière, centrée sur la ligne, z-index 1000 <br>Source : `src/ui/calendar/CalendarGrid.css:1461` | Absente <br>Source : Aucun équivalent dans `ui/TimeGrid.kt` | **ECART** Dessiner la pastille dans la colonne des heures (masque l'étiquette voisine) |
| Étiquette d'une prière | `nc-prayer-label` : même boîte que la pastille, couleur du calendrier (`--nc-prayer-color`) <br>Source : `src/ui/calendar/CalendarGrid.css:1484` | Absente <br>Source : Aucun équivalent | **ECART** Voir Fonctions manquantes (horaires de prière) |
| Fond de la colonne | `rgba(30,30,46,0.4)` (`.nc-left-rail-window`) <br>Source : `src/ui/calendar/CalendarGrid.css:331`, `mobile.css:4675` | Fond uni <br>Source : `ui/TimeGrid.kt:185` | **ECART** Transparent 40 % |
| Défilement | Défile avec la grille (même `scrollTop`) <br>Source : `src/ui/calendar/CalendarDebugLines.css:23`, `mobile.css:3145` | Même état `GridState.scrollY` <br>Source : `ui/TimeGrid.kt:265` | OK. Rien |

## 5. Grille (lignes, colonnes, heure actuelle, défilement)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`, `.superpowers/parite/parite-nouveau-40-grille-debordement-haut.png`, `.superpowers/parite/parite-nouveau-41-reglages-debordement-haut.png`, `.superpowers/parite/parite-nouveau-42-reglages-debordement-bas.png`  
Écarts : **9** sur 11 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Lignes d'heure | 1 px CSS `rgba(155,160,185,0.17)`, pleine largeur, une par heure (192 lignes pour 8 colonnes) ; aucune demi-heure <br>Source : `src/ui/calendar/CalendarGrid.css:848`, `mobile.css:1581` | `Neo.GridLine` `0x1AFFFFFF` (blanc 10 %), 1 pixel physique <br>Source : `ui/TimeGrid.kt:297`, `ui/Theme.kt:23` | **ECART** Couleur `rgba(155,160,185,0.17)`, épaisseur 1 dp |
| Séparateurs de jours | `border-left` 1 px `rgba(155,160,185,0.17)` ; padding gauche 2 <br>Source : `src/ui/calendar/CalendarDebugLines.css:31`, `mobile.css:3142` | Mêmes lignes verticales en `GridLine` 1 pixel <br>Source : `ui/TimeGrid.kt:303` | **ECART** Même couleur et épaisseur que les lignes d'heure |
| Colonne d'aujourd'hui | Aucune teinte <br>Source : `src/ui/calendar/CalendarGrid.css:838`, `mobile.css:2719` | Voile `0x0DFFFFFF` (5 %) <br>Source : `ui/TimeGrid.kt:292` | **ECART** Supprimer le voile |
| Ligne de l'heure actuelle | Filet 1 px `rgba(241,85,80,0.3)` sur toute la largeur (`nc-now-line`) + trait 2 px `rgb(241,85,80)`, rayon 999, ombre `0 0 3px rgba(0,0,0,0.35)`, sur la colonne d'aujourd'hui (`nc-now-today-line`) + tiret vertical 2x6 rayon 1 au bord gauche (`nc-now-tick`), z-index 5/6 <br>Source : `src/ui/calendar/CalendarGrid.css:1287`, `src/ui/calendar/CalendarGrid.css:1297`, `src/ui/calendar/CalendarGrid.css:1447` | Filet `Neo.Today` 30 % pleine largeur, trait 2 dp sur la colonne, **disque de 4 dp** au bord gauche <br>Source : `ui/TimeGrid.kt:314` | **ECART** Remplacer le disque par un tiret 2x6 dp (rayon 1) ; ombre 3 dp ; rayon des bouts arrondis |
| Fond de la zone défilante | `rgba(30,30,46,0.4)` (`--nc-grid-container-background`) <br>Source : `src/ui/calendar/CalendarGrid.css:464`, `mobile.css:4674` | Transparent sur fond uni `#11111B` <br>Source : `ui/TimeGrid.kt:187` | **ECART** Voir écran 19 |
| Défilement initial | Au premier affichage : `(heure actuelle - h) x hauteur d'heure` avec `h = min(6 ; max(3,5 ; heures visibles x 0,68))` sur Android (6 h au-dessus de maintenant sur un téléphone), rappliqué à 0, +1 image, +2 images et +220 ms <br>Source : `src/ui/calendar/TimeGrid.tsx:591` | 1 h au-dessus de maintenant (`hourOfDay - 1`) <br>Source : `ui/GridState.kt:108` | **ECART** `h = clamp(heures visibles x 0,68 ; 3,5 ; 6)` |
| Marge basse | `padding-bottom: safe-area-bottom + 10 px` sous minuit, ligne finale 1 px (`.nc-days-row::after`) <br>Source : `src/ui/calendar/CalendarGrid.css:464`, `mobile.css:4674` | La grille s'arrête à 24 h exactement (`maxScroll = 24 x hourPx - hauteur`) <br>Source : `ui/GridState.kt:72` | **ECART** Ajouter 10 dp + inset bas de défilement |
| Défilement vertical | Natif WebView (`overflow-y:auto`, `overscroll-behavior:none`) <br>Source : `src/ui/calendar/CalendarGrid.css:464`, `mobile.css:4674` | `pointerInput` maison + `animateDecay` sur `rememberSplineBasedDecay` (pas de `verticalScroll`) <br>Source : `ui/GridState.kt:126`, `ui/GridState.kt:172` | **ECART** Voir « Effet de débordement de la grille » |
| Glissé horizontal | Un jour exactement, sauf `freeScroll` <br>Source : `src/ui/calendar/useAxisLock.ts` | Idem (`settleToDay`, `flingFree`, tween 260 ms FastOutSlowIn) <br>Source : `ui/GridState.kt:112` | OK. Rien |
| Pincement | Hauteur d'heure 32 à 320, repos 72 <br>Source : `src/ui/calendar/useWheelZoom.ts` | Idem (`MIN_HOUR_HEIGHT`, `MAX_HOUR_HEIGHT`) <br>Source : `ui/GridState.kt:96` | OK. Rien |
| Lignes de prière | Trait 2 px dans la couleur du calendrier « Islam » (étiquette dans la gouttière), filet 1 px à 30 %, Jumu'a animée (`nc-prayer-shimmer` 2,6 s) <br>Source : `src/ui/calendar/CalendarGrid.css:1367`, `src/ui/calendar/CalendarGrid.css:1357` | Absentes <br>Source : Aucun équivalent | **ECART** Voir Fonctions manquantes |

## 6. Blocs d'évènement

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **6** sur 12 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Fond | `linear-gradient(accent 15 %)` sur `var(--background-primary)` `rgb(30,30,46)` (opaque) <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | `accent 15 %` composé sur `Neo.Surface` `#1E1E2E` <br>Source : `ui/EventBlock.kt:70` | OK. Rien |
| Bande d'accent | `::before` 4 px de large, pleine hauteur, couleur du calendrier, rayon `4 0 0 4` ; passé : opacité 0,4 <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | Rectangle 4 dp, alpha 0,4 si passé <br>Source : `ui/EventBlock.kt:96` | OK. Rien |
| Rayon | 4 <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | 4 <br>Source : `ui/EventBlock.kt:73` | OK. Rien |
| Ombre | `0 5px 14px rgba(0,0,0,0.18)` <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | Élévation 4 dp, ambiante et ponctuelle noires à 18 % <br>Source : `ui/EventBlock.kt:84` | **ECART** Dessiner l'ombre `0 5 14 .18` (rayon de flou 14, décalage 5) ; l'élévation Compose ne la reproduit pas à l'identique |
| Marges intérieures | `padding 5px 7px 5px 11px` <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | `start 11, end 7, top 5 (2 si court), bottom 2` <br>Source : `ui/EventBlock.kt:98` | **ECART** Bas 5 dp |
| Titre | 11 px, graisse 600, interligne 14,3, couleur `rgb(198,208,245)` (muted si passé), jusqu'à 2 lignes avant la coupe <br>Source : `src/ui/calendar/CalendarGrid.css:1142`, `mobile.css:401` | 11 sp Medium (500), `Neo.Text` (secondaire si passé ou fait), `maxLines 6` <br>Source : `ui/EventBlock.kt:127` | **ECART** Graisse 600, interligne 14,3 sp |
| Lieu | Ligne « Efrei Bat. H H219 » sous le titre : 11 px, `rgb(161,168,201)`, interligne 14,3 <br>Source : `src/ui/calendar/CalendarGrid.css:1209` | Absente <br>Source : Aucun équivalent dans `ui/EventBlock.kt` | **ECART** Afficher le lieu entre titre et heure (masqué si le bloc est court) |
| Heure | « 06:00 –  11:00 » 11 px, `rgb(161,168,201)` <br>Source : `src/ui/calendar/CalendarGrid.css:1156`, `mobile.css:402` | « 06:00 – 11:00 » 11 sp `TextSecondary` `#A6ADC8` <br>Source : `ui/EventBlock.kt:132` | OK. Rien d'essentiel |
| Position, hauteur minimale et chevauchements | Colonne de jour + 5 px ; largeur `colonne - 17 px` (156,5 pour 173,5) ; haut = `heure x hauteur d'heure + 2 px` ; hauteur = `max(30 px ; durée x hauteur d'heure) - 4 px` (donc **26 dp au minimum**) ; `OVERLAP_COL_GAP` 16, `EVENT_VGAP` 4 ; chevauchements en colonnes égales <br>Source : `src/ui/calendar/TimeGridSections.tsx`, `src/ui/calendar/calendarConstants.ts:100` | Marge 4 dp, largeur `fente - 16`, haut = `heure x hauteur + 2`, hauteur = `durée x hauteur - 4`, **minimum 14 dp**, mêmes constantes du noyau <br>Source : `ui/TimeGrid.kt:71` | **ECART** Minimum 26 dp (`MIN_BLOCK_DP = 26`) |
| Bloc court (40 min ou moins sur le jour) | Disposition en ligne `nc-event-text-inline` (titre et heure côte à côte, gap 5), lieu masqué, même seuil de 40 minutes (`isShort`) <br>Source : `src/ui/calendar/EventBlock.tsx:160` | Même seuil (`durationHours * 60 <= 40`) : une ligne titre + heure (heure masquée sous 20 min), padding haut 2 <br>Source : `ui/EventBlock.kt:79` | OK. Rien d'autre que la hauteur minimale ci-dessus |
| Tâche sur le bloc | Case ronde pointillée / disque coché (`TaskCheckbox.tsx`) <br>Source : `src/ui/calendar/TaskCheckbox.tsx` | `TaskCheck` 22 dp (anneau pointillé 1,5 dp / disque), même dessin <br>Source : `ui/EventBlock.kt:187` | OK. Rien |
| États appui, déplacement, redimensionnement | Appui long 220 ms puis glissé ; double appui = deux poignées ; bloc d'origine à opacité réduite <br>Source : `src/ui/calendar/CalendarOverlays.css:849`, `draftPreview.css:71` | Idem, opacité 0,35 (`PENDING_DIM`), poignées disque 12 dp dans une zone 32x28 <br>Source : `ui/EventBlock.kt:148` | **ECART** Mesurer l'opacité et les poignées de l'ancienne (disque 14, bord 2 px accent, `nc-draft-preview-resize`) |

## 7. Bande « journée entière »

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **6** sur 7 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Hauteur d'une ligne | 30 dp de pas (barre 26 + 4) ; bande à 3 lignes pour 2 barres (une ligne vide pour ajouter) = 90 dp ; vide : 1 ligne <br>Source : `src/ui/calendar/CalendarGrid.css:443`, `mobile.css:2749`, `src/ui/calendar/CalendarGrid.css:689` | `ALLDAY_ROW_HEIGHT` 24 dp, barres de 20 dp <br>Source : `ui/AllDayBand.kt:72` | **ECART** 30 dp (barre 26) |
| Barre | Fond identique au bloc (accent 15 % sur `rgb(30,30,46)`), rayon 4, ombre `0 5 14 .18`, padding `5 7 5 11`, bande d'accent 4 px, texte 12 px, animation d'apparition `0.22s cubic-bezier(.215,.61,.355,1)` (`nc-allday-bar-in`) <br>Source : `src/ui/calendar/CalendarGrid.css:709`, `mobile.css:2507` | Fond accent 15 %, rayon 4, **bande 3 dp**, padding `start 9 / end 6`, texte 11 sp Medium, sans ombre ni animation <br>Source : `ui/AllDayBand.kt:206` | **ECART** Bande 4 dp, padding 5/7/5/11, texte 12 sp, ombre, animation |
| Gouttière et bouton de repli | 64 dp ; bouton 22x22 rayon 6 à gauche du bord, deux chevrons Lucide 14x14 en `rgb(105,109,134)` qui se retournent en 0,22 s ; libellés « Réduire / Développer les événements sur la journée » <br>Source : `src/ui/calendar/CalendarGrid.css:78`, `src/ui/calendar/CalendarGrid.css:110` | 48 dp ; chevron simple 16 dp `TextSecondary`, affiché si >= 2 lignes ou replié <br>Source : `ui/AllDayBand.kt:100` | **ECART** Deux chevrons 14 dp, couleur `#696D86`, rotation 220 ms, cible 22 dp |
| Filets | Bas : 1 px `rgba(108,112,134,0.28)` ; bord droit de la gouttière 1 px `rgba(128,128,128,0.35)` ; cellules : bordure gauche 1 px `rgba(105,109,134,0.24)` <br>Source : `src/ui/calendar/CalendarDebugLines.css:35`, `src/ui/calendar/CalendarDebugLines.css:27` | Filet bas `GridLine` 1 pixel <br>Source : `ui/AllDayBand.kt:88` | **ECART** Reprendre les trois filets |
| Badge « N événements » (replié) | Bouton `nc-allday-hidden-count` couvrant la case du jour, texte **centré**, 11 px, `rgb(161,168,201)`, fond transparent (la barre dessous est effacée à l'œil), survol : fond `--nc-bg-hover` ; texte « N événements » ; un appui déplie toute la bande <br>Source : `src/ui/calendar/CalendarGrid.css:737` | Texte **à gauche** (padding 6), `TextSecondary` 11 sp, fond `#11111B` opaque, « N évènements », sans action propre <br>Source : `ui/AllDayBand.kt:144` | **ECART** Centrer, « N événements », appui = déplier, survol |
| Ajouter par appui dans la bande | Appui sur une case vide : brouillon journée entière <br>Source : `src/ui/calendar/TimeGridSections.tsx` | Idem (`onCreateAllDay`) <br>Source : `ui/AllDayBand.kt:115` | OK. Rien |
| Glisser un évènement vers / depuis la bande | Déplacement possible entre la grille horaire et la bande (`useTimeGridDrag`) <br>Source : `src/ui/calendar/useTimeGridDrag.ts` | Non pris en charge (écart v1 consigné) <br>Source : Plan v1 « Écarts de la v1 », Créer / déplacer (T4) | **ECART** Voir Fonctions manquantes |

## 8. Bouton +

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **4** sur 5 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Géométrie | 56x56, rayon 16 (`!important` en bas de `mobile.css`), à `max(18, safe+14)` du bord droit et du bas, fond `var(--nc-accent)` `#658ff2` <br>Source : `src/ui/calendar/CalendarLayout.css:53`, `mobile.css:4692` | 56 dp, rayon 18, marge 16 dp (dans la zone grille, donc au-dessus de la barre de navigation) <br>Source : `ui/NativeScreen.kt:326`, `ui/NativeScreen.kt:325` | **ECART** Rayon 16, marges 18 dp + insets |
| Ombre | `0 12px 28px accent 30 %, 0 5px 14px rgba(0,0,0,0.34)` <br>Source : `src/ui/calendar/CalendarLayout.css:53`, `mobile.css:4692` | `shadow(8.dp)` noir par défaut <br>Source : `ui/NativeScreen.kt:325` | **ECART** Ombre double ci-contre |
| Icône | Lucide `plus` 24x24 couleur `var(--nc-accent-text)` `#1e1e2e`, traits 14 de long <br>Source : `src/ui/calendar/CalendarLayout.css:53`, `mobile.css:4692` | `NeoIcons.Plus` 26 dp teinte `#11111B` <br>Source : `ui/NativeScreen.kt:337` | **ECART** 24 dp, teinte `#1E1E2E` |
| Appui | Échelle 0,94 en 90 ms à l'appui, retour en 260 ms `cubic-bezier(.2,.9,.3,1)` <br>Source : `src/ui/calendar/CalendarLayout.css:53`, `mobile.css:4692` | Ondulation Material <br>Source : `ui/NativeScreen.kt:327` | **ECART** Échelle animée 0,94 (90 ms / 260 ms) |
| Action | Brouillon à l'instant (arrondi au quart d'heure ? non : maintenant, 30 min), calendrier par défaut <br>Source : `src/ui/calendar/useDraftEvent.ts` | `newDraft()` : maintenant sans arrondi, 30 min, calendrier par défaut <br>Source : `ui/NativeScreen.kt:520` | OK. Rien |

## 9. Tiroir (en-tête, jours, calendriers, tâches)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-02-tiroir.png`, `.superpowers/parite/parite-ancien-03-menu-ligne-calendrier.png`, `.superpowers/parite/parite-ancien-17-tiroir-plus-de-durees.png`, `.superpowers/parite/parite-ancien-web-drawer.png`, `.superpowers/parite/parite-ancien-web-row-menu.png`, `.superpowers/parite/parite-ancien-web-more-days.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-02-tiroir.png`, `.superpowers/parite/parite-nouveau-03-menu-ligne-calendrier.png`  
Écarts : **21** sur 21 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Panneau : largeur et position | 360 dp de large, du haut (0) au bas, contenu sous l'inset haut (padding-top 48), rayon 0 <br>Source : `src/ui/calendar/CalendarPanel.css:49`, `mobile.css:4376` | `min(305 dp ; 82 %)` donc 305 dp sur 411 dp ; démarre sous la barre d'état <br>Source : `ui/Drawer.kt:118` | **ECART** Largeur 360 dp (mesuré), `min(360 ; 88 %)` à vérifier sur écran étroit |
| Panneau : fond et bord | Fond opaque `rgb(24,24,37)` (`#181825`, `--background-secondary`), bordure droite 1 px `rgba(108,112,134,0.28)`, aucune ombre <br>Source : `src/ui/calendar/CalendarPanel.css:49`, `mobile.css:4376` | `Neo.Surface` `#1E1E2E`, bordure 1 dp blanche 8 % sur les quatre côtés <br>Source : `ui/Drawer.kt:146`, `ui/Drawer.kt:147` | **ECART** Fond `#181825`, bordure droite seulement `rgba(108,112,134,.28)` |
| Voile derrière le tiroir | Le calendrier seul s'assombrit : `.nc-main::after` noir, opacité 0,4 (`--nc-drawer-dim`), transition `300ms cubic-bezier(.05,.7,.1,1)`, sans transition pendant le glissé ; la bande à droite du tiroir est un capteur d'appui transparent <br>Source : `mobile.css:4322`, `mobile.css:4289` | Noir 50 % x progression, sur tout l'écran <br>Source : `ui/Drawer.kt:137` | **ECART** Noir 40 % |
| Animation d'ouverture et de fermeture | `transform 0.3s cubic-bezier(0.05,0.7,0.1,1)` ; suit le doigt depuis le bord gauche (`useDrawerSwipe`) <br>Source : `src/ui/calendar/CalendarPanel.css:49`, `mobile.css:4376` | `tween(220, FastOutSlowInEasing)`, suit le doigt (bord de 32 dp) <br>Source : `ui/Drawer.kt:98` | **ECART** 300 ms et courbe `cubic-bezier(0.05,0.7,0.1,1)` |
| En-tête | Barre 64 dp (`min-height 56` + padding), bordure basse 1 px `rgba(108,112,134,0.28)`, contenu aligné à droite : pastille de version puis engrenage ; **aucun titre** <br>Source : `src/ui/calendar/CalendarSidebar.css:645`, `mobile.css:4366`, `src/ui/calendar/CalendarSidebar.css:71` | Ligne de 60 dp : titre « Neo Calendar » 16 sp SemiBold, version 12 sp `TextFaint`, engrenage 20 dp, sans bordure ; la pastille de mise à jour a sa ligne <br>Source : `ui/Drawer.kt:197`, `ui/Drawer.kt:198` | **ECART** Retirer le titre ; pastille de version bordée ; filet bas |
| Pastille de version | « v1.83.1 » 11 px / 11, `rgb(161,168,201)`, bordure 1 px `rgba(108,112,134,0.28)`, rayon 999, padding `5px 9px`, marge droite 4 ; (c'est aussi le point d'entrée de la mise à jour) <br>Source : `src/ui/calendar/CalendarSidebar.css:71` | Texte nu 12 sp `#6C7086` <br>Source : `ui/Drawer.kt:198` | **ECART** Pastille bordée comme ci-contre |
| Engrenage | 48x48, rayon 10, Lucide `settings` 22 dp, `rgb(161,168,201)`, appui fond `--background-modifier-hover` `rgb(49,50,68)` <br>Source : `mobile.css:1645`, `src/ui/calendar/CalendarSidebar.css:659`, `mobile.css:3021` | 48 dp, icône 20 dp `TextSecondary` <br>Source : `ui/Drawer.kt:200` | **ECART** Icône 22 dp, rayon 10 |
| Choix du nombre de jours : disposition | Liste verticale de 3 lignes de 50 dp (gap 3), padding du bloc `7 8 10`, filet bas ; ligne = icône de colonnes (18x16, bord 1 px muted, rayon 3, padding 2, opacité 0,82, n barres) + « 1 day » / « 2 days » / « 3 days » (14 px / 520) à 12 dp de l'icône <br>Source : `mobile.css:3721`, `mobile.css:3045` | Titre « Jours affichés », 3 tuiles côte à côte (icône de barres 7x16 + « 1 jour »), 12 sp <br>Source : `ui/Drawer.kt:239`, `ui/Drawer.kt:310` | **ECART** Reprendre la liste verticale, le libellé « 1 jour / 2 jours / 3 jours » (l'ancienne affiche l'anglais faute de traduction) |
| Choix actif | Fond `rgb(49,50,68)` (`--background-modifier-hover`), rayon 8, texte `rgb(198,208,245)` | Fond accent 18 % + bord 1 dp accent, texte accent <br>Source : `ui/Drawer.kt:315` | **ECART** Fond plein `#313244`, aucun contour accent |
| « Plus de durées » | Ligne 50 dp, 13 px, `rgb(105,109,134)`, rayon 9, padding `10 12`, chevron Lucide ; déplie une grille de 6 boutons 4 à 9 (50,7x36, gap 5, rayon 8, fond `rgba(255,255,255,0.035)`, bord 1 px `rgba(255,255,255,0.07)`, 16 px) puis un champ numérique et « Appliquer » (accent) <br>Source : `mobile.css:3046`, `mobile.css:1735`, `mobile.css:1761` | Ligne `TextSecondary` 13 sp ; 2 rangées de 3 boutons de 40 dp (rayon 10) ; champ + bouton ; « De 1 à 60 jours » <br>Source : `ui/Drawer.kt:255` | **ECART** Grille d'une rangée de 6 (36 dp), fonds et bords ci-contre, 16 sp |
| Mini-calendrier | **Absent du tiroir** (le mois s'ouvre par la feuille de la barre) <br>Source : `src/ui/calendar/CalendarSidebar.css:700`, `mobile.css:2249` | Présent entre le choix des jours et les calendriers (titre du mois, chevrons haut / bas, 6 semaines) <br>Source : `ui/Drawer.kt:206` | **ECART** Le retirer du tiroir (`MiniCalendar` n'est plus utilisé que par `MonthSheet`) |
| Titre de section « Calendriers » | Ligne 34 dp (padding `6 8`, rayon 9) : « Calendriers » 11 px / 700 `rgb(105,109,134)` + chevron de repli 14 ; à droite deux boutons 20x20 : « ... » (Plus d'options) et « + » <br>Source : `src/ui/calendar/CalendarSidebar.css:98`, `mobile.css:2272`, `src/ui/calendar/CalendarSidebar.css:118`, `src/ui/calendar/CalendarSidebar.css:160` | « Calendriers » 12 sp SemiBold `TextSecondary` + « + » 20 dp (cible 48) ; pas de repli ni de menu « ... » <br>Source : `ui/Drawer.kt:208` | **ECART** 11 px / 700 `#696D86`, repli par appui sur le titre, menu « ... » |
| Ligne de calendrier : géométrie | Hauteur 58 (padding `8 10`, nom `min-height 42`), rayon 10, gap 8, appui / sélection : fond `rgb(49,50,68)` ; glisser pour réordonner <br>Source : `src/ui/calendar/CalendarSidebar.css:200`, `mobile.css:3052` | Ligne 48 dp, `padding-start 4`, appui = ouvrir la liste ; appui long + glissé pour réordonner (fond `Neo.Hover`) <br>Source : `ui/Drawer.kt:406` | **ECART** 58 dp, rayon 10, fond d'appui `#313244` |
| Pastille de couleur | **Carré** 15x15 de rayon 4 rempli de la couleur (bord 1 px même couleur), dans un bouton 42x42 ; masqué : vidé ; calendrier par défaut : anneau 2 px de la couleur autour ; appui : échelle 0,82 (`130ms cubic-bezier(.2,.85,.25,1)`) <br>Source : `src/ui/calendar/CalendarSidebar.css:250`, `mobile.css:3092`, `mobile.css:3057` | Disque 14 dp (anneau 2 dp quand masqué) dans 40 dp ; le défaut ne se voit que par le libellé <br>Source : `ui/Drawer.kt:411` | **ECART** Carré rayon 4, anneau du calendrier par défaut, échelle 0,82 à l'appui ; un appui = calendrier par défaut |
| Nom du calendrier | 14 px / 21, graisse 540, `rgb(198,208,245)`, hauteur 42 <br>Source : `src/ui/calendar/CalendarSidebar.css:323`, `mobile.css:3096` | 14 sp, normal, `Neo.Text` (`TextFaint` si masqué) <br>Source : `ui/Drawer.kt:423` | **ECART** Graisse 540 (500 à défaut) |
| Libellé « Par défaut » | 11 px / 700, `rgb(105,109,134)`, padding droit 6 <br>Source : `src/ui/calendar/CalendarSidebar.css:347` | 11 sp normal `TextFaint` <br>Source : `ui/Drawer.kt:430` | **ECART** Graisse 700 |
| Actions de ligne | « ... » (menu) puis œil Lucide `eye` / `eye-off`, 22x22 chacun, `rgb(105,109,134)`, rayon 3 <br>Source : `src/ui/calendar/CalendarSidebar.css:397`, `src/ui/calendar/CalendarSidebar.css:384`, `mobile.css:3103` | Œil 20 dp puis menu **vertical** (⋮) 20 dp ; les deux dans des cibles de 48 dp <br>Source : `ui/Drawer.kt:445` | **ECART** Ordre « ... » puis œil, icône `ellipsis` horizontale, 22 dp |
| Menu de ligne : entrées | Couleur (carré de la couleur), Renommer (`pencil`), « Open folder » (`folder`, sans effet sur Android), Rappel (`bell`), Liens ICS (`link`), « N'afficher que ce calendrier » (`eye-off` ; « Afficher les calendriers précédents » une fois actif), « Retirer de la liste » (`list-x`, rouge `rgb(243,139,168)`) ; **Horaires de prière** (`clock`) pour le seul calendrier nommé Islam <br>Source : `src/ui/calendar/CalendarSidebar.css:436` | Couleur, Renommer, Rappel, Liens ICS, Calendrier par défaut, Supprimer ; **sans icônes**, texte 14 sp <br>Source : `ui/Drawer.kt:448` | **ECART** Ajouter les icônes ; retirer « Calendrier par défaut » du tiroir (c'est la pastille), garder « Supprimer » avec le libellé « Retirer de la liste » ; ajouter « N'afficher que ce calendrier » et « Horaires de prière » ; ne pas reproduire « Open folder » (inerte) |
| Menu de ligne : surface | Fond `rgb(30,30,46)`, bord 1 px `rgba(108,112,134,0.28)`, rayon 10, padding 4, gap 1, ombre `0 14px 28px -6px rgba(0,0,0,.4), 0 2px 6px -1px rgba(0,0,0,.22)`, flou 28 px ; entrées 34 dp, rayon 6, padding `7 10`, gap 10, texte 16 px ; danger `rgb(243,139,168)` <br>Source : `src/ui/calendar/CalendarHeader.css:70` | `DropdownMenu` Material (fond `Neo.Surface`, bord 12 dp), texte 14 sp, hauteur 48 dp <br>Source : `ui/fields/FieldChrome.kt:124` | **ECART** Reproduire la surface et les entrées (menu maison à la place de `DropdownMenu`) |
| Section « Tâches » | Titre statique (11 px / 700 faint, ligne 34), deux lignes de 44 : icône (`nc-status-icon` 12x12 : cercle orange pointillé `rgb(233,151,63)` / disque vert coché `rgb(47,158,68)`), libellé 14 px, compte 14 px `rgb(161,168,201)` ; rayon 4, padding `8 10` <br>Source : `src/ui/calendar/CalendarOverlays.css:275`, `tasks.css:40`, `src/ui/calendar/CalendarPanel.css:2903` | « Tâches » 12 sp SemiBold ; lignes 48 dp : `TaskCheck` 18 dp en accent (anneau gris / disque accent), libellé 14 sp, compte 13 sp <br>Source : `ui/Drawer.kt:227` | **ECART** Icônes orange pointillé et vert coché 12 dp, compte 14 sp, lignes 44 dp, rayon 4 |
| Sections et filets | Chaque section séparée par un filet haut 1 px `rgba(108,112,134,0.28)` (padding `16 10 24`) <br>Source : `src/ui/calendar/CalendarSidebar.css:57`, `mobile.css:3033` | Aucun filet, aucune bordure entre sections <br>Source : `ui/Drawer.kt:207` | **ECART** Ajouter les filets |

## 10. Dialogues de calendrier (couleur, renommer, ajouter, rappel, liens ICS, suppression)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-04-dialogue-couleur.png`, `.superpowers/parite/parite-ancien-18-ajouter-calendrier.png`, `.superpowers/parite/parite-ancien-07-liens-ics.png`, `.superpowers/parite/parite-ancien-web-color-popup.png`, `.superpowers/parite/parite-ancien-web-add-calendar.png`, `.superpowers/parite/parite-ancien-web-ics-dialog.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-04-dialogue-couleur.png`, `.superpowers/parite/parite-nouveau-05-dialogue-renommer.png`, `.superpowers/parite/parite-nouveau-18-ajouter-calendrier.png`, `.superpowers/parite/parite-nouveau-07-liens-ics.png`  
Écarts : **9** sur 9 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Couleur : conteneur | Popover 232x305 ancré à la ligne : fond `rgb(30,30,46)`, bord 1 px `rgba(198,208,245,0.22)`, rayon 12, padding 12, gap 10, ombre `0 14px 28px -6px rgba(0,0,0,.45)`, flou 28 px <br>Source : `src/ui/calendar/ColorPicker.css:4` | `AlertDialog` Material « Couleur » (cercles de 10 teintes Catppuccin + champ `#rrggbb` + Annuler / Appliquer) <br>Source : `ui/CalendarDialogs.kt:129` | **ECART** Remplacer par le sélecteur ci-contre |
| Couleur : contenu | Carré saturation / luminosité 206x140 (rayon 8, poignée disque 12 bord 2 px blanc), barre de teinte 206x12 (rayon 6, poignée 14), ligne : aperçu 24x24 rayon 6 + champ hexa 174x32 (fond `rgb(57,58,78)`, rayon 6, interlettrage .32) ; 12 pastilles prédéfinies 29,3x29,3 (rayon 6, 6 par rangée, gap 6) : `#ed201d #fd7941 #f4be40 #5ecc89 #33b5b5 #4ca8df #6c6fe8 #985df6 #f45d9e #b07d53 #b8b8b8` + `#6b7684` <br>Source : `src/ui/calendar/ColorPicker.css:33`, `src/ui/calendar/ColorPicker.css:54`, `src/ui/calendar/ColorPicker.css:125`, `src/ui/calendar/ColorPicker.css:97` | 10 pastilles rondes Catppuccin + champ texte <br>Source : `ui/CalendarDialogs.kt:132` | **ECART** 12 pastilles et carré SV / barre de teinte |
| Renommer | Édition dans la ligne du tiroir (champ en place) <br>Source : `src/ui/calendar/CalendarSidebar.tsx` | Dialogue « Renommer le calendrier » avec champ et boutons <br>Source : `ui/NativeScreen.kt:467` | **ECART** Édition en place dans la ligne (comme l'ancienne) ou dialogue équivalent assumé |
| Ajouter un calendrier | Feuille de bas d'écran `nc-add-calendar-dialog` (411 de large, 557 de haut, fond `rgb(30,30,46)`, rayon `24 24 0 0`, ombre `0 24px 70px rgba(0,0,0,.48)`, voile `rgba(8,9,18,.72)` flou 7 px) : étiquette « Calendrier », croix, dossier racine « Neo Calendar », **deux cartes de type** (« Dossier de notes » : un fichier Markdown par événement ; « Jours fériés » : en lecture seule, calculés sur l'appareil), nom, lien ICS facultatif + aide, boutons Annuler / « Ajouter le calendrier » (accent, rayon 8, 54 dp) <br>Source : `apps/windows/src/App.css:2412`, `mobile.css:1130`, `apps/windows/src/App.css:6163` | Petit `AlertDialog` « Nouveau calendrier » : un champ « Nom » et Annuler / Créer <br>Source : `ui/NativeScreen.kt:462` | **ECART** Reconstruire la feuille ; le choix « Jours fériés » et le lien ICS à la création manquent |
| Liens ICS : conteneur | Carte centrée 375 de large (marge 18) : fond `rgb(30,30,46)`, bord 1 px `rgba(198,208,245,0.22)`, rayon 20, padding 14, ombre `0 24px 70px rgba(0,0,0,.48)`, voile `rgba(8,9,18,.72)` flou 7 px ; titre « Liens ICS — Etudes » 16 px / 700 avec icône `link` ; croix 30x30 rayon 7 <br>Source : `apps/windows/src/App.css:2969`, `mobile.css:4867`, `apps/windows/src/App.css:791` | `AlertDialog` Material (titre 18 sp) <br>Source : `ui/IcsLinksDialog.kt:76` | **ECART** Reprendre la carte et son voile (voir écran 19 pour les polices Inter) |
| Liens ICS : ligne d'un lien | Carte (fond `rgba(198,208,245,0.03)`, bord, rayon 10, padding 10) : icône `link`, nom éditable 16 px / 600, URL 12 px tronquée, « Dernière synchro. le 01/10/2026 à 06h12 » 11,5 px italique `#757B95`, menu de fréquence (86x30, fond `rgb(50,51,70)`, bord, rayon 7, « 1 h »), boutons 30x30 « Actualiser » (`refresh-cw`) et « Supprimer » (`trash-2`), adresse du lieu (`map-pin`) sous la carte <br>Source : `apps/windows/src/App.css:3098`, `mobile.css:4891`, `apps/windows/src/App.css:3065` | Nom, URL, « Jamais synchronisé » / date, fréquence, actualiser, supprimer, adresse : mêmes données, habillage Material <br>Source : `ui/IcsLinksDialog.kt:128` | **ECART** Habiller comme ci-contre |
| Liens ICS : ajout | Deux champs « Nom » et « https://... » (34 dp, fond `rgb(50,51,70)`, rayon 7, bord) puis bouton « + Ajouter un lien ICS » plein (accent, texte blanc 600, rayon 7, 34 dp) <br>Source : `apps/windows/src/App.css:3256`, `mobile.css:4886` | Champs et bouton « Ajouter » du dialogue <br>Source : `ui/IcsLinksDialog.kt:84` | **ECART** Habiller comme ci-contre |
| Rappel du calendrier | Dialogue de réglage (même liste de délais que les Paramètres) <br>Source : `apps/windows/src/ReminderChoiceDialog.tsx` | `ReminderDialog` Material <br>Source : `ui/CalendarDialogs.kt:190` | **ECART** Habillage seul |
| Suppression | Dialogue de confirmation `ConfirmDialog` (« Retirer ... de la liste ? ») <br>Source : `apps/windows/src/ConfirmDialog.tsx` | `ConfirmDeleteCalendarDialog` <br>Source : `ui/CalendarDialogs.kt:152` | **ECART** Habillage et libellé « Retirer de la liste » |

## 11. Liste des évènements d'un calendrier

Captures de l'ancienne : `.superpowers/parite/parite-ancien-08-liste-evenements-calendrier.png`, `.superpowers/parite/parite-ancien-09-liste-filtres.png`, `.superpowers/parite/parite-ancien-10-liste-menu-points.png`, `.superpowers/parite/parite-ancien-web-events-panel.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-08-liste-evenements-calendrier.png`  
Écarts : **6** sur 7 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Forme de l'écran | Panneau latéral de 360 dp (même bord et même fond que le tiroir, `rgb(24,24,37)`) qui se superpose au tiroir, voile noir 42 % sur le reste (`transition opacity .26s cubic-bezier(.2,0,0,1)`, panneau `transform .26s cubic-bezier(.2,0,0,1)`) <br>Source : `src/ui/calendar/CalendarEventsPanel.css:29`, `mobile.css:4716`, `src/ui/calendar/CalendarEventsPanel.css:14`, `mobile.css:4718`, `mobile.css:4498` | Écran plein écran sur `#11111B` qui glisse de 1/5 depuis la droite (`tween(260)`) <br>Source : `ui/NativeScreen.kt:399` | **ECART** Panneau de 360 dp animé en 260 ms depuis la gauche |
| En-tête | Hauteur 111 (inset 60 + 10), fond `rgb(24,24,37)`, bordure basse 1 px ; icône calendrier colorée 16, nom 16 px / 700, puis 4 boutons 40x40 rayon 12 : « ... » (menu), filtres (`sliders-horizontal`), « + » (nouvel évènement), retour (`chevron-left`) <br>Source : `src/ui/calendar/CalendarEventsPanel.css:89`, `mobile.css:4717`, `src/ui/calendar/CalendarEventsPanel.css:128`, `mobile.css:4580` | Retour à gauche (chevron 24), pastille 12 dp puis titre 20 sp SemiBold, rien à droite <br>Source : `ui/ListChrome.kt:41` | **ECART** Retour à droite, 3 boutons d'action (menu, filtres, +) |
| Champ de recherche | Barre 32 dp de haut, marge `8 10 0`, icône loupe 14, « Rechercher un événement » (rayon 8 environ) <br>Source : `src/ui/calendar/CalendarEventsPanel.css:163` | 44 dp, `Neo.Hover`, bord 1 dp, rayon 12, loupe 18 dp, 15 sp <br>Source : `ui/ListChrome.kt:67` | **ECART** 32 dp de haut, loupe 14 |
| Carte d'évènement | Bouton 339 de large : fond `rgb(30,30,46)`, bord 1 px `rgba(255,255,255,0.055)`, rayon 10, ombre `0 1px 2px rgba(0,0,0,.05)`, padding `10 8 8`, gap 6 ; ligne de titre (icône de note 14 + titre 16 px / 600 sur 1 ligne) ; date 12,5 px / 500 en couleur du calendrier ; évènement en cours : bord blanc 16 % + barre d'accent 3 px à gauche ; passé : opacité 0,52 ; tâche : pastille « À faire » (rayon 6, 12 px) <br>Source : `src/ui/calendar/CalendarEventsPanel.css:598`, `src/ui/calendar/CalendarEventsPanel.css:668`, `src/ui/calendar/CalendarEventsPanel.css:654`, `src/ui/calendar/CalendarEventsPanel.css:773` | Carte `Neo.Hover` `0x14FFFFFF`, bord 1 dp (accent si en cours), rayon 12, padding `14 / 12`, titre 15 sp Medium (2 lignes), date 12 sp en teinte éclaircie, passé : opacité 0,6, pastille d'état 7 dp + « À faire » 11 sp <br>Source : `ui/CalendarEventsList.kt:85` | **ECART** Fond `#1E1E2E`, rayon 10, titre 16 px / 600 avec icône 14, date 12,5 px / 500, barre 3 px pour « en cours », opacité 0,52, gap 6 |
| Filtres (menu) | Popover « Filtres » : Statut, Date, Liens ICS (valeur « Tous » + chevron) <br>Source : `src/ui/calendar/CalendarEventsPanel.css:310`, `src/ui/calendar/CalendarEventsPanel.css:370` | Absents <br>Source : Plan v1 « Écarts de la v1 », Listes (T2) | **ECART** À ajouter |
| Menu « ... » | Couleur (valeur « Custom »), Définir par défaut, N'afficher que cette vue, Afficher les totaux, Rappel, Liens ICS, Retirer la vue de la liste <br>Source : `src/ui/calendar/CalendarHeader.css:70` | Absent <br>Source : Plan v1 « Écarts de la v1 », Listes (T2) | **ECART** À ajouter (voir Fonctions manquantes) |
| Liste vide / chargement | Message vide de la liste <br>Source : `src/ui/calendar/CalendarEventsPanel.css:588`, `mobile.css:4718` | « Aucun évènement » / « Aucun évènement correspondant » 14 sp `TextFaint` centré <br>Source : `ui/CalendarEventsList.kt:69` | OK. Rien |

## 12. Listes de tâches (À faire, Terminé)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-06-liste-taches-a-faire.png`, `.superpowers/parite/parite-ancien-web-tasks-todo.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-06-liste-taches-a-faire.png`  
Écarts : **4** sur 5 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Forme | Fenêtre centrée (`nc-task-modal`) : 387 de large, marge 12, fond `rgb(30,30,46)`, bord 1 px `rgba(198,208,245,0.22)`, rayon 12, ombre `0 24px 48px -8px rgba(0,0,0,.48)`, voile `rgba(8,9,18,.72)` flou 5 px, padding du voile `48 12 12` <br>Source : `src/ui/calendar/CalendarOverlays.css:320`, `tasks.css:20`, `src/ui/calendar/CalendarOverlays.css:326`, `tasks.css:9` | Écran plein écran (en-tête, champ, cartes) <br>Source : `ui/TasksLists.kt:47` | **ECART** Fenêtre centrée comme ci-contre |
| En-tête | Titre « À faire » 15 px / 700 à gauche, croix 44x44 à droite (padding `14 16`, filet bas) <br>Source : `src/ui/calendar/CalendarOverlays.css:371` | Retour (chevron 24) puis titre 20 sp SemiBold <br>Source : `ui/TasksLists.kt:59` | **ECART** Titre à gauche, croix à droite |
| Recherche | Champ 44 dp, bord 1 px, rayon 8, padding `7 10`, « Rechercher une tâche » <br>Source : `src/ui/calendar/CalendarOverlays.css:416`, `tasks.css:27` | 44 dp, rayon 12, loupe 18, 15 sp <br>Source : `ui/TasksLists.kt:60` | **ECART** Rayon 8, sans loupe |
| Ligne de tâche | Ligne 52 dp : fond `rgba(couleur du calendrier, 0.08)`, rayon 4, padding `4 8`, case 44x44 (cercle pointillé 12), titre 16 px, échéance à droite 11 px / 600 (rouge `rgb(229,83,75)` si en retard) ; liste padding 8 <br>Source : `src/ui/calendar/CalendarOverlays.css:105`, `src/ui/calendar/CalendarOverlays.css:150`, `src/ui/calendar/CalendarOverlays.css:205`, `src/ui/calendar/CalendarOverlays.css:221` | Carte 56 dp min : fond couleur 12 % sur `#1E1E2E`, bord 1 dp, rayon 12, case 22 dp, titre 15 sp Medium + nom du calendrier 11 sp en dessous, date 12 sp + drapeau + « En retard » / « Échéance » <br>Source : `ui/TasksLists.kt:76` | **ECART** Ligne 52 dp, rayon 4, fond 8 %, sans nom de calendrier ; échéance 11 px / 600 |
| Liste vide | Message de la fenêtre <br>Source : `src/ui/calendar/CalendarOverlays.css:451`, `tasks.css:32` | « Rien ici » / « Rien ne correspond » <br>Source : `ui/TasksLists.kt:62` | OK. Rien |

## 13. Recherche plein écran

Captures de l'ancienne : `.superpowers/parite/parite-ancien-15-recherche.png`, `.superpowers/parite/parite-ancien-16-recherche-resultats.png`, `.superpowers/parite/parite-ancien-web-search.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-16-recherche-resultats.png`  
Écarts : **5** sur 6 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Fond | `rgba(30,30,46,0.78)` sur le fond d'écran, flou 28 px + saturation 1,18 (`nc-command-palette`), entrée `0.26s cubic-bezier(.05,.7,.1,1)` (`nc-android-search-in`) <br>Source : `mobile.css:4169`, `src/ui/calendar/CalendarPanel.css:139` | `Neo.Background` uni, entrée glissante `tween(260)` <br>Source : `ui/NativeScreen.kt:84` | **ECART** Fond translucide flouté |
| Barre de saisie | Barre 66 (inset + 10 / 12), champ 44 dp, fond `rgba(57,58,78,0.78)`, rayon 12, padding `0 10 0 12`, gap 9, loupe 16 `#696D86`, texte 17 px ; croix ronde 26 (`rgba(105,109,134,.72)`) ; « Cancel » (16 px, accent) à droite <br>Source : `mobile.css:4030`, `mobile.css:4061`, `mobile.css:4090` | Champ 44 dp `Neo.Hover` (bord 1 dp, rayon 12), loupe 18, texte 15 sp, croix 16 dp ; « Annuler » 15 sp accent <br>Source : `ui/SearchScreen.kt:71` | **ECART** Fond `rgba(57,58,78,.78)`, texte 17 px, croix ronde pleine ; « Annuler » (l'ancienne affiche « Cancel ») 16 px |
| Date de groupe | `h3` 15 px / 650, marge `0 0 10 2` (« mar 29 sept ») <br>Source : `mobile.css:4112` | 12 sp SemiBold `TextSecondary`, marge haute 16 / basse 6 <br>Source : `ui/SearchScreen.kt:79` | **ECART** 15 px / 650 |
| Carte de résultat | Bouton : fond `rgba(24,24,37,0.62)`, bande gauche 4 px couleur du calendrier, rayon 10, padding `13 14 13 18`, marge basse 8, gap 10 ; titre 15 px `rgb(161,168,201)` ; heure 15 px blanche + durée 15 px `#696D86` ; appui : fond `rgb(49,50,68)` <br>Source : `mobile.css:4140`, `mobile.css:4144`, `mobile.css:4153` | Carte `Neo.Hover`, bande 4 dp, rayon 10, titre 15 sp Medium `Neo.Text`, heure 12 sp, durée 12 sp, marge basse 6 <br>Source : `ui/SearchScreen.kt:95` | **ECART** Mêmes valeurs que l'ancienne (15 px, couleurs inversées titre / heure) |
| Résultat vide | « No events found » (traduction manquante) 15 px `#696D86`, padding `28 4` <br>Source : `src/ui/calendar/CalendarPanel.css:173`, `mobile.css:4169` | « Aucun évènement trouvé » 14 sp centré <br>Source : `ui/SearchScreen.kt:74` | **ECART** Texte français 15 px |
| Portée de la recherche | Titre seul, casse ignorée (`event.title.toLowerCase().includes(...)`), sans pli des accents ; « Untitled » pour un titre vide <br>Source : `src/ui/calendar/CommandPalette.tsx:272` | Titre seul, casse et accents ignorés <br>Source : `ui/SearchScreen.kt:64` | OK. Rien (le natif tolère plus de saisies) |

## 14. Fiche d'évènement (feuille, en-tête, lignes, menus, sélecteurs, dialogues)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-11-fiche-evenement.png`, `.superpowers/parite/parite-ancien-20-fiche-tache.png`, `.superpowers/parite/parite-ancien-21-tache-repeter.png`, `.superpowers/parite/parite-ancien-22-tache-rappels.png`, `.superpowers/parite/parite-ancien-23-tache-calendrier.png`, `.superpowers/parite/parite-ancien-24-tache-selecteur-date.png`, `.superpowers/parite/parite-ancien-25-tache-menu-type.png`, `.superpowers/parite/parite-ancien-26-tache-menu-points.png`, `.superpowers/parite/parite-ancien-27-tache-description-barre.png`, `.superpowers/parite/parite-ancien-28-description-mise-en-forme.png`, `.superpowers/parite/parite-ancien-12-fiche-selecteur-heure.png`, `.superpowers/parite/parite-ancien-19-fiche-repeter.png`, `.superpowers/parite/parite-ancien-web-sheet-ro.png`, `.superpowers/parite/parite-ancien-web-sheet-task.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-11-fiche-evenement.png`, `.superpowers/parite/parite-nouveau-11b-fiche-evenement-plein.png`, `.superpowers/parite/parite-nouveau-20-fiche-tache.png`, `.superpowers/parite/parite-nouveau-21-tache-repeter.png`, `.superpowers/parite/parite-nouveau-22-tache-calendrier.png`, `.superpowers/parite/parite-nouveau-23-tache-rappels.png`, `.superpowers/parite/parite-nouveau-24-tache-date.png`, `.superpowers/parite/parite-nouveau-25-tache-heure.png`, `.superpowers/parite/parite-nouveau-26-tache-menu-points.png`, `.superpowers/parite/parite-nouveau-27-tache-menu-type.png`  
Écarts : **24** sur 24 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Feuille : ancrages et ouverture | Trois ancrages ouverts `full` (haut de la feuille à 14 dp sous l'inset), `half`, `low` (bande de 96 dp : poignée + en-tête) et fermé ; **une note existante s'ouvre à plein écran** (852 dp de haut), **un brouillon s'ouvre à l'ancrage bas** (≈ 210 dp visibles) ; élan : une chiquenaude avance d'un cran (vitesse > 0,5 px/ms) ; `settleSheet` <br>Source : `src/ui/calendar/useSheetDrag.ts:102`, `src/ui/calendar/useSheetDrag.ts:59` | Trois ancrages bas 176 dp, moitié 56 %, plein ; **note existante : moitié ; brouillon : plein** ; projection `hauteur - vitesse x 0,18`, fermeture sous 62 % du bas <br>Source : `ui/SheetFrame.kt:66`, `ui/EventSheet.kt:217` | **ECART** Inverser les ouvertures (existante = plein ; brouillon = bas), bande basse = 96 dp, moitié = `restOffset` de l'ancienne |
| Feuille : surface et mouvement | Fond opaque `rgb(30,30,46)`, bord haut / côtés 1 px `rgba(108,112,134,0.28)`, rayon `22 22 0 0`, ombre `0 24px 48px -8px rgba(0,0,0,.48), 0 4px 12px -1px rgba(0,0,0,.24)` (brouillon : bord blanc 11 %, ombre `0 -22px 58px rgba(0,0,0,.48), 0 -1px 0 rgba(255,255,255,.05)`) ; mouvement `transform 0.3s cubic-bezier(0.05,0.7,0.1,1)` sans animation d'entrée ; brouillon : voile `rgba(8,9,18,0.3)` <br>Source : `src/ui/calendar/CalendarOverlays.css:531`, `mobile.css:4760`, `src/ui/calendar/CalendarOverlays.css:498`, `mobile.css:3285` | `Neo.Surface` `#1E1E2E`, rayon `22 22 0 0` (clip), sans bord ni ombre, voile noir 50 % x fraction ; `tween(260)` à l'ancrage / `tween(220)` au lâcher / `tween(200)` fermeture <br>Source : `ui/SheetFrame.kt:115` | **ECART** Ajouter bord 1 px, ombre double, courbe `cubic-bezier(.05,.7,.1,1)` en 300 ms, voile `rgba(8,9,18,.3)` (brouillon seulement) |
| Poignée | Bouton 96x30 centré en haut (rayon `0 0 12 12`, `rgb(105,109,134)` à 0,72), **chevron `chevron-down` 24x20** quand la feuille est haute (`--down`), **barre** quand elle est basse (`--bar`) ; elle se tire pour changer d'ancrage (`useSheetDrag.ts`) <br>Source : `mobile.css:751` | Barre 36x4 dp rayon 2 `TextFaint`, marges 10 / 4, toujours une barre <br>Source : `ui/SheetFrame.kt:123` | **ECART** Chevron ou barre selon l'ancrage, cible 96x30 |
| En-tête : type | Déclencheur 40 dp (padding `7 8`, rayon 6, 13 px / 500, gap 4, chevron 13 ; sans bord ; lecture seule : opacité 0,72 et pas de chevron) : « Événement », « Tâche », « Anniversaire » <br>Source : `src/ui/calendar/CalendarPanel.css:3359`, `mobile.css:4773` | Pastille bordée (1 dp, rayon 10, 36 dp min, 14 sp, chevron 14) : « Évènement » (accent grave) ... <br>Source : `ui/EventSheet.kt:222` | **ECART** Déclencheur sans bord, 13 px / 500 ; texte « Événement » (accent aigu) |
| En-tête : actions | Menu « Plus » (cercles `ellipsis` horizontaux 22 dp, 48x48, rayon 12) et croix (11x11 dans 48x48, rayon 12), `rgb(161,168,201)`, **aucun bouton « Enregistrer »** (enregistrement au fil de l'eau) <br>Source : `src/ui/calendar/CalendarPanel.css:254`, `mobile.css:1903`, `src/ui/calendar/CalendarPanel.css:260`, `mobile.css:1911` | « Enregistrer » (14 sp Medium accent) si modifié ou brouillon, menu ⋮ vertical 22 dp, croix 22 dp, toutes en `Neo.Text` <br>Source : `ui/EventSheet.kt:236`, `ui/EventSheet.kt:240` | **ECART** Pas de bouton Enregistrer (écriture continue, voir Fonctions manquantes), `ellipsis` horizontal 22, teinte `rgb(161,168,201)` |
| Titre | Champ 16 px / 19,2 dans une ligne (padding `6 8`, marge `0 10 8`, rayon 6, bord transparent 1 px), couleur `rgb(198,208,245)` ; brouillon : 25 px / 650 / 29,5 avec « Title » en fantôme <br>Source : `src/ui/calendar/CalendarPanel.css:401`, `mobile.css:4769`, `src/ui/calendar/CalendarPanel.css:363`, `mobile.css:4849` | 22 sp SemiBold, « Titre » fantôme `TextFaint`, marges 22 / 16 / 4 / 8 <br>Source : `ui/EventSheet.kt:280` | **ECART** 16 px (fiche) / 25 px (brouillon, graisse 650), placeholder « Titre » |
| Message de lecture seule | Aucun message : les lignes sont atténuées (opacité 0,48 sur « Toute la journée » et « Répéter », 0,7 sur Rappels) <br>Source : `src/ui/calendar/EventDateControls.css:20`, `src/ui/calendar/CalendarPanel.css:2250` | « Cet évènement est en lecture seule. » 13 sp `TextFaint` <br>Source : `ui/EventSheet.kt:288` | **ECART** Remplacer le message par l'atténuation de l'ancienne |
| Heure et date | Une ligne : icône horloge (boîte 22x20) puis « 6:00 AM → 11:00 AM  5h » (champs heure 53x44, 16 px, flèche 15x15 muted, durée 12,5 px muted) ; dessous « Jeu 1 oct » (bouton 16 px, rayon 4, padding `2 6`) ; heures en **12 h** (défaut de l'ancienne : ignore le réglage 24 h dans la fiche) <br>Source : `src/ui/calendar/CalendarPanel.css:604`, `mobile.css:426`, `src/ui/calendar/CalendarPanel.css:524`, `mobile.css:927`, `src/ui/calendar/CalendarPanel.css:663`, `mobile.css:928`, `src/ui/calendar/CalendarPanel.css:588`, `mobile.css:436` | Deux lignes « Début [date][heure] x » et « Fin [date][heure] durée » avec pastilles bordées (36 dp, rayon 10, 14 sp), libellés 13 sp <br>Source : `ui/fields/ScheduleFields.kt:109` | **ECART** Une ligne `heure → heure durée` puis la date dessous ; **garder l'affichage 24 h** quand le réglage est actif (défaut de l'ancienne à ne pas reproduire) |
| « Toute la journée » | Ligne cliquable (icône `sun` 16 dans 22x20, libellé 16 px `rgb(161,168,201)`, rayon 6, padding `8 7`, gap 6), **sans interrupteur** ; active : bord 1 px `rgba(108,112,134,0.28)`, libellé graisse 600, icône accent `#658ff2` agrandie à 1,06 (`transition .1s`), et la ligne des heures passe à l'opacité 0,38 ; en lecture seule : opacité 0,48 <br>Source : `src/ui/calendar/EventDateControls.css:20`, `src/ui/calendar/CalendarPanel.css:550` | Ligne avec icône calendrier, libellé 15 sp `Neo.Text` et `Switch` Material ; les heures disparaissent quand elle est active <br>Source : `ui/fields/ScheduleFields.kt:135` | **ECART** Ligne cliquable sans interrupteur, états ci-contre, icône `sun` |
| « Répéter » | Ligne (icône `refresh-cw` 16, libellé 16 px `rgb(161,168,201)`) ; la ligne se développe en popover « Répéter » : Une seule fois (coche), Tous les jours, Toutes les semaines, Tous les mois, Tous les ans, Personnalisé... ; chevron visible au survol / ouverture <br>Source : `src/ui/calendar/EventDateControls.css:199` | Ligne icône `repeat`, résumé 15 sp, chevron 16 ; `DropdownMenu` des mêmes six choix ; panneau Personnalisé inline (pastilles de fréquence, jours en disques 38 dp, fin) <br>Source : `ui/fields/RepeatField.kt:78` | **ECART** Icône `refresh-cw` ; popover `nc-repeat-select-menu` de la même surface que le menu du calendrier (fond `rgba(30,30,46,.9)`, rayon 12, flou 12 px, entrées 48 dp, coche à gauche de l'entrée active) ; panneau « Personnalisé... » non capturé |
| Calendrier | Bouton 50 dp (padding `5 7`, rayon 6) : carré de la couleur 10x10 rayon 3, nom 16 px, type « Note » 13 px `rgb(161,168,201)`, chevron 14 ; menu `nc-cal-select-menu` : fond `rgba(30,30,46,.9)`, rayon 12, flou 12 px, titre « Calendrier » 11 px / 600 interlettrage .33, entrées 48 dp (coche, carré de couleur, nom) <br>Source : `src/ui/calendar/CalendarPanel.css:3001`, `mobile.css:3345`, `src/ui/calendar/CalendarPanel.css:3087`, `mobile.css:3352`, `src/ui/calendar/CalendarPanel.css:3160`, `mobile.css:3360` | Ligne icône dossier, disque 12 dp, nom 15 sp, chevron 16 dp ; `DropdownMenu` (noms seuls, coche accent) <br>Source : `ui/fields/CalendarStatusFields.kt:44` | **ECART** Carré rayon 3, type du calendrier en légende, menu à titre « Calendrier » et pastilles de couleur |
| Rappels | Ligne (icône `bell`, « Rappels » 16 px `#696D86` quand aucun) ; menu `nc-reminders-menu` : fond `rgba(30,30,46,.92)`, rayon 12, flou 12 / luminosité 1,18, entrées 40 dp : « Au début de l'événement », « **5 min** avant » (nombre 600, suffixe `#696D86`), 10 min, 30 min, 1 heure, Personnalisé... ; chaque rappel choisi devient une ligne éditable <br>Source : `src/ui/calendar/CalendarPanel.css:2227`, `src/ui/calendar/CalendarPanel.css:2332`, `src/ui/calendar/CalendarPanel.css:2337` | « Par défaut » / « Aucun rappel » ou pastilles (34 dp, rayon 10, croix 30 dp) + pastille « Ajouter ⌄ » ; menu avec « Personnalisé... » et « Rétablir le réglage de l'application » <br>Source : `ui/fields/RemindersField.kt:60` | **ECART** Libellé « Rappels », menu de l'ancienne ; conserver l'état « réglage de l'application » |
| Lieu | Icône `map-pin` ; champ « Lieu » 16 px `#696D86` (édition) ou lien souligné `rgb(105,109,134)` (lecture) qui ouvre le menu des cartes <br>Source : `src/ui/calendar/CalendarPanel.css:1938` | Champ « Lieu » 15 sp, puis ligne « Ouvrir dans les cartes » (pastille bordée) <br>Source : `ui/fields/LocationField.kt:80` | **ECART** Lien souligné + menu cartes sur appui ; retirer la pastille séparée |
| Description | Icône `text-align-start`, zone 15 px / 21,75, focus : fond `rgba(198,208,245,0.1)`, bord 1 px `rgba(108,112,134,0.28)`, rayon 8 ; **barre d'outils** collée au clavier (48 dp, fond `rgb(30,30,46)`, ombre `0 -8px 24px rgba(0,0,0,.18)`) : « T » (mise en forme) et trombone, puis gras, italique, souligné, liste, liste numérotée, cases à cocher, annuler, rétablir <br>Source : `src/ui/calendar/CalendarPanel.css:1166`, `descriptionToolbar.css:42`, `src/ui/calendar/CalendarPanel.css:489`, `mobile.css:937` | Texte Markdown brut (15 sp), cases rendues en carrés, liens listés dessous ; aucune barre d'outils, pas d'ajout de pièce jointe ni de lien <br>Source : `ui/fields/DescriptionField.kt:85` | **ECART** Éditeur riche et barre ci-contre (voir Fonctions manquantes) |
| Statut d'une tâche | Pas de ligne « Statut » : la case se coche dans la liste et sur le bloc ; l'état figure dans le menu « Supprimer la tâche » <br>Source : `src/ui/calendar/CalendarGrid.css:1097`, `tasks.css:20` | Ligne « Statut » avec pastille « À faire » / « Terminé » <br>Source : `ui/fields/CalendarStatusFields.kt:65` | **ECART** Retirer la ligne ou la garder comme ajout assumé |
| Filets de section | Filet 1 px `rgba(108,112,134,0.28)` de x=26 à 409 (`::before`) entre horaires, propriétés et description <br>Source : `src/ui/calendar/CalendarPanel.css:3331`, `mobile.css:4850` | Aucun filet <br>Source : `ui/EventSheet.kt:294` | **ECART** Ajouter les filets |
| Colonne d'icônes | Boîte 22x20 à x=27 (16 px de padding + 10 de marge), icônes Lucide 16 px `rgb(161,168,201)` <br>Source : `mobile.css:4795` (NEO_PANEL_ICON_COLUMN_ANDROID_V1) | Boîte 20 dp à 22 dp du bord, icônes 18 dp `TextSecondary` <br>Source : `ui/fields/FieldChrome.kt:36` | **ECART** Boîte 22x20 à x=27, icônes 16 |
| Sélecteur de date | Popover `nc-datepicker` 252x312 ancré au champ : fond `rgba(30,30,46,.92)`, rayon 12, flou 12 px, padding 10 ; en-tête (flèches 26x26 rayon 6, titre « sept 2026 » 13 px / 600) ; jours 31,1x30 rayon 7, 16 px ; jour choisi : accent `#658ff2` texte `#1e1e2e` 600 ; autres mois à 0,5 ; pied : « Retirer la date » (600 muted) et « Aujourd'hui » (accent) <br>Source : `src/ui/calendar/CalendarPanel.css:734`, `src/ui/calendar/CalendarPanel.css:814`, `src/ui/calendar/CalendarPanel.css:870` | `DatePickerDialog` système (anglais : « Wed, Sep 2 », CANCEL / OK) <br>Source : `ui/fields/ScheduleFields.kt:53` | **ECART** Reconstruire le popover (calendrier en français) à la place du dialogue système |
| Sélecteur d'heure | Saisie en place dans le champ (53x44, fond `rgba(198,208,245,.1)` au focus), aucun cadran ni dialogue <br>Source : `src/ui/calendar/CalendarPanel.css:524`, `mobile.css:927` | `TimePickerDialog` système (cadran 24 h, CANCEL / OK en anglais) <br>Source : `ui/fields/ScheduleFields.kt:66` | **ECART** Saisie en place comme l'ancienne |
| Menu du type | Popover 176x142 (fond `rgb(30,30,46)`, bord, rayon 7, padding 4) : entrées 44 dp, rayon 5, 16 px, active fond `rgba(49,50,68,.78)` + coche 14 <br>Source : `src/ui/calendar/CalendarPanel.css:3389`, `src/ui/calendar/CalendarPanel.css:3401`, `mobile.css:4779` | `DropdownMenu` : Évènement, Tâche, Anniversaire (14 sp, coche accent) <br>Source : `ui/EventSheet.kt:224` | **ECART** Reproduire la surface et la ligne active |
| Menu « Plus » | Popover 182x102 (fond `rgb(30,30,46)`, rayon 6, ombre `0 4px 16px rgba(0,0,0,.18)`) : « Dupliquer » (icône `copy-plus` 15) et « Supprimer la tâche » / « Supprimer l'événement » en rouge `rgb(243,139,168)` (`trash-2`), entrées 46 dp rayon 11 padding `10 12`, 15 px <br>Source : `src/ui/calendar/CalendarPanel.css:289`, `mobile.css:963`, `src/ui/calendar/CalendarPanel.css:304`, `mobile.css:953` | `DropdownMenu` « Dupliquer » / « Supprimer » sans icônes <br>Source : `ui/EventSheet.kt:242` | **ECART** Icônes et libellé « Supprimer la tâche » selon le type |
| Dialogue de portée (série) | `RecurringScopeDialog` : « Cet évènement seulement » / « Tous les évènements » ; suppression : celui-ci ou celui-ci et les suivants <br>Source : `src/ui/calendar/RecurringScopeDialog.tsx`, `apps/windows/src/RecurringDeleteDialog.tsx` | `ScopeDialog` / `DeleteOccurrenceDialog` Material avec liste des modifications <br>Source : `ui/EventSheetDialogs.kt:43` | **ECART** Habillage (même carte que la fenêtre de tâches) |
| Dialogue d'abandon | Aucun : l'ancienne enregistre au fil de l'eau <br>Source : aucun | « Enregistrer les modifications ? » (`DiscardDialog`) <br>Source : `ui/EventSheetDialogs.kt:87` | **ECART** Supprimer avec l'écriture continue |
| Flèches d'occurrence précédente / suivante | Présentes dans l'en-tête d'une série (`seriesNavigation.ts`) <br>Source : `src/ui/calendar/seriesNavigation.ts` | Absentes <br>Source : Plan v1 « Écarts de la v1 », Fiche (T3) | **ECART** Voir Fonctions manquantes |

## 15. Brouillon : aperçu sur la grille et feuille de création

Captures de l'ancienne : `.superpowers/parite/parite-ancien-web-draft.png`  
Écarts : **2** sur 3 lignes.

La feuille du brouillon n'a pas de capture dans l'état « nouvelle » ; le panneau « Personnalisé... » de la répétition (écran 14) est lui aussi non capturé.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Aperçu sur la grille | `nc-draft-preview` : encadré sur le créneau (quart d'heure) : bord 2 px `#4aabe0`, fond `rgb(74 171 224 / 18%)`, rayon 6, `left/right 2 px`, poignées rondes 14x14 (bord 2 px `#4aabe0`, fond `--background-primary`, zone tactile 44x44) en haut à 12 px et en bas à 12 px à droite, fondu 180 ms `ease-out` à l'apparition et à la disparition <br>Source : `apps/android/src/draftPreview.css:1`, `src/ui/calendar/DraftPreview.tsx` | Aucun aperçu (écart v1) <br>Source : Plan v1 « Écarts de la v1 », Créer / déplacer (T4) | **ECART** Dessiner l'aperçu et ses poignées ; un glissé des poignées redimensionne le brouillon |
| Création par appui sur un créneau vide | Appui sur un créneau vide : brouillon calé au quart d'heure, 30 min (inventaire §1 ; `useTimeGridSelection.ts`) <br>Source : `src/ui/calendar/useTimeGridSelection.ts` | Appui : brouillon (`onCreate`) aux mêmes règles <br>Source : `ui/NativeScreen.kt:223` | OK. Vérifier le calage au quart d'heure sur l'émulateur |
| Feuille du brouillon | Hauteur 780 posée à l'ancrage bas (≈ 210 dp visibles : poignée barre, type, croix, titre 25 px / 650 « Title », ligne horaire) ; en-tête `padding 17 14 4 22` ; la croix et le type suffisent, aucune validation | Plein écran d'emblée, bouton « Enregistrer », titre obligatoire (« Donnez un titre à l'évènement. ») <br>Source : `ui/EventSheet.kt:169` | **ECART** Ancrage bas à l'ouverture ; voir écran 14 pour l'enregistrement |

## 16. Réglages (racine, apparence, calendriers, fuseaux, synchronisation, dialogues de choix)

Captures de l'ancienne : `.superpowers/parite/parite-ancien-30-reglages-racine.png`, `.superpowers/parite/parite-ancien-31-reglages-bas.png`, `.superpowers/parite/parite-ancien-34-reglages-theme.png`, `.superpowers/parite/parite-ancien-35-reglages-theme-bas.png`, `.superpowers/parite/parite-ancien-37-reglages-fuseaux.png`, `.superpowers/parite/parite-ancien-38-reglages-synchronisation.png`, `.superpowers/parite/parite-ancien-39-reglages-coffres-obsidian.png`, `.superpowers/parite/parite-ancien-40-reglages-langue.png`, `.superpowers/parite/parite-ancien-41-reglages-mode-couleur.png`, `.superpowers/parite/parite-ancien-web-settings.png`, `.superpowers/parite/parite-ancien-web-set-theme.png`, `.superpowers/parite/parite-ancien-web-set-dialog-lang.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-20-reglages-racine.png`, `.superpowers/parite/parite-nouveau-21-reglages-bas.png`  
Écarts : **14** sur 14 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Page : fond et entrée | Plein écran, fond opaque `rgb(24,24,37)` (`--nc-bg-secondary`), entrée `0.26s cubic-bezier(.2,.85,.25,1)` (`nc-android-settings-push-in`) + fondu du voile 0,22 s, **police Inter Variable** <br>Source : `apps/windows/src/App.css:296`, `mobile.css:3532`, `apps/windows/src/App.css:279`, `mobile.css:3525` | Plein écran `#11111B`, entrée `slideInHorizontally(tween(260))`, police du système <br>Source : `ui/SettingsScreen.kt:95` | **ECART** Fond `#181825`, Inter, courbe `cubic-bezier(.2,.85,.25,1)` |
| En-tête | 113 dp (inset 56 + 8), padding `56 8 8 18`, filet bas 1 px `rgba(198,208,245,0.088)` ; flèche Lucide `arrow-left` dans un bouton rond 48x48 ; titre « **Paramètres** » 19 px / 650 <br>Source : `apps/windows/src/App.css:317`, `mobile.css:3391`, `apps/windows/src/App.css:336`, `mobile.css:3405` | `ListHeader` 64 dp : chevron gauche 24 dp (rayon 14), titre « **Réglages** » 20 sp SemiBold, sans filet <br>Source : `ui/SettingsScreen.kt:96` | **ECART** Titre « Paramètres », icône `arrow-left`, bouton rond, filet bas |
| Groupes | Titre 13 px / 500 `rgb(151,158,189)`, marge `0 0 8 4`, groupes espacés de 22, page `padding 18 16 26` ; lignes séparées de 2 dp, fond **`rgb(19,19,29)`** par ligne, rayon `14 14 4 4` / 4 / `4 4 14 14`, filet interne 1 px `rgba(198,208,245,0.114)` à 16 dp <br>Source : `apps/windows/src/App.css:4569`, `apps/windows/src/App.css:4624` | Titre 12 sp SemiBold `TextSecondary` ; un seul bloc `Neo.Surface` `#1E1E2E`, rayon 14, bord 1 dp, sans filets <br>Source : `ui/SettingsScreen.kt:172` | **ECART** Lignes séparées, fond `#13131D`, rayons haut / milieu / bas |
| Ligne : contenu | Hauteur 52 (padding `9 14 9 16`, gap 12) : icône Lucide 18 dp dans 22x18 `rgb(151,158,189)`, libellé 15 px / 19,5, valeur 15 px `rgb(151,158,189)`, chevron `chevron-right` 18 dp `rgb(117,123,149)` <br>Source : `apps/windows/src/App.css:4671`, `apps/windows/src/App.css:4680`, `apps/windows/src/App.css:4697` | 52 dp min (padding 16 / 6) : icône 18, libellé 15 sp, valeur 14 sp `TextSecondary` (max 170 dp), chevron 16 `TextFaint` <br>Source : `ui/SettingsScreen.kt:178` | **ECART** Valeur 15 sp, chevron 18 dp `#757B95` |
| Interrupteur | Piste 44x26 rayon 999 (activée : accent `#658ff2`, bouton blanc 20x20 décalé de 18 ; désactivée : piste `rgba(198,208,245,0.198)`, bouton `#c6d0f5`), transition 0,16 s `cubic-bezier(.2,.85,.25,1)` <br>Source : `apps/windows/src/App.css:5447`, `apps/windows/src/App.css:5461` | `Switch` Material 3 (piste accent, bouton `#11111B` ; désactivée : piste `Neo.Hover` + bord) <br>Source : `ui/fields/FieldChrome.kt:105` | **ECART** Dessiner l'interrupteur de l'ancienne (44x26, boutons 20) |
| Titres de groupe et ordre | « Vue du calendrier » (Vue initiale sur ordinateur : Semaine ; Vue initiale sur téléphone : 3 jours ; Premier jour de la semaine ; Format 24 heures ; Créer un événement en cliquant un jour du mois ; Défilement libre entre les jours ; Rappel ; Mode de trajet ; Application de cartes ; Nouveaux événements créés comme des tâches ; Reconvertir les tâches horaires en événements + note) ; « Apparence » (Thème ; Mode de couleur ; Langue) ; « Intégrations » (Calendriers ; Fuseaux horaires) ; « Données » (Dossier de données ; Coffres Obsidian ; Synchronisation) ; version `1.83.1` 12 px centrée <br>Source : `apps/windows/src/DesktopSettings.tsx` | « Affichage » (Premier jour ; Format 24 h ; Défilement libre ; Rappel ; Mode de trajet ; Application de cartes ; Nouveaux évènements en tâches) ; « Intégrations » (Calendriers) ; « Données » (Dossier) ; « Application » (Rechercher les mises à jour ; Ancienne interface (WebView)) ; `v1.83.1` <br>Source : `ui/SettingsScreen.kt:128` | **ECART** Reprendre les groupes, l'ordre et les libellés de l'ancienne ; ajouter les lignes manquantes (voir Fonctions manquantes) ; garder « Rechercher les mises à jour » (la version se retrouve dans l'ancienne par la pastille du tiroir) |
| Icônes de ligne | Premier jour : `calendar-range` ; 24 h : `timer` ; clic mois : `calendar-clock` ; défilement libre : `columns-2` ; Rappel : `bell` ; trajet : `route` ; cartes : `map` ; tâches : `check` ; vue ordinateur : `monitor` ; téléphone : `smartphone` ; thème : `palette` ; mode : `moon` ; langue : `languages` ; calendriers : `calendar-days` ; fuseaux : `globe` ; dossier : `folder-open` ; coffres : `library` ; synchro : `refresh-cw` ; retour : `arrow-left` ; chevron : `chevron-right` <br>Source : `apps/windows/src/DesktopSettings.tsx` (imports `lucide-react`) | Premier jour `calendar` ; 24 h `clock` ; défilement libre **`chevron-right`** (anomalie visible) ; Rappel `bell` ; trajet `navigation` ; cartes `map-pin` ; tâches `check` ; calendriers `calendar` ; dossier `folder-open` ; mises à jour `refresh-cw` <br>Source : `ui/Icons.kt:12`, `ui/SettingsScreen.kt:132` | **ECART** Ajouter à `NeoIcons` les icônes `calendar-range`, `timer`, `columns-2`, `route`, `map`, `monitor`, `smartphone`, `palette`, `moon`, `languages`, `calendar-days`, `globe`, `library`, `arrow-left`, `calendar-clock` (tracés Lucide 24x24, comme `lucide()` dans `Icons.kt`) |
| Dialogue de choix (jour, trajet, cartes, mode, langue) | `nc-choice-dialog` 300 de large centré : fond `rgb(30,30,46)`, bord 1 px `rgba(198,208,245,0.22)`, rayon 12, ombre `0 14px 28px -6px rgba(0,0,0,.4), 0 2px 6px -1px rgba(0,0,0,.22)`, flou 28 px, padding `6 4 4`, titre 15 px / 600 (marge `4 0 6`, padding `0 10`) ; options 40 dp rayon 6 padding `7 10` ; choisie : accent + coche 16 ; voile `rgba(8,9,18,.72)` flou 6 px (padding 24) ; entrée 0,16 s `cubic-bezier(.2,.7,.3,1)` <br>Source : `apps/android/src/mobile.css:485` | `ChoiceDialog` : `AlertDialog` Material 3 <br>Source : `ui/CalendarDialogs.kt:164` | **ECART** Reproduire la carte ci-contre |
| Page Apparence | Thème : aperçu 24x24 (rayon 7, « A » accent) + « Catppuccin » ; Importer un thème (`upload`) ; Copier le thème (`copy`) ; **Couleurs** : Accentuation `#658FF2`, Arrière-plan `#1E1E2E`, Avant-plan `#C6D0F5` (pastilles rondes 20, valeur 13 px interlettrage .26) et Contraste (curseur 60) ; **Image de fond** : vignette 30x22 « Sommet sous les étoiles », Luminosité du fond (0,70), Flou du fond (5), Opacité des conteneurs (0,40), Barre latérale translucide (interrupteur) ; **Polices** : interface (`type`) et monospace (`code-xml`) en champs de texte (38 dp, rayon 10, fond `rgba(57,58,78,.7)`) ; Enregistrer (`save`), Réinitialiser ce thème (`rotate-ccw`) ; curseurs `input[type=range]` 22 dp accent `#658ff2` <br>Source : `apps/windows/src/App.css:3490`, `mobile.css:3573`, `apps/windows/src/App.css:4801`, `apps/windows/src/App.css:4802` | Absente <br>Source : Plan v1 « Écarts de la v1 », Réglages (T5) | **ECART** Page à créer (voir Fonctions manquantes : thème, couleurs, fond d'écran, effets, polices) |
| Mode de couleur | Dialogue : Système (`smartphone`), Clair (`sun`), Sombre (`moon`), défaut Sombre <br>Source : `src/ui/calendar/themes`, `apps/windows/src/themes/appearancePreferences.ts` | Absent (sombre fixe) <br>Source : Plan v1 « Écarts de la v1 », Réglages (T5) | **ECART** Ajouter le dialogue et un thème clair |
| Langue | Dialogue : Français / English (clé `neo-calendar.language`, rechargement) <br>Source : `src/ui/i18n.ts:21` | Français fixe (`AppLocale.current`) <br>Source : `AppLocale.kt` | **ECART** Ajouter le dialogue et un jeu de textes anglais |
| Fuseaux horaires | Page : champ « ex. America/New_York » + bouton « + », note « Une colonne d'heures supplémentaire apparaît dans les vues semaine, jour et trois jours. » ; fuseaux ajoutés listés avec suppression <br>Source : `apps/windows/src/DesktopSettings.tsx` | Absent <br>Source : Plan v1 « Écarts de la v1 », Réglages (T5) | **ECART** Voir Fonctions manquantes |
| Synchronisation et Coffres Obsidian | Synchronisation : dialogue d'information (Dossier de données, méthodes Syncthing recommandé / stockage en ligne / transfert manuel) ; Coffres Obsidian : page « Ajouter un dossier » (aucun effet utile sur téléphone) <br>Source : `apps/windows/src/DesktopSettings.tsx` | Absents <br>Source : aucun | **ECART** Reproduire la Synchronisation (texte pur) ; Coffres Obsidian : rien (page inerte sur téléphone) |
| Pages Calendriers et Rappel | Page Calendriers (liste, couleur, rappel, liens ICS) ; dialogue Rappel (liste des délais cochables + personnalisé) <br>Source : `apps/windows/src/ReminderChoiceDialog.tsx` | Page « Calendriers » (nom, point de couleur, « Rappel : ... ») + `ReminderDialog` <br>Source : `ui/SettingsScreen.kt:156` | **ECART** Habillage seul |

## 17. Widget

Captures de l'ancienne : voir la note.  
Écarts : **1** sur 3 lignes.

Le widget n'a pas de capture dédiée dans ce relevé (pas de widget posé sur l'émulateur) : les deux interfaces écrivent la même charge `WidgetData` et le même fournisseur la dessine. Non capturé : aucun widget n'est posé sur l'émulateur ; valeurs tirées du code.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Habillage et mise en page | `NeoCalendarWidget` + `res/layout`, `drawable/widget_*` (carte, barre de couleur, point, « + ») communs aux deux interfaces <br>Source : `apps/android/native/app/src/main/res/drawable/widget_card.xml` | Les mêmes ressources <br>Source : idem | OK. Rien |
| Contenu | Au plus 60 lignes sur 30 jours (`MAX_ROWS = 60`), calendriers choisis à la pose (activité de configuration), pas de lieu <br>Source : `apps/windows/src/platform/androidWidget.ts:21` | `buildWidgetPayload` du noyau : fenêtre = le mois à venir, **lieu affiché sous l'heure** (écart T8 du plan) <br>Source : `NativeWidget.kt:8` | **ECART** Retirer le lieu pour coller à l'ancienne, ou décision d'Ahmed |
| Appui sur une ligne / sur « + » | Ouvre la fiche / un brouillon (route `new-event`) <br>Source : `MainActivity.java` | Idem (`NativeRoute`) <br>Source : `ui/NativeScreen.kt:203` | OK. Rien |

## 18. Écran de démarrage et premier lancement

Captures de l'ancienne : voir la note.  
Écarts : **2** sur 3 lignes.

Non capturé (ni le premier lancement sans dossier, ni le splash) : valeurs cibles tirées du CSS / TSX et des ressources.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Écran de lancement système | Thème `Theme.NeoCalendar` : fond `#11111B`, splash système (v31) fond `#0B1125` et icône animée `splash_icon`, jusqu'à l'événement `neo-calendar-ready` (la couche de fond d'écran attend la photo, `useStartupReveal`) <br>Source : `apps/android/native/app/src/main/res/values-v31/themes.xml:1` | Même thème et même splash ; retenu jusqu'à la lecture du dossier (1,5 s au plus) <br>Source : `NativeActivity.kt:73` | OK. Rien |
| Premier lancement sans dossier | Carte d'accueil `nc-welcome` : repère 62x62, titre « Neo Calendar » (32 à 42 px), texte 15 px / 1,55 « Choisissez le dossier de données de Neo Calendar. », bouton plein largeur 52 dp rayon 14 « Choisir le dossier » (icône `folder-open` 18), message d'erreur 12 px <br>Source : `apps/windows/src/App.css:151`, `mobile.css:103`, `apps/windows/src/App.css:209`, `mobile.css:114` | Écran d'erreur « Sélectionnez d'abord un dossier de notes. » avec le seul bouton « Réessayer » : **aucun moyen de choisir le dossier avant d'avoir une grille** <br>Source : `ui/NativeScreen.kt:140` | **ECART** Écran d'accueil avec « Choisir le dossier » (sélecteur `ACTION_OPEN_DOCUMENT_TREE` déjà présent dans `NativeScreen.kt`) |
| Attente de lecture | Page cachée tant que le dossier n'est pas lu (`nc-desktop--booting`), puis révélée ; jamais de grille vide <br>Source : `apps/windows/src/useStartupReveal.ts` | Spinner `CircularProgressIndicator` accent au centre pendant `Loading` <br>Source : `ui/NativeScreen.kt:130` | **ECART** Garder le splash système jusqu'à la grille remplie, pas de spinner |

## 19. Fond d'écran, effets et surfaces translucides

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`, `.superpowers/parite/parite-ancien-34-reglages-theme.png`, `.superpowers/parite/parite-ancien-web-grid.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **5** sur 5 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Couche de fond | `#nc-wallpaper-render-layer` : `position: fixed; inset: -36px; transform: scale(1.04)`, image **portrait** `starlit-snow-peak-portrait.jpg` (cover, centrée), recouverte de `linear-gradient(rgba(30,30,46,.16), rgba(30,30,46,.24))`, `background-color #1e1e2e` (repli), `filter: brightness(0.7) blur(5px)`, `will-change: filter` ; sous elle le `body::before` `#11111b` ; thème : `--nc-wallpaper-overlay` `linear-gradient(rgba(13,15,28,.46) x2)` <br>Source : `apps/windows/src/WallpaperRenderLayer.tsx:1`, `apps/windows/src/themes/catppuccin-mocha.css:40` | Aucun fond d'écran : `Neo.Background` `#11111B` uni <br>Source : `ui/NativeScreen.kt:127` | **ECART** Ajouter la couche : image en ressource ou lue dans le dossier de données (`.neo-calendar/wallpapers/`), cover, échelle 1,04, flou 5 px (`Modifier.blur` ou `RenderEffect`), luminosité 0,7 (filtre de couleur), voile 16 % puis 24 % |
| Effets réglables | `WALLPAPER_EFFECTS` : luminosité 0 à 1 (défaut **0,7**), flou 0 à 20 px (défaut **5**), opacité des conteneurs 0 à 1 (défaut **0,4**), stockés en `localStorage` `neo-calendar-wallpaper-effects-v1` <br>Source : `apps/windows/src/themes/wallpaperEffects.ts:12` | Absents <br>Source : Plan v1 « Écarts de la v1 », Réglages (T5) | **ECART** Réglages ci-dessus (écran 16) |
| Opacité des conteneurs | Barre du haut, gouttière, grille : `rgba(30,30,46, opacité)` (0,40 par défaut, même valeur pour tous) ; ruban latéral `min(1 ; opacité + 0,14)` = 0,54 ; tiroir, listes, fiche, réglages, dialogues : **opaques** (surcharges Android) <br>Source : `apps/windows/src/themes/wallpaperEffects.ts:135` | Surfaces toutes opaques (`#11111B`, `#1E1E2E`) <br>Source : `ui/Theme.kt:16` | **ECART** Barre, gouttière et grille à 40 % |
| Catalogue | Une vingtaine de fonds (paires paysage / portrait + 40 vignettes dans `themes/neo-wallpapers/`, 31 Mo en tout), défaut `starlit-snow-peak` ; sur Android les photos sont téléchargées dans le dossier de données (`WallpaperStore.java`) ; sélecteur `ThemeWallpaperPicker.tsx` <br>Source : `apps/windows/src/themes/wallpapers.ts:220` | Aucun <br>Source : aucun | **ECART** Voir Fonctions manquantes |
| Polices | Calendrier (barre, tiroir, grille, fiche) : pile `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif` donc **Roboto** sur téléphone ; Réglages, dialogues (ICS, ajout, couleur, choix, tâches) : `"Inter Variable", Inter, ...` (Inter embarquée par `@fontsource-variable/inter`) ; géométrie 29 px / 750 du titre du mois <br>Source : `apps/windows/src/themes/fonts.css:55`, `apps/android/src/main.tsx:7` | Police système partout (Roboto / Google Sans Flex) <br>Source : `ui/Theme.kt:44` | **ECART** Embarquer Inter Variable (< 1 Mo) pour les écrans Inter ; poids 520 / 540 / 650 / 750 en variable |

## 20. Barres système

Captures de l'ancienne : `.superpowers/parite/parite-ancien-01-grille.png`  
Captures de la nouvelle : `.superpowers/parite/parite-nouveau-01-grille.png`  
Écarts : **1** sur 2 lignes.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Barre d'état et de navigation | `setStatusBarColor/NavigationBarColor(TRANSPARENT)`, contraste forcé coupé, `setDecorFitsSystemWindows(false)` : les barres laissent voir le fond d'écran, icônes claires <br>Source : `apps/android/native/app/src/main/java/com/ahmed/neocalendar/MainActivity.java:78` | `enableEdgeToEdge(SystemBarStyle.dark(0xFF11111B))` : barres pleines `#11111B` <br>Source : `NativeActivity.kt:32` | **ECART** Barres transparentes sur le fond d'écran (`SystemBarStyle.dark(Color.TRANSPARENT)`), contraste forcé coupé |
| Clavier | Fiche de hauteur naturelle ancrée en haut : l'espace restant dessous est celui du clavier (`mobile.css:3832`) <br>Source : `apps/android/src/mobile.css:3832` | `imePadding` et feuille mesurée dans ce qui reste <br>Source : `ui/SheetFrame.kt:64` | OK. Rien |

## 21. Textes et orthographe

Captures de l'ancienne : voir la note.  
Écarts : **3** sur 5 lignes.

Non capturé : relevé de textes tiré des fichiers `i18n.ts`, `DesktopSettings.tsx` et du code natif.

| Élément | Ancienne (valeur exacte + source) | Nouvelle (valeur actuelle + source) | À faire |
|---|---|---|---|
| Évènement / Événement | Interface : « Événement » (accent aigu) dans le type de fiche, « Rechercher un événement », « Toute la journée », « Cet événement » ... (fichier `i18n.ts`) <br>Source : `src/ui/i18n.ts:418` | « Évènement », « Nouvel évènement », « évènements » (accent grave) partout <br>Source : `rg "vènement" apps/android/native/app/src/main/java` | **ECART** Passer à l'orthographe de l'ancienne (« événement ») dans tous les textes de `nativeapp` |
| Libellés de la barre | « Week 40 », « October » (clés absentes du dictionnaire français) ; sinon français <br>Source : `src/ui/i18n.ts` | « Semaine 40 », « Octobre » <br>Source : `ui/TopBar.kt:88` | OK. Garder le français (décision à confirmer) |
| Chaînes restées en anglais dans l'ancienne | « 1 day / 2 days / 3 days », « Cancel » (recherche), « Open folder », « Today » (sélecteur de date), « No events found », « Event details » (étiquette d'accessibilité), « To do / Complete » (accessibilité) <br>Source : `src/ui/i18n.ts` | Français <br>Source : idem | OK. Garder le français |
| Réglages : libellés | « Paramètres », « Vue du calendrier », « Format 24 heures », « Nouveaux événements créés comme des tâches » <br>Source : `apps/windows/src/DesktopSettings.tsx` | « Réglages », « Affichage », « Format 24 h », « Nouveaux évènements en tâches » <br>Source : `ui/SettingsScreen.kt:129` | **ECART** Reprendre les libellés de l'ancienne |
| Messages d'erreur et de confirmation | Bulle `nc-desktop-notice` en bas (fond `rgb(30,30,46)`, rayon 10, padding `10 14`, 12 px, ombre `0 14px 42px rgba(0,0,0,.45)`) et bandeau d'erreur `nc-desktop-storage-status--error` (texte `rgb(243,139,168)`, rayon 11, ombre `0 16px 44px rgba(0,0,0,.38)`) <br>Source : `apps/windows/src/App.css:692`, `apps/windows/src/App.css:693` | `Toast` Android pour les erreurs d'écriture et les confirmations ; bandeau rouge `Neo.Today` 85 % pour une relecture en échec <br>Source : `ui/NativeScreen.kt:178` | **ECART** Reproduire les deux bulles (en Compose, à la place de `Toast`) |

## 22. Palette et jetons du thème par défaut (Catppuccin Mocha)

Sources : `apps/windows/src/themes/catppuccin-mocha.css:1-48`, `apps/windows/src/themes/wallpaperEffects.ts`, surcharges Android dans `apps/android/src/mobile.css`. Constantes natives : `ui/Theme.kt` (`object Neo`).

| Jeton | Ancienne (valeur lue) | Nouvelle constante | À faire |
|---|---|---|---|
| Surface (`--background-primary`, `--nc-bg-primary`) | `rgb(30,30,46)` `#1E1E2E` | `Neo.Surface` `#1E1E2E` | OK. |
| Fond secondaire (`--background-secondary`, tiroir, réglages, liste d'un calendrier) | `rgb(24,24,37)` `#181825` | aucune (le tiroir prend `Neo.Surface`) | Ajouter `Neo.Mantle = #181825`. |
| Fond de page (`--nc-bg-crust`) | `rgb(17,17,27)` `#11111B` (derrière le fond d'écran) | `Neo.Background` `#11111B` | OK. |
| Fond des lignes de réglage | `rgb(19,19,29)` `#13131D` | aucune | Ajouter `Neo.SettingRow`. |
| Survol / appui / ligne active (`--background-modifier-hover`, `--nc-surface-hover`) | `rgb(49,50,68)` `#313244` | `Neo.Hover` `0x14FFFFFF` (blanc 8 %) | Passer à `#313244` pour les lignes et le jour actif ; 8 % blanc pour les boutons de barre. |
| Bordure (`--background-modifier-border`) | `rgba(108,112,134,0.28)` | `Neo.Border` `0x14FFFFFF` | Passer à `0x476C7086`. |
| Bordure forte (dialogues, cartes) | `rgba(198,208,245,0.22)` | aucune | Ajouter. |
| Texte (`--text-normal`) | `rgb(198,208,245)` `#C6D0F5` | `Neo.Text` `#C6D0F5` | OK. |
| Texte secondaire (`--text-muted`) | `rgb(161,168,201)` `#A1A8C9` | `Neo.TextSecondary` `#A6ADC8` | Passer à `#A1A8C9`. |
| Texte discret (`--text-faint`) | `rgb(105,109,134)` `#696D86` | `Neo.TextFaint` `#6C7086` | Passer à `#696D86`. |
| Libellés clairs (semaine, jours, étiquettes d'heure) | `rgb(214,221,248)` `#D6DDF8` | aucune | Ajouter. |
| Réglages : valeurs, titres | `rgb(151,158,189)` `#979EBD` ; chevrons et notes `rgb(117,123,149)` `#757B95` | `TextSecondary` / `TextFaint` | Ajouter ces deux gris. |
| Accent (`--interactive-accent`, `--nc-accent`) | `#658FF2` | `Neo.Accent` `#658FF2` | OK. |
| Texte sur accent (`--text-on-accent`) | `rgb(30,30,46)` `#1E1E2E` | `onPrimary = Neo.Background` `#11111B` | Passer à `#1E1E2E` (bouton +, boutons pleins, jour choisi). |
| Aujourd'hui | `#F15550` (grille, en-tête du jour), `#F5544F` (pastille de la barre) | `Neo.Today` `#F5544F` | Utiliser `#F15550` pour le rond du jour et la ligne de l'heure. |
| Erreur / danger (`--text-error`) | `rgb(243,139,168)` `#F38BA8` ; retard de tâche `rgb(229,83,75)` `#E5534B` | `Neo.Today` rouge | Ajouter `#F38BA8` et `#E5534B`. |
| Tâches : à faire / terminé | `rgb(233,151,63)` `#E9973F` (pointillé) / `rgb(47,158,68)` `#2F9E44` (disque) | accent / gris | Ajouter. |
| Lignes de grille (Android) | `rgba(155,160,185,0.17)` ; demi-heure `0.06` non dessinée | `0x1AFFFFFF` | Passer à `0x2B9BA0B9`. |
| Brouillon | `#4AABE0` bord 2 px, fond 18 % | aucun | Ajouter. |
| Calendriers de l'appareil | Islam `#006400`, Etudes `#0036B2`, Essai Compose `#72C8EE` | lus du fichier | OK. |
| Rayon des cartes, ombre du thème | `--nc-card-radius` 22 ; `--nc-shadow` `0 8px 24px rgba(17,17,27,.32)` | 22 dp pour la feuille | OK. |

## 23. Fonctions manquantes (présentes dans l'ancienne, absentes ou partielles dans la nouvelle)

Pour chacune : ce qu'elle fait, ses sources, ce que la nouvelle a aujourd'hui. Ahmed cite le fond d'écran ; la recherche dans le code a trouvé les autres.

1. **Fond d'écran**
   - Ce que fait l'ancienne : Une photo (défaut `starlit-snow-peak`, version portrait) peinte derrière toute l'interface : plein cadre, échelle 1,04, voile de la couleur du thème à 16 % puis 24 %, luminosité 0,7 et flou 5 px ; les conteneurs de la grille sont translucides (0,4) pour la laisser voir. Sur Android les photos ne sont pas dans l'APK : elles se téléchargent une à une dans `.neo-calendar/wallpapers/` (SHA-256 vérifié, événement `neo-wallpaper-done`), et le fond du thème s'affiche tant qu'elle n'y est pas. Sélecteur à vignettes avec crédit de la photo.
   - Sources : `apps/windows/src/WallpaperRenderLayer.tsx`, `apps/windows/src/themes/wallpapers.ts`, `apps/windows/src/ThemeWallpaperPicker.tsx`, `apps/windows/src/themes/wallpaperDownload.ts`, `apps/windows/src/themes/wallpaperBatch.ts`, `apps/windows/src/themes/wallpaperCredit.ts`, `apps/windows/src/themes/useWallpaperReady.ts`, `apps/android/native/app/src/main/java/com/ahmed/neocalendar/WallpaperStore.java`
   - Dans la nouvelle : Aucune. `WallpaperStore.java` (Java, déjà dans l'APK) sait lire, installer et lister les fonds : le natif peut le réutiliser tel quel.

2. **Réglages du fond : luminosité, flou, opacité des conteneurs**
   - Ce que fait l'ancienne : Trois curseurs (luminosité 0-1 défaut 0,7 ; flou 0-20 px défaut 5 ; opacité des conteneurs 0-1 défaut 0,4), appliqués en direct, plus l'interrupteur « Barre latérale translucide » (ruban à opacité + 0,14).
   - Sources : `apps/windows/src/themes/wallpaperEffects.ts`, `apps/windows/src/WallpaperEffectsControls.tsx`
   - Dans la nouvelle : Aucune.

3. **Thèmes et apparence**
   - Ce que fait l'ancienne : 14 thèmes (`THEME_IDS` : catppuccin-mocha par défaut, tokyo-night, absolutely, ayu, github, linear, lobster, matrix, one, oscurange, raycast, rose-pine, vercel, vscode-plus), choix du thème, accent / arrière-plan / avant-plan personnalisables (sélecteur de couleur), contraste 0-100, polices d'interface et de code, import (fichier) et copie (presse-papiers) d'un thème, « Réinitialiser ce thème ». Stockage par thème dans `neo-calendar.appearance`.
   - Sources : `apps/windows/src/themes/registry.ts`, `apps/windows/src/themes/codex-themes.css`, `apps/windows/src/themes/appearancePreferences.ts`, `apps/windows/src/ThemeColorPicker.tsx`, `apps/windows/src/DesktopSettings.tsx`
   - Dans la nouvelle : Aucune : thème Catppuccin Mocha figé en constantes (`ui/Theme.kt`).

4. **Mode de couleur (Système / Clair / Sombre)**
   - Ce que fait l'ancienne : `mode` = `system`, `light` ou `dark` (défaut `dark`), résolu par `prefers-color-scheme` ; les thèmes ont une variante claire.
   - Sources : `apps/windows/src/themes/appearancePreferences.ts`
   - Dans la nouvelle : Aucune (sombre uniquement).

5. **Langue (Français / English)**
   - Ce que fait l'ancienne : `setLanguage` mémorise `neo-calendar.language` et recharge ; dictionnaire `FR` clé anglaise vers français, repli sur la clé.
   - Sources : `src/ui/i18n.ts`
   - Dans la nouvelle : Français fixe (`AppLocale.current`, `values-fr`). Pas de réglage.

6. **Fuseaux horaires**
   - Ce que fait l'ancienne : Réglage `secondaryTimezones` : colonnes d'heures supplémentaires dans la gouttière (`TimezoneColumn`), coin « GMT+2 » avec le décalage principal, sélecteur de fuseau, et invite lorsque le fuseau de l'appareil a changé (`TimezoneChangePrompt`, `timezoneDrift`).
   - Sources : `src/ui/calendar/TimezoneColumn.tsx`, `src/ui/calendar/TimezonePicker.tsx`, `src/ui/calendar/TimezoneChangePrompt.tsx`, `src/ui/calendar/timezoneDrift.ts`, `src/ui/calendar/useTimezoneDrift.ts`, `src/ui/calendar/timezoneModals.tsx`
   - Dans la nouvelle : Aucune.

7. **Ligne de la prochaine prière / horaires de prière**
   - Ce que fait l'ancienne : Sur le calendrier nommé « Islam », avec une mosquée choisie (`PrayerMosqueDialog`, entrée « Horaires de prière » du menu de ligne), les cinq prières du jour sont tracées en travers de la grille (trait 2 px de la couleur `prayerColors`, filet 1 px à 30 %, étiquette d'heure dans la gouttière) ; la Jumu'a du vendredi est animée (reflet `nc-prayer-shimmer`) et se choisit par `JumuaChoiceDialog` ; mise à jour chaque minute. Aucun rappel de prière sur le téléphone.
   - Sources : `src/ui/calendar/prayerTimes.ts`, `src/ui/calendar/prayerCalendarName.ts`, `src/ui/calendar/prayerTimetables/index.ts`, `apps/windows/src/PrayerMosqueDialog.tsx`, `apps/windows/src/JumuaChoiceDialog.tsx`, `src/ui/calendar/TimeGridSections.tsx`
   - Dans la nouvelle : Aucune.

8. **Mise en forme de la description**
   - Ce que fait l'ancienne : Éditeur riche (`androidDescriptionEditor.ts`) avec barre au-dessus du clavier : gras, italique, souligné, liste, liste numérotée, cases à cocher, annuler, rétablir, ajout de lien (`DescriptionAddLinkDialog`), liens en ligne, mention d'une note ; la description est sérialisée en Markdown.
   - Sources : `apps/android/src/androidDescriptionEditor.ts`, `apps/android/src/descriptionToolbar.css`, `src/ui/calendar/DescriptionSection.tsx`, `src/ui/calendar/descriptionFormatting.ts`, `src/ui/calendar/descriptionChecklist.ts`, `src/ui/calendar/DescriptionAddLinkDialog.tsx`, `src/ui/calendar/descriptionInlineLinks.ts`
   - Dans la nouvelle : Texte brut éditable ; les cases `- [ ]` sont rendues (lecture, bascule) ; pas de barre ni d'ajout de lien (écart v1).

9. **Pièces jointes**
   - Ce que fait l'ancienne : Bouton trombone : choix de fichiers (`pickFiles`), copie dans le dossier du calendrier (`copy_desktop_attachment`), collage d'un fichier dans la description (`pastedAttachment.ts`), lecture / ouverture.
   - Sources : `src/ui/calendar/pastedAttachment.ts`, `apps/android/src/platform/bridge.ts`
   - Dans la nouvelle : Les liens et pièces jointes déjà présents sont listés et ouvrables ; aucun ajout.

10. **Aperçu du brouillon et poignées**
   - Ce que fait l'ancienne : Encadré 2 px `#4aabe0` rempli à 18 % sur le créneau, deux poignées rondes (14 dp, zone 44 dp), fondu 180 ms.
   - Sources : `src/ui/calendar/DraftPreview.tsx`, `apps/android/src/draftPreview.css`, `src/ui/calendar/draftPreviewBox.ts`
   - Dans la nouvelle : Aucun aperçu (écart v1).

11. **Glisser un évènement vers ou depuis la bande « journée entière »**
   - Ce que fait l'ancienne : Le déplacement d'un bloc se projette sur la bande (et inversement) : l'évènement devient « toute la journée » ou reprend l'heure du créneau.
   - Sources : `src/ui/calendar/useTimeGridDrag.ts`, `src/ui/calendar/dragProjection.ts`
   - Dans la nouvelle : Non pris en charge (écart v1).

12. **Enregistrement au fil de l'eau**
   - Ce que fait l'ancienne : Toute modification du formulaire est écrite (avec dialogue de portée pour une série) ; il n'y a ni bouton « Enregistrer » ni dialogue d'abandon.
   - Sources : `src/ui/calendar/useEventFormState.ts`, `src/ui/calendar/useEventPanel.ts`
   - Dans la nouvelle : Bouton « Enregistrer » et dialogue « Enregistrer les modifications ? » (écart v1 consigné, `EventSheet.kt`).

13. **Occurrence précédente / suivante d'une série**
   - Ce que fait l'ancienne : Flèches dans la fiche d'une série pour passer d'une occurrence à l'autre.
   - Sources : `src/ui/calendar/seriesNavigation.ts`
   - Dans la nouvelle : Absentes (écart v1).

14. **« N'afficher que ce calendrier » (solo)**
   - Ce que fait l'ancienne : Entrée de menu (tiroir et liste du calendrier) qui masque tous les autres, et « Afficher les calendriers précédents » pour rétablir.
   - Sources : `src/ui/calendar/useCalendarVisibility.ts`, `src/ui/calendar/CalendarSidebar.tsx`
   - Dans la nouvelle : Absente (écart v1).

15. **Liste d'un calendrier : filtres, totaux, menu, ajout**
   - Ce que fait l'ancienne : Filtres Statut / Date / Liens ICS, « Afficher les totaux », menu « ... » (Couleur, Définir par défaut, N'afficher que cette vue, Rappel, Liens ICS, Retirer la vue), bouton « + » qui crée dans ce calendrier.
   - Sources : `src/ui/calendar/CalendarEventsPanel.tsx`, `src/ui/calendar/CalendarEventsPanel.helpers.ts`
   - Dans la nouvelle : Recherche seule (écart v1).

16. **Types de calendrier et lien ICS à la création**
   - Ce que fait l'ancienne : La feuille « Ajouter un calendrier » propose « Dossier de notes » et « Jours fériés » (lecture seule, calculés sur l'appareil) et un lien ICS facultatif ; menu « Modifier le lien » pour un calendrier iCal.
   - Sources : `apps/windows/src/AddCalendarDialog.tsx`, `apps/windows/src/platform/desktopExternalCalendars.ts`
   - Dans la nouvelle : Création par un simple nom (écart v1).

17. **Réglages absents**
   - Ce que fait l'ancienne : Vue initiale ordinateur / téléphone, « Créer un événement en cliquant un jour du mois », « Reconvertir les tâches horaires en événements », fréquence ICS par défaut + « Appliquer à tous les liens », Coffres Obsidian (inerte sur téléphone), Synchronisation (information).
   - Sources : `apps/windows/src/DesktopSettings.tsx`, `apps/windows/src/platform/desktopWorkspacePreferences.ts`
   - Dans la nouvelle : Aucun de ces réglages.

18. **Sélecteurs de date et d'heure de la fiche**
   - Ce que fait l'ancienne : Popover de date en français (jours, flèches, « Retirer la date », « Aujourd'hui ») et saisie de l'heure en place (aucun dialogue système).
   - Sources : `src/ui/calendar/EventDateControls.tsx`, `src/ui/calendar/EventDateControls.css`
   - Dans la nouvelle : `DatePickerDialog` et `TimePickerDialog` du système, en anglais (« Wed, Sep 2 », CANCEL / OK).

19. **Pastille de l'heure actuelle et fuseau principal**
   - Ce que fait l'ancienne : Pastille rouge « 06:59 » dans la gouttière et coin « GMT+2 » dans l'angle.
   - Sources : `src/ui/calendar/TimeGridSections.tsx`
   - Dans la nouvelle : Absents.

20. **Premier lancement : choix du dossier**
   - Ce que fait l'ancienne : Carte d'accueil avec « Choisir le dossier ».
   - Sources : `apps/windows/src/App.tsx`
   - Dans la nouvelle : Écran d'erreur sans moyen de choisir un dossier avant d'avoir une grille (`FailedScreen`).

**Fonctions présentes des deux côtés (pour mémoire, rien à faire)** : changer le nombre de jours (1 à 60), défilement d'un jour exact et défilement libre, pincement 32 à 320, tiroir à glissé, recherche, listes de tâches, rappels et notifications, liens ICS (5 par calendrier, fréquence, actualiser), ouvrir dans les cartes (Google Maps, Citymapper, Moovit, Waze et applications `geo:`), répétition personnalisée, widget, mise à jour de l'application (pastille), déplacement et redimensionnement des blocs, cases de tâche sur les blocs, rechargement du dossier au retour.

**À ne pas reproduire** : l'entrée « Open folder » du menu de ligne (sans effet sur Android : `open_desktop_path` renvoie `null`, `MainActivity.java`), le rendu des heures de la fiche en 12 h malgré le réglage 24 h, et les chaînes laissées en anglais (écran 21).

## 24. Effet de débordement de la grille (étirement Android)


### Comment la grille défile aujourd'hui

- **Pas de `verticalScroll`, pas de `scrollable`, pas de `nestedScroll`.** La position verticale est un état maison, `GridState.scrollY` (`ui/GridState.kt`), lu à la mise en page et au dessin : `HourRail` et `GridBackground` sont des `Canvas`, `DayColumns` place chaque colonne à `-scrollY` dans un `Layout` (`ui/TimeGrid.kt`, lignes 98 à 108).
- Le doigt est lu par `Modifier.gridDrag(...)` (`GridState.kt`, `fun Modifier.gridDrag`) : un `pointerInput` / `awaitEachGesture` qui attend le seuil (`awaitTouchSlopOrCancellation`), choisit l'axe, puis appelle `state.dragY(delta)`, qui **clampe** aussitôt `scrollY` entre 0 et `maxScroll`. Au lâcher, `flingY` lance un `AnimationState.animateDecay(rememberSplineBasedDecay())` qui s'**annule** dès qu'une borne est atteinte (`if (clamped != value) cancelAnimation()`).
- Rien ne sait donc qu'on tire « au-delà » : le delta est jeté, et la grille ne bouge pas. Constaté sur l'émulateur (API 37) : `parite-nouveau-40-grille-debordement-haut.png` (grille à 00:00, doigt tiré vers le bas pendant 2,8 s : aucun étirement).
- Seule la bande « journée entière » utilise `verticalScroll(rememberScrollState())` (`ui/AllDayBand.kt`) et les Réglages aussi (`ui/SettingsScreen.kt`) : eux **ont déjà** l'effet par défaut. Preuve : `parite-nouveau-41-reglages-debordement-haut.png` (liste étirée, espacement des lignes qui croît vers le bas).
- L'ancienne interface n'avait **pas** cet effet : `overscroll-behavior: none` sur `.nc-main-scroller` (`mobile.css:3130` et `mobile.css:3183`, commentaire : l'étirement déplacerait la grille peinte sans changer `scrollTop` et désynchroniserait le clip du haut). La demande d'Ahmed est donc un ajout, pas une parité.

### Ce que fournit Compose (vérifié dans la bibliothèque du projet)

BOM `2026.09.00` : `androidx.compose.foundation:foundation` **1.12.1** (`compose-bom-2026.09.00.pom`, ligne 114 ; `foundation-android-1.12.1` est dans le cache Gradle). Lu par `javap` sur `classes.jar` de l'AAR :

- `interface androidx.compose.foundation.OverscrollEffect` : `applyToScroll(delta: Offset, source: NestedScrollSource, performScroll: (Offset) -> Offset): Offset`, `suspend applyToFling(velocity: Velocity, performFling: suspend (Velocity) -> Velocity)`, `isInProgress: Boolean`, `node` / `effectModifier`.
- `@Composable fun rememberOverscrollEffect(): OverscrollEffect` et `fun Modifier.overscroll(overscrollEffect: OverscrollEffect): Modifier` (`OverscrollKt`).
- `val LocalOverscrollFactory: ProvidableCompositionLocal<OverscrollFactory>` (remplace `LocalOverscrollConfiguration`, dont la classe `OverscrollConfiguration` subsiste), `interface OverscrollFactory { createOverscrollEffect() }`, `rememberPlatformOverscrollFactory(glowColor, glowDrawPadding)`.
- `Modifier.scrollable(state, orientation, overscrollEffect, enabled, reverseDirection, flingBehavior, interactionSource, bringIntoViewSpec)` (surcharge à `overscrollEffect`).
- Implémentations : `StretchOverscrollNode` (Android 12 et plus : étirement, celui des Réglages natifs d'Android) et `GlowOverscrollNode` (en dessous). `minSdk` du projet est 26 : les API 26 à 30 auraient la lueur, pas l'étirement, sauf `LocalOverscrollFactory` fourni explicitement. La page développeur « Scroll modifiers » confirme que l'effet par défaut vient de `LocalOverscrollFactory` et qu'un `OverscrollEffect` explicite se passe en paramètre (les pages de référence détaillées de l'API n'ont pas pu être lues par l'outil de lecture web : les signatures ci-dessus viennent des classes de la bibliothèque).

### Ce qu'il faut pour l'avoir sur la grille

Deux montages, du plus simple au plus fidèle (aucun n'est codé ici) :

1. **Remplacer l'axe vertical de `gridDrag` par `scrollable`.** Dans `TimeGridArea`, créer `val effect = rememberOverscrollEffect()` ; sur la `Row` des heures et colonnes (`ui/TimeGrid.kt:178-202`) poser `Modifier.overscroll(effect)` puis `Modifier.scrollable(state = rememberScrollableState { delta -> ... }, orientation = Vertical, overscrollEffect = effect)`. Le `ScrollableState` appelle `GridState.dragY(-delta)` et rend la part réellement consommée (l'écart entre `scrollY` avant et après le clamp) : le reste, c'est le débordement que l'effet affiche. Le `flingBehavior` par défaut fait déjà un décroissement à spline et appelle `applyToFling` aux bornes ; le `verticalJob` / `flingY` maison disparaît. L'axe horizontal garde `gridDrag(vertical = false)` ; vérifier à l'émulateur que les deux gestes ne se disputent pas (le seuil et le choix d'axe de `gridDrag` sont aujourd'hui communs).
2. **Garder `gridDrag` et brancher l'effet à la main.** Dans la boucle `drag { }` du cas vertical, remplacer `state.dragY(delta.y)` par `effect.applyToScroll(Offset(0f, delta.y), NestedScrollSource.UserInput) { consumed -> state.dragY(consumed.y) ; consumed }` (la fonction rend ce qui a été consommé), et au lâcher `effect.applyToFling(Velocity(0f, velocity.y)) { v -> state.flingY(...) ; Velocity.Zero }` ; `Modifier.overscroll(effect)` sur la même `Row`. Plus de code à tenir, mais le verrou d'axe ne bouge pas.

Dans les deux cas : l'effet agit sur le **contenu de la `Row`** (heures + colonnes, y compris les `Canvas`), donc l'en-tête des jours et la bande « journée entière » (hors de la `Row`) restent fixes, comme dans les Réglages natifs. Aucune dépendance à ajouter : `androidx.compose.foundation:foundation` est déjà dans `app/build.gradle.kts`. Le défilement horizontal (jour par jour, pas de bord) n'en a pas besoin ; la zone sous minuit est atteinte à `maxScroll` exactement (voir écran 5 : marge basse de 10 dp + inset à ajouter, sinon le dernier créneau reste sous la barre de navigation lors de l'étirement).

## 25. Index des captures

**Ancienne, appareil** (35) : `parite-ancien-01-grille.png`, `parite-ancien-02-tiroir.png`, `parite-ancien-03-menu-ligne-calendrier.png`, `parite-ancien-04-dialogue-couleur.png`, `parite-ancien-06-liste-taches-a-faire.png`, `parite-ancien-07-liens-ics.png`, `parite-ancien-08-liste-evenements-calendrier.png`, `parite-ancien-09-liste-filtres.png`, `parite-ancien-10-liste-menu-points.png`, `parite-ancien-11-fiche-evenement.png`, `parite-ancien-12-fiche-selecteur-heure.png`, `parite-ancien-14-feuille-mois.png`, `parite-ancien-15-recherche.png`, `parite-ancien-16-recherche-resultats.png`, `parite-ancien-17-tiroir-plus-de-durees.png`, `parite-ancien-18-ajouter-calendrier.png`, `parite-ancien-19-fiche-repeter.png`, `parite-ancien-20-fiche-tache.png`, `parite-ancien-21-tache-repeter.png`, `parite-ancien-22-tache-rappels.png`, `parite-ancien-23-tache-calendrier.png`, `parite-ancien-24-tache-selecteur-date.png`, `parite-ancien-25-tache-menu-type.png`, `parite-ancien-26-tache-menu-points.png`, `parite-ancien-27-tache-description-barre.png`, `parite-ancien-28-description-mise-en-forme.png`, `parite-ancien-30-reglages-racine.png`, `parite-ancien-31-reglages-bas.png`, `parite-ancien-34-reglages-theme.png`, `parite-ancien-35-reglages-theme-bas.png`, `parite-ancien-37-reglages-fuseaux.png`, `parite-ancien-38-reglages-synchronisation.png`, `parite-ancien-39-reglages-coffres-obsidian.png`, `parite-ancien-40-reglages-langue.png`, `parite-ancien-41-reglages-mode-couleur.png`

**Ancienne, harnais web** (29) : `parite-ancien-web-add-calendar.png`, `parite-ancien-web-cal-picker.png`, `parite-ancien-web-cep-filters.png`, `parite-ancien-web-cep-menu.png`, `parite-ancien-web-color-popup.png`, `parite-ancien-web-date-popup.png`, `parite-ancien-web-desc-focus.png`, `parite-ancien-web-draft.png`, `parite-ancien-web-drawer.png`, `parite-ancien-web-events-panel.png`, `parite-ancien-web-grid.png`, `parite-ancien-web-ics-dialog.png`, `parite-ancien-web-menu-points.png`, `parite-ancien-web-menu-type.png`, `parite-ancien-web-month.png`, `parite-ancien-web-more-days.png`, `parite-ancien-web-reminders.png`, `parite-ancien-web-repeat-popup.png`, `parite-ancien-web-row-menu.png`, `parite-ancien-web-search.png`, `parite-ancien-web-set-appearance.png`, `parite-ancien-web-set-dialog-lang.png`, `parite-ancien-web-set-theme.png`, `parite-ancien-web-settings.png`, `parite-ancien-web-sheet-ro.png`, `parite-ancien-web-sheet-task.png`, `parite-ancien-web-tasks-todo.png`, `parite-ancien-web-time-edit.png`, `parite-ancien-web-x.png`

**Nouvelle, appareil** (26) : `parite-nouveau-01-grille.png`, `parite-nouveau-02-tiroir.png`, `parite-nouveau-03-menu-ligne-calendrier.png`, `parite-nouveau-04-dialogue-couleur.png`, `parite-nouveau-05-dialogue-renommer.png`, `parite-nouveau-06-liste-taches-a-faire.png`, `parite-nouveau-07-liens-ics.png`, `parite-nouveau-08-liste-evenements-calendrier.png`, `parite-nouveau-11-fiche-evenement.png`, `parite-nouveau-11b-fiche-evenement-plein.png`, `parite-nouveau-14-feuille-mois.png`, `parite-nouveau-16-recherche-resultats.png`, `parite-nouveau-18-ajouter-calendrier.png`, `parite-nouveau-20-fiche-tache.png`, `parite-nouveau-20-reglages-racine.png`, `parite-nouveau-21-reglages-bas.png`, `parite-nouveau-21-tache-repeter.png`, `parite-nouveau-22-tache-calendrier.png`, `parite-nouveau-23-tache-rappels.png`, `parite-nouveau-24-tache-date.png`, `parite-nouveau-25-tache-heure.png`, `parite-nouveau-26-tache-menu-points.png`, `parite-nouveau-27-tache-menu-type.png`, `parite-nouveau-40-grille-debordement-haut.png`, `parite-nouveau-41-reglages-debordement-haut.png`, `parite-nouveau-42-reglages-debordement-bas.png`

