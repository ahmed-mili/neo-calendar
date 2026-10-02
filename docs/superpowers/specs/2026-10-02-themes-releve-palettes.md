# Relevé des palettes officielles des six thèmes

Relevé du 2026-10-02 (heure locale, session « Thèmes et fond d'écran », Task 4). Chaque valeur « officielle »
ci-dessous a été relue ce jour-là dans le fichier source cité (téléchargé en brut, jamais saisie de mémoire).
Les lignes citées sont celles des fichiers bruts à la date et au SHA indiqués. Les fichiers JSON minifiés
(`OneDark.json`, une seule ligne) sont cités par clé.

## Rôles comparés

- **accent** : la couleur d'action principale du thème (rôle nommé dans chaque tableau).
- **surface** : fond de l'éditeur / de la page (`editor.background`, `canvas.default`, `base`).
- **ink** : texte principal (`editor.foreground`, `fg.default`, `text`).
- **danger** et **succès** : le rouge de suppression / d'erreur et le vert d'ajout du thème. Rôle retenu : celui que
  le thème donne aux marqueurs « supprimé » et « ajouté » de l'éditeur (`editorGutter.deletedBackground` /
  `addedBackground`, `gitDecoration.*`, `danger.fg` / `success.fg`, `markup.deleted` / `markup.inserted`), car le
  registre les nomme `diffRemoved` / `diffAdded` et que le CSS les reprend pour `--nc-danger` / `--nc-success`.
- **texte sur accent** : relevé pour information quand la source le donne ; il n'est pas adopté, le texte sur
  accent est calculé (`readableOn`, Tasks 5 et 6).
- Les couleurs dérivées (secondaire, champ, survol, bordure, muted, faint, accent fort) ne sont pas comparées :
  elles suivent la dérivation de l'application.

## Décisions générales

1. Valeur de l'application égale à la valeur officielle : rien ne change.
2. Écart : la valeur officielle est adoptée telle quelle (registre, `Themes.kt`, CSS).
3. Une valeur officielle qui ne tient pas un seuil de lisibilité (Task 5 / 6) reste officielle ; c'est la
   dérivation qui s'adapte (texte sur accent calculé, rouge et vert de texte rapprochés de l'encre jusqu'au seuil).
4. Aucune exemption de contraste n'est demandée par ce relevé (voir les rapports des Tasks 5 et 6 pour les
   paires qui l'auraient justifiée).

---

## Catppuccin

Sources (lues le 2026-10-02) :
- `https://raw.githubusercontent.com/catppuccin/palette/main/palette.json`, SHA `07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd`, version `1.8.0`.
- Recoupement : `https://raw.githubusercontent.com/catppuccin/vscode/main/packages/catppuccin-vsc/package.json`, SHA `befc9e6fc41980f4241408f7049755d47c06ff45`, ligne 93 : accent par défaut du portage VS Code = `mauve`.

Constats : l'application mélangeait deux saveurs (surface = Mocha, texte = Frappé) ; son accent `#658ff2` n'est dans
aucune saveur de la palette. Choix de l'accent : la palette déclare 14 couleurs d'accent (`"accent": true`) ;
le portage VS Code prend `mauve` par défaut, mais l'application a toujours porté un bleu (bordure au survol
`rgba(137,180,250,…)`, accent fort `#89b4fa`, et `mauve` est déjà la couleur « skill »). On garde donc le bleu de
la palette : `blue`.

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| Mocha (sombre) | accent (blue) | `#89b4fa` | palette.json, `mocha.colors.blue.hex` (L2988) | `#658ff2` | oui | adoptée |
| Mocha | surface (base) | `#1e1e2e` | palette.json, `mocha.colors.base.hex` (L3219) | `#1e1e2e` | non | inchangée |
| Mocha | ink (text) | `#cdd6f4` | palette.json, `mocha.colors.text.hex` (L3030) | `#c6d0f5` (= `frappe.colors.text`, L1214 de ce SHA) | oui | adoptée |
| Mocha | danger (red) | `#f38ba8` | palette.json, `mocha.colors.red.hex` (L2820) | `#f38ba8` | non | inchangée |
| Mocha | succès (green) | `#a6e3a1` | palette.json, `mocha.colors.green.hex` (L2904) | `#a6e3a1` | non | inchangée |
| Mocha | texte sur accent | aucun rôle officiel | (la palette ne nomme pas de texte sur accent) | `#1e1e2e` (= base) | non comparé | dérivé |
| Latte (clair) | accent (blue) | `#1e66f5` | palette.json, `latte.colors.blue.hex` (L264) | n/a | n/a | `light.accent` |
| Latte | surface (base) | `#eff1f5` | palette.json, `latte.colors.base.hex` (L495) | n/a | n/a | `light.surface` |
| Latte | ink (text) | `#4c4f69` | palette.json, `latte.colors.text.hex` (L306) | n/a | n/a | `light.ink` |
| Latte | danger (red) | `#d20f39` | palette.json, `latte.colors.red.hex` (L96) | n/a | n/a | `light.danger` |
| Latte | succès (green) | `#40a02b` | palette.json, `latte.colors.green.hex` (L180) | n/a | n/a | `light.success` |

