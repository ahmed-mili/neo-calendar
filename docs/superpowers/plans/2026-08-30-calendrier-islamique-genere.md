# Calendrier islamique généré Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer dans `الْإِسْلَامُ/المناسبات الإسلامية` un corpus islamique sourcé et filtrable sous forme de notes Markdown en lecture seule, avec titres arabes et descriptions françaises.

**Architecture:** Un catalogue versionné décrit les observances et leurs sources sans dépendre de l’interface. Un moteur hégirien étend ce catalogue en occurrences déterministes, puis un réconciliateur écrit uniquement dans le sous-dossier géré et protège toutes les notes personnelles. Les préférences partagées pilotent l’activation et les filtres sur Windows et Android.

**Tech Stack:** TypeScript, Zod, Intl `islamic-umalqura`, Luxon, Jest, React 17, Tauri 2/Rust, WebView Android/Java.

**Spec:** `docs/superpowers/specs/2026-08-30-calendrier-islamique-genere-design.md`

## Global Constraints

- Chemin initial : `الْإِسْلَامُ/المناسبات الإسلامية` sous le dossier de données.
- Le moteur ne dépend jamais du nom arabe pour reconnaître la fonctionnalité.
- Le titre affiché contient uniquement de l’arabe ; le nom français ouvre la description.
- La date est calculée par `Intl.DateTimeFormat("en-u-ca-islamic-umalqura")` et signalée comme date attendue susceptible de varier localement.
- Les catégories communes sont visibles par défaut ; les commémorations historiques et traditions particulières sont masquées par défaut.
- Aucun fichier sans marqueur complet `neo-calendar:islamic` ne peut être modifié ni supprimé.
- Les notes générées sont en lecture seule dans Neo Calendar.
- Génération initiale : année grégorienne courante, précédente et suivante ; extension paresseuse lors de la navigation.
- Les six jours de Chawwāl sont une fenêtre flexible, jamais les dates imposées du 2 au 7.
- Mawaqit reste hors périmètre et demeure dans `docs/PROCHAINE_VERSION.md`.
- Windows et Android doivent produire les mêmes noms et contenus pour la même occurrence.

---

### Task 1: Catalogue typé, sources et matrice de couverture

**Files:**
- Create: `src/calendars/islamic/catalog.ts`
- Create: `src/calendars/islamic/catalog.data.ts`
- Create: `src/calendars/islamic/catalog.sources.ts`
- Create: `src/calendars/islamic/catalog.coverage.ts`
- Create: `src/calendars/islamic/catalog.test.ts`

**Interfaces:**
- Produces: `IslamicObservanceDefinition`, `IslamicCategory`, `IslamicTradition`, `ISLAMIC_CATALOGUE_VERSION`, `ISLAMIC_OBSERVANCES`, `ISLAMIC_SOURCES`, `EXPECTED_ISLAMIC_IDS`.

- [ ] **Step 1: Write the failing schema and coverage tests**

```ts
for (const definition of ISLAMIC_OBSERVANCES) {
  expect(definition.titleAr).toMatch(/^[\p{Script=Arabic}\p{Number}\sـًٌٍَُِّْٰٱإأآؤئءةى]+$/u);
  expect(definition.nameFr.trim()).not.toBe("");
  expect(definition.descriptionFr.startsWith(definition.nameFr)).toBe(true);
  expect(definition.sources.length).toBeGreaterThan(0);
  expect(definition.sources.every(id => ISLAMIC_SOURCES[id])).toBe(true);
}
expect(new Set(ISLAMIC_OBSERVANCES.map(item => item.id))).toEqual(new Set(EXPECTED_ISLAMIC_IDS));
```

Also assert unique ASCII IDs, recognized categories/traditions/statuses, valid reviewed dates, and no French parenthesis or Latin word in `titleAr`.

- [ ] **Step 2: Run the catalogue test and confirm failure**

Run: `npx jest src/calendars/islamic/catalog.test.ts --runInBand`

Expected: FAIL because the catalogue does not exist.

