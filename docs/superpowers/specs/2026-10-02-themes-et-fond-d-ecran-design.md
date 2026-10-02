# Thèmes et fond d'écran (PC et Android)

Rédigé le 2026-10-02, à la demande d'Ahmed : « améliore la colorimétrie du
panel ; dans les paramètres Apparence l'image de fond doit être séparée du
thème ; vérifie que tous les thèmes fonctionnent et ont la bonne colorimétrie ;
ne garde que les meilleurs thèmes, les plus populaires ».

## 1. Constats

- Le registre des thèmes (`apps/windows/src/themes/registry.ts`, porté dans
  l'app Android par `NeoTokens`) compte 14 thèmes, communs au PC et à Android.
- Le fond d'écran est enregistré **dans chaque thème**
  (`ThemeCustomization.wallpaperId`, `appearancePreferences.ts`) : changer de
  thème change d'image. Les effets du fond (luminosité, flou, opacité) sont
  déjà communs (`wallpaperEffects.ts`, clé `neo-calendar-wallpaper-effects-v1`).
- Tokyo Night, jugé moche par Ahmed, est **fidèle** au thème officiel (thème
  VS Code d'Enkia, relu le 2026-10-02 : fond `#1a1b26`, texte `#a9b1d6`,
  boutons et barres `#3d59a1`, l'accent terne repris par l'app). Règle
  d'Ahmed : « s'il est vraiment comme ça, on le retire ».

## 2. Décisions d'Ahmed

- **Thèmes gardés (6)** : Catppuccin (par défaut), GitHub, One, Ayu, Rosé Pine,
  Vercel. **Retirés (8)** : Tokyo Night, Absolutely, Linear, Lobster, Matrix,
  Oscurange, Raycast, VS Code Plus.
- **Tous les panneaux** sont concernés par la colorimétrie (grille, fiche
  d'évènement, tiroir, listes, Réglages, dialogues), sur PC et sur Android.

## 3. Conception

### 3.1 Fond d'écran indépendant du thème

- Nouveau réglage d'apparence global `wallpaperId`, au même niveau que le mode
  (`AppearancePreferences`, et son pendant natif dans `NeoAppearance` côté
  Android, écrit aux mêmes endroits qu'aujourd'hui).
- Lecture : si le réglage global manque, il prend la valeur du fond du thème
  actuel (`themeOverrides[thème].wallpaperId`), sinon le fond par défaut.
  Aucun changement visible à la mise à jour ; rien n'est réécrit tant que
  l'utilisateur ne change rien ; les fonds par thème restants sont ignorés.
- Page Apparence (PC et Android) : deux sections, « Thème » puis « Fond
  d'écran » ; les effets (luminosité, flou, opacité des conteneurs) passent
  sous « Fond d'écran ». Changer de thème ne touche plus au fond.

### 3.2 Liste réduite à 6 thèmes

- Les 8 thèmes retirés disparaissent du registre, de `THEME_IDS`, du CSS des
  thèmes (`codex-themes.css`) et de l'app Android.
- Un utilisateur dont le thème enregistré n'existe plus retombe sur Catppuccin
  (`getTheme` le fait déjà ; même règle côté Android), sans message ;
  ses personnalisations de ce thème sont ignorées.

### 3.3 Vérification de chaque thème (clair et sombre)

- **Fidélité** : pour chacun des 6, l'accent, le fond et le texte (et les
  variantes claires) sont comparés à la palette officielle, relue à la source
  (dépôt ou fichier officiel du thème ; pour Vercel, le système de couleurs
  Geist). Chaque écart est corrigé, source citée.
- **Lisibilité** : contraste calculé (formule WCAG) pour chaque thème et chaque
  panneau : texte principal et secondaire sur leurs surfaces, texte sur accent,
  pastilles et boutons. Seuil : 4,5:1 pour le texte, 3:1 pour les grands
  éléments et les icônes. Un défaut se corrige dans la **dérivation** des
  couleurs des panneaux (une règle pour tous les thèmes), pas par des
  exceptions thème par thème, sauf palette officielle en cause.
- **Cohérence** : les panneaux d'un même thème partagent les mêmes niveaux de
  surface (fond, panneau, panneau survolé, panneau ouvert) et la même
  transparence sur le fond d'écran.
- **Preuve visuelle** : une image côte à côte par thème et par panneau
  principal (grille, fiche, tiroir, Réglages), en clair et en sombre, sur
  l'émulateur et sur le PC.

## 4. Contraintes

- Règles permanentes d'Ahmed : le lancement reste aussi rapide qu'en 1.87.0
  (aucun travail ajouté avant le premier écran ; mesurer avant / après si le
  démarrage est touché) ; aucune migration forcée ; tout en Kotlin côté
  Android ; d'autres personnes ont l'app.
- Préférences partagées entre l'app PC et l'app Android (et l'ancienne clé
  `neo-calendar.appearance`) : même format des deux côtés.

## 5. Tests

- Unitaires : lecture du fond global (absent → fond du thème actuel → défaut),
  thème retiré → Catppuccin, calcul de contraste, dérivation des surfaces.
- Contrôle automatique : pour chaque thème et chaque paire texte / surface, le
  contraste calculé atteint le seuil (test qui échoue sinon).
- Écran : les images côte à côte du §3.3.

## Hors périmètre

Ajouter de nouveaux thèmes (Dracula, Nord) ; changer la mise en page des
panneaux.
