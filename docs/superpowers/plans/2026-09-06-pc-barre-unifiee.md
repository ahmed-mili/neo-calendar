# Barre supérieure Windows unifiée Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ahmed choisit déjà cette méthode : ne pas redemander « Subagent-Driven ou Inline ? ».

**Goal:** Fusionner la barre de fenêtre et la barre d’outils Windows, ajouter les menus de la référence et faire naviguer les flèches du clavier selon la vue active.

**Architecture:** Conserver `useCalendarNavigation` comme source du pas de navigation. Composer une barre Windows autour de `CalendarHeader`, injectée par un slot React facultatif dans `CalendarLayout`. Un registre de commandes commun au menu et aux nouveaux raccourcis appelle les actions existantes de `DesktopCalendar` et un pont Tauri limité aux opérations natives.

**Tech Stack:** React 17, TypeScript, CSS existant, Lucide installé, Jest/ReactDOM test-utils, Tauri 2, Rust, WebView2 Windows.

**Spec:** [Spécification et référence annotée](../specs/2026-09-06-pc-barre-unifiee-design.md).

## Global Constraints

- Cible : application Windows. Aucun changement de comportement Android ou Obsidian.
- React 17, TypeScript, Jest et Tauri 2 déjà installés ; pas de nouvelle bibliothèque UI.
- Seule dépendance directe supplémentaire envisagée : `webview2-com = "=0.38.2"`, déjà résolue à cette version dans Cargo.lock, pour le pont natif Windows.
- Réutiliser les icônes existantes puis Lucide installé ; aucune icône dessinée au hasard.
- Traductions via `t()` et `src/ui/i18n.ts` ; version via `appVersion()`.
- Pas de refonte générale de `DesktopCalendar.tsx` ni de la synchronisation ICS.
- Ne pas écraser les modifications locales présentes au début de l’exécution.
- La livraison exige des tests de comportement et une comparaison visuelle Tauri.
- `git ship` est exécuté par Ahmed, jamais automatiquement par ce plan.

## État constaté et points d’entrée

Inspection du 6 septembre 2026, HEAD `a71e79d`, package local 1.74.0. Ces valeurs
décrivent l’inspection ; ne pas les recopier comme version de l’application.

| Fichier | Responsabilité et constat |
|---|---|
| `apps/windows/src-tauri/tauri.conf.json` | Fenêtre `main`, minimum 960 × 640, décorations natives actuellement actives par défaut ; fichier déjà modifié localement |
| `apps/windows/src-tauri/capabilities/default.json` | Autorisations Tauri, pas encore celles des commandes de fenêtre |
| `apps/windows/src/main.tsx` | Point d’entrée exclusivement Windows, endroit pour un shell permanent |
| `apps/windows/src/App.tsx` | États chargement, accueil et calendrier ; les trois perdraient leur barre native |
| `apps/windows/src/DesktopCalendar.tsx:3495` | Gestionnaire clavier réel du standalone, distinct du hook Obsidian ; partagé avec Android |
| `apps/windows/src/DesktopCalendar.tsx:1900` | `deleteEvents`, `undoLastDeletion`, un lot supprimé mémorisé, aucun rétablissement |
| `apps/windows/src/DesktopCalendar.tsx:3055` | `actionTargetIds`, presse-papiers, duplication et suppression existants |
| `src/ui/calendar/useCalendarNavigation.ts:66` | `goPrev`/`goNext` font déjà ±1, ±3, ±N, ±7 jours ou ±1 mois selon la vue |
| `src/ui/calendar/CalendarLayout.tsx:392` | Monte `CalendarHeader` dans `.nc-main`, après les panneaux latéraux |
| `src/ui/calendar/CalendarHeader.tsx:254` | Rendu desktop, sélecteur de vue complet, engrenage et navigation à réutiliser |
| `src/ui/calendar/CalendarSidebar.tsx:301` | Ancienne ligne latérale : toggle, recherche, version et `UpdateBadge` |
| `src/ui/calendar/useWheelZoom.ts:109` | Applique hauteur, variable CSS, ancrage et notifications de mesure |
| `src/ui/calendar/TimeGrid.tsx:250` | Monte le zoom souris et connaît `republishScrollTravel`/`noteScaleSettled` |
| `apps/windows/src-tauri/src/lib.rs:1609` | `fetch_if_due` protège déjà les recherches concurrentes et le délai automatique |

Les icônes de plateforme, Cargo.toml, tauri.conf.json, DescriptionSection.tsx et
un test de description avaient des modifications locales. Refaire `git status
--short` à l’exécution et conserver ce travail. Ne pas utiliser une restauration
globale de tauri.conf.json après configuration de l’updater : elle effacerait
également `decorations: false` et les modifications préexistantes.

## Préparation d’exécution

- [ ] Lire la spec, la capture et la réponse éventuelle d’Ahmed sur Annuler/Rétablir.
- [ ] Appliquer `using-git-worktrees` à l’exécution si une isolation est nécessaire ;
  tenir compte des changements locaux au lieu de repartir d’un HEAD incomplet.
- [ ] Relever l’état initial avec `git status --short`, puis lancer les tests ciblés
  existants ci-dessous. Conserver les échecs préexistants dans le compte rendu.

```powershell
npx jest --runInBand --runTestsByPath src/ui/calendar/keyboardGuard.test.ts src/ui/calendar/shortcutRegistry.test.ts src/ui/calendar/useWheelZoom.test.tsx src/ui/calendar/useInfiniteScroll.test.tsx src/ui/calendar/CalendarHeaderMonthSheet.test.tsx
```

- [ ] Mesurer dans la référence les centres des contrôles, l’intervalle entre vue,
  Aujourd’hui et flèches, les surfaces de survol et les séparateurs. Comparer à la
  capture Tauri initiale à échelle Windows connue. La référence est un montage :
  ne pas assimiler automatiquement ses pixels à des CSS px.

## Structure et ordre des livrables

1. Navigation et contrat des nouvelles commandes.
2. Pont Windows et contrôles de fenêtre permanents.
3. Actions d’affichage et recherche de mise à jour.
4. Actions Modifier, sélection visible et rétablissement de suppression.
5. Menu à sous-menus et barre unique intégrée.
6. Vérification complète, comparaison Tauri et documentation de livraison.