Réponses aux soupçons : les trois couleurs de l'application ne venaient PAS de la même saveur (texte = Frappé) ;
l'accent n'était pas une couleur de la palette (écart, corrigé, visible : preuve avant / après dans
`.superpowers/themes/catppuccin-avant-apres/`).

## GitHub

Sources (lues le 2026-10-02) :
- `https://github.com/primer/github-vscode-theme`, `src/colors.js` et `src/theme.js` au SHA `cd78e5e4e7bcf132a6f428ae0f32264bb1b729cf` (version 6.3.5), qui lisent `@primer/primitives` **7.10.0** (`package.json` L86).
- Primitives : `https://cdn.jsdelivr.net/npm/@primer/primitives@7.10.0/dist/json/colors/dark.json` et `light.json`.
- `theme.js` : `errorForeground` = `color.danger.fg` (L47), `gitDecoration.addedResourceForeground` = `color.success.fg` (L309), `activityBarBadge.background` = `color.accent.emphasis` (L97), `editor.background` = `color.canvas.default` (L172), `editor.foreground` = `color.fg.default` (L171).
- `colors.js` surcharge `fg.default` : clair `#1f2328` (L18), sombre `#e6edf3` (L29) ; sombre `accent.fg` `#2f81f7` (L31).

La variante imitée par l'application est « Dark » (`dark.json`, fond `#0d1117`), pas Dark Dimmed.
Rôle d'accent : `accent.emphasis` (badge d'activité, focus), la couleur d'action du thème ; `accent.fg` est la couleur de lien.

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| Dark | accent | `#1f6feb` | dark.json, `accent.emphasis` (L417) | `#1f6feb` | non | inchangée |
| Dark | surface | `#0d1117` | dark.json, `canvas.default` (L393) | `#0d1117` | non | inchangée |
| Dark | ink | `#e6edf3` | colors.js L29, `darkColors.fg.default` (surcharge de `#c9d1d9`, dark.json L387) | `#e6edf3` | non | inchangée |
| Dark | danger | `#f85149` | dark.json, `danger.fg` (L440) | `#f85149` | non | inchangée |
| Dark | succès | `#3fb950` | dark.json, `success.fg` (L422) | `#3fb950` | non | inchangée |
| Dark | texte sur accent | `#ffffff` | dark.json, `fg.onEmphasis` | `#ffffff` | non | dérivé |
| Light | accent | `#0969da` | light.json, `accent.emphasis` (L417) | n/a | n/a | `light.accent` |
| Light | surface | `#ffffff` | light.json, `canvas.default` (L393) | n/a | n/a | `light.surface` |
| Light | ink | `#1f2328` | colors.js L18, `lightColors.fg.default` (surcharge de `#24292f`, light.json L387) | n/a | n/a | `light.ink` |
| Light | danger | `#cf222e` | light.json, `danger.fg` (L440) | n/a | n/a | `light.danger` |
| Light | succès | `#1a7f37` | light.json, `success.fg` (L422) | n/a | n/a | `light.success` |

Aucun écart sombre pour GitHub.

## One