- [ ] **Step 3: Implement the exact catalogue types**

```ts
export type IslamicCategory = "feasts" | "sacred-periods" | "ramadan" | "hajj" | "recommended-fasts" | "historical-commemorations";
export type IslamicTradition = "common" | "sunni" | "twelver" | "ismaili" | "ibadi" | "local-sufi";
export type IslamicStatus = "obligatory" | "recommended" | "forbidden" | "feast" | "commemoration" | "information";
export type IslamicRule =
  | { kind: "hijri-date"; month: number; day: number; variant?: string }
  | { kind: "hijri-range"; month: number; startDay: number; end: "month-end" | number }
  | { kind: "hijri-month"; month: number }
  | { kind: "hijri-monthly"; days: number[] }
  | { kind: "weekly"; weekdays: number[] }
  | { kind: "flexible-window"; month: number; startDay: number; count: number }
  | { kind: "last-weekday"; month: number; weekday: number }
  | { kind: "gregorian-date"; month: number; day: number };
export interface IslamicObservanceDefinition {
  id: string; titleAr: string; nameFr: string; descriptionFr: string;
  category: IslamicCategory; traditions: IslamicTradition[];
  status: IslamicStatus; rule: IslamicRule; sources: string[]; lastReviewed: string;
}
```

- [ ] **Step 4: Populate the versioned source registry**

Each source record contains `id`, institution, title, URL, traditions and `lastChecked`. Use primary or institutional sources only: Quran/Hadith references for common prescriptions, Umm al-Qura conversion reference, IMAM-US calendars for Twelver dates, The Ismaili publications for Ismaili observances, Oman Ministry of Endowments and Religious Affairs/Oman News Agency for institutional Ibadi observances, and named institutional calendars for local/Sufi entries. Do not add a tradition-specific row without a source that explicitly observes it.

- [ ] **Step 5: Populate and freeze the coverage matrix**

The initial matrix must include these stable IDs, with tradition/date variants as separate definitions when required:

```ts
export const EXPECTED_ISLAMIC_IDS = [
  "hijri-new-year", "sacred-month-muharram", "tasua-fast", "ashura-common", "ashura-karbala", "muharram-eleventh-fast",
  "mawlid-sunni", "mawlid-twelver", "prophet-death", "hijra-arrival-quba", "isra-miraj", "mid-shaban",
  "ramadan-month", "ramadan-fast", "last-ten-nights", "laylat-qadr-21", "laylat-qadr-23", "laylat-qadr-25", "laylat-qadr-27", "laylat-qadr-29", "farewell-friday",
  "eid-fitr", "shawwal-six-window", "sacred-month-rajab", "sacred-month-dhul-qidah", "sacred-month-dhul-hijjah",
  "first-ten-dhul-hijjah", "tarwiyah", "arafah", "eid-adha", "tashriq-days", "white-days", "monday-thursday-fasts",
  "battle-badr", "battle-uhud", "battle-trench", "treaty-hudaybiyyah", "conquest-makkah", "battle-hunayn", "battle-khaybar", "expedition-tabuk",
  "ghadir-khumm", "mubahala", "arbaeen", "fatima-birth", "fatima-death-75", "fatima-death-95", "ali-birth", "ali-death",
  "hasan-birth", "hasan-death", "husayn-birth", "husayn-death", "zayn-al-abidin-birth", "zayn-al-abidin-death",
  "muhammad-al-baqir-birth", "muhammad-al-baqir-death", "jafar-al-sadiq-birth", "jafar-al-sadiq-death",
  "musa-al-kazim-birth", "musa-al-kazim-death", "ali-al-rida-birth", "ali-al-rida-death",
  "muhammad-al-jawad-birth", "muhammad-al-jawad-death", "ali-al-hadi-birth", "ali-al-hadi-death",
  "hasan-al-askari-birth", "hasan-al-askari-death", "mahdi-birth", "beginning-major-occultation"
] as const;
```