Les tâches 2 à 4 peuvent être préparées séparément après le contrat de la tâche 1,
mais leurs modifications communes à `DesktopCalendar.tsx` et `lib.rs` doivent
être intégrées séquentiellement. Un agent réalise une tâche ; les revues suivent
le skill d’exécution. Ce plan a une auto-relecture locale, sans sous-agent.

### Task 1: Raccorder les flèches et définir les commandes Windows

**Files:**
- Create: `apps/windows/src/desktopCommands.ts`
- Create: `apps/windows/src/desktopCommands.test.ts`
- Create: `src/ui/calendar/useCalendarNavigation.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx:3495`
- Modify: `src/ui/calendar/shortcutRegistry.ts`
- Modify: `src/ui/calendar/ShortcutsPanel.tsx`
- Test: `src/ui/calendar/shortcutRegistry.test.ts`

**Interfaces:**
- Consumes: `goPrev(): void`, `goNext(): void`, `isEditableTarget(target)` existants.
- Produces: types et fonction suivants ; tous les consommateurs emploient ces IDs.

```ts
export type DesktopCommandId =
    | "previous" | "next" | "settings" | "check-updates"
    | "undo" | "redo" | "cut" | "copy" | "paste" | "paste-plain"
    | "delete" | "select-all" | "duplicate"
    | "hours-reset" | "hours-increase" | "hours-decrease"
    | "reload" | "hard-reload" | "devtools" | "fullscreen";

export interface DesktopCommand {
    enabled: boolean;
    run: () => void | Promise<void>;
}
export type DesktopCommands = Partial<Record<DesktopCommandId, DesktopCommand>>;

export interface DesktopShortcutContext {
    commands: DesktopCommands;
    blocked: boolean;
    onError: (error: unknown) => void;
}
export function handleDesktopShortcut(
    event: KeyboardEvent,
    context: DesktopShortcutContext
): boolean;
// true : accord reconnu/consommé ; false : l'ancien gestionnaire continue.
```

- [ ] **Step 1: Écrire les tests de navigation avant de changer le clavier.**
  Le hook conserve son implémentation actuelle si ces tests passent. Monter un
  harness React 17 et vérifier le pas sans dépendre de la date réelle.

```tsx
/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { ViewType } from "../types";
import { addDays } from "./CalendarUtils";

test.each<[ViewType, number, number]>([
    ["day", 3, 1], ["3days", 3, 3], ["days", 5, 5],
    ["week", 3, 7], ["list", 3, 7],
])("%s avance puis revient au point de départ", (view, count, step) => {
    const host = document.createElement("div");
    let nav!: ReturnType<typeof useCalendarNavigation>;
    function Harness() {
        nav = useCalendarNavigation(view, 1, count);
        return null;
    }
    act(() => { ReactDOM.render(<Harness />, host); });
    act(() => { nav.setCurrentDate(new Date(2026, 9, 24)); });
    const start = nav.currentDate;
    act(() => { nav.goNext(); });
    expect(nav.currentDate.toDateString()).toBe(addDays(start, step).toDateString());
    act(() => { nav.goPrev(); });
    expect(nav.currentDate.toDateString()).toBe(start.toDateString());
    act(() => { ReactDOM.unmountComponentAtNode(host); });
});
```

  Ajouter le cas mois décembre → janvier → décembre, le changement 3 → 5 jours
  via `setDaysCount`, et l’ancrage `alignToday` sans recalage involontaire.

- [ ] **Step 2: Écrire et lancer un test rouge sur le routeur réel.**

```ts
/** @jest-environment jsdom */
import { handleDesktopShortcut } from "./desktopCommands";

test("ArrowRight utilise la même action que le bouton", () => {
    const next = jest.fn();
    const event = new KeyboardEvent("keydown", {
        key: "ArrowRight", bubbles: true, cancelable: true,
    });
    expect(handleDesktopShortcut(event, {
        commands: { next: { enabled: true, run: next } },
        blocked: false, onError: jest.fn(),
    })).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
});
```

```powershell
npx jest --runInBand --runTestsByPath apps/windows/src/desktopCommands.test.ts src/ui/calendar/useCalendarNavigation.test.tsx
```

  Attendu avant implémentation : module `desktopCommands` absent ; pas un échec
  d’import Tauri. Étendre avec ArrowLeft, `blocked`, `isComposing`, `defaultPrevented`,
  input, textarea, select, descendant contenteditable, rôle menu/dialog et modificateurs.

- [ ] **Step 3: Implémenter le routage et l’insérer avant les anciennes branches.**
  Les accords simples utilisent `key`, la ponctuation Ctrl+Maj est vérifiée sur
  AZERTY avec `key` et les codes physiques constatés. Aucune touche AltGr n’est
  consommée. Pour une commande reconnue mais désactivée, consommer l’accord hors
  champ de texte pour empêcher l’ancien gestionnaire de lancer une autre action.
  Les callbacks asynchrones rejettent vers `onError`, jamais vers une promesse oubliée.

```ts
// Dans le listener de DesktopCalendar, avant son calcul `targets` :
if (!isAndroid && handleDesktopShortcut(event, {
    commands: desktopCommands,
    blocked: calendarShortcutsBlocked,
    onError: (reason) => setStorageError(errorMessage(reason)),
})) return;
```

  Définir `desktopCommands` dans ce composant avec previous/next, puis enrichir
  ce même objet aux tâches suivantes. Définir `calendarShortcutsBlocked` depuis
  les états de superposition déjà utilisés par la garde Échap vers la ligne 2556,
  plus le menu d’application et la sélection de texte non vide. Dans le listener
  Windows, cette garde doit aussi empêcher de retomber sur les anciennes branches
  de navigation/édition quand une superposition est active : retourner avant le
  switch existant, sans preventDefault sur les touches laissées au menu/champ.
  Le routeur renvoie false dans les champs pour laisser leur historique natif
  fonctionner ; les commandes de fenêtre F11 restent accessibles via le shell.
  Ne pas toucher au hook `useKeyboardShortcuts`, qui est celui d’Obsidian.

- [ ] **Step 4: Afficher les flèches dans l’aide Windows uniquement.**
  Ajouter un paramètre facultatif `platform: "shared" | "windows" = "shared"`
  à `buildSections` après `bindings` et ajouter ArrowLeft/ArrowRight uniquement
  dans le cas Windows. Le consommateur est `src/ui/calendar/ShortcutsPanel.tsx:95`.
  Le shell Windows pose `body.nc-platform-windows` au montage et retire la classe
  au démontage ; ShortcutsPanel choisit Windows seulement avec cette classe.
  Passer `undefined` pour l'argument bindings et le platform en cinquième argument,
  puis conserver l'appel par défaut pour Android/Obsidian.
  Vérifier que les accords J/K et [/] existent toujours et qu’aucun raccourci
  spécifique Windows n’est annoncé dans la sortie par défaut.

