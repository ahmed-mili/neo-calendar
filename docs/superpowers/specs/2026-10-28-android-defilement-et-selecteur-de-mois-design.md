# Android : défilement horizontal rapide et sélecteur de mois

Date : 2026-10-28. App Android native (Kotlin, Jetpack Compose), version de
départ 1.92.1. Le bureau (Tauri) n'est pas concerné.

## Pourquoi

Ahmed trouve le défilement horizontal de la grille pénible « quand je veux
scroller vite », et Notion Calendar (Android 1.48.0) meilleur. Il trouve aussi
le sélecteur de mois (le panneau qui s'ouvre sous « Novembre ^ ») « ultra
moche », mal organisé et pas adapté au reste de l'app.

Les deux sujets touchent le même écran et se livrent ensemble.

## Ce qui a été mesuré (Xiaomi 13T Pro, 120 Hz, 2026-10-28)

Comparaison par gestes injectés (`input motionevent`), vidéo et
`dumpsys gfxinfo`, Neo en vue 3 jours (colonne de 343 px), Notion en vue
2 jours (colonne de 531 px).

- **Fluidité : pas en cause.** Neo : 0 vsync manquée, 99e percentile 20 ms.
  Notion : 24 ms. Rien à gagner côté rendu pour ce sujet.
- **Recul au lâcher.** La grille de Neo suit le doigt sans limite
  (`GridState.dragX`), par exemple 560 px pour un glisser de 600 px. Au lâcher,
  elle est ramenée à exactement un jour (343 px) : la grille repart vers
  l'arrière d'environ 220 px. Notion ne recule jamais.
- **Distance indépendante de la vitesse.** Neo avance d'un jour par lancer
  quelle que soit sa force (`snapTargetDay`, `GridGestures.kt:28`, un jour
  exactement par construction). Notion : un glisser de 600 px en 300 ms avance
  d'un jour, en 150 ms de deux, et s'arrête toujours pile sur un jour.
- **Élan perdu au lâcher.** L'animation de calage est un
  `tween(260 ms, FastOutSlowInEasing)` (`GridState.kt:183`) : vitesse de départ
  nulle, `initialVelocity` ignoré. Le contenu ralentit net puis repart.
- **Bug : grille arrêtée entre deux jours.** Un doigt posé pendant l'animation
  puis levé sans bouger annule l'animation et sort du geste sans calage
  (`GridState.kt:229`, `return@awaitEachGesture` quand `slop == null`).
  Positions finales mesurées : 445, 267, 315 px, aucune multiple de 343.
- **Rafales.** Sur 10 lancers enchaînés, Neo parcourt environ 16 jours, Notion
  environ 14. Le problème n'est pas la distance totale mais les à-coups : chez
  Neo chaque nouveau toucher repart du jour le plus proche
  (`GridState.kt:220-222`) avec un traqueur de vitesse neuf.

Les mesures brutes et les scripts sont dans le scratchpad de la session
(non versionné), dossier `phone-scroll`.

## Partie 1 : défilement horizontal

### Ce que l'utilisateur doit sentir

La grille se comporte comme une surface lancée au doigt qui s'arrête toujours
sur un jour entier.

1. **Pendant le glisser**, la grille suit le doigt exactement, sans résistance.
2. **Au lâcher avec élan**, la grille continue à la vitesse du doigt, sans
   creux de vitesse, puis décélère et s'arrête pile au début d'un jour.
   La distance dépend de la vitesse : plus le lancer est fort, plus il emporte
   de jours.
3. **Plafond : 7 jours par lancer**, comptés depuis la position au moment du
   lâcher (décision d'Ahmed, 2026-10-28).
4. **Jamais de recul.** Le jour d'arrivée est toujours dans le sens du geste ou
   égal au jour le plus proche ; la grille ne revient pas en arrière d'une
   distance qu'elle a déjà parcourue sous le doigt, sauf pour se caler sur le
   jour le plus proche quand le geste n'a pas d'élan.
5. **Geste lent et court** (sans élan) : comportement actuel conservé. Le
   calage se fait sur le jour suivant si le glisser a dépassé un quart de
   colonne (`SNAP_DISTANCE_DAYS`), sinon retour au jour de départ. Ce que la
   1.16.0 voulait protéger (un petit geste = un jour, pas une surface qui
   dérive) reste vrai à vitesse lente.
6. **Lancers enchaînés.** Un nouveau toucher pendant l'animation arrête la
   grille sous le doigt, instantanément et sans saut. Si ce toucher devient un
   nouveau lancer dans le même sens, son élan s'ajoute à celui qui restait
   (comme sur iOS et chez Notion) au lieu de repartir de zéro. Le plafond de
   7 jours s'applique à chaque lancer, pas à la rafale.
7. **Doigt posé puis levé sans bouger** pendant l'animation : la grille s'arrête
   puis se cale sur le jour le plus proche (corrige le bug ci-dessus).

### Ce qui ne change pas

- Le verrouillage d'axe (horizontal / vertical) et le défilement vertical.
- Le réglage « Défilement libre entre les jours » (`freeScroll`, désactivé par
  défaut) : quand il est actif, la grille garde sa décroissance libre sans
  calage, comme aujourd'hui. Il est partagé avec le bureau par les réglages :
  ne pas le renommer.
- `goTo` (bouton du jour, choix d'une date dans le sélecteur).
- Le pas de calage reste le jour, quel que soit le nombre de colonnes affichées.

### Cible chiffrée (à vérifier sur le téléphone après coup)

Avec le même protocole qu'au-dessus (glisser de 600 px, vue 3 jours) :

| Geste | Attendu |
|---|---|
| 600 px en 300 ms (la grille est à 1,6 jour au lâcher) | 2 à 3 jours, aucun recul |
| 600 px en 150 ms | 3 à 5 jours |
| 600 px le plus vite possible | au plus 8 jours (1,6 sous le doigt + 7 de plafond, arrondi vers le bas) |
| Doigt posé 100 ms après un lancer, levé sans bouger | Position finale multiple d'une colonne |
| 5 lancers à 150 ms d'intervalle | Plus de jours qu'avant, sans arrêt visible entre deux lancers |
| Glisser lent de 0,3 colonne puis lâcher | +1 jour (inchangé) |
| `gfxinfo` sur une rafale | Pas pire qu'en 1.92.1 (99e percentile ≤ 20 ms environ) |

### Tranché par Claude (à relire)

- **Unités.** Tous les seuils de vitesse et de distance s'expriment en
  colonnes (jours) et en colonnes par seconde, pas en pixels : le même geste,
  rapporté à la largeur de colonne, se comporte pareil en vue jour, 3 jours et
  semaine. Le plafond reste 7 jours dans toutes les vues.
- **Lancer en sens inverse** pendant une animation : l'élan restant est
  abandonné, le nouveau lancer part de sa seule vitesse. Seul un lancer dans le
  même sens cumule.
- **Mode `freeScroll`** : strictement inchangé (le doigt posé arrête déjà la
  grille, et l'absence de calage y est voulue).

### Laissé au constructeur

Le choix de la physique (décroissance spline d'Android projetée puis arrondie
au jour, ressort qui part de la vitesse du doigt, `SnapFlingBehavior`…), les
constantes exactes et le seuil qui sépare « avec élan » de « sans élan », tant
que la cible chiffrée est tenue. Les tests unitaires de `core/grid` doivent
suivre (la fonction pure de calcul de la cible est l'endroit naturel).

Pistes vues dans le code mais **hors périmètre** de cette livraison (mesures
de fluidité bonnes) : recomposition de `NativeScreen` à chaque jour franchi,
gouttière des heures redessinée à chaque image, fondu des barres toute la
journée à l'entrée. À ne traiter que si la nouvelle physique les rend
visibles.

## Partie 2 : sélecteur de mois

Référence : celui de Notion Calendar. Captures d'Ahmed du 2026-10-28
(`C:\Users\Ahmed\Pictures\Screenshots\Phone 2026-10-28 163312.png` pour Neo,
`... 163402.png` pour Notion).

### Ce qui cloche aujourd'hui

- **Fond.** `MonthSheet` peint `Neo.Surface` opaque avec une ombre et un trait
  du bas (`MonthSheet.kt:48-51`), alors que tout l'écran est posé sur
  `neoGlass()` (surface translucide sur le fond d'écran, `NativeScreen.kt:507`).
  Résultat : une dalle noire sous une barre teintée par le fond d'écran.
- **Noms des jours masqués.** Le sélecteur est une couche posée par-dessus la
  grille (`NativeScreen.kt:584`) : il recouvre la rangée des en-têtes de jours
  (« ven 27 », « sam 28 »). Chez Notion, il pousse la grille vers le bas et
  cette rangée reste visible sous le mois.
- **Mauvaise bande surlignée.** `MiniCalendar` surligne la semaine
  d'**aujourd'hui** (`MiniCalendar.kt:116`), quelle que soit la date affichée.
  Notion surligne les **jours visibles dans la grille**.

### Ce qui est voulu (validé par Ahmed)

1. **Même verre que la barre du haut.** Le sélecteur n'a plus de fond propre,
   ni ombre, ni trait : barre et sélecteur se lisent comme une seule pièce,
   sur le même `neoGlass` que le reste.
2. **Dans le flux.** À l'ouverture, le sélecteur s'insère entre la barre du haut
   et la grille et pousse la grille vers le bas ; la rangée des noms de jours
   de la grille reste visible juste en dessous. Ouverture et fermeture
   animées (hauteur et fondu), courtes, dans l'esprit des durées actuelles
   (170 ms à l'ouverture, 120 ms à la fermeture).
3. **La bande suit les jours affichés.** Elle couvre exactement les jours
   visibles dans la grille (3 cases en vue 3 jours, 7 en vue semaine, 1 en vue
   jour) et se déplace quand on fait défiler la grille. Si les jours visibles
   chevauchent deux rangées (samedi → lundi), la bande se coupe en deux
   segments, un par rangée.
4. **Aujourd'hui** garde sa pastille rouge (`Neo.Today`) posée par-dessus.
5. Les jours hors du mois restent estompés (comportement actuel).

### Ce qui ne change pas

- Un appui sur un jour y saute (`grid.goTo`) et referme ; un glisser horizontal
  dans le sélecteur change de mois ; le bouton retour le ferme ; ouvrir la
  recherche le ferme.
- Le sélecteur n'est pas composé tant qu'il est fermé (règle du lancement
  rapide, `CLAUDE.md` : rien de plus avant le premier écran).
- Le libellé « Semaine N » dans la barre reste ; Notion le retire quand le
  sélecteur est ouvert, ce n'est pas demandé ici.

### Questions de comportement tranchées par Claude (à relire)

- Un appui à côté du sélecteur (sur la grille) le refermait. Le sélecteur
  n'étant plus une couche par-dessus, la grille redevient utilisable sous lui ;
  un appui sur la grille ne le ferme plus, seuls le titre du mois, le retour
  et le choix d'un jour le ferment. Notion se comporte ainsi.
- Pendant que le sélecteur est ouvert, le mois qu'il affiche suit la grille
  quand le mois des jours visibles change. Un mois parcouru à la main dans le
  sélecteur est un état local : il tient tant que la grille ne change pas de
  mois, et il est oublié à la fermeture et à chaque `goTo`.
- Pendant un défilement, la bande couvre `dayCount` jours à partir du jour
  le plus proche de la position de la grille (`nearestDay`, la même valeur que
  celle qui pilote déjà la barre du haut). Elle saute donc d'un jour à chaque
  jour franchi ; ce saut glisse en environ 120 ms plutôt que d'apparaître net.
- La hauteur du sélecteur ne varie pas d'un mois à l'autre : `MiniCalendar`
  dessine toujours 6 rangées (`MiniCalendar.kt:113`), on le garde.

## Contraintes du dépôt

- Vérifier sur le téléphone ou l'émulateur Pixel_8 avant de dire que c'est
  fini (`CLAUDE.md`, « Vérifier une modification d'interface »).
- Mesurer le lancement à froid avant / après si l'écran principal est touché
  (`docs/superpowers/specs/2026-10-02-android-lancement-rapide-design.md`).
  Une régression bloque la livraison.
- Messages de commit en anglais, impératif, 60 caractères au plus.
- Livraison par `git ship minor` (nouveau comportement).