Do not create umbrella events for a tradition. Tag common observances with every tradition whose institutional source actually publishes them, and add a tradition-specific definition only when its institution names a real date. The coverage test additionally requires every `IslamicTradition` value to occur in at least one sourced definition.

- [ ] **Step 6: Run the catalogue tests**

Run: `npx jest src/calendars/islamic/catalog.test.ts --runInBand`

Expected: PASS with every matrix ID backed by a definition and source.

- [ ] **Step 7: Commit the catalogue**

```bash
git add src/calendars/islamic/catalog.ts src/calendars/islamic/catalog.data.ts src/calendars/islamic/catalog.sources.ts src/calendars/islamic/catalog.coverage.ts src/calendars/islamic/catalog.test.ts
git commit -m "feat: add the sourced Islamic observance catalogue"
```

### Task 2: Moteur de règles hégiriennes et périodes

**Files:**
- Create: `src/calendars/islamic/rules.ts`
- Create: `src/calendars/islamic/rules.test.ts`
- Modify: `src/calendars/auto/hijri.ts`
- Modify: `src/calendars/auto/rules.test.ts`

**Interfaces:**
- Consumes: `IslamicRule`, `IslamicObservanceDefinition`.
- Produces: `expandIslamicObservances`, `IslamicOccurrence`, runtime support check.

- [ ] **Step 1: Write failing date, period and exclusion tests**

```ts
const expanded = expandIslamicObservances(catalogue, 2026, 2026);
const result = expanded.occurrences;
expect(byId(result, "eid-fitr")[0].date).toBe("2026-03-20");
expect(byId(result, "ramadan-fast")[0]).toMatchObject({ date: "2026-02-18", endDate: "2026-03-19" });
expect(byId(result, "shawwal-six-window")[0]).toMatchObject({ date: "2026-03-21", endDate: "2026-04-18", flexibleCount: 6 });
expect(byId(result, "white-days").some(item => item.hijriMonth === 12 && item.hijriDay === 13 && item.status === "forbidden")).toBe(true);
expect(expanded.weekly[0].event).toMatchObject({ type: "recurring", daysOfWeek: ["M", "R"] });
```

Also test Monday/Thursday exclusions during Ramadan, both Eids and Tashriq; Twelver date variants; periods as one occurrence; unsupported `Intl` behavior; and range confinement.

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest src/calendars/islamic/rules.test.ts src/calendars/auto/rules.test.ts --runInBand`

Expected: FAIL because the Islamic rule engine does not exist and the old preset imposes six Chawwāl dates.

- [ ] **Step 3: Export safe Hijri primitives**

```ts
export function isUmmAlQuraSupported(): boolean;
export function hijriDateOfIso(iso: string): HijriDay | null;
export function hijriIndex(firstYear: number, lastYear: number): HijriDay[];
```

Return no fabricated fallback when the runtime lacks valid Umm al-Qura parts.

- [ ] **Step 4: Implement occurrence expansion**

```ts
export interface IslamicOccurrence {
  id: string;
  definitionId: string;
  hijriYear: number;
  hijriMonth: number;
  hijriDay: number;
  date: string;
  endDate: string | null;
  flexibleCount?: number;
  titleAr: string;
  descriptionFr: string;
  category: IslamicCategory;
  traditions: IslamicTradition[];
  status: IslamicStatus;
}
export interface IslamicWeeklyMaterialization {
  definitionId: string;
  hijriYear: number;
  event: NeoEvent & { type: "recurring" };
}
export function expandIslamicObservances(definitions: readonly IslamicObservanceDefinition[], firstGregorianYear: number, lastGregorianYear: number): { occurrences: IslamicOccurrence[]; weekly: IslamicWeeklyMaterialization[] };
```

Generate deterministic IDs `neo-islamic:<definition-id>:<hijri-year>:<date>`, merge ranges into one occurrence, and sort by date then definition ID. Materialize Monday/Thursday fasting as one yearly recurring note carrying `startRecur`, `endRecur` and every forbidden or superseded date in `skipDates`. Append the local-observation caveat to lunar dates and the sunset explanation to nights.

- [ ] **Step 5: Remove the incorrect shipped preset behavior**

Replace the old mixed Arabic/French Islamic preset with an activation entry for the generated calendar, or disable its direct rule expansion so it cannot duplicate the new notes. Keep migration recognition for existing users.

- [ ] **Step 6: Run the rule tests**

Run: `npx jest src/calendars/islamic/rules.test.ts src/calendars/auto/rules.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit the engine**

