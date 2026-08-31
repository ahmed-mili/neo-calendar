# PC Mini Calendar and Tasks Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le mini calendrier PC lisible et remplacer les longues listes de tâches de la barre latérale par deux pilules ouvrant une modale, tout en interdisant la terminaison d'une tâche sans date sur PC.

**Architecture:** Les règles de terminaison et de regroupement PC vivent dans des fonctions pures testables. `CalendarSidebar` conserve le panneau actuel sur Android et rend un nouveau `DesktopTasksPanel` uniquement hors Android. `EventPanel` reçoit un drapeau explicite depuis `DesktopCalendar`, afin que l'invariant PC ne modifie ni Android ni le plugin Obsidian.

**Tech Stack:** React 17, TypeScript, CSS, Jest avec jsdom, application Tauri Windows.

**Spec:** `docs/superpowers/specs/2026-08-31-pc-mini-calendrier-taches-modal-design.md`

## Global Constraints

- Cette modification concerne uniquement l'application PC Windows.
- Aucun fichier sous `apps/android/` ne doit être modifié.
- Android doit conserver son panneau de tâches intégré actuel.
- Le résumé PC contient exactement `To do` et `Complete`; `No date` et `Add task` n'y apparaissent plus.
- Une tâche PC sans date ni échéance ne peut jamais passer à `Complete`.
- Les couleurs utilisent les variables de thème existantes et restent lisibles en clair, sombre et sur fond d'écran.
- La barre latérale ne doit pas seulement masquer une zone débordante; son contenu normal doit tenir sans barre de défilement verticale.

---

### Task 1: Règles pures des groupes et de la terminaison PC

**Files:**
- Create: `src/ui/tasks/desktopTaskGroups.ts`
- Create: `src/ui/tasks/desktopTaskGroups.test.ts`

**Interfaces:**
- Consumes: `TaskItem`, `effectiveDue` et `TaskStatus` existants.
- Produces: `hasTaskCompletionDate(date, due): boolean`, `normalizedDesktopTaskStatus(task): TaskStatus`, `buildDesktopTaskGroups(tasks): { todo: TaskItem[]; complete: TaskItem[] }`.

- [ ] **Step 1: Écrire les tests en échec des règles PC**

Créer `src/ui/tasks/desktopTaskGroups.test.ts` avec des tâches datées, avec échéance, sans date, terminées et incohérentes. Les attentes essentielles sont :

```ts
expect(hasTaskCompletionDate(null, null)).toBe(false);
expect(hasTaskCompletionDate("2026-08-31", null)).toBe(true);
expect(hasTaskCompletionDate(null, "2026-09-03")).toBe(true);
expect(normalizedDesktopTaskStatus(undatedComplete)).toBe("todo");
expect(buildDesktopTaskGroups(input).todo.map(({ id }) => id)).toEqual([
    "overdue",
    "future",
    "undated",
    "invalid-complete",
]);
expect(buildDesktopTaskGroups(input).complete.map(({ id }) => id)).toEqual([
    "recent-complete",
]);
```

- [ ] **Step 2: Vérifier que les tests échouent pour absence du module**

Run: `npx jest src/ui/tasks/desktopTaskGroups.test.ts --runInBand`

Expected: FAIL car `desktopTaskGroups` n'existe pas.

- [ ] **Step 3: Implémenter les fonctions pures minimales**

Créer `desktopTaskGroups.ts` avec cette structure :

```ts
import { TaskStatus } from "./index";
import { TaskItem, effectiveDue } from "./taskList";

export interface DesktopTaskGroups {
    todo: TaskItem[];
    complete: TaskItem[];
}

export const hasTaskCompletionDate = (
    date: string | null | undefined,
    due: string | null | undefined
): boolean => Boolean(due ?? date);

export const normalizedDesktopTaskStatus = (task: TaskItem): TaskStatus =>
    task.status === "complete" &&
    !hasTaskCompletionDate(task.date, task.due)
        ? "todo"
        : task.status;
```

