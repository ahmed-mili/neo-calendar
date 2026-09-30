# Corpus de conformité et noyau Kotlin : grille et ICS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter en Kotlin la logique pure de la grille (semaines, position des blocs, chevauchements, bandes all-day) puis la lecture d'un flux ICS et le plan de synchro de ses notes, jusqu'à ce que le même corpus passe sous Jest et JUnit.

**Architecture:** Même moule que `notes` et `preferences` (déjà sur `main`). Cas dans `conformance/layout/` et `conformance/ics/`, adaptateurs `conformance/operations.ts` et `core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt`. Kotlin dans `core/src/main/kotlin/com/ahmed/neocalendar/core/layout/` et `.../ics/`. Domaines 6 et 7 de la spec, menés en parallèle du plan `recurrence-rappels` sur une autre branche : ce plan NE PORTE PAS `DisplayEvent` ni l'expansion (autre plan) et définit son propre type d'entrée minimal pour la grille.

**Tech Stack:** Jest 29 + ts-jest ; Kotlin 2.3.21, kotlinx-serialization-json 1.11.0, JUnit 4.13.2 (en place) ; **`org.mnode.ical4j:ical4j` 4.3.0** (BSD 3-Clause, vérifié sur Maven Central et dans son LICENSE le 2026-09-30) pour lire l'ICS ; dates en `java.time`.

**Spec:** `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md`

## Global Constraints