```bash
git add src/calendars/islamic/rules.ts src/calendars/islamic/rules.test.ts src/calendars/auto/hijri.ts src/calendars/auto/rules.test.ts presets/custom-presets.json
git commit -m "feat: expand Islamic observances into correct periods"
```

### Task 3: Préférences, manifeste et plan de réconciliation

**Files:**
- Create: `apps/windows/src/platform/islamicCalendarPreferences.ts`
- Create: `apps/windows/src/platform/islamicCalendarPreferences.test.ts`
- Create: `apps/windows/src/platform/islamicNoteSync.ts`
- Create: `apps/windows/src/platform/islamicNoteSync.test.ts`
- Modify: `apps/windows/src/platform/desktopWorkspacePreferences.ts`
- Modify: `apps/windows/src/platform/managedEventNote.ts`

**Interfaces:**
- Consumes: occurrences and managed-note serializer from the ICS plan.
- Produces: `IslamicCalendarPreferences`, `IslamicManifest`, `planIslamicNoteSync`.

- [ ] **Step 1: Write failing preference defaults and validation tests**

```ts
expect(defaultIslamicCalendarPreferences()).toEqual({
  enabled: false,
  targetCalendarPath: "الْإِسْلَامُ",
  managedSubdirectory: "المناسبات الإسلامية",
  hiddenCategories: ["historical-commemorations"],
  hiddenTraditions: ["twelver", "ismaili", "ibadi", "local-sufi"],
  generatedGregorianYears: [],
});
```

Reject absolute paths, `..`, reserved Windows segments and paths outside the target calendar.

- [ ] **Step 2: Write failing reconciliation tests**

Cover first generation, idempotence, version upgrade, obsolete managed file removal, personal collision, incomplete marker, interruption before manifest, deterministic filename, and no deletion outside the prior manifest.

```ts
expect(plan.writes[0].fileName).toBe("2026-03-20 eid-fitr 1447.md");
expect(plan.deletes.every(file => file.metadata.neoManagedBy === "neo-calendar:islamic")).toBe(true);
expect(plan.manifest.version).toBe(ISLAMIC_CATALOGUE_VERSION);
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx jest apps/windows/src/platform/islamicCalendarPreferences.test.ts apps/windows/src/platform/islamicNoteSync.test.ts --runInBand`

Expected: FAIL on missing modules.

- [ ] **Step 4: Implement shared preferences and manifest**

```ts
export interface IslamicCalendarPreferences {
  enabled: boolean;
  targetCalendarPath: string;
  managedSubdirectory: string;
  hiddenCategories: IslamicCategory[];
  hiddenTraditions: IslamicTradition[];
  generatedGregorianYears: number[];
}
export interface IslamicManifest {
  version: number;
  generatedGregorianYears: number[];
  files: Record<string, string>;
}
```

Store the configuration in shared workspace preferences. The manifest path is `<target>/<managedSubdirectory>/.neo-calendar-islamic.json` and is written last.

- [ ] **Step 5: Implement the pure reconciliation planner**

```ts
export function planIslamicNoteSync(args: {
  occurrences: readonly IslamicOccurrence[];
  existingRecords: readonly DesktopStoredEvent[];
  previousManifest: IslamicManifest | null;
  preferences: IslamicCalendarPreferences;
}): { writes: ManagedNoteWrite[]; deletes: DesktopStoredEvent[]; manifest: IslamicManifest; conflicts: string[] };
```

Serialize a single all-day event for a date or inclusive range. A write may reuse a previous relative path only when the full Islamic marker is valid. A delete additionally requires the path to occur in the previous manifest.

