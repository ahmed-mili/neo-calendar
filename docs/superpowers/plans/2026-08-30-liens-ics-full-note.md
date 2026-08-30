# Liens ICS dans les calendriers Full Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les calendriers ICS séparés par cinq liens ICS configurables dans chaque calendrier Full Note, matérialisés en notes Markdown en lecture seule avec synchronisation prudente.

**Architecture:** Les préférences partagées portent les liens et fréquences, tandis que l’état d’exécution reste dans le stockage local de l’appareil. Un parseur produit des occurrences ICS identifiables, un planificateur pur calcule les écritures et suppressions autorisées, puis `DesktopCalendar` exécute le plan sans bloquer le chargement. Un panneau commun Windows/Android gère les liens et leurs états.

**Tech Stack:** TypeScript, React 17, Jest, ical.js, Luxon, Tauri 2/Rust, WebView Android/Java, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-30-liens-ics-dans-calendriers-full-note-design.md`

## Global Constraints

- Maximum cinq liens ICS par calendrier Full Note.
- Fréquence globale par défaut : 60 minutes.
- Fréquences disponibles : 5, 15, 30, 60, 180 et 360 minutes.
- « Actualiser maintenant » est toujours disponible.
- Maximum deux téléchargements simultanés et jamais deux pour le même lien.
- Les semaines antérieures au lundi courant ne sont jamais supprimées.
- Une absence implicite exige deux synchronisations valides et une preuve de couverture postérieure.
- Une erreur réseau, un ICS invalide ou un flux vide inattendu ne supprime rien.
- Seules les notes marquées `neo-calendar:ics` du lien concerné sont modifiables ou supprimables par le synchroniseur.
- Les notes générées restent non modifiables et non supprimables manuellement.
- Toute nouvelle icône d’interface vient de `lucide-react`.
- L’interface couvre Windows et Android sans débordement horizontal.

---

### Task 1: Modèle partagé des liens et migration des anciennes sources

**Files:**
- Create: `apps/windows/src/platform/icsFeedPreferences.ts`
- Create: `apps/windows/src/platform/icsFeedPreferences.test.ts`
- Modify: `apps/windows/src/platform/desktopExternalCalendars.ts`
- Modify: `apps/windows/src/platform/desktopWorkspacePreferences.ts`
- Modify: `apps/windows/src/platform/preferences.test.ts`
- Modify: `apps/windows/src/platform/reconcileWorkspacePreferences.test.ts`

**Interfaces:**
- Produces: `IcsFeedSubscription`, `ICS_REFRESH_MINUTES`, `normalizeIcsUrl`, `parseIcsFeeds`, `migrateLegacyIcalSources`.
- Produces: `DesktopWorkspacePreferences.version = 5`, `icsDefaultRefreshMinutes`, `icsFeeds`.
- Preserves: `externalCalendars` pour les seules sources automatiques et la lecture des anciennes sources `type: "ical"`.

- [ ] **Step 1: Write the failing preference tests**

```ts
expect(parseIcsFeeds([{ id: "a", calendarPath: "Études", name: "Cours", url: "webcal://x.test/a.ics", refreshMinutes: 15 }])).toEqual([
  { id: "a", calendarPath: "Études", name: "Cours", url: "https://x.test/a.ics", refreshMinutes: 15, active: true },
]);
expect(parseIcsFeeds(new Array(6).fill(null).map((_, i) => ({ id: String(i), calendarPath: "Études", name: String(i), url: `https://x.test/${i}.ics` })))).toHaveLength(5);
expect(parseDesktopWorkspacePreferences({ externalCalendars: [{ type: "ical", id: "old", name: "Cours", url: "https://x.test/a.ics", directory: "Études", color: "#fff" }] }).icsFeeds[0].calendarPath).toBe("Études");
expect(defaultDesktopWorkspacePreferences().icsDefaultRefreshMinutes).toBe(60);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npx jest apps/windows/src/platform/icsFeedPreferences.test.ts apps/windows/src/platform/preferences.test.ts --runInBand`

Expected: FAIL because `icsFeedPreferences.ts` and version 5 fields do not exist.

- [ ] **Step 3: Implement the exact preference model**

```ts
export const ICS_REFRESH_MINUTES = [5, 15, 30, 60, 180, 360] as const;
export type IcsRefreshMinutes = (typeof ICS_REFRESH_MINUTES)[number];
export interface IcsFeedSubscription {
  id: string;
  calendarPath: string;
  name: string;
  url: string;
  refreshMinutes?: IcsRefreshMinutes;
  active: boolean;
}
export const MAX_ICS_FEEDS_PER_CALENDAR = 5;
export function normalizeIcsUrl(value: string): string;
export function parseIcsFeeds(value: unknown): IcsFeedSubscription[];
export function migrateLegacyIcalSources(value: unknown): { feeds: IcsFeedSubscription[]; unresolved: DesktopIcalCalendarSource[] };
```

Parse only HTTP(S)/webcal URLs, safe direct calendar paths, allowed refresh values and unique normalized URLs per calendar. Keep unresolved legacy sources readable until a safe folder is known. Update the shared preference parser to migrate safe legacy sources and retain automatic calendars.

- [ ] **Step 4: Run the preference and reconciliation tests**

Run: `npx jest apps/windows/src/platform/icsFeedPreferences.test.ts apps/windows/src/platform/preferences.test.ts apps/windows/src/platform/reconcileWorkspacePreferences.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```bash
git add apps/windows/src/platform/icsFeedPreferences.ts apps/windows/src/platform/icsFeedPreferences.test.ts apps/windows/src/platform/desktopExternalCalendars.ts apps/windows/src/platform/desktopWorkspacePreferences.ts apps/windows/src/platform/preferences.test.ts apps/windows/src/platform/reconcileWorkspacePreferences.test.ts
git commit -m "feat: attach ICS feeds to Full Note calendars"
```

