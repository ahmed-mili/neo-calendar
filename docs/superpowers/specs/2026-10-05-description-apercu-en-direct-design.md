# Description : un éditeur « aperçu en direct » comme Obsidian

Date : 2026-10-05. Demande : la description d'un évènement s'écrit et se lit
EXACTEMENT comme une note Obsidian en aperçu en direct (live preview), jusqu'au
moindre détail, et elle saute de ligne aussi dans le fichier.

## 1. Constat

- **Fichier** : une description de plusieurs lignes est écrite sur UNE ligne,
  `description: "- [ ] a\n- [ ] b"` (`stringifyYamlAtom` = `JSON.stringify`).
  Illisible et inéditable à la main dans Obsidian ou VS Code.
- **Éditeur** : `DescriptionRow` (EventPanelRows.tsx) découpe la description en
  lignes, chacune rendue à part, et n'ouvre qu'UN `<textarea>` d'une ligne à la
  fois. Conséquences : impossible de sélectionner à la souris sur plusieurs
  lignes, impossible de copier un morceau qui en traverse plusieurs, Ctrl+A
  bascule vers un autre champ, le gras/italique ne se rendent pas (`**x**` reste
  brut), et chaque touche (Entrée, Retour arrière, flèches) est réimplémentée à
  la main avec des écarts par rapport à Obsidian.

## 2. Décision

1. **Format** : une description multiligne s'écrit en bloc littéral YAML,
   octet pour octet comme Obsidian l'écrit (mesuré avec
   `app.fileManager.processFrontMatter`, cf. §3). Toute la chaîne de lecture et
   d'écriture suit : bureau/Android web (`desktopEventFormat.ts`), greffon
   (`FullNoteCalendar.ts`), Android natif (`Frontmatter.kt`, `Serialize.kt`),
   corpus de conformité.