`buildDesktopTaskGroups` doit copier les tâches incohérentes avec `status: "todo"` et `completedAt: null`, trier les tâches datées par `effectiveDue`, conserver ensuite l'ordre stable des tâches sans date, et trier les terminées par `completedAt` décroissant avec les valeurs nulles à la fin.

- [ ] **Step 4: Exécuter les tests unitaires ciblés**

Run: `npx jest src/ui/tasks/desktopTaskGroups.test.ts src/ui/tasks/taskList.test.ts --runInBand`

Expected: PASS, y compris les anciens tests à trois sections utilisés par Android.

- [ ] **Step 5: Commit de la logique pure**

```powershell
git add -- src/ui/tasks/desktopTaskGroups.ts src/ui/tasks/desktopTaskGroups.test.ts src/ui/tasks/taskList.ts
git commit -m "feat: add desktop task grouping rules"
```

---

### Task 2: Résumé Tasks et modale PC

**Files:**
- Create: `src/ui/calendar/DesktopTasksPanel.tsx`
- Create: `src/ui/calendar/DesktopTasksPanel.test.tsx`
- Modify: `src/ui/calendar/CalendarSidebar.tsx:1-5,126-131,806-849`
- Modify: `src/ui/calendar/CalendarOverlays.css:30-180`
- Modify: `src/ui/i18n.ts`

**Interfaces:**
- Consumes: `buildDesktopTaskGroups`, `hasTaskCompletionDate`, `TaskItem`, `onTaskClick` et `onToggleTask`.
- Produces: `DesktopTasksPanel` avec les props `{ tasks, today, onTaskClick, onToggleTask }`.

- [ ] **Step 1: Écrire les tests de composant en échec**

Créer un test jsdom qui rend le composant avec une tâche datée, une tâche sans date et une tâche terminée. Vérifier :

```ts
expect(button("To do").textContent).toContain("2");
expect(button("Complete").textContent).toContain("1");
expect(document.body.textContent).not.toContain(t("No date"));
expect(document.body.textContent).not.toContain(t("Add task"));

act(() => Simulate.click(button("To do")));
expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
expect(document.body.textContent).toContain("Tâche sans date");
expect(
    (
        document.body.querySelector(
            '[data-task-id="undated"] .nc-tasks-checkbox'
        ) as HTMLButtonElement
    ).disabled
).toBe(true);
```

Tester aussi l'ouverture de `Complete`, la fermeture par Échap, le clic sur l'arrière-plan et l'ouverture d'une tâche avec fermeture préalable de la modale.

- [ ] **Step 2: Vérifier l'échec avant implémentation**

Run: `npx jest src/ui/calendar/DesktopTasksPanel.test.tsx --runInBand`

Expected: FAIL car le composant n'existe pas.

- [ ] **Step 3: Implémenter le composant et son portail**

`DesktopTasksPanel` doit :

```ts
type DesktopTaskGroup = "todo" | "complete";
const [openGroup, setOpenGroup] = React.useState<DesktopTaskGroup | null>(null);
const groups = React.useMemo(() => buildDesktopTaskGroups(tasks), [tasks]);
```

Rendre deux boutons `nc-status-pill nc-status-todo` et `nc-status-pill nc-status-complete` avec leur point et leur compteur. Quand `openGroup` n'est pas null, rendre avec `ReactDOM.createPortal(..., document.body)` une superposition `data-nc-popup-portal="true"`, un dialogue accessible et une liste interne. Fermer sur Échap, clic direct sur la superposition et croix. Fermer avant d'appeler `onTaskClick(task.id)`.

La case d'une tâche à faire est désactivée lorsque `!task.editable || !hasTaskCompletionDate(task.date, task.due)`. Son `title` et son `aria-label` utilisent la nouvelle traduction `Add a date or deadline before completing this task`.

- [ ] **Step 4: Brancher uniquement la version PC**

Dans `CalendarSidebar`, conserver exactement le bloc actuel avec repli et `TasksPanel` dans la branche `isAndroid`. Dans la branche PC, rendre un titre non cliquable :