- Copie de travail : `C:\dev\neo-calendar-noyau-b` (branche `noyau-grille-ics`). Toutes les commandes s'y lancent ; ne jamais toucher à `C:\dev\neo-calendar`, où un autre plan tourne.
- Aucune modification de comportement du TypeScript, de l'app WebView ni du bureau. Un bug TypeScript découvert s'écrit dans le rapport de tâche (le contrôleur le reportera dans `docs/PROCHAINE_VERSION.md`) et le cas décrit le comportement ACTUEL.
- Le module `core` n'a aucune dépendance Android. Seule dépendance nouvelle autorisée : `implementation("org.mnode.ical4j:ical4j:4.3.0")` (Task 3).
- **Fuseau** `Europe/Paris` des deux côtés. Kotlin : déjà fixé. Jest : dans `conformance/runner.test.ts`, `beforeAll` mémorise `process.env.TZ` et le passe à `"Europe/Paris"`, `afterAll` le restaure. (L'autre plan fait la même modification : écrire EXACTEMENT ce bloc, pour que la fusion soit triviale.)
```ts
let previousTz: string | undefined;
beforeAll(() => {
    previousTz = process.env.TZ;
    process.env.TZ = "Europe/Paris";
});
afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
});
```
- **Dates** : entrée en chaînes ISO (`new Date(s)` / `Instant.parse` ou `OffsetDateTime.parse`) ; sortie au format `Date.prototype.toISOString()` (UTC, millisecondes, `Z`).
- Si `ical4j` ne reproduit pas `ical.js` sur un cas, ne pas forcer : écrire l'écart dans `conformance/README.md` (section « Écarts connus ») et le signaler ; si l'écart touche un flux réel d'Ahmed (Planning Efrei, jours fériés), l'écrire à la main pour ces formes.
- Commandes : Jest `npx jest conformance` à la racine de la copie B ; Gradle sous PowerShell dans `C:\dev\neo-calendar-noyau-b\apps\android\native` : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test --rerun-tasks --console=plain`.
- Nombres : valeur entière → `JsonPrimitive(Long)`.
- Sorties attendues obtenues en EXÉCUTANT le TypeScript (test Jest temporaire supprimé ensuite), jamais de tête.
- **Discriminance** : chaque cas vu ROUGE sous une casse du TypeScript, puis vert ; après chaque casse `git diff apps/windows/src src` vide. Casse de chaque cas dans le rapport.
- **Rouge Kotlin avant le port**, consigné.
- Commit : n'ajouter que `conformance` et `apps/android/native/core` ; message en français ; trailer `Co-Authored-By:` au nom du modèle réel, puis `Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR`.

## Review Focus

- Semaine qui commence un autre jour que le lundi (`firstDay` 0 à 6) et semaine ISO 1/52/53 aux bords d'année (cas dédiés, Task 1).
- Trois évènements qui se chevauchent en chaîne (A avec B, B avec C, pas A avec C) : mêmes colonnes que le TypeScript (cas dédiés, Task 2).
- Évènement all-day sur plusieurs jours qui déborde de la semaine affichée, et plus de lanes que `ALLDAY_MAX_ROWS` = 4 (cas dédiés, Task 2).
- Flux ICS avec `TZID`, avec évènement journée entière (`VALUE=DATE`), avec série et exception (`RECURRENCE-ID`, `EXDATE`) : mêmes occurrences que `ical.js` (cas dédiés, Task 3).
- Flux qui change entre deux synchros (évènement modifié, supprimé, ajouté) : même plan d'écriture et de suppression de notes que `planIcsNoteSync` (cas dédiés, Task 4).

---

### Task 1: Dates et mesures de la grille

> Fait : commits 0f8d273..8ed8ccf

Port de `src/ui/calendar/calendarDateUtils.ts` (42 lignes), et dans `src/ui/calendar/CalendarUtils.ts` de `getISOWeek`, `todayBadgeState`, `eventTopHours`, `eventDurationHours`, `isMultiDayTimed`, `needsCompactMonthType` / `LONG_MONTH_NAME` ; dans `calendarConstants.ts` de `clampHourHeight`, `MIN_HOUR_HEIGHT`, `MAX_HOUR_HEIGHT`, `ANDROID_HOUR_HEIGHT`, `ALLDAY_ROW_HEIGHT`, `ALLDAY_MAX_ROWS`, `OVERLAP_COL_GAP`, `EVENT_VGAP`. Ne pas porter ce qui lit le DOM (`isAndroidRuntime`, `allDayRowHeight`, `positionToDate` s'il en dépend).

**Files:**
- Modify: `conformance/runner.test.ts` (bloc du fuseau)
- Create: `conformance/layout/dates-*.json` et `mesures-*.json` (au moins 20)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/layout/GridDates.kt`, `GridMetrics.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Produces : fonctions Kotlin de mêmes noms, dates en `Instant` ou `LocalDate` selon ce que la fonction TypeScript manipule réellement (jour local → `LocalDate`, instant → `Instant`).
- Opérations : `layout.<nomDeLaFonction>` avec les arguments de la fonction TypeScript en objet nommé (ex. `layout.getWeekStart` `{date, firstDay}`).

- [x] **Step 1: Bloc du fuseau dans le runner**, Jest toujours vert.
- [x] **Step 2: Cas**, reprendre les tests existants de ces fonctions ; Review Focus ligne 1 couverte.
- [x] **Step 3: Vert en TypeScript, discriminance vue.**
- [x] **Step 4: Rouge en Kotlin.**
- [x] **Step 5: Porter.**
- [x] **Step 6: Vert des deux côtés, commit** « Corpus grille : dates et mesures, portées en Kotlin ».

---

### Task 2: Chevauchements et bandes all-day

> Fait : commits 8ed8ccf..d635d1c

Port de `computeOverlapGroups` (`CalendarUtils.ts:138-206`, type `OverlapGroup`) et de `packAllDayLanes`, `visibleLaneCount`, `hiddenBarCountByDay`, `allDayBandRows` (`src/ui/calendar/useAllDayLanes.ts:39-243`, SANS le hook React `useAllDayLanes`).

**Files:**
- Create: `conformance/layout/chevauchement-*.json` (au moins 10), `conformance/layout/allday-*.json` (au moins 12)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/layout/GridEvent.kt`, `Overlap.kt`, `AllDayLanes.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `GridDates.kt` (Task 1).
- Produces : `data class GridEvent(val id: String, val start: Instant, val end: Instant, val allDay: Boolean, val isMultiDay: Boolean, ...)` avec EXACTEMENT les champs de `DisplayEvent` que ces fonctions lisent (les relever dans le code) ; l'autre plan fournira plus tard `DisplayEvent.toGridEvent()`. Fonctions de mêmes noms.
- Opérations : `layout.overlapGroups` `{events}` ; `layout.packAllDayLanes` `{events, extendedDates, arrival}` où `arrival` est un objet `id → nombre` (l'adaptateur en fait la fonction `arrivalOf`) ; `layout.visibleLaneCount`, `layout.hiddenBarCountByDay`, `layout.allDayBandRows` avec leurs arguments nommés. Dans les deux adaptateurs, un évènement d'entrée ne porte que les champs lus ; les autres champs de `DisplayEvent` reçoivent une valeur neutre fixe.

- [x] **Step 1: Cas**, reprendre `useAllDayLanes.test.ts` et les tests de `computeOverlapGroups` ; Review Focus lignes 2 et 3 couvertes.
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin.**
- [x] **Step 4: Porter.**
- [x] **Step 5: Vert des deux côtés, commit** « Corpus grille : chevauchements et bandes all-day, portés en Kotlin ».

---

### Task 3: Lire un flux ICS

> Fait : commits d635d1c..3937def

Port de `parseIcsSnapshot`, `occurrenceSignature`, `getEventsFromICS` (`src/calendars/parsing/ics.ts`, 508 lignes, `ical.js` + `luxon`), en Kotlin avec `ical4j`. Réutiliser `NeoEvent` / `validateEvent` de `core/.../notes/NeoEvent.kt`.

**Files:**
- Create: `conformance/ics/lecture-*.json` (au moins 20 ; le texte ICS est une chaîne dans l'entrée)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/ics/IcsParser.kt`
- Modify: `apps/android/native/core/build.gradle.kts` (dépendance `ical4j`), les deux adaptateurs

**Interfaces:**
- Produces : `fun parseIcsSnapshot(text: String, from: String, to: String): JsonObject` (forme `IcsSnapshot` du TypeScript) ; `fun occurrenceSignature(event: NeoEvent): String?` ; `fun getEventsFromICS(text: String): List<NeoEvent>`.
- Opérations : `ics.snapshot` `{text, window: {from, to}}` ; `ics.signature` `{event}` ; `ics.events` `{text}`.

- [x] **Step 1: Cas**, reprendre `ics.test.ts` (28 cas, chaînes ICS en ligne) ; Review Focus ligne 4 couverte ; plus un extrait réaliste de flux universitaire (cours horodatés avec `TZID=Europe/Paris`, `LOCATION`, `DESCRIPTION` multiligne pliée à 75 octets).
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin.**
- [x] **Step 4: Porter avec `ical4j`** ; appliquer la règle « écart connu » si besoin. Vérifier que `ical4j` ne cherche pas de fichier de fuseau sur disque ni sur le réseau pendant le test (sinon le configurer pour ses fuseaux embarqués) et le dire dans le rapport.
- [x] **Step 5: Vert des deux côtés, commit** « Corpus ICS : lecture d'un flux, portée en Kotlin ».

---

### Task 4: Plan de synchro des notes d'un flux ICS

> Fait : commits 3937def..87f7cad

Port de `apps/windows/src/platform/icalNoteSync.ts` (437 lignes : `preferredIcalDirectoryName`, `availableIcalDirectoryName`, `planIcalDirectoryAssignments`, `scopedIcalEvent`, `planIcalNoteSync`, `startOfLocalWeekIso`, `planIcsNoteSync`) et de `apps/windows/src/platform/mergeRemoteEvents.ts` (35). Réutiliser `serializeManagedEventMarkdown` s'il est déjà porté (`core/.../notes/ManagedNote.kt`), sinon le porter ici depuis `managedEventNote.ts`.

`validate_single_name` et `safe_join` sont en Rust (`apps/windows/src-tauri/src/lib.rs:113-150`), pas en TypeScript : ils ne peuvent pas entrer au corpus Jest. Les porter dans `core/.../ics/SafeNames.kt` avec un test JUnit `SafeNamesTest.kt` dont les attendus sont relevés en EXÉCUTANT le Rust (test `cargo test` temporaire dans `src-tauri`, supprimé ensuite ; ou les tests Rust existants s'ils couvrent déjà les cas).

**Files:**
- Create: `conformance/ics/synchro-*.json` (au moins 15), `conformance/ics/dossier-*.json` (au moins 6)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/ics/IcsNoteSync.kt`, `SafeNames.kt`
- Create: `core/src/test/kotlin/com/ahmed/neocalendar/core/ics/SafeNamesTest.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `parseIcsSnapshot` (Task 3), `NeoEvent`, `serializeEventMarkdown`, `ManagedNote.kt` (domaine notes).
- Produces : fonctions de mêmes noms, entrées et sorties en `JsonObject` quand le TypeScript manipule des objets composés.
- Opérations : `ics.planSync` avec les arguments de `planIcsNoteSync` (`now` explicite dans l'entrée) ; `ics.directoryName` `{name}` ; `ics.availableDirectoryName` avec ses arguments ; `ics.startOfLocalWeek` `{now}`.

- [x] **Step 1: Cas**, reprendre `icalNoteSync.test.ts` (856 lignes) ; Review Focus ligne 5 couverte.
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin** (et `SafeNamesTest` rouge avant `SafeNames.kt`).
- [x] **Step 4: Porter.**
- [x] **Step 5: Vert des deux côtés, commit** « Corpus ICS : plan de synchro des notes, porté en Kotlin ».