Sources (lues le 2026-10-02) :
- Palette de syntaxe Atom : `https://raw.githubusercontent.com/atom/atom/master/packages/one-dark-syntax/styles/colors.less` et `one-light-syntax/styles/colors.less`, SHA `1c3bd35ce238dc0491def9e1780d04748d8e18af`. Les couleurs y sont en `hsl(...)` ; leur conversion en hexadécimal est calculée (arrondi au plus proche).
- Accent d'interface : `one-dark-ui/styles/ui-variables-custom.less` L77 et `one-light-ui/styles/ui-variables-custom.less` L60, `@accent-bg-color` (« used for button, tooltip »), formule `mix(hsv(h,s,v), hsl(h,s,l), @accent-luma * 2)`.
- Portage VS Code : `https://raw.githubusercontent.com/akamud/vscode-theme-onedark/master/themes/OneDark.json`, SHA `a8be970644982221f9b61fb1c4b3da74b4beab79`.

Contrôle de la méthode de calcul : la formule `@accent-bg-color` du sombre (teinte 220) donne `#4d78cc`, exactement
le `button.background` du portage VS Code ; la même formule appliquée au clair (teinte 230, celle de
`one-light-syntax` `@syntax-hue`, L3) donne `#5871ef`. Calcul : script jetable, luminance relative de
`hsl(230,50%,50%)` = 0,1135 ; pondération `luma * 2`.

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| One Dark | accent (bouton) | `#4D78CC` | OneDark.json, `colors["button.background"]` ; égale à `@accent-bg-color` (ui-variables-custom.less L77, calculé) | `#4d78cc` | non | inchangée |
| One Dark | surface | `#282C34` | OneDark.json, `colors["editor.background"]` ; one-dark-syntax colors.less L28 `@syntax-bg` = `hsl(220,13%,18%)` = `#282c34` | `#282c34` | non | inchangée |
| One Dark | ink | `#ABB2BF` | OneDark.json, `colors["editor.foreground"]` ; colors.less L9 `@mono-1` = `hsl(220,14%,71%)` = `#abb2bf` | `#abb2bf` | non | inchangée |
| One Dark | danger | `#E06C75` | OneDark.json, `tokenColors` « Markup Deleted » (`markup.deleted`) ; colors.less L19 `@hue-5` = `hsl(355,65%,65%)` = `#e06c75` | `#e05561` | oui | adoptée |
| One Dark | succès | `#98C379` | OneDark.json, `tokenColors` « Markup Inserted » (`markup.inserted`) ; colors.less L17 `@hue-4` = `hsl(95,38%,62%)` = `#98c379` | `#8cc265` | oui | adoptée |
| One Dark | texte sur accent | `#FFFFFF` | OneDark.json, `colors["button.foreground"]` | `#ffffff` | non | dérivé (blanc sur `#4d78cc` : 4,31 < 4,5, donc la dérivation choisit le noir) |
| One Light | accent (bouton) | `#5871ef` | one-light-ui ui-variables-custom.less L60 `@accent-bg-color`, calculé (teinte 230) | n/a | n/a | `light.accent` |
| One Light | surface | `#fafafa` | one-light-syntax colors.less L28 `@syntax-bg` = `hsl(230,1%,98%)` | n/a | n/a | `light.surface` |
| One Light | ink | `#383a42` | colors.less L9 `@mono-1` = `hsl(230,8%,24%)` | n/a | n/a | `light.ink` |
| One Light | danger | `#e45649` | colors.less L19 `@hue-5` = `hsl(5,74%,59%)` | n/a | n/a | `light.danger` |
| One Light | succès | `#50a14f` | colors.less L17 `@hue-4` = `hsl(119,34%,47%)` | n/a | n/a | `light.success` |

Les valeurs sombres `#e05561` et `#8cc265` de l'application ne se retrouvent dans aucun des fichiers relus : écarts, corrigés.
Limite : il n'existe pas de portage VS Code de One Light dans les sources prévues ; le clair vient donc de la
palette Atom (calculée depuis les `hsl` du fichier).

## Ayu

Sources (lues le 2026-10-02) : `https://raw.githubusercontent.com/ayu-theme/vscode-ayu/master/ayu-dark.json`, `ayu-mirage.json`, `ayu-light.json`, SHA `d676974ebb245fa5a7ae4444027f72801017f1b6` (branche par défaut `master`, pas `main`). Palette de base `ayu-theme/ayu-colors` au SHA `b0fd979a1ddf050101b43311fa598a1a9c5f1bbc` (non nécessaire : le thème VS Code donne chaque rôle).

