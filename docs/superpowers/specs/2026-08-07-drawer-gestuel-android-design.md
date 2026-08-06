# Lot 1 — Drawer gestuel Android

Date : 2026-08-07
Plateforme concernée : Android uniquement (`body.nc-platform-android`)

## Contexte

Le panneau latéral Android (drawer) s'ouvre aujourd'hui par un bouton hamburger
et apparaît d'un bloc via une animation CSS. Il est trop transparent, et tant
qu'il est ouvert la totalité du calendrier est masquée. Le badge de date de la
barre du haut n'a qu'une seule apparence et affiche la mauvaise valeur.

La référence visuelle est **Notion Calendar** (`com.cron.calendar`), installé sur
l'appareil de test. Les valeurs de ce document ont été mesurées pixel par pixel
sur des captures de cette application, pas estimées à l'œil.

## Périmètre

Dans ce lot :

1. Ouverture et fermeture du drawer au doigt, panneau solidaire du doigt.
2. Suppression des deux boutons hamburger sur Android.
3. Densification du drawer (opacité et flou).
4. Fin du masquage du calendrier à droite du drawer.
5. Badge de date : trois états et nouvelles dimensions.
6. Harmonisation de trois couleurs de texte.

Hors de ce lot, traités séparément :

- Lot 2 — fonds d'écran : le changement ne s'applique pas, filtrage par
  plateforme, ajout d'un fond, suppression de l'aperçu, sélecteur simplifié.
- Lot 3 — refonte de l'interface des Paramètres, wallpaper visible derrière,
  sélecteur de thème, curseur d'opacité du drawer.
- Lot 4 — rechargement à chaud des événements modifiés par Syncthing.

L'opacité du drawer est figée en dur dans ce lot, mais exposée comme variable CSS
pour que le lot 3 puisse la piloter sans retoucher les règles.

## Architecture

### `src/ui/calendar/useDrawerSwipe.ts` (nouveau)

Hook au rôle unique : traduire une suite d'événements tactiles en une progression
`0 → 1`, puis décider de l'état final.

```ts
useDrawerSwipe({
    enabled: boolean;      // faux hors Android
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
})
```

Il ne connaît ni le calendrier, ni les sources de calendriers, ni le contenu du
drawer. Il n'expose aucune valeur de retour : son seul effet est d'écrire la
variable CSS `--nc-drawer-progress` sur `document.body` et d'appeler
`onOpenChange` aux transitions.

Passer par le state React à chaque déplacement du doigt produirait un panneau
saccadé : la progression transite donc par une variable CSS, et le CSS seul en
déduit la position du panneau et l'opacité du voile. Aucun rendu React pendant le
glissement.

### Contrainte de montage

`CalendarSidebar.tsx:283` ne monte le contenu du drawer que lorsque
`sidebarVisible` est vrai. Tirer un panneau vide n'aurait pas de sens : dès que le
geste dépasse 8 px horizontalement, `onOpenChange(true)` est appelé pour monter le
contenu, la position visuelle restant pilotée par la variable CSS. Relâcher en
deçà du seuil rappelle `onOpenChange(false)`.

L'animation d'entrée `nc-android-drawer-in` est neutralisée pendant un geste
(classe `nc-drawer-dragging` sur `body`), sans quoi elle entrerait en conflit avec
la position sous le doigt.

### `todayBadgeState()` dans `CalendarUtils.ts`

Fonction pure, sans DOM :

```ts
todayBadgeState(currentDate: Date, viewType: ViewType, dayCount: number)
    : "present" | "back" | "forward"
```

Les noms décrivent le geste qui ramènerait à aujourd'hui : `present` lorsque la
date du jour tombe dans la plage affichée, `back` lorsque la vue est postérieure
à aujourd'hui, `forward` lorsqu'elle lui est antérieure.

## Flux du geste

| Étape | Comportement |
|---|---|
| Contact dans les 24 px du bord gauche, drawer fermé | geste candidat |
| Contact sur le drawer ou le voile, drawer ouvert | geste candidat |
| `abs(dy) > abs(dx)` | abandon, le défilement vertical de la grille reprend la main |
| Déplacement | `progress = dx / largeur du drawer`, borné à `[0,1]`, écrit dans la variable CSS |
| Relâchement | ouvert si `progress > 0.5` **ou** vitesse > 0.4 px/ms dans le sens de l'ouverture ; fermé sinon |
| `touchcancel`, second point de contact | retour à l'état de départ |

## Spécifications visuelles

### Drawer

| Propriété | Avant | Après |
|---|---|---|
| Fond | `rgba(17,17,27,0.54)` (`mobile.css:2462`) | `rgba(17,17,27,0.80)` |
| Flou | aucun sur le panneau | `blur(26px) saturate(1.08)` |
| Position | animation d'entrée seule | `translateX(calc((var(--nc-drawer-progress,1) - 1) * 100%))` |

La valeur `0.80` est portée par `--nc-android-drawer-opacity`, destinée à être
pilotée par les Paramètres au lot 3.

### Zone de calendrier à droite

