# Vérification — Barre Windows unifiée

Plan : [`2026-09-06-pc-barre-unifiee.md`](../plans/2026-09-06-pc-barre-unifiee.md).
Spec et référence : [`2026-09-06-pc-barre-unifiee-design.md`](../specs/2026-09-06-pc-barre-unifiee-design.md).

Vérification conduite le 2026-09-07 sur la **vraie application Tauri**
(`npm run dev`, binaire `target/debug/neo-calendar.exe`, WebView2), fenêtre
1442 × 902 à l'échelle Windows 100 %, thème sombre.

**Un piège rencontré, à connaître pour la prochaine fois** : le plugin
d'instance unique a fait sortir le build de dev en redonnant le focus à
l'application **installée** qui tournait déjà. Les deux premières captures
montraient donc l'ancienne interface, avec sa barre de titre native. Il faut
fermer l'instance installée avant de vérifier un build de dev, sans quoi on
croit regarder son travail alors qu'on regarde la version précédente.

## Mesures réelles contre la référence

Toutes mesurées au pixel sur la capture de l'application, comparées à
`reference-measurements.md` (la référence est à l'échelle 1:1).

| Mesure | Référence | Réel | Écart |
|---|---|---|---|
| Hauteur de barre | 45 px | **45 px** | 0 |
| Centre vertical des contrôles | uniforme | uniforme (23,5) | 0 |
| Chevron du menu, centre depuis le bord | 22 px | 22,5 px | +0,5 |
| Bascule de panneau, centre | 56,5 px | 57,5 px | +1 |
| Recherche, depuis le bord droit de la bande latérale | 52,5 px | **52,5 px** | 0 |
| Création, depuis le bord droit de la bande latérale | 23 px | **23 px** | 0 |
| Écart recherche → création | 29,5 px | 29,5 px | 0 |
| Écart entre les deux flèches | 31 px | **31 px** | 0 |
| Fermer, depuis le bord droit | 29,5 px | **29,5 px** | 0 |
| Agrandir, depuis le bord droit | 69 px | 69,5 px | +0,5 |
| Réduire, depuis le bord droit | 108,5 px | **108,5 px** | 0 |

**Deux écarts assumés, tous deux justifiés :**

1. **Bande latérale de 220 px contre 238 px** dans la référence. Les positions
   du groupe gauche sont comptées depuis les bords de *notre* colonne, et les
   écarts relatifs sont **exacts au pixel** (52,5 et 23 px). Notion a une
   sidebar plus large ; copier sa valeur absolue aurait décalé nos contrôles.
2. **Les flèches sont plus proches des commandes de fenêtre** que dans la
   référence (156,5 px contre 188,5 px depuis le bord droit). La référence loge
   dans cet intervalle une bascule de panneau droit que Neo Calendar n'a pas.

**Grammaire des surfaces, conforme** : pastille pleine pour le sélecteur de vue
et Aujourd'hui, glyphe nu sans aucun fond au repos pour tout le reste.

## Ce qui a été vu tourner

| Vérification | Résultat |
|---|---|
| Une seule ligne, aucune barre de titre native | ✅ |
| Titre du mois resté **sous** la barre | ✅ |
| Menu au survol du chevron : 3 rubriques, **aucune Aide** | ✅ |
| Sous-menu Neo Calendar : `v1.74.5` non activable à la place d'« À propos », Rechercher les mises à jour…, Paramètres… `Ctrl+Virgule` | ✅ |
| Sous-menu Modifier : les 10 entrées, bon ordre, bons raccourcis, séparateur | ✅ |
| États désactivés du menu Modifier (rien de sélectionné) : libellé **et** raccourci atténués, ligne visible | ✅ |
| Sous-menu Afficher : les 8 entrées, 2 séparateurs, bons raccourcis | ✅ |
| Sous-menu Échelle de l'interface : 8 paliers, coche sur 100 % | ✅ |
| Cascade sur deux niveaux sans fermeture au passage entre surfaces | ✅ |
| Survol d'une rubrique : surface pleine sur toute la largeur | ✅ |
| **Flèches avec le menu ouvert : le calendrier ne bouge pas** | ✅ |
| Flèche droite menu fermé, vue Semaine : +7 jours exactement (lun 7 → lun 14) | ✅ |
| Échap ferme le menu **et rend le focus au déclencheur** (liseré visible) | ✅ |
| Glissement de la fenêtre depuis une surface vide de la barre | ✅ 72 × 48 px demandés, 72 × 48 obtenus |
| Réduire | ✅ |
| Agrandir puis Restaurer | ✅ 1442 → 2560 → 1442 px |
| Sidebar repliée : chevron, bascule, recherche et création tous accessibles | ✅ |
| Largeur minimale 960 px : aucune commande coupée, aucun défilement horizontal | ✅ |

## Le défaut trouvé à l'écran, et corrigé

**L'infobulle « Menu de l'application » se posait par-dessus la première
rubrique du menu**, la rendant illisible. Les deux s'ouvrent au survol du même
bouton, et rien ne les départageait. Aucun test ne pouvait l'attraper : les
deux surfaces sont correctes séparément, c'est leur superposition qui ne l'est
pas.

Corrigé au commit `efded7b` : l'attribut d'infobulle est retiré tant que le
menu est ouvert. Revérifié à l'écran après rechargement à chaud.

## Ce qui n'a PAS été vérifié

À déclarer tel quel — ces points restent des suppositions, pas des preuves.

- **Thème clair** et les deux thèmes sombres alternatifs. Seul le thème sombre
  courant a été vu.
- **Le bouton Fermer.** Non actionné : il aurait fallu relancer toute la chaîne
  de build pour poursuivre. Réduire, Agrandir et Restaurer, eux, sont prouvés.
- **Les opérations d'édition sur un dossier d'essai** — Couper/Copier/Coller,
  Supprimer → Annuler → Rétablir sur de vraies notes temporaires.
- **Ctrl+A avec un calendrier masqué.** L'exclusion se fait en amont, dans la
  liste d'évènements ; aucun test à son niveau ne peut le prouver, et l'œil non
  plus tant que l'essai n'est pas fait.
- **Le bundle de production local.** Seul le build de développement a tourné.
- **Les échelles Windows 125 % et 150 %**, et les Snap Layouts (Win+Z, survol
  du bouton Agrandir).
- **La preuve réseau du rafraîchissement sans cache** aux outils WebView2.
- **La non-régression Android à l'exécution.** `npm run android:frontend`
  compile, et l'Annuler Android est couvert par un test, mais rien n'a été vu
  tourner sur l'émulateur ni sur le Xiaomi.