- [ ] **Step 6: Run preference and planner tests**

Run: `npx jest apps/windows/src/platform/islamicCalendarPreferences.test.ts apps/windows/src/platform/islamicNoteSync.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit preferences and planner**

```bash
git add apps/windows/src/platform/islamicCalendarPreferences.ts apps/windows/src/platform/islamicCalendarPreferences.test.ts apps/windows/src/platform/islamicNoteSync.ts apps/windows/src/platform/islamicNoteSync.test.ts apps/windows/src/platform/desktopWorkspacePreferences.ts apps/windows/src/platform/managedEventNote.ts
git commit -m "feat: plan safe Islamic note generation"
```

### Task 4: Support natif des sous-dossiers gérés sur Windows et Android

**Files:**
- Modify: `apps/windows/src-tauri/src/lib.rs`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/MainActivity.java`
- Modify: `apps/windows/src/platform/desktopCalendarStore.ts`
- Create: `apps/windows/src/platform/managedDirectoryStore.test.ts`

**Interfaces:**
- Produces native commands: `ensure_managed_directory`, `read_managed_text`, `write_managed_text`.
- Changes workspace loading to read Markdown recursively while preserving the top-level calendar identity.

- [ ] **Step 1: Write failing Rust path and recursion tests**

Add tests proving that `الْإِسْلَامُ/المناسبات الإسلامية` can be created, nested Markdown is returned with `calendar_path = "الْإِسْلَامُ"`, `..` and absolute segments are rejected, symlink escape is rejected, and atomic manifest replacement leaves either old or new complete content.

- [ ] **Step 2: Run native tests and confirm failure**

Run: `cargo test --manifest-path apps/windows/src-tauri/Cargo.toml`

Expected: FAIL because nested managed commands and recursive discovery do not exist.

- [ ] **Step 3: Implement confined native commands in Rust**

```rust
#[tauri::command(rename_all = "camelCase")]
fn ensure_managed_directory(data_folder: String, relative_path: String) -> Result<String, String>;
#[tauri::command(rename_all = "camelCase")]
fn read_managed_text(data_folder: String, relative_path: String) -> Result<Option<String>, String>;
#[tauri::command(rename_all = "camelCase")]
fn write_managed_text(data_folder: String, relative_path: String, contents: String) -> Result<(), String>;
```

Resolve every path under the canonical data root, refuse escaping symlinks, create only requested descendants, and write text through a temporary sibling followed by rename. Recursively read Markdown but skip nested symbolic links and non-Markdown files.

- [ ] **Step 4: Mirror the three commands in Android SAF code**

Add switch cases and helpers using `DocumentFile` descendants. Reject `.`/`..`, empty and separator-containing segments. Write manifests to a temporary document, replace the old document only after the temporary write succeeds, and preserve the top-level calendar path while recursively reporting Markdown.

- [ ] **Step 5: Add TypeScript wrappers and contract tests**

```ts
export async function ensureManagedDirectory(dataFolder: string, relativePath: string): Promise<string>;
export async function readManagedText(dataFolder: string, relativePath: string): Promise<string | null>;
export async function writeManagedText(dataFolder: string, relativePath: string, contents: string): Promise<void>;
```

- [ ] **Step 6: Run native and wrapper tests**

Run: `cargo test --manifest-path apps/windows/src-tauri/Cargo.toml`

