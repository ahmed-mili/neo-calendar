# Plan : description en aperçu en direct (comme Obsidian)

Spec : `docs/superpowers/specs/2026-10-05-description-apercu-en-direct-design.md`
(elle fait foi ; ses tableaux sont des mesures faites dans Obsidian).
Worktree : `C:\dev\neo-calendar-worktrees\description-live-preview`, branche
`feature/description-live-preview` (depuis `origin/main` 1.91.13).

Règles pour chaque tâche : messages de commit en anglais, impératif, une ligne
≤ 60 caractères, sans citation ni prénom ; `git add` des SEULS fichiers de la
tâche ; contrôles : `npx jest <fichiers touchés>` puis `npx jest` complet,
`npx tsc --noEmit -p .` et `npm --prefix apps/windows run build`.

## T1. Format : bloc littéral YAML pour une description multiligne

- `apps/windows/src/platform/desktopEventFormat.ts` : écriture (§3 de la spec,
  octet pour octet) ; lecture des blocs `|`/`>` avec indicateurs ; regroupement
  clé + lignes de continuation dans `parseFrontmatter` ET `serializeEventMarkdown`
  (clé inconnue multiligne recopiée telle quelle, continuation jamais prise pour
  une clé).
- `src/calendars/FullNoteCalendar.ts` (`modifyFrontmatterString`) : même
  écriture et même regroupement (il parse ligne par ligne avec `parseYaml`).
- Kotlin `apps/android/native/core/.../notes/Frontmatter.kt` et `Serialize.kt` :
  port exact du TypeScript.
- Corpus `conformance/notes/` : cas de lecture et d'écriture pour chaque ligne
  du tableau §3, plus clé inconnue multiligne préservée et note de l'utilisateur
  (`description: "…\n…"` sur une ligne → relue identique, réécrite en bloc).
- Tests : `src/types/descriptionPersistence.test.ts` étendu (aller-retour,
  y compris via `parseYaml` d'Obsidian simulé par `js-yaml` si présent).
- Contrôles en plus : `cd apps/android/native && ./gradlew.bat :core:test`.

## T2. Le noyau de l'éditeur (CodeMirror 6)

- Dépendances (racine `package.json`) : `@codemirror/state`, `@codemirror/view`,
  `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`,
  `@lezer/markdown` (versions courantes, vérifiées sur npm).
- `src/ui/calendar/description/` (nouveau dossier) :
  - `listCommands.ts` : fonctions PURES `(text, from, to) → {text, from, to}`
    pour Entrée, Maj+Entrée, Tab, Maj+Tab, Ctrl+L, Ctrl+B, Ctrl+I — chaque
    ligne des tableaux §4.3/§4.4 est un cas de `listCommands.test.ts`.
  - `livePreview.ts` : extension CodeMirror (ViewPlugin + décorations) du §4.1
    et §4.2 : widgets case/puce, marqueurs cachés, marques de style, liens,
    règles de dévoilement exactes ; clic case → bascule ; clic lien → callback.
  - `DescriptionEditor.tsx` : composant React (props : `value`, `editable`,
    `onChange`, `onBlur`, `onOpenLink`, `onLinkMenu`, `onPaste?`, `placeholder`,
    `focusRequest`, une poignée impérative pour la barre : `getSelection`,
    `replaceSelection`, `applyFormat`, `focus`). Valeur contrôlée sans casser
    l'historique ni le curseur (ne redispatcher que si la valeur diffère de
    l'état).
  - Tests jsdom du composant : rendu des cases/liens, clic case, dévoilement.
- Aucun branchement dans la fiche ici (T3).

## T3. Brancher l'éditeur dans la fiche et retirer l'ancien

- `DescriptionSection.tsx` : un seul `DescriptionEditor` à la place du
  `<textarea>` et de `DescriptionRow` ; barre de mise en forme, coller une
  adresse, Ctrl+K, liens (ouvrir, petite barre au clic droit, fenêtre
  modifier/retirer), pièces jointes branchés sur la poignée.
- `descriptionFormatting.ts` : italique `*`, règles Ctrl+B/I du §4.4.
- Retirer `DescriptionRow`, `DescriptionLineText`, `readsAsNote` et les aides
  devenues mortes ; adapter `desktopDescriptionShortcuts.ts`,
  `desktopDescriptionEditor.ts`, `apps/android/src/androidDescriptionEditor.ts`
  (ils visent `HTMLTextAreaElement`) ; `desktopEditCommands.ts` : annuler /
  rétablir routés vers CodeMirror dans `.cm-editor`.
- CSS (`CalendarPanel.css` et feuilles bureau/Android) : même allure que la
  fiche actuelle (police, rond de case, couleur des liens), coché barré atténué.
- Tests : réécrire ceux qui visaient le `<textarea>` ou les lignes
  (`Description*.test.tsx`, `conformance/form`), sans perdre ce qu'ils
  protégeaient.

## T4. Vérifier pour de vrai

- Lancer l'app de bureau (`npm run dev`, cf. CLAUDE.md : config updater puis
  `git checkout` du `tauri.conf.json`), ouvrir « Setup Upgrade » dans un
  dossier de calendrier de TEST (copie, jamais le vrai `C:\Neo Calendar`), et
  rejouer au clavier/souris chaque ligne du §4 ; capture avant/après ;
  vérifier le fichier écrit (bloc `|-`).

Le plan compte 4 tâches.