### Task 2: Métadonnées gérées et occurrences ICS stables

**Files:**
- Create: `apps/windows/src/platform/managedEventNote.ts`
- Create: `apps/windows/src/platform/managedEventNote.test.ts`
- Modify: `src/calendars/parsing/ics.ts`
- Modify: `src/calendars/parsing/ics.test.ts`
- Modify: `apps/windows/src/platform/desktopEventFormat.ts`
- Modify: `apps/windows/src/platform/desktopEventFormat.test.ts`

**Interfaces:**
- Consumes: `IcsFeedSubscription` from Task 1.
- Produces: `ManagedEventMetadata`, `serializeManagedEventMarkdown`, `managedMetadataFromMarkdown`, `isManagedBy`.
- Produces: `parseIcsSnapshot(text, window): IcsSnapshot` with stable occurrences and explicit cancellations.

- [ ] **Step 1: Write failing managed-frontmatter tests**

```ts
const contents = serializeManagedEventMarkdown(event, {
  neoManagedBy: "neo-calendar:ics",
  neoManagedVersion: 1,
  neoIcsFeedId: "school",
  neoIcsUid: "uid-1",
  neoIcsRecurrenceId: "2026-09-01T08:00:00Z",
  neoIcsStatus: "confirmed",
});
expect(managedMetadataFromMarkdown(contents)?.neoIcsUid).toBe("uid-1");
expect(parseStoredEvent(dto, new Set(["local::Études"]))?.readOnly).toBe(true);
```

- [ ] **Step 2: Write failing ICS semantic tests**

Use fixtures containing a normal VEVENT, `STATUS:CANCELLED`, `RECURRENCE-ID`, `RRULE` and `EXDATE`. Assert that recurring events are expanded into single dated occurrences inside an explicit bounded window and that identity is `UID + RECURRENCE-ID`, never the translated title.

```ts
const snapshot = parseIcsSnapshot(feed, { from: "2026-08-31", to: "2028-08-31" });
expect(snapshot.events.map(e => e.key)).toContain("uid-1::2026-09-01T08:00:00Z");
expect(snapshot.cancelledKeys).toContain("uid-1::2026-09-08T08:00:00Z");
expect(snapshot.events[0].event.description).toBe("Chapitre 2");
expect(snapshot.events[0].event.location).toBe("Salle B12");
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npx jest apps/windows/src/platform/managedEventNote.test.ts src/calendars/parsing/ics.test.ts apps/windows/src/platform/desktopEventFormat.test.ts --runInBand`