```tsx
<div className="nc-sidebar-title-row nc-sidebar-title-row-static">
    <span className="nc-sidebar-title">{t("Tasks")}</span>
</div>
<DesktopTasksPanel
    tasks={tasks}
    today={today}
    onTaskClick={onEventClick}
    onToggleTask={onToggleTask}
/>
```

Ne pas retirer `onAddTask` des interfaces partagées car Android continue de l'utiliser.

- [ ] **Step 5: Ajouter les styles du résumé et de la modale**

Ajouter des classes dédiées avec :

```css
.nc-desktop-tasks-summary { display:flex; gap:8px; padding:2px 8px 8px; }
.nc-task-modal-backdrop { position:fixed; inset:0; display:grid; place-items:center; }
.nc-task-modal { width:min(560px, calc(100vw - 48px)); max-height:min(640px, calc(100vh - 48px)); display:flex; flex-direction:column; }
.nc-task-modal-list { min-height:0; overflow-y:auto; overflow-x:hidden; }
.nc-task-modal-header { flex:0 0 auto; }
```

La surface utilise `var(--nc-bg-primary)`, `var(--nc-border)`, les tokens de texte, ainsi qu'un `backdrop-filter` compatible avec les fonds d'écran. Ajouter `:focus-visible` aux contrôles. Ne définir aucune règle dans `apps/android/src/mobile.css`.

- [ ] **Step 6: Exécuter les tests de composant et de barre latérale**

Run: `npx jest src/ui/calendar/DesktopTasksPanel.test.tsx src/ui/calendar/CalendarSidebar.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit de l'interface Tasks PC**

```powershell
git add -- src/ui/calendar/DesktopTasksPanel.tsx src/ui/calendar/DesktopTasksPanel.test.tsx src/ui/calendar/CalendarSidebar.tsx src/ui/calendar/CalendarOverlays.css src/ui/i18n.ts
git commit -m "feat: move desktop tasks into status modals"
```

---

### Task 3: Interdiction PC de terminer une tâche sans date

**Files:**
- Modify: `src/ui/calendar/EventPanel.tsx:105-150,245-335,1567-1576`
- Modify: `src/ui/calendar/EventPanelRows.tsx:1959-1995`
- Modify: `src/ui/calendar/useEventFormState.ts:20-45,145-155,345-410`
- Modify: `src/ui/calendar/useEventFormState.test.ts`
- Create: `src/ui/calendar/StatusRow.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx:2258-2286,3379-3445`

**Interfaces:**
- Consumes: `hasTaskCompletionDate` de la Task 1.
- Produces: prop optionnelle `requireTaskDateForCompletion?: boolean` sur `EventPanel` et `useEventFormState`; prop optionnelle `completeDisabledReason?: string` sur `StatusRow`.

- [ ] **Step 1: Écrire les tests en échec de la fiche et de la sauvegarde**

Dans `StatusRow.test.tsx`, vérifier qu'une tâche `todo` avec `completeDisabledReason` a son bouton désactivé et n'appelle pas `setStatus`, tandis qu'une tâche `complete` peut toujours revenir à `todo`.

Dans `useEventFormState.test.ts`, ajouter un test de la fonction exportée `persistedTaskStatus` :

```ts
expect(persistedTaskStatus("complete", "", null, true)).toBe("todo");
expect(persistedTaskStatus("complete", "", "2026-09-02", true)).toBe("complete");
expect(persistedTaskStatus("complete", "", null, false)).toBe("complete");
```

- [ ] **Step 2: Vérifier que les tests ciblés échouent**

Run: `npx jest src/ui/calendar/StatusRow.test.tsx src/ui/calendar/useEventFormState.test.ts --runInBand`

Expected: FAIL car les nouvelles props et `persistedTaskStatus` n'existent pas.

- [ ] **Step 3: Normaliser le statut dans le formulaire uniquement quand demandé**

Ajouter à `useEventFormState` :

```ts
export function persistedTaskStatus(
    status: TaskStatus | null,
    date: string | null | undefined,
    due: string | null | undefined,
    requireDate: boolean
): TaskStatus | null {
    return requireDate && status === "complete" &&
        !hasTaskCompletionDate(date, due)
        ? "todo"
        : status;
}
```

Ajouter `requireTaskDateForCompletion = false` aux arguments du hook. Dans `buildPayload`, calculer `savedTaskStatus` avec cette fonction et le passer à `completedFor` et `dueFor`. Le défaut `false` garantit l'absence de changement pour Android et le plugin.

Lors du chargement d'un événement, utiliser également `persistedTaskStatus` pour présenter immédiatement une ancienne tâche incohérente comme `todo` sur PC, sans écrire le fichier tant que l'utilisateur ne le modifie pas.

- [ ] **Step 4: Désactiver l'action Complete dans la fiche PC**

Ajouter `requireTaskDateForCompletion?: boolean` à `EventPanelProps`, transmettre le drapeau au hook, puis passer à `StatusRow` une raison uniquement lorsque la règle PC est active et que `form.date` et `form.due` sont vides.

`StatusRow` doit désactiver le bouton seulement lorsque l'action suivante est `complete` :

```ts
const completionBlocked = next === "complete" && Boolean(completeDisabledReason);
const disabled = !editable || completionBlocked;
```

Conserver la possibilité de revenir à `todo` depuis une ancienne donnée incohérente.

- [ ] **Step 5: Ajouter la garde d'écriture Windows**

Dans `DesktopCalendar.toggleTask`, avant l'écriture d'un événement non récurrent :

```ts
if (
    done &&
    !isAndroidRuntime() &&
    !hasTaskCompletionDate(
        record.event.type === "single" ? record.event.date : null,
        (record.event as { due?: string | null }).due
    )
) return false;
```

Passer `requireTaskDateForCompletion={!isAndroidRuntime()}` à `EventPanel`. Le même composant utilisé par Android reçoit donc explicitement `false`.

- [ ] **Step 6: Exécuter les tests de règle et de fiche**

Run: `npx jest src/ui/tasks/desktopTaskGroups.test.ts src/ui/calendar/StatusRow.test.tsx src/ui/calendar/useEventFormState.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit de l'invariant PC**