2. **Éditeur** : UN seul éditeur CodeMirror 6 (le moteur d'Obsidian) pour toute
   la description, avec un aperçu en direct maison sur l'arbre `@lezer/markdown`
   (GFM). Il remplace `DescriptionRow`, le `<textarea>` simple de
   `DescriptionSection` et le mode « whole » de Ctrl+A. Les règles du §4 sont
   celles mesurées dans Obsidian 2026-10-05 sur le vault Personal ; elles font
   foi.

## 3. Format du fichier (mesuré dans Obsidian)

Une chaîne SANS `\n` garde l'écriture actuelle (`JSON.stringify`), rien ne
change pour elle. Une chaîne AVEC `\n` :

| Valeur | Écrit par Obsidian |
|---|---|
| `"a\nb"` | `description: \|-` puis `  a`, `  b` |
| `"a\n\nb"` | `\|-`, `  a`, `` (ligne vide SANS indentation), `  b` |
| `"a\n"` (un seul `\n` final) | `\|`, `  a` |
| `"a\n\n"` (plusieurs `\n` finaux) | `\|+`, `  a`, `` |
| `" a\nb"` (1re ligne commence par une espace) | `\|2-`, `   a`, `  b` |
| `"\ta\nb"` (1re ligne commence par une tabulation) | `\|-`, `  \ta`, `  b` |
| `"- [ ] \nb"` (espace en fin de ligne) | `\|-`, `  - [ ] `, `  b` (gardée) |
| `"\na"` (commence par `\n`) | `\|-`, `  ` (2 espaces), `  a` |
| `"a\n "`, `"\n"`, contient `\r` ou un caractère de contrôle autre que `\t` | entre guillemets (garder `JSON.stringify`) |

Règles d'écriture : indentation 2 espaces ; une ligne vide s'écrit vide, SAUF
la première ligne quand elle est vide (Obsidian/js-yaml y met l'indentation,
`"  "`) ; indicateur d'indentation `2` quand la première ligne commence par une
espace ; chomping `-` (pas de `\n` final), rien (un seul), `+` (plusieurs) ;
repli `JSON.stringify` quand la chaîne contient `\r`, un caractère de contrôle
hors `\t`, se termine par une ligne faite seulement d'espaces (`"a\n "`), ou ne
contient que des `\n`.

Lecture : un `description:` suivi de `|`, `|-`, `|+`, `|N`, `|N-`, `|N+`
(et `>` équivalents, pliés selon YAML) lit les lignes suivantes indentées
(et les lignes vides entre elles) jusqu'à la prochaine clé de premier niveau ;
l'indentation retirée est celle de l'indicateur, sinon celle de la première
ligne non vide. Le sérialiseur regroupe une clé et ses lignes de continuation :
une clé INCONNUE multiligne est recopiée octet pour octet, une clé connue
remplace toutes ses lignes. Une ligne de continuation n'est JAMAIS prise pour
une clé (`  - [ ] a: b` n'est pas la clé `- [ ] a`).

## 4. Comportement de l'éditeur (mesuré dans Obsidian, aperçu en direct)

### 4.1 Rendu (curseur ailleurs)

- `- [ ] ` / `* [ ] ` / `+ [ ] ` : la case de l'app (rond `TaskCheckbox`), le
  marqueur caché. `[x]`/`[X]` : cochée, texte barré et atténué. Une case vide
  (`- [ ] ` seul) reste une case.
- `- ` / `* ` / `+ ` : une puce (point). `1. ` / `1) ` : le numéro tel qu'écrit.
- Indentation (tabulation ou espaces) : décalage par niveau.
- `**gras**`, `*ital*` / `_ital_`, `***les deux***`, `~~barré~~`, `==surligné==`,
  `` `code` ``, `<u>souligné</u>` : rendus, marqueurs cachés.
- `[nom](adresse)` : le nom, en lien ; `<https://…>` et une URL nue
  `https://…` : lien.
- `# Titre` à `###### Titre` : titre, `#` cachés. `> citation` : citation.
- Le reste est du texte, ligne pour ligne (une ligne « Total » sous une liste
  est une ligne de texte, pas la suite de l'élément).

### 4.2 Ce que le curseur dévoile (règles exactes)

- Un élément en ligne (lien, gras, italique, barré, surligné, code, souligné)
  montre sa syntaxe brute quand la sélection touche son intervalle, BORNES
  INCLUSES : `Total [lien](https://a.b) fin` → curseur en 6 (devant `[`) ou en
  25 (après `)`) : brut ; en 5 ou 26 : rendu.
- Le marqueur d'une tâche se dévoile quand le curseur est dans
  `[début du marqueur, fin du marqueur)` : `- [ ] a` → brut pour 0 à 5, case
  pour 6 ; `\t- [ ] a` → case en 0 (avant la tabulation), brut de 1 à 6, case
  en 7.
- Une puce et un numéro ne se dévoilent jamais (toujours dessinés).
- Un titre dévoile ses `#` quand le curseur est sur sa ligne.

### 4.3 Touches (résultat exact ; `|` = curseur)

| Avant | Touche | Après |
|---|---|---|
| `- [ ] Tache|` | Entrée | `- [ ] Tache\n- [ ] |` |
| `- [ ] Ta|che` | Entrée | `- [ ] Ta\n- [ ] |che` |
| `- [ ] |Tache` | Entrée | `- [ ] \n- [ ] |Tache` |
| `- [x] Fait|` | Entrée | `- [x] Fait\n- [ ] |` (la suite n'est jamais cochée ; `[-]` aussi → `[ ]`) |
| `- [ ] a\n- [ ] |` | Entrée | `- [ ] a\n|` (marqueur retiré) |
| `- [x] |` | Entrée | `|` |
| `- [ ] a\n\t- [ ] b|` | Entrée | `…\n\t- [ ] |` |
| `- [ ] a\n\t- [ ] |` | Entrée | `- [ ] a\n- [ ] |` (désindente d'un niveau) |
| `- a\n\t- |` | Entrée | `- a\n- |` |
| `- item|` / `* a|` / `+ a|` | Entrée | `\n- |` / `\n* |` / `\n+ |` |
| `- item\n- |` | Entrée | `- item\n|` |
| `1. a|` / `9. a|` / `1) a|` | Entrée | `\n2. |` / `\n10. |` / `\n2) |` |
| `1. a\n2. |` | Entrée | `1. a\n|` |
| `> a|` | Entrée | `> a\n> |` |
| `  - [ ] a|` | Entrée | `  - [ ] a\n  - [ ] |` |
| `- [|] Tache` (dans le marqueur) | Entrée | `- [\n|] Tache` (coupure brute) |
| `|- [ ] Tache` | Entrée | `\n|- [ ] Tache` |
| `Total|` | Entrée | `Total\n|` |
| sélection `- [ ] a|bc\n- [ ] de|f` | Entrée | `- [ ] a\n|f` (remplace, sans suite de liste) |
| `- [ ] Tache|` | Maj+Entrée | `- [ ] Tache\n      |` (6 espaces : continuation alignée) |
| `- [ ] |Tache` | Retour arrière | `- [ ]|Tache` (un caractère, rien de plus) |
| `- [ ] a\n- [ ] |` | Retour arrière | `- [ ] a\n- [ ]|` |
| `- |item` | Retour arrière | `-|item` |
| `abc\n|def` | Retour arrière | `abc|def` |
| `- [ ] a|\n- [ ] b` | Suppr | `- [ ] a|- [ ] b` |
| `- [ ] a\n- [ ] b|` | Tab | `- [ ] a\n\t- [ ] b|` (la ligne entière, curseur suit) |
| `- [ ] a|bc` | Tab | `\t- [ ] a|bc` |
| `a|bc` (pas une liste) | Tab | `\ta|bc` (indente la ligne, comme Obsidian) |
| sélection sur 2 lignes de liste | Tab | les deux lignes indentées, sélection gardée |
| `- [ ] a\n\t- [ ] b|` | Maj+Tab | `- [ ] a\n- [ ] b|` |
| `- [ ] a|` (niveau 0) | Maj+Tab | inchangé |

Indentation : TABULATION (réglage Obsidian `useTab: true`, `tabSize: 4`).

### 4.4 Raccourcis (Obsidian)

| Raccourci | Effet |
|---|---|
| Ctrl+L | bascule la case : texte → `- [ ] texte` (curseur décalé de 6) ; `- a` → `- [ ] a` ; `- [ ] a` → `- [x] a` ; `- [x] a` → `- [ ] a` ; ligne vide → `- [ ] ` |
| Ctrl+L, sélection sur plusieurs lignes `a` / `- b` / `- [ ] c` | `- [ ] a` / `- [ ] b` / `- c` (chaque ligne avance d'un cran : texte → case, puce → case, case → puce) |
| Ctrl+B | sélection → `**sel**` (sélection gardée sur le mot) ; curseur dans un mot → le mot entier ; déjà gras → retiré |
| Ctrl+I | `*sel*` (astérisque, pas `_`) ; mêmes règles |
| Ctrl+A | tout le texte de la description |
| Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z | annuler / rétablir dans la description (historique CodeMirror), jamais l'annulation globale de l'app |
| Ctrl+C / X / V | presse-papiers natif, sélection multiligne comprise |

Les boutons de la barre (gras, italique, souligné, listes, cases, effacer)
agissent sur la sélection CodeMirror, avec ces mêmes règles.

### 4.5 Souris

- Clic sur une case : coche/décoche (`[ ]` ↔ `[x]`), sans déplacer le curseur
  ni ouvrir quoi que ce soit.
- Clic sur un lien rendu : l'ouvre (`onOpenLink`). Clic droit : la petite barre
  existante (modifier, copier).
- Clic ailleurs : pose le curseur au caractère cliqué. Glisser : sélection
  native, à travers les lignes, les cases et les liens.
- Double clic : mot ; triple clic : ligne.

### 4.6 Ce qui reste propre à Neo Calendar (sans équivalent Obsidian)

- Coller une adresse seule la transforme en lien titré (`urlMarkdown`).
- Ctrl+K ouvre la fenêtre « ajouter un lien » existante.
- Pièces jointes, barre de mise en forme, menu de l'icône (bureau).
- Retiré, parce qu'Obsidian ne le fait pas : le Retour arrière contre un lien
  qui ouvrait sa fenêtre, le clic À CÔTÉ d'un lien qui ouvrait sa fenêtre.

### 4.7 Autres

- Lecture seule (évènement ICS) : même rendu, aucune édition, cases
  désactivées, liens cliquables ; vide et verrouillé : rien (comme aujourd'hui).
- Vide et modifiable : invite « Add a description » (`t()`).
- Hauteur : suit le contenu, jamais d'ascenseur interne.
- `setDescription` à chaque changement, `onCommit` à la perte du focus (comme
  avant) et après un clic sur une case.
- Le champ est un `contenteditable` : les gardes clavier existantes
  (`keyboardGuard`, `desktopCommands`, `useSheetDrag`, menus contextuels) le
  reconnaissent déjà ; `desktopEditCommands` doit router Annuler/Rétablir vers
  CodeMirror quand le focus est dans `.cm-editor`.

## 5. Hors périmètre

- L'éditeur natif Kotlin de l'APK Compose (`ui/fields/DescriptionEditor.kt`) :
  seul son LECTEUR/ÉCRIVAIN de fichier change ici.
- Tableaux, blocs de code clôturés, callouts, images intégrées : rendus en
  texte (non cassés, non stylés).