- [ ] **Step 5: Relancer les trois suites concernées puis commit ciblé.**
  Attendu : navigation, routeur et registre passent. Commit :
  `feat(windows): navigate calendar periods with arrow keys`.

### Task 2: Pont natif Windows et commandes de fenêtre disponibles partout

**Files:**
- Create: `apps/windows/src/platform/desktopWindow.ts`
- Create: `apps/windows/src/platform/desktopWindow.test.ts`
- Create: `apps/windows/src/DesktopWindowShell.tsx`
- Create: `apps/windows/src/DesktopWindowShell.css`
- Create: `apps/windows/src/DesktopWindowShell.test.tsx`
- Create: `apps/windows/src-tauri/src/window_commands.rs`
- Modify: `apps/windows/src/main.tsx`
- Modify: `apps/windows/src-tauri/src/lib.rs:1816`
- Modify: `apps/windows/src-tauri/Cargo.toml`
- Modify: `apps/windows/src-tauri/Cargo.lock`
- Modify: `apps/windows/src-tauri/capabilities/default.json`
- Modify: `apps/windows/src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `DesktopWindowShell({ children }: { children: React.ReactNode })` et
  les fonctions du pont ci-dessous. Le shell contient un conteneur identifié
  `nc-desktop-titlebar-slot`, utilisable par portail à la tâche 5. Il expose aussi
  `useDesktopTitlebarHost(): HTMLElement | null` par contexte React ; une callback
  ref renseigne l'élément après montage. Éviter une recherche DOM lors du premier
  rendu qui supposerait le slot déjà créé.
- Consumes: méthodes vérifiées dans les `.d.ts` Tauri installés :
  `getCurrentWindow`, `minimize`, `toggleMaximize`, `close`, `startDragging`,
  `isMaximized`, `isFullscreen`, `setFullscreen`, `onResized`, `onFocusChanged`.

```ts
export type NativeTextCommand =
    "undo" | "redo" | "cut" | "copy" | "paste" | "paste-plain" | "delete" | "select-all";