```powershell
git add -- src/ui/calendar/EventPanel.tsx src/ui/calendar/EventPanelRows.tsx src/ui/calendar/useEventFormState.ts src/ui/calendar/useEventFormState.test.ts src/ui/calendar/StatusRow.test.tsx apps/windows/src/DesktopCalendar.tsx
git commit -m "fix: prevent undated task completion on desktop"
```

---

### Task 4: Lisibilité et encombrement du mini calendrier PC

**Files:**
- Modify: `src/ui/calendar/CalendarSidebar.css:25-43,613-760`
- Modify: `src/ui/calendar/CalendarSidebar.test.ts`

**Interfaces:**
- Consumes: classes actuelles de `MiniCalendar` et variable racine Android `nc-platform-android`.
- Produces: grille de huit colonnes stable et contraste PC vérifié par tests de style.

- [ ] **Step 1: Écrire les tests de style en échec**

Étendre `CalendarSidebar.test.ts` pour exiger :

```ts
expect(declarationsFor(".nc-mini-cal-grid.nc-with-week-numbers")["grid-template-columns"])
    .toBe("18px repeat(7, minmax(0, 1fr))");
expect(declarationsFor(".nc-mini-cal-week").color)
    .toBe("var(--nc-text-secondary, var(--text-muted))");
expect(declarationsFor(".nc-mini-cal-day.nc-other-month").color)
    .toBe("var(--nc-text-secondary, var(--text-muted))");
expect(declarationsFor(".nc-mini-cal-day")["max-width"]).toBe("26px");
```

- [ ] **Step 2: Vérifier l'échec des tests de style**

Run: `npx jest src/ui/calendar/CalendarSidebar.test.ts --runInBand`

Expected: FAIL sur la piste `auto`, les couleurs faint et l'absence de `max-width`.

- [ ] **Step 3: Stabiliser les huit colonnes et relever le contraste**