La règle `visibility: hidden` de `mobile.css:2952` est supprimée. La grille, les
événements et la ligne d'heure courante restent visibles. Le voile
(`.nc-mobile-sidebar-scrim`) couvre uniquement la zone à droite du drawer, son
opacité valant `0.25 × progress` : il s'installe progressivement pendant le
glissement, et un appui dessus referme le panneau.

### Badge de date

`CalendarHeader.tsx:197` affiche `currentDate.getDate()`, soit le jour affiché.
La référence montre **aujourd'hui** : le badge reste sur « 7 » quand la vue passe
à sam 8 puis dim 9. Corrigé en `new Date().getDate()`, sans quoi les trois états
n'auraient pas de sens.

| État | Condition | Fond | Chiffre |
|---|---|---|---|
| `present` | aujourd'hui est dans la plage affichée | `rgba(255,255,255,0.14)` | `--nc-text-primary` |
| `back` | la vue est postérieure à aujourd'hui | `#F5544F` | `#ffffff` |
| `forward` | la vue est antérieure à aujourd'hui | `#F5544F` | `#ffffff` |

`back` et `forward` partagent leur apparence mais restent distincts dans le DOM
via `data-today-state`, ce qui permettra d'ajouter une flèche directionnelle sans
refonte.

Le fond de l'état `present` reste translucide, contrairement au `#333333` opaque
de la référence : Notion Calendar n'a pas de fond d'écran derrière sa barre,
Neo Calendar si, et tout le chrome de l'application est translucide. La valeur
passe de `0.09` à `0.14` pour rester lisible sur un fond clair.

L'accent `#F5544F` est celui que l'application emploie déjà pour la pastille
« aujourd'hui ». La référence utilise `#F05550` : l'écart est de trois points sur
chaque canal, invisible à l'œil, rien à changer.

| Dimension | Référence mesurée | Avant | Après |
|---|---|---|---|
| Largeur × hauteur | 32 × 30 px | 48 × 48 px | 32 × 30 px |
| Taille du chiffre | 16 px | 15 px | 17 px |
| Rayon | ~10 px | 10 px | 9 px |

La zone tactile reste à 48 px via un `::after` transparent, selon le procédé déjà
employé dans `CalendarTouch.css:116`.

### Couleurs de texte

Le nom d'un jour qui n'est pas aujourd'hui (« Sat ») tire sa couleur de
`--nc-text-secondary` (`CalendarGrid.css:369`). Trois éléments utilisent un cran
plus effacé et passent sur cette même valeur :

| Élément | Emplacement | Valeur actuelle |
|---|---|---|
| `GMT+2` | `mobile.css:2940` | `--nc-text-faint` |
| `Semaine 32` | `mobile.css:3768` | `--nc-text-faint` |
| Libellés d'heures | `mobile.css:2961` | `--nc-text-faint` affaibli par un `color-mix` à 86 % |

## Boutons supprimés

Les deux hamburgers disparaissent, uniquement dans les branches Android :

- `CalendarHeader.tsx:143-151`, dans la branche `nc-header--android` ;
- `CalendarSidebar.tsx:250-256`, sous le drapeau `isAndroid` déjà présent dans le
  fichier.

Les versions bureau et Obsidian conservent les leurs. La barre du haut du drawer
garde recherche, réglages et nouvel événement.

## Cas limites

- Geste à dominante verticale : abandonné, le défilement de la grille reprend.
- Second point de contact : geste abandonné, retour à l'état de départ.
- `prefers-reduced-motion` : aucune transition, bascule directe. Le bloc existant
  à `mobile.css:670` couvre déjà l'animation d'entrée et sera étendu.
- Geste interrompu par le système (`touchcancel`) : retour à l'état de départ.
- Drawer ouvert puis rotation ou changement de taille : la largeur du drawer étant
  une variable CSS, la position reste correcte sans recalcul JavaScript.

## Tests

`useDrawerSwipe` est testé seul sous jest, avec des événements tactiles
synthétiques :

- ouverture au-delà du seuil de distance ;
- ouverture par la vitesse, en deçà du seuil de distance ;
- annulation en deçà des deux seuils ;
- abandon sur geste à dominante verticale ;
- fermeture par glissement inverse depuis l'état ouvert ;
- retour à l'état de départ sur `touchcancel`.

`todayBadgeState` est testée sur ses trois valeurs de retour, aux bornes de la
plage affichée (premier et dernier jour visible) et pour plusieurs `dayCount`.

Le rendu visuel se vérifie sur l'appareil, connecté en débogage USB
(`adb -s SGPZQ84XNFDQBE8L exec-out screencap -p`), l'injection d'événements étant
refusée par HyperOS.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/ui/calendar/useDrawerSwipe.ts` | nouveau |
| `src/ui/calendar/useDrawerSwipe.test.ts` | nouveau |
| `src/ui/calendar/CalendarUtils.ts` | ajout de `todayBadgeState` |
| `src/ui/calendar/CalendarLayout.tsx` | appel du hook |
| `src/ui/calendar/CalendarHeader.tsx` | hamburger Android retiré, badge corrigé |
| `src/ui/calendar/CalendarSidebar.tsx` | hamburger retiré sous `isAndroid` |
| `apps/android/src/mobile.css` | bloc `V10 DRAWER GESTURE`, suppression de la règle `visibility:hidden` |