export function reloadDesktop(ignoreCache: boolean): Promise<void>;
export function executeNativeTextCommand(command: NativeTextCommand): Promise<void>;
export function toggleDesktopDevtools(): Promise<void>;
export function setDesktopInterfaceScale(scale: number): Promise<void>;
export function toggleDesktopFullscreen(): Promise<void>;
```

- [ ] **Step 1: Tester le shell avec une fausse fenêtre injectée.**
  Le pont expose une fabrique `createDesktopWindowActions(window)` avec un type
  structurel reprenant les méthodes utilisées ; le composant reçoit ce résultat
  en prop facultative `actions`. Tests : cliquer les trois boutons appelle les
  trois méthodes distinctes, une erreur d’action affiche `role="alert"`, un
  resize met à jour Agrandir/Restaurer, le démontage nettoie les listeners même
  si leur promesse se résout tard. Le shell rend ses contrôles avec children
  chargement, accueil et erreur, sans dépendre d’un calendrier monté.

```tsx
// Assertion de comportement après rendu du shell avec les actions simulées :
act(() => {
    host.querySelector<HTMLButtonElement>('button[aria-label="Réduire"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
expect(actions.minimize).toHaveBeenCalledTimes(1);
expect(host.querySelector("#nc-desktop-titlebar-slot")).not.toBeNull();
```

- [ ] **Step 2: Implémenter le shell et seulement ensuite désactiver les décorations.**
  Le shell Windows entoure `<App />` dans `main.tsx`, reste hors de l’error boundary
  du calendrier et prend une ligne de hauteur commune. Sa partie droite contient
  les trois contrôles ; sa partie gauche reçoit le portail ou un espace draggable.
  Le shell utilise une colonne flex de hauteur 100dvh, avec une zone de contenu
  flex:1 et min-height:0 ; l'App occupe cette zone sans ajouter 100vh sous la barre.
  Appliquer ces règles sous le shell, afin de préserver le root Android.
  Le calendrier ne réserve pas une deuxième ligne. L’accueil et le chargement
  disposent automatiquement de cette même ligne. Utiliser un vrai bouton pour
  chaque action et les icônes Lucide installées pour réduire, carré, restaurer, croix.

```json
{
  "decorations": false
}
```

  Ajouter cette propriété uniquement à `app.windows[0]` déjà existant. Ajouter
  aux permissions existantes les capacités suivantes, vérifiées dans le schéma
  Tauri local et la documentation officielle :

```json
[
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
  "core:window:allow-start-dragging",
  "core:window:allow-set-fullscreen",
  "core:webview:allow-set-zoom"
]
```

  Les lectures d’état et événements viennent de `core:default`, déjà présent.
  Utiliser la gestion explicite du drag documentée par Tauri sur la surface vide,
  avec un seul propriétaire du double clic ; ne pas cumuler une gestion manuelle
  et `data-tauri-drag-region` sur la même surface.

- [ ] **Step 3: Ajouter le module natif, sans endpoint CDP arbitraire.**
  Dans `window_commands.rs`, exposer trois commandes :
  `reload_desktop(window: WebviewWindow, ignore_cache: bool)`,
  `execute_native_text_command(window: WebviewWindow, command: NativeTextCommand)`
  et `toggle_desktop_devtools(window: WebviewWindow)`, toutes retournant
  `Result<(), String>`. Déclarer l’enum Rust avec serde `rename_all = "kebab-case"`.
  Les méthodes sont autorisées uniquement pour la fenêtre `main`.

```rust
// Corps de la commande devtools ; window est son argument WebviewWindow.
if window.label() != "main" {
    return Err("Unsupported window".into());
}
if window.is_devtools_open() {
    window.close_devtools();
} else {
    window.open_devtools();
}
Ok(())
```

  Rechargement normal : `window.reload()`. Pour le rechargement sans cache,
  utiliser `with_webview`, `controller().CoreWebView2()` et
  `CallDevToolsProtocolMethod` avec les deux chaînes fixes suivantes :

```json
{"method":"Page.reload","params":{"ignoreCache":true}}
```

  Pour l’édition, mapper l’enum aux noms Blink `Undo`, `Redo`, `Cut`, `Copy`,
  `Paste`, `PasteAndMatchStyle`, `Delete`, `SelectAll`, puis appeler :

```json
{"method":"Input.dispatchKeyEvent","params":{"type":"rawKeyDown","key":"Unidentified","commands":["PasteAndMatchStyle"]}}
```

  La liste provient de Chromium ; seuls ces noms sont acceptés par l’enum.
  Ajouter `webview2-com = "=0.38.2"` sous `cfg(windows)` dans Cargo.toml.
  Réutiliser `webview2_com::CoTaskMemPWSTR::from(text)` pour les chaînes et
  `CallDevToolsProtocolMethodCompletedHandler::create(Box::new(...))` pour le
  callback. Les définitions sont présentes dans le registre Cargo local.
  Le helper privé a la signature :

```rust
async fn call_window_protocol(
    window: tauri::WebviewWindow,
    method: &'static str,
    params: serde_json::Value,
) -> Result<(), String>;
```

  Passer le résultat COM par `std::sync::mpsc`, attendre avec
  `tauri::async_runtime::spawn_blocking` et `recv_timeout(Duration::from_secs(5))`.
  La closure `with_webview` et son callback envoient les erreurs au canal ; aucun
  `unwrap`, attente bloquante sur le thread UI ou faux succès avant le callback.
  Compiler ce module uniquement sur Windows et fournir une erreur explicite sur
  toute autre cible. Enregistrer les trois commandes dans `generate_handler!`.
  Ne jamais appeler `clearAllBrowsingData`, qui effacerait autre chose que le cache.

- [ ] **Step 4: Tester les mappings et le vrai build natif.**
  Tests Rust : chaque variant a une commande autorisée, `paste-plain` sélectionne
  PasteAndMatchStyle, le JSON de hard reload contient `ignoreCache: true`, une
  chaîne inconnue échoue à la désérialisation. Les tests TS simulent séparément
  `invoke`, `@tauri-apps/api/window` et `webview` ; ne pas élargir le stub global
  silencieusement, qui doit continuer à refuser les appels natifs inattendus.

```powershell
npx jest --runInBand --runTestsByPath apps/windows/src/platform/desktopWindow.test.ts apps/windows/src/DesktopWindowShell.test.tsx
cargo test --manifest-path apps/windows/src-tauri/Cargo.toml window_commands
npm run build
```

- [ ] **Step 5: Vérifier réduire/restaurer/fermer et drag dans Tauri, puis commit.**
  Réouvrir l’app après le test de fermeture. Commit :
  `feat(windows): add persistent custom window chrome`.

### Task 3: Commandes Afficher et recherche manuelle de mise à jour

**Files:**
- Create: `src/ui/calendar/hourHeightCommands.ts`
- Create: `src/ui/calendar/hourHeightCommands.test.ts`
- Modify: `src/ui/calendar/useWheelZoom.ts`
- Modify: `src/ui/calendar/useWheelZoom.test.tsx`
- Modify: `apps/windows/src/platform/desktopWindow.ts`
- Modify: `apps/windows/src/platform/desktopUpdates.ts`
- Create: `apps/windows/src/platform/desktopUpdates.test.ts`
- Modify: `apps/windows/src-tauri/src/lib.rs:1609`
- Modify: `apps/windows/src/DesktopCalendar.tsx`

**Interfaces:**
- Produces: `requestHourHeight(command: "reset" | "increase" | "decrease"): void`
  et événement `neo-hour-height-command`, portant exactement cette commande.
- Produces: `checkDesktopUpdates(): Promise<"ready" | "current" | "busy">`.
- Consumes: `DesktopCommands`, fonctions natives de la tâche 2,
  `currentHourHeight`, `restingHourHeight`, `setHourHeight`, `scrollForAnchor`.

- [ ] **Step 1: Tester une commande d’espacement sur le vrai hook de zoom.**
  Étendre son harness existant, avec `scrollTop`, `clientHeight`, `scrollHeight`
  et RAF contrôlés comme dans les tests actuels. Le test doit observer hauteur,
  CSS, ancrage et callbacks, pas simplement l’émission de l’événement.

```ts
const before = currentHourHeight();
act(() => { requestHourHeight("increase"); });
act(() => { jest.runOnlyPendingTimers(); });
expect(currentHourHeight()).toBeCloseTo(before * WHEEL_ZOOM_PER_NOTCH);
expect(host.style.getPropertyValue("--nc-hour-height"))
    .toBe(`${currentHourHeight()}px`);
expect(onScaleSettled).toHaveBeenCalled();
```

  Ajouter min/max, reset, aller-retour increase/decrease, molette après menu,
  menu après molette et listener absent lorsque `enabled=false`.

- [ ] **Step 2: Brancher l’événement sur le même pipeline que la molette.**
  Dans l’effet de `useWheelZoom`, enregistrer et nettoyer le nouveau listener
  uniquement lorsqu’il est enabled. Capturer l’ancre avant tout changement.

```ts
// Dans l'effet existant, element et host sont les refs validées.
offsetY = element.clientHeight / 2;
anchorHours = (element.scrollTop + offsetY) / currentHourHeight();
// Le handler reçoit command: "reset" | "increase" | "decrease".
const next = command === "reset"
    ? restingHourHeight()
    : currentHourHeight() * WHEEL_ZOOM_PER_NOTCH **
        (command === "increase" ? 1 : -1);
setHourHeight(next);
```

  Factoriser dans ce même effet les quelques lignes de programmation RAF/idle
  utilisées par les deux entrées ; garder `draw` et les deux callbacks existants.
  Les commandes sont désactivées en vue mois/liste, où aucune grille horaire
  n’est montée. Aucune nouvelle hauteur CSS indépendante.

- [ ] **Step 3: Ajouter le zoom d’interface local Windows.**
  `setDesktopInterfaceScale` appelle `getCurrentWebview().setZoom(scale)`.
  Autoriser exclusivement les paliers de la spec ; validation à la lecture et
  à l’écriture de `localStorage["neo-calendar:windows-interface-scale"]`.
  Valeur absente/invalide → 1. Appliquer au montage du shell, enregistrer seulement
  après résolution de setZoom ; en cas de rejet garder l’ancienne valeur et afficher
  l’erreur. Un reset à 100 % reste toujours accessible dans le sous-menu.

```ts
export const INTERFACE_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export function parseInterfaceScale(value: string | null): number {
    const scale = Number(value);
    return INTERFACE_SCALES.some((candidate) => candidate === scale) ? scale : 1;
}
```

- [ ] **Step 4: Exposer une recherche updater réutilisant son verrou actuel.**
  Modifier `fetch_if_due` pour retourner un `Result<UpdateCheckOutcome, String>`
  avec enum serde `ready/current/busy`. Version déjà téléchargée → ready ;
  verrou occupé → busy ; recherche terminée sans fichier prêt → current.
  Conserver le chemin automatique avec journalisation des erreurs et délai
  `UPDATE_QUIET`. La commande manuelle `check_desktop_updates` utilise `force=true`
  et retourne les erreurs au frontend. Garantir la libération de `busy` dans les
  branches succès/erreur, sans créer une deuxième boucle ou un deuxième updater.
  Relier le wrapper TS à `invoke("check_desktop_updates")` et continuer à utiliser
  les événements progress/ready et `UpdateBadge` existants.

```ts
test("une recherche manuelle ne lance pas l'installation", async () => {
    invokeMock.mockResolvedValue("current");
    await expect(checkDesktopUpdates()).resolves.toBe("current");
    expect(invokeMock).toHaveBeenCalledWith("check_desktop_updates");
    expect(invokeMock).not.toHaveBeenCalledWith("install_pending_update");
});
```

  Compléter la table `desktopCommands` : settings ouvre les paramètres ; les trois
  commandes heures émettent requestHourHeight ; reload/hard-reload/devtools/fullscreen
  appellent la tâche 2 ; check-updates affiche recherche, à jour, téléchargement
  ou erreur. Désactiver les commandes pendant leur propre requête et les reloads
  pendant une écriture en cours. La recherche ne déclenche pas d’installation.

- [ ] **Step 5: Lancer les suites touchées, cargo test et commit ciblé.**

```powershell
npx jest --runInBand --runTestsByPath src/ui/calendar/hourHeightCommands.test.ts src/ui/calendar/useWheelZoom.test.tsx apps/windows/src/platform/desktopWindow.test.ts apps/windows/src/platform/desktopUpdates.test.ts
cargo test --manifest-path apps/windows/src-tauri/Cargo.toml
```

  Commit : `feat(windows): wire display and update menu actions`.

### Task 4: Menu Modifier, sélection visible et rétablissement

**Files:**
- Create: `apps/windows/src/desktopEditCommands.ts`
- Create: `apps/windows/src/desktopEditCommands.test.ts`
- Create: `apps/windows/src/useDeletionHistory.ts`
- Create: `apps/windows/src/useDeletionHistory.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx:1900`
- Modify: `apps/windows/src/DesktopCalendar.tsx:3055`
- Modify: `apps/windows/src/desktopCommands.test.ts`

**Interfaces:**
- Produces: `visibleEventIds(events: DisplayEvent[], start: Date, end: Date): string[]`,
  intervalle `[start,end[`, et capture/restauration de la cible d’édition.
- Produces: `useDeletionHistory<T>({ restore, remove })`, où chaque fonction
  `(records: readonly T[]) => Promise<void>` rejette en cas d’échec ; retourne
  `rememberDeleted`, `undo`, `redo`, `invalidateRedo`, `canUndo`, `canRedo`, `busy`.
- Consumes: `DesktopStoredEvent` existant, `deleteEventFiles`, callbacks de copie,
  collage, duplication, suppression et commandes texte natives de la tâche 2.

- [ ] **Step 1: Tester la sélection de la plage réellement affichée.**
  `displayEvents` contient un tampon : il ne peut pas être sélectionné entièrement.

```ts
import { DisplayEvent } from "../../../src/ui/types";
import { visibleEventIds } from "./desktopEditCommands";
const event = (id: string, start: Date, end: Date) =>
    ({ id, start, end } as DisplayEvent);
test("sélectionne le chevauchement mais pas le tampon", () => {
    const start = new Date(2026, 8, 7), end = new Date(2026, 8, 14);
    expect(visibleEventIds([
        event("avant", new Date(2026, 8, 6), start),
        event("traversant", new Date(2026, 8, 6), new Date(2026, 8, 8)),
        event("après", end, new Date(2026, 8, 15)),
    ], start, end)).toEqual(["traversant"]);
});
```

```ts
export function visibleEventIds(events: DisplayEvent[], start: Date, end: Date) {
    return [...new Set(events.filter((event) =>
        event.start < end && (event.end > start ||
            (event.end.getTime() === event.start.getTime() && event.start >= start))
    ).map((event) => event.id))];
}
```

  Le caller passe les évènements des calendriers visibles. En grille horaire,
  lire la plage au déclenchement avec `visibleColumnRange(scroller)` de
  `src/ui/calendar/gridColumns.ts`, sur `.nc-main-scroller` sous calendarRootRef.
  Les `.nc-timegrid-day[data-date]` exposent déjà leurs dates : début du premier
  jour mesuré, fin exclusive au lendemain du dernier. Cela couvre le scroll
  partiel sans attendre le rebasage de currentDate. En vue mois/liste, prendre
  visibleDates, incluant les 42 cellules du mois. Si la mesure est momentanément
  absente, conserver la plage visibleDates. Tester les bornes DOM simulées après
  un scroll de 2,5 colonnes, et pas seulement les dates initiales.
  Vérifier aussi évènement ponctuel,
  évènement multijour, doublon d’occurrence, grille sans évènement et calendrier masqué.

- [ ] **Step 2: Tester l’historique à un niveau avec des callbacks asynchrones.**
  Extraire le lot actuellement géré par `deletedBatch` dans `useDeletionHistory`.
  `rememberDeleted` est appelé uniquement après une suppression réussie.

```ts
// Dans un harness ReactDOM du hook, après rememberDeleted([record]) :
await act(async () => { await history.undo(); });
expect(restore).toHaveBeenCalledWith([record]);
expect(history.canUndo).toBe(false);
expect(history.canRedo).toBe(true);
await act(async () => { await history.redo(); });
expect(remove).toHaveBeenCalledWith([record]);
expect(history.canUndo).toBe(true);
```

  Ajouter échec restore/remove conservant l’opération réessayable, double appel
  pendant une promesse pendante, nouveau lot invalidant redo et restauration
  partielle réessayée sans doublon. La fabrique de fixtures réutilise les champs
  DesktopStoredEvent de la suite taskCompletion existante.

- [ ] **Step 3: Brancher l’historique aux écritures réelles.**
  Extraire le corps de `undoLastDeletion` vers `restoreDeletedRecords(records)`.
  Conserver les chemins, contenus, mise à jour de `recordsRef` et états de sauvegarde.
  Faire rejeter cette fonction après `setStorageError` au lieu d’avaler l’erreur,
  pour que le hook n’annonce pas un succès. `remove` réutilise `deleteEventFiles`.
  Retenir seulement le lot réellement supprimé. Invalider redo après une nouvelle
  mutation utilisateur ou une modification externe du lot restauré ; ne pas
  supprimer une note qui a changé depuis Undo. Garder l’ancienne branche Android
  et ne pas inventer un historique pour les éditions partielles de récurrence.

```ts
const deletionHistory = useDeletionHistory<DesktopStoredEvent>({
    restore: restoreDeletedRecords,
    remove: deleteEventFiles,
});
// Après await deleteEventFiles(records), uniquement sur Windows et remember=true :
deletionHistory.rememberDeleted(records);
```

- [ ] **Step 4: Unifier les commandes Modifier autour de la cible capturée.**
  À l’ouverture du menu, mémoriser le champ, `selectionStart/selectionEnd` pour
  input/textarea ou `getSelection().getRangeAt(0).cloneRange()` pour contenteditable.
  La fermeture restaure focus et sélection avant la commande native ; une cible
  démontée ou désactivée annule cette action avec un état indisponible.
  L’édition textuelle utilise `executeNativeTextCommand`; la grille utilise :

```ts
// Valeurs du composant DesktopCalendar, après calcul de targets = actionTargetIds().
const eventEditCommands: DesktopCommands = {
    undo: { enabled: deletionHistory.canUndo, run: deletionHistory.undo },
    redo: { enabled: deletionHistory.canRedo, run: deletionHistory.redo },
    copy: { enabled: targets.length > 0, run: () => copyEvent(targets[0]) },
    cut: { enabled: targets.length > 0, run: () => cutEvent(targets[0]) },
    paste: { enabled: clipboard !== null, run: () => pasteEvent(currentDate) },
    "paste-plain": { enabled: false, run: () => {} },
    delete: { enabled: targets.length > 0, run: deleteTargets },
    duplicate: { enabled: targets.length > 0, run: duplicateTargets },
    "select-all": {
        enabled: visibleIds.length > 0,
        run: () => setSelectedIds(new Set(visibleIds)),
    },
};
```

  Calculer `visibleIds` avec la fonction de Step 1. Raffiner enabled pour les
  actions destructrices avec `record.readOnly`, calendrier éditable et busy.
  Coller et respecter le style est désactivé sur la grille : il s’applique au texte.
  Conserver le comportement de copie/coupe à un évènement actuel, sans annoncer
  une nouvelle copie multiple. Menu et Ctrl+A/Y/Z appellent la même table.
  Une touche dans un champ continue à être traitée nativement, sans passer par
  cette table d’évènements. Tester qu’un menu ouvert ne fait pas perdre la sélection.

- [ ] **Step 5: Tests ciblés et commit.**

```powershell
npx jest --runInBand --runTestsByPath apps/windows/src/desktopEditCommands.test.ts apps/windows/src/useDeletionHistory.test.tsx apps/windows/src/desktopCommands.test.ts apps/windows/src/DesktopCalendar.taskCompletion.test.ts src/ui/calendar/recurrenceDeletion.test.ts src/ui/calendar/useClipboardActions.test.ts
```

  Commit : `feat(windows): connect contextual edit menu commands`.

### Task 5: Menu imbriqué et barre unifiée conforme à la référence

**Files:**
- Create: `apps/windows/src/DesktopAppMenu.tsx`
- Create: `apps/windows/src/DesktopAppMenu.css`
- Create: `apps/windows/src/DesktopAppMenu.test.tsx`
- Create: `apps/windows/src/DesktopTitlebar.tsx`
- Create: `apps/windows/src/DesktopTitlebar.css`
- Create: `apps/windows/src/DesktopTitlebar.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx:3640`
- Modify: `src/ui/calendar/CalendarLayout.tsx`
- Modify: `src/ui/calendar/CalendarHeader.tsx`
- Modify: `src/ui/calendar/CalendarSidebar.tsx`
- Modify: `src/ui/calendar/CalendarHeader.css`
- Modify: `apps/windows/src/App.css` (sélecteurs qui entrent effectivement en conflit)
- Modify: `src/ui/i18n.ts`
- Test: `src/ui/calendar/CalendarHeaderMonthSheet.test.tsx`
- Test: `src/ui/calendar/CalendarSidebar.test.ts`

**Interfaces:**
- `DesktopAppMenu({ commands, onOpenChange })`, avec DesktopCommands de Task 1.
- `DesktopTitlebar({ controls, commands, onToggleSidebar, onOpenSearch,
  onNewEvent, sidebarVisible })`, controls étant un `React.ReactNode`.
- `CalendarLayoutProps.desktopTitlebar?: (controls: React.ReactNode) => React.ReactNode`.
- `CalendarHeaderProps.presentation?: "default" | "window-controls"`.
- `CalendarSidebarProps.showTopBar?: boolean`, true par défaut.

- [ ] **Step 1: Écrire les tests comportementaux de menu.**
  Harness ReactDOM jsdom, langue française, command callbacks simulés. Survoler
  le chevron, puis Modifier, puis entrer dans le sous-menu : celui-ci reste ouvert.
  Vérifier trois rubriques, aucune Aide, version dynamique, ordre des entrées,
  disabled, click-outside, Échap et restitution du focus. Tester déplacement clavier
  haut/bas, droite/gauche, Home/End, Enter/Espace, Tab et sous-menu d’échelle.

```tsx
act(() => {
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
});
expect(document.querySelector('[role="menu"]')).not.toBeNull();
expect(document.body.textContent).not.toContain("À propos de Neo Calendar");
expect(document.body.textContent).toContain(`v${appVersion()}`);
// Après ouverture de Modifier et clic sur la ligne Dupliquer :
expect(commands.duplicate!.run).toHaveBeenCalledTimes(1);
expect(document.querySelector('[role="menu"]')).toBeNull();
```

  En complément, déclencher ArrowRight dans le menu avec le routeur de Task 1
  monté et vérifier que `commands.next.run` n’est jamais appelé.

- [ ] **Step 2: Construire le menu à partir de la table et des callbacks.**
  `ContextMenu` actuel ne supporte ni cascade ni focus roving : ne pas le transformer
  en framework pour tous les menus. Réutiliser ses tokens, séparateurs et raccourcis
  visuels dans `DesktopAppMenu`. Structure typée locale :

```ts
type MenuEntry =
    | { kind: "separator"; id: string }
    | { kind: "version"; id: "version" }
    | { kind: "action"; id: DesktopCommandId; label: string; shortcut?: string }
    | { kind: "submenu"; id: "app" | "edit" | "view" | "scale";
        label: string; items: MenuEntry[] };
```

  Remplir les trois rubriques exactement avec la table de la spec. Les paliers
  d’échelle sont des `menuitemradio`, aria-checked selon la valeur appliquée.
  La version est non activable, pas un faux bouton. Tous les libellés passent par
  `t()`, dont les entrées de traduction FR/EN sont ajoutées dans i18n.ts.
  Utiliser un seul portail et un état de chemin ouvert ; toute la cascade partage
  un périmètre de fermeture. Prévoir un court délai de sortie commun, annulé à
  l’entrée d’un sous-menu. Limiter les menus au viewport et basculer le sous-menu
  vers la gauche s’il manque de place. Capturer la cible d’édition avant de déplacer
  le focus dans les menus et nettoyer timers/listeners au démontage.

- [ ] **Step 3: Composer la barre à partir de l’en-tête existant.**
  Construire `header` une seule fois dans CalendarLayout, puis choisir son emplacement :

```tsx
// `header` reprend les props actuelles, plus presentation déterminée par le slot.
{desktopTitlebar ? desktopTitlebar(header) : null}
// À l'emplacement actuel dans .nc-main :
{desktopTitlebar ? null : header}
```

  `DesktopCalendar` lit `useDesktopTitlebarHost()` et fournit le slot seulement
  quand `!isAndroid` et que cet hôte existe ; il retourne le portail vers cet hôte
  et y monte DesktopTitlebar. Sans hôte, le rendu partagé reste disponible. Passer
  `showTopBar={!desktopTitlebar}` à CalendarSidebar, de sorte que version,
  recherche et UpdateBadge n’apparaissent pas deux fois sur Windows. La valeur par
  défaut maintient tous les autres consommateurs.
  En présentation window-controls, CalendarHeader conserve le sélecteur existant,
  Today et précédent/suivant, mais n’affiche ni toggle gauche ni engrenage.
  DesktopTitlebar ajoute à gauche menu/toggle/recherche/création, une surface vide
  flexible, puis UpdateBadge et controls à droite. Les commandes de fenêtre sont
  déjà à droite du slot dans le shell. Une seule hauteur et un seul fond de barre.

- [ ] **Step 4: Appliquer le CSS mesuré sans casser les thèmes et les panneaux.**
  Créer des sélecteurs Windows locaux, min-width:0 sur le slot et ses enfants flex,
  boutons non rétractables, espace central flexible ; ne pas masquer un débordement
  pour cacher une commande. Uniformiser la hauteur du shell, des contrôles et du
  fragment CalendarHeader via `--nc-window-bar-height`. Réutiliser les fonds et
  textes du thème ; mesurer les états repos/survol/ouvert/focus/désactivé côte à côte.
  Le fond de chaque menu doit rester lisible sur le wallpaper.
  Vérifier les règles `nc-header`, `nc-sidebar-top-bar` et les états
  `body.nc-settings-open` : le shell doit rester utilisable quand les paramètres
  désactivent le layout. Les couches de menus passent au-dessus de la grille sans
  couvrir les boutons de fenêtre de manière persistante.

```css
.nc-desktop-titlebar {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
}
.nc-desktop-titlebar__drag-space {
    flex: 1 1 auto;
    min-width: 0;
    align-self: stretch;
}
.nc-desktop-titlebar button { flex-shrink: 0; }
```

  Ce bloc fixe la structure, pas les mesures de fidélité : reporter les mesures
  obtenues en préparation dans les règles locales. Conserver les infobulles
  `data-nc-tooltip` de l’app, ne pas réintroduire de `title` natif.

- [ ] **Step 5: Tests d’intégration, builds et commit.**
  DesktopTitlebar.test monte le slot, l’en-tête réel et le shell simulé : compter
  une seule occurrence de Today, du sélecteur et de chaque contrôle. Replier la
  sidebar et vérifier menu/recherche/toggle présents. Monter sans slot puis en
  Android et vérifier les anciens contrôles. Ne pas écrire des tests qui ne font
  que chercher une chaîne CSS dans les sources.

```powershell
npx jest --runInBand --runTestsByPath apps/windows/src/DesktopAppMenu.test.tsx apps/windows/src/DesktopTitlebar.test.tsx src/ui/calendar/CalendarHeaderMonthSheet.test.tsx src/ui/calendar/CalendarSidebar.test.ts src/ui/i18n.test.ts
npm run build
npm run android:frontend
```

  Commit : `feat(windows): unify calendar titlebar and application menus`.

### Task 6: Vérification de réception et livraison reviewable

**Files:**
- Create: `docs/superpowers/verification/2026-09-06-pc-barre-unifiee.md`
- Modify: `docs/PROCHAINE_VERSION.md` (fichier local ignoré)
- Modify: ce plan, uniquement pour cocher les étapes réellement exécutées.

**Interfaces:**
- Consumes: application intégrée des tâches 1 à 5 et la référence de la spec.
- Produces: preuves de tests, captures comparatives et limites éventuelles explicites.

- [ ] **Step 1: Exécuter les vérifications automatisées finales.**

```powershell
npm test
npm run build
npm run android:frontend
cargo test --manifest-path apps/windows/src-tauri/Cargo.toml
git diff --check
```

  Utiliser Prettier sur les fichiers TS/TSX ajoutés et les seules sections touchées
  des fichiers existants ; éviter de reformater les gros fichiers et le travail
  local d’une autre session. Journaliser les sorties volumineuses dans un fichier,
  lire la fin et les erreurs. N’élargir les tests qu’après une nouvelle modification
  ou un échec non expliqué.

- [ ] **Step 2: Lancer la vraie application et établir la preuve visuelle.**
  Lire les skills `senior-dev:real-render-check`, `senior-dev:state-coverage`,
  `css-layout-check`, `no-horizontal-overflow` et le skill d’automatisation approprié
  avant leurs actions. Configurer l’updater seulement si absent, en sauvegardant
  la version actuelle du JSON hors dépôt ; restaurer uniquement le changement
  de configuration temporaire. Démarrer avec `npm run dev`.
  Utiliser un dossier d’essai pour créer/copier/couper/supprimer, jamais les notes
  réelles d’Ahmed. Les captures du rapport doivent provenir de Tauri/WebView2 ;
  un navigateur Vite ne prouve pas les comportements de fenêtre.

| Vérification | Résultat attendu |
|---|---|
| Repos 1440 × 900, sidebar ouverte puis fermée | Une ligne unique, alignements de la référence, tous les contrôles présents |
| Largeur minimum 960, mise à l’échelle Windows 100/125/150 % | Aucune commande coupée, aucun scroll horizontal de page |
| Thème clair et deux thèmes sombres existants | Repos/survol/ouvert/focus/disabled lisibles ; fond menu cohérent |
| Survol chevron puis Neo Calendar / Modifier / Afficher / échelle | Ouverture continue sans trou entre surfaces ; pas d’Aide |
| Clavier dans le menu | Roving focus, cascade, Échap/Tab ; aucune navigation du calendrier |
| Vues jour, 3 jours, 5 jours, semaine, liste, mois | Boutons et flèches produisent la même date, aller-retour exact |
| Navigation après scroll horizontal et changement de vue | Bon pas et bonne plage réellement visible, sans retour différé |
| Titre, description, recherche, dialogue, composition IME | Les flèches conservent leurs usages d’édition/navigation locale |
| Supprimer → Undo → Redo → Undo | Un seul fichier d’essai, contenu préservé, aucune duplication |
| Erreur d’écriture et double déclenchement | Erreur visible, historique non perdu, pas de seconde opération concurrente |
| Texte sélectionné puis menu Couper/Coller/Coller et respecter le style | Bonne cible et sélection restaurées, vrai presse-papiers, historique texte fonctionnel |
| Ctrl+A avec évènements hors champ et calendrier masqué | Seules les occurrences de la plage visible sont sélectionnées |
| Espacement et Ctrl+molette alternés, bornes et reset | Hauteur logique/CSS cohérente, point central conservé, all-day réévalué |
| Échelle d’interface puis redémarrage | Choix restauré localement, aucune modification de hauteur horaire logique |
| Recherche updater : à jour, en cours, échec réseau, prêt | État honnête ; pas de nouvelle installation ni de requête doublée |
| Reload et hard reload | Interface rechargée ; hard reload ignore cache, préférences et fichiers conservés |
| Réduire, restaurer, drag, double clic, resize, F11 et Alt+F4 | Actions effectives, icônes d’état justes, fenêtre toujours récupérable |
| Accueil sans dossier, chargement et erreur React simulée | Commandes de fenêtre présentes en permanence |
| Android, menu du mois et drawer | Aucun changement d’organisation ni de raccourcis Windows injectés |

  Pour hard reload, utiliser les outils réseau WebView2 sur une ressource HTTP
  de développement contrôlée pour constater l’absence de réutilisation du cache.
  Tester également le bundle de production local. Pour Windows Snap Layouts,
  vérifier Win+Z et le comportement de survol du bouton agrandir ; documenter
  séparément toute différence native plutôt que la déclarer vérifiée par React.

- [ ] **Step 3: Comparer les captures avec la référence et corriger les écarts.**
  Écrire les tailles réellement mesurées et les captures dans le rapport de
  vérification. Réduire les captures affichées dans la conversation à environ
  1280 px ; conserver les originaux pour la comparaison. Aucun « terminé » sur
  la seule base de tests jsdom. Une case du tableau non exécutée reste déclarée
  non vérifiée.

- [ ] **Step 4: Relecture de code et périmètre final.**
  Appliquer `superpowers:requesting-code-review` avec le mode d’exécution retenu.
  Vérifier les callbacks partagés entre boutons/menu/clavier, les états voisins,
  le nettoyage listeners/timers et les autorisations natives minimales.
  Examiner `git diff --stat` et chaque fichier ; ne pas inclure les modifications
  d’icônes et de description préexistantes dans un commit aveugle.

- [ ] **Step 5: Mettre à jour le suivi et remettre la livraison à Ahmed.**
  Cocher l’entrée de PROCHAINE_VERSION seulement si tous les critères applicables
  sont satisfaits ; sinon y noter exactement la vérification restante. Le rapport
  final indique changements, tests et éventuels écarts. Fournir la commande :

```powershell
git ship minor "Barre Windows unifiée, menus et navigation au clavier"
```

  Ne pas l’exécuter. Ne pas attribuer de numéro de version à la prochaine livraison
  avant que le script de version ne l’ait réellement déterminé.

## Sources techniques vérifiées pendant la planification

- API et permissions de barre personnalisée : [Tauri Window Customization](https://v2.tauri.app/learn/window-customization/) et [Core Permissions](https://v2.tauri.app/reference/acl/core-permissions/).
- `setZoom`, commandes et événements : déclarations installées dans `apps/windows/node_modules/@tauri-apps/api/window.d.ts` et `webview.d.ts`.
- Rechargement WebView2 normal respectant le cache : [Microsoft Reload](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.reload).
- Rechargement sans cache : [CDP Page.reload](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-reload).
- Commandes d’édition : [CDP Input.dispatchKeyEvent](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent) et [noms de commandes Chromium](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/editing/commands/editor_command_names.h).
- Interop Windows vérifiée localement : Tauri 2.11.5 `src/webview/mod.rs`, webview2-com 0.38.2 `callback.rs`, `pwstr.rs` et webview2-com-sys 0.38.2 `bindings.rs` dans le registre Cargo. Revérifier ces versions si Cargo.lock change avant exécution.

## Auto-relecture du plan

- [x] Couverture des six exigences de la reformulation et de chaque sous-menu de la capture.
- [x] APIs de navigation, édition, mise à jour et fenêtre identifiées dans le code ou la documentation primaire.
- [x] Contrats des nouveaux fichiers explicités et dépendances ordonnées.
- [x] Android/Obsidian, champs de texte, menus, récurrence, concurrence et erreurs inclus dans les validations.
- [x] Référence jointe à la spec ; hypothèse Annuler/Rétablir rendue explicite.
- [x] Aucune étape de ce plan présentée comme une fonctionnalité déjà implémentée.