Expected: FAIL on missing helpers and missing ICS metadata.

- [ ] **Step 4: Implement managed metadata without widening `NeoEvent`**

```ts
export type ManagedEventMetadata =
  | { neoManagedBy: "neo-calendar:ics"; neoManagedVersion: 1; neoIcsFeedId: string; neoIcsUid: string; neoIcsRecurrenceId: string | null; neoIcsStatus: "confirmed" }
  | { neoManagedBy: "neo-calendar:islamic"; neoManagedVersion: 1; neoIslamicId: string; neoIslamicCategory: string; neoIslamicTraditions: string[] };

export function serializeManagedEventMarkdown(event: NeoEvent, metadata: ManagedEventMetadata, previousContents = ""): string;
export function managedMetadataFromMarkdown(contents: string): ManagedEventMetadata | null;
```

Append or replace only the recognized `neo*` lines after `serializeEventMarkdown`; reject incomplete marker sets. Make `parseStoredEvent` set `readOnly: true` from valid managed metadata while keeping the top-level calendar ID.

- [ ] **Step 5: Implement the bounded occurrence parser**

```ts
export interface IcsOccurrence {
  key: string;
  uid: string;
  recurrenceId: string | null;
  event: NeoEvent & { type: "single" };
}
export interface IcsSnapshot {
  events: IcsOccurrence[];
  cancelledKeys: Set<string>;
  latestOccurrenceDate: string | null;
}
export function parseIcsSnapshot(text: string, window: { from: string; to: string }): IcsSnapshot;
```

Use ical.js recurrence iteration, apply detached instances and EXDATE, and materialize occurrences from the Monday one year before `now` through two years after `now`. Preserve all finite non-recurring events returned by the feed even outside that expansion window. Map SUMMARY, DESCRIPTION, LOCATION and ATTENDEE into `NeoEvent`.

- [ ] **Step 6: Run the focused tests**

Run: `npx jest apps/windows/src/platform/managedEventNote.test.ts src/calendars/parsing/ics.test.ts apps/windows/src/platform/desktopEventFormat.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit occurrence parsing**

```bash
git add apps/windows/src/platform/managedEventNote.ts apps/windows/src/platform/managedEventNote.test.ts src/calendars/parsing/ics.ts src/calendars/parsing/ics.test.ts apps/windows/src/platform/desktopEventFormat.ts apps/windows/src/platform/desktopEventFormat.test.ts
git commit -m "feat: materialize stable managed ICS occurrences"
```

### Task 3: Plan de synchronisation, archives et suppressions prudentes

**Files:**
- Rewrite: `apps/windows/src/platform/icalNoteSync.ts`
- Rewrite: `apps/windows/src/platform/icalNoteSync.test.ts`
- Modify: `apps/windows/src/platform/desktopCalendarStore.ts`

**Interfaces:**
- Consumes: `IcsFeedSubscription`, `IcsSnapshot`, managed metadata.
- Produces: `IcsSyncState`, `IcsSyncPlan`, `planIcsNoteSync`.

- [ ] **Step 1: Write the complete deletion matrix as failing tests**

```ts
export interface IcsSyncState {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  knownEventCount: number;
  missingCounts: Record<string, number>;
}
export interface IcsSyncPlan {
  writes: IcalNoteWrite[];
  deletes: DesktopStoredEvent[];
  nextState: IcsSyncState;
}
```

Cover: past-week missing, first current-week miss, second covered miss, second uncovered miss, explicit cancellation, reappearance, HTTP failure represented by no planner call, unexpectedly empty snapshot, personal note, other feed and changed event retaining the same file.

- [ ] **Step 2: Run the planner tests and confirm failure**

Run: `npx jest apps/windows/src/platform/icalNoteSync.test.ts --runInBand`

Expected: FAIL because the current planner returns only writes.

- [ ] **Step 3: Implement the pure planner**

```ts
export function startOfLocalWeekIso(now: Date): string;
export function planIcsNoteSync(args: {
  feed: IcsFeedSubscription;
  snapshot: IcsSnapshot;
  existingRecords: readonly DesktopStoredEvent[];
  previousState: IcsSyncState;
  now: Date;
}): IcsSyncPlan;
```

Delete only when metadata matches the feed, occurrence date is on or after the current Monday, and either the key is explicitly cancelled or its missing count reaches two while `snapshot.latestOccurrenceDate` is later. Treat a previously nonempty source returning no occurrences and no explicit cancellations as invalid by throwing before a plan is returned.

- [ ] **Step 4: Add an exact delete wrapper and keep native path confinement**

Keep `deleteDesktopEventFile(dataFolder, relativePath)` as the only deletion primitive. Do not add recursive deletion. Add no API capable of deleting a calendar folder from the synchronizer.

- [ ] **Step 5: Run planner and native tests**

Run: `npx jest apps/windows/src/platform/icalNoteSync.test.ts --runInBand`

Run: `cargo test --manifest-path apps/windows/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 6: Commit guarded reconciliation**