Run: `npx jest apps/windows/src/platform/managedDirectoryStore.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit native managed-folder support**

```bash
git add apps/windows/src-tauri/src/lib.rs apps/android/native/app/src/main/java/com/ahmed/neocalendar/MainActivity.java apps/windows/src/platform/desktopCalendarStore.ts apps/windows/src/platform/managedDirectoryStore.test.ts
git commit -m "feat: support confined managed calendar subfolders"
```

### Task 5: Génération, chargement en lecture seule et filtrage global

**Files:**
- Modify: `apps/windows/src/DesktopCalendar.tsx`
- Create: `apps/windows/src/platform/islamicCalendarIntegration.test.tsx`
- Modify: `apps/windows/src/platform/desktopEventFormat.ts`
- Modify: `apps/windows/src/platform/DesktopEventCache.ts`
- Modify: `apps/windows/src/platform/desktopReminderScheduler.ts`
- Modify: `apps/windows/src/platform/desktopReminderScheduler.test.ts`

**Interfaces:**
- Consumes: preferences, occurrence engine, native managed store and reconciliation planner.
- Produces: `ensureIslamicCalendarYears(years: number[])` and filtered managed records.

- [ ] **Step 1: Write failing integration tests**

Assert activation creates the managed directory and years `now - 1..now + 1`, a second run writes nothing, navigation to an uncovered year adds it, generated records are read-only, personal sibling notes remain editable, filters exclude grid/list/search/panel/reminders, and a conflict surfaces without overwriting the personal file.

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest apps/windows/src/platform/islamicCalendarIntegration.test.tsx apps/windows/src/platform/desktopReminderScheduler.test.ts --runInBand`

Expected: FAIL because generation and managed filters are not wired.

- [ ] **Step 3: Implement transactional generation orchestration**

Read the manifest, calculate occurrences and the plan, ensure the directory, write/update notes, delete only validated obsolete managed notes, then atomically write the manifest. On any note failure, do not write the new manifest and show an actionable error.

- [ ] **Step 4: Implement lazy year expansion**

Observe the visible range already held by `DesktopCalendar`; when it intersects a Gregorian year absent from `generatedGregorianYears`, call `ensureIslamicCalendarYears` once for the missing years and deduplicate in-flight generation.

- [ ] **Step 5: Apply filters before every consumer**

```ts
export function isIslamicRecordVisible(record: DesktopStoredEvent, preferences: IslamicCalendarPreferences): boolean;
```

Return true for every non-Islamic record. For an Islamic record, category must not be hidden and at least one attached tradition must remain visible. Feed the resulting record set to the event cache, search, list/panel data and reminder scheduler.

- [ ] **Step 6: Run integration tests**

Run: `npx jest apps/windows/src/platform/islamicCalendarIntegration.test.tsx apps/windows/src/platform/desktopReminderScheduler.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit runtime integration**

```bash
git add apps/windows/src/DesktopCalendar.tsx apps/windows/src/platform/islamicCalendarIntegration.test.tsx apps/windows/src/platform/desktopEventFormat.ts apps/windows/src/platform/DesktopEventCache.ts apps/windows/src/platform/desktopReminderScheduler.ts apps/windows/src/platform/desktopReminderScheduler.test.ts
git commit -m "feat: generate and filter Islamic event notes"
```

### Task 6: Activation et paramètres des types/traditions

**Files:**
- Modify: `apps/windows/src/AddCalendarDialog.tsx`
- Modify: `apps/windows/src/AddCalendarDialog.test.tsx`
- Create: `apps/windows/src/IslamicCalendarSettings.tsx`
- Create: `apps/windows/src/IslamicCalendarSettings.test.tsx`
- Modify: `apps/windows/src/DesktopSettings.tsx`
- Modify: `apps/windows/src/DesktopSettings.test.tsx`
- Modify: `src/ui/i18n.ts`
- Modify: `src/ui/i18n.test.ts`
- Modify: `apps/windows/src/App.css`
- Modify: `apps/android/src/mobile.css`

**Interfaces:**
- Consumes: Islamic preferences and local calendar list.
- Produces: activation request and two filter groups.

- [ ] **Step 1: Write failing activation and settings tests**

Assert the automatic preset « Calendrier islamique » requests a local target, defaults to `الْإِسْلَامُ` when present, creates it only when absent and explicitly requested, activates `المناسبات الإسلامية`, and does not add the legacy in-memory preset. Test all category and tradition switches plus default hidden states.

```tsx
expect(screen.getByRole("group", { name: "Types d’événements" })).toBeTruthy();
expect(screen.getByRole("group", { name: "Traditions" })).toBeTruthy();
expect(screen.getByRole("checkbox", { name: "Commémorations historiques" })).not.toBeChecked();
```

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npx jest apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/IslamicCalendarSettings.test.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/i18n.test.ts --runInBand`