L'application imite **Dark**, pas Mirage (fond `#10141c` = `ayu-dark.json` L106 ; Mirage est `#242936`).

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| Dark | accent | `#e6b450` | ayu-dark.json, `button.background` (L18) | `#e6b450` | non | inchangée |
| Dark | surface | `#10141c` | ayu-dark.json, `editor.background` (L106) | `#10141c` | non | inchangée |
| Dark | ink | `#bfbdb6` | ayu-dark.json, `editor.foreground` (L107) | `#bfbdb6` | non | inchangée |
| Dark | danger | `#f26d78` | ayu-dark.json, `editorGutter.deletedBackground` (L147) | `#f26d78` | non | inchangée |
| Dark | succès | `#70bf56` | ayu-dark.json, `editorGutter.addedBackground` (L146) | `#70bf56` | non | inchangée |
| Dark | texte sur accent | `#765b24` | ayu-dark.json, `button.foreground` (L19) | `#10141c` | non comparé | dérivé (le texte officiel `#765b24` sur `#e6b450` ne fait que 3,34 : la dérivation garde un texte lisible, ici `#10141c` = 9,67) |
| Light | accent | `#f29718` | ayu-light.json, `button.background` (L18) | n/a | n/a | `light.accent` |
| Light | surface | `#fcfcfc` | ayu-light.json, `editor.background` (L106) | n/a | n/a | `light.surface` |
| Light | ink | `#5c6166` | ayu-light.json, `editor.foreground` (L107) | n/a | n/a | `light.ink` |
| Light | danger | `#ff7383` | ayu-light.json, `editorGutter.deletedBackground` (L147) | n/a | n/a | `light.danger` |
| Light | succès | `#6cbf43` | ayu-light.json, `editorGutter.addedBackground` (L146) | n/a | n/a | `light.success` |