```bash
git add apps/windows/src/platform/icalNoteSync.ts apps/windows/src/platform/icalNoteSync.test.ts apps/windows/src/platform/desktopCalendarStore.ts
git commit -m "feat: reconcile ICS notes without deleting history"
```

### Task 4: État local et planificateur à concurrence limitée

**Files:**
- Create: `apps/windows/src/platform/icsSyncScheduler.ts`
- Create: `apps/windows/src/platform/icsSyncScheduler.test.ts`
- Modify: `apps/windows/src/platform/tauriSettingsStore.ts`
- Modify: `apps/windows/src/platform/deviceWorkspacePreferences.test.ts`

**Interfaces:**
- Consumes: subscriptions and `IcsSyncState`.
- Produces: `IcsRuntimeStateByFeed`, `loadIcsRuntimeState`, `saveIcsRuntimeState`, `dueIcsFeeds`, `runIcsQueue`.

- [ ] **Step 1: Write failing due-time and concurrency tests**

```ts
expect(dueIcsFeeds(feeds, states, new Date("2026-08-30T18:05:00Z"), 60).map(f => f.id)).toEqual(["never", "overdue"]);
expect(maxObservedConcurrency).toBe(2);
expect(invocationsById.get("same-feed")).toBe(1);
```

Also assert that per-feed 15 minutes overrides global 60, inactive feeds never run, manual force includes a non-due feed, and failures retain `lastSuccessAt` while recording `lastAttemptAt` and `lastError`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest apps/windows/src/platform/icsSyncScheduler.test.ts apps/windows/src/platform/deviceWorkspacePreferences.test.ts --runInBand`

Expected: FAIL on missing scheduler and store methods.

- [ ] **Step 3: Implement local persistence and queue**

```ts
export type IcsRuntimeStateByFeed = Record<string, IcsSyncState>;
export function dueIcsFeeds(feeds: readonly IcsFeedSubscription[], states: IcsRuntimeStateByFeed, now: Date, defaultMinutes: IcsRefreshMinutes, forcedIds?: ReadonlySet<string>): IcsFeedSubscription[];
export async function runIcsQueue<T>(feeds: readonly IcsFeedSubscription[], worker: (feed: IcsFeedSubscription) => Promise<T>, concurrency?: 2): Promise<PromiseSettledResult<T>[]>;
```

Store runtime state beside the existing device preferences, never in `.neo-calendar.json`. Use an in-memory `Set<string>` in the caller for in-flight deduplication.

- [ ] **Step 4: Run scheduler tests**

Run: `npx jest apps/windows/src/platform/icsSyncScheduler.test.ts apps/windows/src/platform/deviceWorkspacePreferences.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the scheduler**

```bash
git add apps/windows/src/platform/icsSyncScheduler.ts apps/windows/src/platform/icsSyncScheduler.test.ts apps/windows/src/platform/tauriSettingsStore.ts apps/windows/src/platform/deviceWorkspacePreferences.test.ts
git commit -m "feat: schedule ICS refreshes per device"
```

### Task 5: Panneau de gestion des liens et paramètres globaux

