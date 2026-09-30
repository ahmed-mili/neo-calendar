# Corpus de conformité et noyau Kotlin : récurrence et rappels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter en Kotlin l'expansion des évènements en occurrences affichables (ponctuels, récurrents par jours, règles RRULE) puis le calcul des rappels (évènements et prières), jusqu'à ce que le même corpus passe sous Jest et JUnit.

**Architecture:** Même moule que `notes` et `preferences` (déjà sur `main`) : un cas = `conformance/<domaine>/<cas>.json` `{name, fn, input, expected}`, adaptateurs `conformance/operations.ts` et `core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt`. Kotlin dans `core/src/main/kotlin/com/ahmed/neocalendar/core/recurrence/` et `.../reminders/`. Domaines 4 et 5 de la spec.

**Tech Stack:** Jest 29 + ts-jest ; Kotlin 2.3.21, kotlinx-serialization-json 1.11.0, JUnit 4.13.2 (en place) ; **`org.dmfs:lib-recur` 0.17.1** (Apache 2.0, vérifié sur Maven Central et dans son LICENSE le 2026-09-30) pour l'expansion RRULE ; dates en `java.time`.

**Spec:** `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md`

## Global Constraints

- Aucune modification de comportement du TypeScript, de l'app WebView ni du bureau. Un bug TypeScript découvert s'écrit dans `docs/PROCHAINE_VERSION.md` (non versionné) et le cas décrit le comportement ACTUEL.
- Le module `core` n'a aucune dépendance Android ; paquets `com.ahmed.neocalendar.core.recurrence` et `com.ahmed.neocalendar.core.reminders`. Seule dépendance nouvelle autorisée : `implementation("org.dmfs:lib-recur:0.17.1")` dans `apps/android/native/core/build.gradle.kts`.
- **Fuseau** : `Europe/Paris` des deux côtés. Kotlin : déjà fixé (`-Duser.timezone=Europe/Paris` dans la tâche `test`). Jest : dans `conformance/runner.test.ts`, `beforeAll` mémorise `process.env.TZ` et le passe à `"Europe/Paris"`, `afterAll` le restaure (sans restauration, la CI en UTC changerait de fuseau pour les fichiers de test suivants du même worker). Le plan `grille-ics`, mené en parallèle sur une autre branche, fait la même modification : écrire EXACTEMENT ce bloc, pour que la fusion soit triviale.
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
- **Dates dans le corpus** : en entrée, chaînes ISO lues par `new Date(s)` (TS) / `Instant.parse` ou `OffsetDateTime.parse` (Kotlin) ; en sortie, la forme de `Date.prototype.toISOString()` (UTC, millisecondes, `Z`), celle que `JSON.stringify` produit. Kotlin doit l'écrire à l'identique (`DateTimeFormatter` `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` en UTC).
- **Langue** : `t()` (`src/ui/i18n.ts`) vaut `"fr"` sous Jest (pas de `localStorage`). Le corpus est en français ; le Kotlin ne porte que les chaînes `fr` qu'emploient les fonctions portées, copiées de `src/ui/i18n.ts`, dans `core/.../reminders/Strings.kt`.
- Si `lib-recur` ne reproduit pas `rrule` sur un cas, ne pas forcer : écrire l'écart dans `conformance/README.md` (section « Écarts connus ») et le signaler dans le rapport ; si l'écart touche une règle que l'app écrit (`recurrenceToRRule`), écrire l'expansion à la main pour ces formes.
- Commandes : Jest `npx jest conformance` à la racine ; Gradle sous PowerShell dans `apps/android/native` : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test --rerun-tasks --console=plain`.
- Nombres : valeur entière → `JsonPrimitive(Long)`.
- Sorties attendues obtenues en EXÉCUTANT le TypeScript (test Jest temporaire supprimé ensuite), jamais de tête.
- **Discriminance** : chaque cas vu ROUGE sous une casse du TypeScript (ou de `node_modules/rrule`, restauré), puis vert ; après chaque casse `git diff apps/windows/src src` vide. Casse de chaque cas dans le rapport.
- **Rouge Kotlin avant le port**, consigné.
- Commit : n'ajouter que `conformance` et `apps/android/native/core` ; message en français ; trailer `Co-Authored-By:` au nom du modèle réel, puis `Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR`.

## Review Focus

- Changement d'heure (dernier dimanche de mars et d'octobre) : une occurrence à 9 h reste à 9 h locale, et un évènement de nuit qui traverse le changement garde sa durée affichée comme le TypeScript (cas dédiés, Tasks 1 et 2).
- Évènement qui traverse minuit : partie du lendemain en continuation, comme `neoEventToDisplayEvents` (cas dédiés, Task 1).
- `skipDates` et `completedDates` d'une série : occurrence retirée, occurrence cochée (cas dédiés, Tasks 1 et 2).
- Fenêtre `rangeStart`/`rangeEnd` : occurrence qui chevauche le bord de la fenêtre, gardée ou non comme le TypeScript (cas dédiés, Task 2).
- Rappel déjà passé à `now`, rappel d'un évènement all-day (`ALL_DAY_REMINDER_HOUR` = 20 la veille), délai propre au calendrier : exactement le TypeScript (cas dédiés, Task 3).

---

### Task 1: Occurrences des évènements ponctuels et récurrents par jours

Port de `src/ui/calendar/eventExpansion.ts` (388 lignes) SANS la branche `rrule` (Task 2), avec ce qu'elle lit : `calendarDateUtils.ts` (42), `getDisplayTitle` (`CalendarEventsPanel.helpers.ts`), `isTask` / `getTaskStatus` (`src/ui/tasks/index.ts`), `seriesStartDate` (`recurrenceDeletion.ts`), le type `DisplayEvent` (`src/ui/types.ts`). Réutiliser `NeoEvent` / `validateEvent` de `core/.../notes/NeoEvent.kt`.

**Files:**
- Modify: `conformance/runner.test.ts` (fuseau, voir Global Constraints)
- Create: `conformance/recurrence/*.json` (au moins 20 : single all-day, single horodaté, sur plusieurs jours, traversant minuit, tâche cochée, tâche en cours, someday, recurring par jours avec `startRecur`/`endRecur`/`skipDates`/`completedDates`, hors fenêtre, changement d'heure)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/recurrence/DisplayEvent.kt`, `Expansion.kt`, `DateUtils.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Produces : `data class DisplayEvent` (mêmes champs que le TypeScript, dates en `Instant`, sans les champs d'état d'interface `selected` et `visibilityState`) avec `fun toJson(): JsonObject` ; `fun neoEventToDisplayEvents(event: NeoEvent, id: String, calendarId: String, calendarName: String, color: String, editable: Boolean, rangeStart: Instant, rangeEnd: Instant): List<DisplayEvent>`.
- Opération `recurrence.expand` : entrée `{event, id, calendarId, calendarName, color, editable, rangeStart, rangeEnd}` (`event` validé par `validateEvent` des deux côtés) ; sortie : le tableau d'occurrences.

- [ ] **Step 1: Fuseau dans le runner Jest**, `npx jest conformance` toujours vert.
- [ ] **Step 2: Cas**, reprendre `eventExpansion.test.ts`. Adaptateur TS :
```ts
"recurrence.expand": ({ event, id, calendarId, calendarName, color, editable, rangeStart, rangeEnd }) =>
    neoEventToDisplayEvents(validateEvent(event)!, id, calendarId, calendarName, color, editable, new Date(rangeStart), new Date(rangeEnd)),
```
- [ ] **Step 3: Vert en TypeScript, discriminance vue.**
- [ ] **Step 4: Rouge en Kotlin.**
- [ ] **Step 5: Porter**, commentaires du POURQUOI repris.
- [ ] **Step 6: Vert des deux côtés, commit** « Corpus récurrence : occurrences ponctuelles et hebdomadaires, portées en Kotlin ».

---

### Task 2: Occurrences des règles RRULE

La branche `rrule` de `eventExpansion.ts` (`rrulestr`, `between`, `skipDates`, `completedDates`, `isSeriesStart`), en Kotlin avec `lib-recur`.

**Files:**
- Create: `conformance/recurrence/rrule-*.json` (au moins 20 : chaque forme de `recurrenceToRRule` — quotidien, tous les N jours, hebdo un et plusieurs jours, mensuel par jour du mois et « 2e mardi », 31 du mois, annuel, `COUNT`, `UNTIL` —, plus `skipDates`, `completedDates`, occurrence au bord de la fenêtre, changement d'heure, règle malformée)
- Modify: `apps/android/native/core/build.gradle.kts` (dépendance `lib-recur`), `Expansion.kt`

**Interfaces:**
- Consumes : `DisplayEvent`, `neoEventToDisplayEvents` (Task 1).
- Produces : même fonction, branche `Rrule` complétée. Même opération `recurrence.expand`.

- [ ] **Step 1: Cas**, reprendre `eventExpansion.test.ts` et les formes de `recurrence.test.ts`.
- [ ] **Step 2: Vert en TypeScript, discriminance vue.**
- [ ] **Step 3: Rouge en Kotlin.**
- [ ] **Step 4: Porter avec `lib-recur`** ; appliquer la règle « écart connu » des Global Constraints si besoin.
- [ ] **Step 5: Vert des deux côtés, commit** « Corpus récurrence : règles RRULE, portées en Kotlin ».

---

### Task 3: Rappels des évènements

Port de `apps/windows/src/platform/androidReminders.ts` (268 lignes : `buildReminders`, `remindersByCalendarId`, `REMINDER_HORIZON_DAYS` = 30, `ALL_DAY_REMINDER_HOUR` = 20, type `Reminder`) et de ce qu'il lit : `relativeDelayLabel` (`src/ui/calendar/reminderDelay.ts`, 136), `DAYS_SHORT` (`calendarConstants.ts`), les chaînes `fr` de `t()`.

**Files:**
- Create: `conformance/reminders/*.json` (au moins 20)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/reminders/Reminders.kt`, `ReminderDelay.kt`, `Strings.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `DisplayEvent` (Tasks 1-2).
- Produces : `data class Reminder` (mêmes champs que le type TypeScript) ; `fun buildReminders(events: List<DisplayEvent>, now: Instant, minutesBefore: List<Long>, minutesByCalendar: Map<String, List<Long>>, timeFormat24h: Boolean): List<Reminder>` ; `fun relativeDelayLabel(...)` (même signature que le TypeScript).
- Opérations : `reminders.build` `{events, now, minutesBefore, minutesByCalendar, timeFormat24h}` où `events` est un tableau d'entrées `recurrence.expand` (l'adaptateur les développe d'abord, des deux côtés, puis concatène) ; `reminders.delayLabel` avec les arguments de `relativeDelayLabel`.

- [ ] **Step 1: Cas**, reprendre `androidReminders.test.ts` (44 cas) et `reminderDelay.test.ts` ; chaque ligne « rappels » du Review Focus a son cas ; formats 24 h et 12 h.
- [ ] **Step 2: Vert en TypeScript, discriminance vue.**
- [ ] **Step 3: Rouge en Kotlin.**
- [ ] **Step 4: Porter.**
- [ ] **Step 5: Vert des deux côtés, commit** « Corpus rappels : rappels des évènements, portés en Kotlin ».

---

### Task 4: Rappels de prière

Port de `apps/windows/src/platform/prayerReminders.ts` (89 lignes : `prayerRemindersFor`) et de `formatTime` (`src/ui/calendar/calendarFormatters.ts`).

**Files:**
- Create: `conformance/reminders/priere-*.json` (au moins 8)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/reminders/PrayerReminders.kt`
- Modify: les deux adaptateurs, `Strings.kt`

**Interfaces:**
- Consumes : `Reminder`, `relativeDelayLabel`, `Strings.kt` (Task 3).
- Produces : `fun prayerRemindersFor(timetable: JsonElement, minutes: List<Long>, now: Instant, timeFormat24h: Boolean): List<Reminder>` (le `timetable` garde la forme JSON du TypeScript).
- Opération `reminders.prayer` `{timetable, minutes, now, timeFormat24h}`.

- [ ] **Step 1: Cas**, reprendre `prayerReminders.test.ts` : délai 0 (« à l'heure »), liste vide (silence), plusieurs délais, prière déjà passée, 12 h / 24 h.
- [ ] **Step 2: Vert en TypeScript, discriminance vue.**
- [ ] **Step 3: Rouge en Kotlin.**
- [ ] **Step 4: Porter.**
- [ ] **Step 5: Vert des deux côtés, commit** « Corpus rappels : rappels de prière, portés en Kotlin ».