Aucun écart sombre pour Ayu. (`errorForeground` vaut `#d95757` en sombre, L11 ; le rouge de suppression
`#f26d78` est conservé, c'est le rôle du registre `diffRemoved`.)

## Rosé Pine

Sources (lues le 2026-10-02) :
- `https://raw.githubusercontent.com/rose-pine/palette/main/source/index.ts`, SHA `92af52b465ab6e47437aca223c9b8d3009a2023b` (source des variantes `main`, `moon`, `dawn`).
- Recoupement : `https://raw.githubusercontent.com/rose-pine/vscode/main/themes/rose-pine-moon-color-theme.json` et `rose-pine-dawn-color-theme.json`, SHA `d8f5ebe8e096fa833e997c07eb7685ee1677a4ba`.
- `https://raw.githubusercontent.com/rose-pine/palette/main/palette.json` (même SHA) donne `dawn.text` = `464261` (ligne 183 du fichier, variante `dawn`), alors que `source/index.ts` L101 et le portage VS Code (`editor.foreground`, L81) donnent `#575279`. Deux sources sur trois concordent, et `palette.json` a été ajouté par un commit « temp: add json, toml, yaml » : la valeur `464261` est écartée (anomalie de `palette.json`, à signaler en amont).

L'application imite **Moon**, pas Main : `base` `#232136` (index.ts L51) et `rose` `#ea9a97` (L59) ; `main.rose` vaut `#ebbcba` (L14).
Rosé Pine n'a pas de vert : la couleur d'ajout du thème est `foam` (`editorGutter.addedBackground`, moon L138).

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| Moon | accent (rose) | `#ea9a97` | index.ts `moon.rose` (L59) ; vscode moon `button.background` (L22) | `#ea9a97` | non | inchangée |
| Moon | surface (base) | `#232136` | index.ts `moon.base` (L51) ; vscode moon `editor.background` (L71) | `#232136` | non | inchangée |
| Moon | ink (text) | `#e0def4` | index.ts `moon.text` (L56) ; vscode moon `editor.foreground` (L81) | `#e0def4` | non | inchangée |
| Moon | danger (love) | `#eb6f92` | index.ts `moon.love` (L57) ; vscode moon `editorGutter.deletedBackground` (L141) et `errorForeground` (L206) | `#908caa` (= `moon.subtle`, un gris, index.ts L54) | oui | adoptée |
| Moon | succès (foam) | `#9ccfd8` | index.ts `moon.foam` (L61) ; vscode moon `editorGutter.addedBackground` (L138) | `#9ccfd8` | non | inchangée |
| Moon | texte sur accent | `#232136` | vscode moon `button.foreground` (L23) | `#232136` | non | dérivé |
| Dawn | accent (rose) | `#d7827e` | index.ts `dawn.rose` (L104) ; vscode dawn `button.background` (L22) | n/a | n/a | `light.accent` |
| Dawn | surface (base) | `#faf4ed` | index.ts `dawn.base` (L96) ; vscode dawn `editor.background` (L71) | n/a | n/a | `light.surface` |
| Dawn | ink (text) | `#575279` | index.ts `dawn.text` (L101) ; vscode dawn `editor.foreground` (L81) | n/a | n/a | `light.ink` |
| Dawn | danger (love) | `#b4637a` | index.ts `dawn.love` (L102) ; vscode dawn `editorGutter.deletedBackground` (L141) | n/a | n/a | `light.danger` |
| Dawn | succès (foam) | `#56949f` | index.ts `dawn.foam` (L106) ; vscode dawn `editorGutter.addedBackground` (L138) | n/a | n/a | `light.success` |

Réponse au soupçon : le « danger » de Rosé Pine était `subtle`, un gris (dans le portage VS Code c'est la couleur
des fichiers supprimés dans Git, `gitDecoration.deletedResourceForeground` L220, pas celle de l'erreur). Le rôle
du registre est une erreur lisible : adopté `love`. Toutes les couleurs sombres sont bien de Moon.

## Vercel

Sources (lues le 2026-10-02) : `https://vercel.com/geist/colors` (page rendue par JavaScript ; les valeurs ne sont pas dans le
texte : lues dans la feuille de style de la page, `https://vercel.com/vc-ap-b3331f/_next/static/immutable/chunks/21h6t23lz7aea.css`,
fichier minifié sur une ligne, blocs `:root,.light-theme,…` (clair, offset 248885) et `.dark,.dark-theme,.invert-theme` (sombre, offset 255338), propriétés `--ds-*` en sRGB hexadécimal).
Rôles Geist : `--ds-background-100` (fond de page) ; `--ds-gray-1000` (couleur 10, « texte et icônes principaux ») ;
`--ds-blue-700`, `--ds-red-700`, `--ds-green-700` (couleur 7 de chaque échelle, « arrière-plans à fort contraste »,
la couleur pleine de l'échelle).

| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
|---|---|---|---|---|---|---|
| Dark | accent | `#0071f6` | chunks/21h6t23lz7aea.css, bloc `.dark`, `--ds-blue-700` | `#006efe` | oui | adoptée |
| Dark | surface | `#000` | `.dark`, `--ds-background-100` | `#000000` | non | inchangée |
| Dark | ink | `#ededed` | `.dark`, `--ds-gray-1000` | `#ededed` | non | inchangée |
| Dark | danger | `#f13242` | `.dark`, `--ds-red-700` | `#F13342` | oui (1 unité) | adoptée |
| Dark | succès | `#00ab3e` | `.dark`, `--ds-green-700` | `#00AD3A` | oui | adoptée |
| Dark | texte sur accent | aucun rôle | (Geist ne nomme pas de texte sur accent) | `#ffffff` | non comparé | dérivé |
| Light | accent | `#0070f7` | bloc `:root,.light-theme`, `--ds-blue-700` | n/a | n/a | `light.accent` |
| Light | surface | `#fff` | `:root`, `--ds-background-100` | n/a | n/a | `light.surface` |
| Light | ink | `#171717` | `:root`, `--ds-gray-1000` | n/a | n/a | `light.ink` |
| Light | danger | `#fc0035` | `:root`, `--ds-red-700` | n/a | n/a | `light.danger` |
| Light | succès | `#28a948` | `:root`, `--ds-green-700` | n/a | n/a | `light.success` |

Les valeurs de l'application (`#006efe`, `#F13342`, `#00AD3A`) sont proches mais pas égales à l'échelle Geist lue :
écarts, corrigés. Lecture : feuille de style statique (sRGB) au lieu de propriétés calculées dans un navigateur ;
les mêmes noms de propriétés `--ds-*` que la consigne.