**Files:**
- Create: `apps/windows/src/IcsFeedsPanel.tsx`
- Create: `apps/windows/src/IcsFeedsPanel.test.tsx`
- Modify: `apps/windows/src/DesktopSettings.tsx`
- Modify: `apps/windows/src/DesktopSettings.test.tsx`
- Modify: `src/ui/calendar/CalendarSidebar.tsx`
- Modify: `src/ui/calendar/CalendarSidebar.test.ts`
- Modify: `src/ui/calendar/Icons.tsx`
- Modify: `src/ui/i18n.ts`
- Modify: `src/ui/i18n.test.ts`
- Modify: `apps/windows/src/App.css`
- Modify: `apps/android/src/mobile.css`

**Interfaces:**
- Consumes: subscriptions, runtime states and preference callbacks.
- Produces: `IcsFeedsPanel` and sidebar callback `onManageIcsFeeds(calendarId)`.

- [ ] **Step 1: Write failing component tests for every state**

Test empty, one source, five-source limit, invalid/duplicate URL, loading, last success, failure with retained success, per-link frequency, manual refresh, remove-without-note-deletion, and global « Appliquer à tous » confirmation.

```tsx
expect(screen.getByText("Dernière synchro. le 30/08/2026 à 18h05")).toBeTruthy();
expect(screen.getByRole("button", { name: "Ajouter un lien ICS" })).toBeDisabled();
expect(onRefreshNow).toHaveBeenCalledWith("feed-1");
expect(onApplyFrequencyToAll).toHaveBeenCalledWith(60);
```

- [ ] **Step 2: Write failing sidebar and settings tests**

Assert that every local Full Note menu has « Liens ICS », no separate ICS menu survives, and settings expose global frequency plus the apply-all action on both desktop and Android render paths.

- [ ] **Step 3: Run UI tests and confirm failure**

Run: `npx jest apps/windows/src/IcsFeedsPanel.test.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/calendar/CalendarSidebar.test.ts src/ui/i18n.test.ts --runInBand`

Expected: FAIL because the panel and callbacks do not exist.

- [ ] **Step 4: Implement the panel and status formatter**