Dans `CalendarSidebar.css` :

```css
.nc-mini-cal-grid.nc-with-week-numbers {
    grid-template-columns: 18px repeat(7, minmax(0, 1fr));
}
.nc-mini-cal-week {
    width: 18px;
    padding-right: 2px;
    color: var(--nc-text-secondary, var(--text-muted));
    font-weight: 600;
}
.nc-mini-cal-day {
    width: 100%;
    max-width: 26px;
    justify-self: center;
}
.nc-mini-cal-day.nc-other-month {
    color: var(--nc-text-secondary, var(--text-muted));
}
```

Remonter l'opacité des en-têtes de week-end de `0.55` à `0.75`. Garder les états today, selected et current-week existants.

- [ ] **Step 4: Retirer la cause du défilement sans supprimer le filet de sécurité**

Ne pas forcer `scrollbar-width: none` et ne pas masquer une zone débordante. Le remplacement des longues listes par le résumé compact doit suffire à supprimer la barre à la hauteur PC de référence. Ajouter `flex-shrink: 0` au mini calendrier et au résumé Tasks pour empêcher leur écrasement; conserver `overflow-y: auto` comme filet de sécurité pour une fenêtre anormalement basse ou une liste exceptionnelle de calendriers.

- [ ] **Step 5: Exécuter les tests de style et le contrôle anti-débordement**

Run: `npx jest src/ui/calendar/CalendarSidebar.test.ts src/ui/calendar/DesktopTasksPanel.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit des corrections visuelles**

```powershell
git add -- src/ui/calendar/CalendarSidebar.css src/ui/calendar/CalendarSidebar.test.ts
git commit -m "fix: improve desktop mini calendar readability"
```

---

### Task 5: Vérification PC complète et préparation du ship

**Files:**
- No new file planned; any real-render correction is restricted to files already listed in Tasks 1-4.

**Interfaces:**
- Consumes: tous les changements précédents.
- Produces: build Windows validé et rendu PC vérifié.

- [ ] **Step 1: Exécuter les tests ciblés ensemble**

Run:

```powershell
npx jest src/ui/tasks/desktopTaskGroups.test.ts src/ui/tasks/taskList.test.ts src/ui/calendar/DesktopTasksPanel.test.tsx src/ui/calendar/StatusRow.test.tsx src/ui/calendar/useEventFormState.test.ts src/ui/calendar/CalendarSidebar.test.ts --runInBand
```

Expected: PASS sans test ignoré ni snapshot mis à jour automatiquement.

- [ ] **Step 2: Exécuter la vérification statique et le build Windows**

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript et Vite terminent avec code 0.

- [ ] **Step 3: Lancer l'application Windows et inspecter le rendu réel**

Run: `npm run dev`

Vérifier dans la fenêtre PC : numéros de semaine activés et désactivés, mois à cinq et six lignes, zéro et beaucoup de tâches, ouverture/fermeture des deux modales, défilement interne de la liste, absence de `No date` et `Add task`, impossibilité de terminer une tâche sans date, et absence de barre verticale dans la barre latérale à la taille de référence.

- [ ] **Step 4: Vérifier les trois familles de thèmes**

Inspecter un thème clair, un thème sombre et un thème avec fond d'écran. Confirmer que les numéros de semaine, jours hors mois, titres, compteurs, dates et états de focus restent lisibles.

- [ ] **Step 5: Contrôler l'absence de changement Android et la propreté Git**

Run:

```powershell
git diff --name-only HEAD~4..HEAD -- apps/android
git diff --check
git status --short
```

Expected: aucune sortie pour `apps/android`, aucune erreur d'espace, seulement les changements attendus avant l'éventuel commit de finition.

- [ ] **Step 6: Appliquer le workflow de git ship du dépôt**

Après réussite des tests, du build et du contrôle visuel, exécuter :

```powershell
git ship --watch "Improve the desktop mini calendar and tasks"
```

Cette commande effectue le bump patch, le commit de version, le push et la surveillance de la CI selon `scripts/ship.mjs`.