Expected: FAIL on missing activation and settings panel.

- [ ] **Step 3: Implement activation with an explicit target**

Extend only the automatic-calendar branch. The request shape is:

```ts
{ type: "islamic-generated"; targetCalendarPath: string; managedSubdirectory: "المناسبات الإسلامية" }
```

Keep Full Note creation unchanged. If the target exists, never rename or replace it. Activation saves preferences then invokes generation.

- [ ] **Step 4: Implement filter groups and explanatory copy**

Render six category switches and six tradition switches. Common categories start enabled; historical and particular traditions start disabled. Explain that hiding affects display and reminders but not files. Show the calculated-date caveat and the managed folder path.

- [ ] **Step 5: Implement responsive and accessible states**

Use native checkbox semantics, visible focus, entire-row labels, Android touch targets at least 40 px, wrapped French copy and `min-width: 0`. Cover enabled, disabled, saving, error and unsupported-Umm-al-Qura states in both themes.

- [ ] **Step 6: Run UI tests and formatting**

Run: `npx jest apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/IslamicCalendarSettings.test.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/i18n.test.ts --runInBand`

Run: `npx prettier --check apps/windows/src/AddCalendarDialog.tsx apps/windows/src/IslamicCalendarSettings.tsx apps/windows/src/DesktopSettings.tsx src/ui/i18n.ts`

Expected: PASS.

- [ ] **Step 7: Commit activation and settings**

```bash
git add apps/windows/src/AddCalendarDialog.tsx apps/windows/src/AddCalendarDialog.test.tsx apps/windows/src/IslamicCalendarSettings.tsx apps/windows/src/IslamicCalendarSettings.test.tsx apps/windows/src/DesktopSettings.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/i18n.ts src/ui/i18n.test.ts apps/windows/src/App.css apps/android/src/mobile.css
git commit -m "feat: configure Islamic event categories and traditions"
```

### Task 7: Vérification du corpus, des fichiers réels et des deux plateformes

**Files:**
- Modify only files whose verification reveals a diagnosed defect.

**Interfaces:**
- Produces: evidence that catalogue coverage, generated Markdown, filtering and rendering satisfy the spec.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Run: `npm run build`

Run: `npm run android:frontend`

Run: `cargo test --manifest-path apps/windows/src-tauri/Cargo.toml`

Expected: all commands exit 0.

- [ ] **Step 2: Generate the real requested folder on Windows**

Launch Neo Calendar against `C:\Neo Calendar`, activate the generated preset for `الْإِسْلَامُ`, and verify that Markdown files appear under `C:\Neo Calendar\الْإِسْلَامُ\المناسبات الإسلامية` while the ten pre-existing personal notes remain byte-identical.

- [ ] **Step 3: Inspect representative files**

Check Eid al-Fitr, Ramadan period, the Chawwāl window, Badr, Ashura/Karbala, Arbaïn and one birth/death entry. Each filename is deterministic, each title is Arabic-only, each description begins with the French name, and each frontmatter marker is complete.

- [ ] **Step 4: Run real Windows and Android UI checks**

On both platforms, toggle every category and tradition; verify grid, list, search, event panel and reminders. Test default state, all-visible, all-hidden, one multi-tradition event, unsupported-calendar error and a generated note opened from the UI.

- [ ] **Step 5: Review the state matrix**

Confirm pairwise coverage: category × tradition; common × particular; current/preloaded/lazy year; personal/generated/conflict file; first run/idempotent/upgrade/interrupted run; Windows/Android × light/dark; visible/hidden × grid/list/search/panel/reminder.

- [ ] **Step 6: Re-run the complete suite after any correction**

Run the four commands from Step 1 again and require all exit codes to be 0 before release work begins.