```ts
export function formatLastIcsSync(iso: string, locale = "fr-FR"): string {
  return `Dernière synchro. le ${new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date(iso))} à ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;
}
```

Use Lucide `Link`, `RefreshCw`, `Plus`, `Trash2`, `AlertCircle` and `Loader2` from the installed package. Status text uses italic secondary ink. Disable only adding at five; keep edit, remove and manual refresh available.

- [ ] **Step 5: Implement responsive layout and state matrix**

Use wrapping rows, `min-width: 0`, `overflow-wrap: anywhere` for URLs, and no fixed content width. Provide `:focus-visible`, fine-pointer `:hover`, coarse-pointer `:active`, disabled and error styles. Verify dark/light theme variables rather than literal backgrounds.

- [ ] **Step 6: Run UI tests and formatting**

Run: `npx jest apps/windows/src/IcsFeedsPanel.test.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/calendar/CalendarSidebar.test.ts src/ui/i18n.test.ts --runInBand`

Run: `npx prettier --check apps/windows/src/IcsFeedsPanel.tsx apps/windows/src/DesktopSettings.tsx src/ui/calendar/CalendarSidebar.tsx src/ui/i18n.ts`

Expected: PASS.

- [ ] **Step 7: Commit the management UI**

```bash
git add apps/windows/src/IcsFeedsPanel.tsx apps/windows/src/IcsFeedsPanel.test.tsx apps/windows/src/DesktopSettings.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/calendar/CalendarSidebar.tsx src/ui/calendar/CalendarSidebar.test.ts src/ui/calendar/Icons.tsx src/ui/i18n.ts src/ui/i18n.test.ts apps/windows/src/App.css apps/android/src/mobile.css
git commit -m "feat: manage ICS links from Full Note calendars"
```

### Task 6: Intégration au cycle de vie et retrait de l’ancien type ICS

**Files:**
- Modify: `apps/windows/src/AddCalendarDialog.tsx`
- Create: `apps/windows/src/AddCalendarDialog.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx`
- Create: `apps/windows/src/platform/icsCalendarIntegration.test.tsx`
- Modify: `apps/windows/src/platform/DesktopEventCache.ts`
- Modify: `src/ui/calendar/useCalendarManagement.ts`
- Create: `src/ui/calendar/useCalendarManagement.test.ts`
- Modify: `src/ui/calendar/autoTargets.ts`

**Interfaces:**
- Consumes: all previous ICS interfaces.
- Produces: lifecycle callbacks for add/update/remove/apply-all/refresh-now and automatic due refresh.

- [ ] **Step 1: Write failing removal and lifecycle tests**

Assert that Add Calendar offers only Full Note and automatic calendars; startup renders disk notes before network completion; focus refreshes only due links; manual refresh forces exactly one; remove-link leaves files; successful sync executes writes then guarded deletes; failed parsing executes neither deletes nor state success.

- [ ] **Step 2: Run the integration tests and confirm failure**

Run: `npx jest apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/platform/icsCalendarIntegration.test.tsx --runInBand`

Expected: FAIL while `CalendarKind` still contains `ical` and lifecycle uses a fixed five-minute interval.

- [ ] **Step 3: Wire the new synchronization service**

Replace `refreshRemoteCalendars` with `refreshIcsFeeds({ forcedIds? })`. For each successful feed: fetch, parse snapshot, plan, atomically write files, delete only `plan.deletes`, update records and persist local runtime state. Run the queue after workspace load without awaiting it, on focus/visibility when due, and with a minute-level wake timer that only selects due feeds.

- [ ] **Step 4: Remove separate ICS calendar creation and display**

Remove `"ical"` from `CalendarKind`, the Wifi card, URL field and source creation branch. Keep legacy parsing only in migration code. Local calendars remain editable as calendars while records marked as managed remain read-only.

- [ ] **Step 5: Run integration and existing calendar tests**

Run: `npx jest apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/platform/icsCalendarIntegration.test.tsx apps/windows/src/platform/icalNoteSync.test.ts src/ui/calendar/useCalendarManagement.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit lifecycle integration**

```bash
git add apps/windows/src/AddCalendarDialog.tsx apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/DesktopCalendar.tsx apps/windows/src/platform/icsCalendarIntegration.test.tsx apps/windows/src/platform/DesktopEventCache.ts src/ui/calendar/useCalendarManagement.ts src/ui/calendar/useCalendarManagement.test.ts src/ui/calendar/autoTargets.ts
git commit -m "feat: synchronize ICS feeds inside local calendars"
```

### Task 7: Vérification complète Windows et Android

**Files:**
- Modify only if a verification exposes a defect in files already covered above.

**Interfaces:**
- Produces: evidence that the ICS slice is buildable, tested and visually usable on both platforms.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Run: `npm run build`

Run: `npm run android:frontend`

Run: `cargo test --manifest-path apps/windows/src-tauri/Cargo.toml`

Expected: all commands exit 0. If the two pre-existing brittle `desktopDescriptionEditorCss.test.ts` assertions still fail, diagnose and fix their root cause separately before claiming completion.

- [ ] **Step 2: Run a real Windows render check**

Start the app with `npm run dev`, open Add Calendar and confirm the ICS card is absent. Open a local calendar menu, manage 0, 1 and 5 links, exercise validation, loading, success and error states, and confirm the timestamp matches the supplied reference styling.

- [ ] **Step 3: Run a real Android render check**

Build and install with `npm run android:build`. On the emulator, repeat the menu and panel checks in portrait, verify keyboard avoidance, URL wrapping, touch active states, and absence of horizontal scrolling.

- [ ] **Step 4: Review the state matrix**

Confirm pairwise coverage: empty/nonempty/limit × Windows/Android; idle/loading/success/error × light/dark; global/per-link frequency × automatic/manual refresh; current/future/past × present/missing/cancelled; single/multiple feeds × queue concurrency.

- [ ] **Step 5: Re-run the complete verification after corrections**

If a check exposed a defect, return to the task owning that file, add a regression test there, make its focused commit, then repeat Steps 1 through 4. Do not create an empty verification commit.
