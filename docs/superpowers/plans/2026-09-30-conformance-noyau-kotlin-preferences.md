# Corpus de conformité et noyau Kotlin : préférences

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter en Kotlin la lecture tolérante de `.neo-calendar.json` (défauts, migration des anciennes valeurs, liens ICS, séparation appareil/partagé, réconciliation) jusqu'à ce que le même corpus passe sous Jest et JUnit.

**Architecture:** Même moule que le domaine `notes` (déjà sur `main`) : un cas = `conformance/preferences/<cas>.json` `{name, fn, input, expected}`, adaptateurs `conformance/operations.ts` et `core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt`. Le Kotlin vit dans `core/src/main/kotlin/com/ahmed/neocalendar/core/preferences/`. Domaine 3 de la spec.

**Tech Stack:** Jest 29 + ts-jest ; Kotlin 2.3.21, kotlinx-serialization-json 1.11.0 (API `JsonElement`), JUnit 4.13.2 — déjà en place.

**Spec:** `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md`

## Global Constraints

- Aucune modification de comportement du TypeScript, de l'app WebView ni du bureau. Un bug TypeScript découvert s'écrit dans `docs/PROCHAINE_VERSION.md` (non versionné) et le cas décrit le comportement ACTUEL.
- Le module `core` n'a aucune dépendance Android ; paquet `com.ahmed.neocalendar.core.preferences`. Aucune nouvelle dépendance.
- Commandes : Jest `npx jest conformance` à la racine ; Gradle sous PowerShell, dans `apps/android/native` : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test --rerun-tasks --console=plain`.
- Nombres : un nombre de valeur entière s'émet en `JsonPrimitive(Long)` (JS écrit `2.0` comme `2`) ; les autres en `Double`.
- Les sorties attendues s'obtiennent en EXÉCUTANT le TypeScript (test Jest temporaire supprimé ensuite), jamais de tête.
- **Discriminance** : un cas n'entre au corpus qu'après avoir été vu ROUGE en cassant temporairement dans le TypeScript la règle qu'il garde, puis vert après restauration ; après chaque casse `git diff apps/windows/src src` revient vide. Consigner la casse de chaque cas dans le rapport.
- **Rouge Kotlin avant le port** : l'opération ajoutée à `Operations.kt`, `:core:test` échoue, c'est consigné, puis on porte.
- Les types Kotlin portent les mêmes noms de champs que le TypeScript ; une préférence absente d'un objet TypeScript est absente du JSON Kotlin (pas de `null` inventé).
- Commit : n'ajouter que `conformance` et `apps/android/native/core` ; message en français terminé par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR
  ```

## Review Focus

- Fichier de préférences corrompu ou d'un autre type (`null`, tableau, chaîne, nombre) : les défauts, sans exception (cas dédiés, Task 2).
- Champ du bon nom mais du mauvais type (`firstDay: "1"`, `reminderMinutes: "10"`, `colors: []`) : le défaut de CE champ seul, les autres gardés (cas dédiés, Task 2).
- Délai de rappel hors bornes (négatif, décimal, `NaN` écrit `null`, au-delà de `MAX_REMINDER_MINUTES` = 40320) : écarté comme le fait `isReminderMinutes` (cas dédiés, Task 2).
- Ancien fichier (version < 5, ancien `reminderMinutes` nombre unique, anciennes sources iCal) : migré exactement comme le TypeScript, sinon le téléphone perdrait les liens ICS d'Ahmed (cas dédiés, Tasks 1 et 2).
- Préférences d'appareil : ce que le téléphone règle pour lui (vue, nombre de jours, colonne, bande all-day) ne doit jamais écraser la partie partagée, et inversement (cas dédiés, Task 3).

---

### Task 1: Liens ICS et calendriers externes dans les préférences

> Fait : commits 718cf27..59c3e06

Port de `apps/windows/src/platform/icsFeedPreferences.ts` (163 lignes : `normalizeIcsUrl`, `parseIcsFeeds`, `migrateLegacyIcalSources`, `ICS_REFRESH_MINUTES`, `MAX_ICS_FEEDS_PER_CALENDAR`) et de `parseExternalCalendarSources` (`apps/windows/src/platform/desktopExternalCalendars.ts:98-182`, avec `FRANCE_HOLIDAY_SOURCE`, `cloneFranceHolidaySource`). Ne PAS porter `buildAutoCalendarEvents` ni `parseIcalCalendarEvents` (domaines récurrence et ICS).

**Files:**
- Create: `conformance/preferences/ics-*.json` (au moins 12), `conformance/preferences/externes-*.json` (au moins 5)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/preferences/IcsFeeds.kt`
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/preferences/ExternalCalendars.kt`
- Modify: `conformance/operations.ts`, `core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt`

**Interfaces:**
- Produces : `fun normalizeIcsUrl(value: String): String` ; `fun parseIcsFeeds(value: JsonElement?): JsonArray` ; `fun migrateLegacyIcalSources(value: JsonElement?): JsonObject` (mêmes clés que le retour TypeScript) ; `fun parseExternalCalendarSources(value: JsonElement?): JsonArray` ; constantes `ICS_REFRESH_MINUTES`, `MAX_ICS_FEEDS_PER_CALENDAR`.
- Les types restent en `JsonElement` à ce stade : l'écran Compose les typera quand il les lira. Un type ajouté maintenant ne servirait à personne.
- Opérations : `preferences.icsUrl` `{value}` ; `preferences.icsFeeds` `{value}` ; `preferences.icsMigrate` `{value}` ; `preferences.externalSources` `{value}`.

- [x] **Step 1: Cas.** Reprendre les données de `icsFeedPreferences.test.ts`. Couvrir : URL `webcal://` et `webcals://`, espaces, casse du schéma, URL déjà normalisée ; flux sans URL, URL en double, fréquence hors `ICS_REFRESH_MINUTES`, plus de `MAX_ICS_FEEDS_PER_CALENDAR` flux dans un calendrier, entrée non-objet dans le tableau, valeur non-tableau ; migration d'anciennes sources iCal (avec et sans flux déjà présents) ; sources externes : jours fériés France présents, absents, source iCal valide, invalide.
- [x] **Step 2: Vert en TypeScript, discriminance vue.** Adaptateurs TS : `"preferences.icsUrl": ({ value }) => normalizeIcsUrl(value)`, `"preferences.icsFeeds": ({ value }) => parseIcsFeeds(value)`, `"preferences.icsMigrate": ({ value }) => migrateLegacyIcalSources(value)`, `"preferences.externalSources": ({ value }) => parseExternalCalendarSources(value)`.
- [x] **Step 3: Rouge en Kotlin** (les quatre opérations dans `Operations.kt`).
- [x] **Step 4: Porter** `IcsFeeds.kt` et `ExternalCalendars.kt`, fonction pour fonction, commentaires du POURQUOI repris.
- [x] **Step 5: Vert des deux côtés, commit** « Corpus préférences : liens ICS et calendriers externes, portés en Kotlin ».

---

### Task 2: Défauts et lecture tolérante de `.neo-calendar.json`

> Fait : commits 59c3e06..85cb614

Port de `apps/windows/src/platform/desktopWorkspacePreferences.ts:20-216` et `371-585` : `defaultDesktopWorkspacePreferences`, `parseDesktopWorkspacePreferences`, `reminderListOf`, `isReminderMinutes`, `REMINDER_CHOICES`, `MAX_REMINDER_MINUTES`, `DEFAULT_PRAYER_REMINDER`, `prayerReminderMinutesFor`, et les constantes qu'elles lisent dans `src/ui/calendar/locationLink.ts` (`MAPS_TRAVEL_MODES`, `MAPS_APPS`) et `src/ui/types.ts` (liste des `ViewType`).

**Files:**
- Create: `conformance/preferences/defauts.json`, `conformance/preferences/lecture-*.json` (au moins 20), `conformance/preferences/rappels-*.json` (au moins 8)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/preferences/WorkspacePreferences.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `parseIcsFeeds`, `migrateLegacyIcalSources`, `parseExternalCalendarSources` (Task 1).
- Produces : `fun defaultWorkspacePreferences(): JsonObject` ; `fun parseWorkspacePreferences(value: JsonElement?): JsonObject` (même objet que le TypeScript, clés absentes omises) ; `fun reminderListOf(value: JsonElement?): List<Long>?` ; `fun isReminderMinutes(value: JsonElement?): Boolean` ; `fun prayerReminderMinutesFor(settings: JsonObject, relativePath: String): List<Long>` ; constantes `REMINDER_CHOICES`, `MAX_REMINDER_MINUTES = 40320`, `DEFAULT_PRAYER_REMINDER`.
- Opérations : `preferences.defaults` `{}` ; `preferences.parse` `{value}` ; `preferences.reminderList` `{value}` (sortie : tableau ou `null`) ; `preferences.isReminderMinutes` `{value}` ; `preferences.prayerReminder` `{settings, relativePath}`.

- [x] **Step 1: Cas.** Reprendre `preferences.test.ts` et `reminderChoices.test.ts`. Chaque ligne du Review Focus a au moins un cas : valeurs racine `null`, tableau, chaîne, nombre ; chaque champ du type `DesktopWorkspacePreferences` au mauvais type, un par cas ou groupés par famille ; `dayCount` hors bornes ; `firstDay` hors 0-6 ; `reminderMinutes` ancien nombre unique, tableau avec doublons, négatif, décimal, au-delà de 40320, vide ; `calendarReminderMinutes` avec entrée invalide ; `initialView` partiel ; version ancienne avec sources iCal à migrer ; un fichier complet réel (prendre la forme de `defaultDesktopWorkspacePreferences` et changer chaque valeur).
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin.**
- [x] **Step 4: Porter `WorkspacePreferences.kt`.**
- [x] **Step 5: Vert des deux côtés, commit** « Corpus préférences : défauts et lecture tolérante, portés en Kotlin ».

---

### Task 3: Appareil, partagé et réconciliation

> Fait : commits 85cb614..80bb5a7

Port de `desktopWorkspacePreferences.ts:217-370` : `DEVICE_KEYS`, `sharedWorkspacePreferences`, `deviceWorkspacePreferences`, `parseDeviceWorkspacePreferences`, `withDeviceWorkspacePreferences`, `reconcileWorkspacePreferences`.

**Files:**
- Create: `conformance/preferences/appareil-*.json` (au moins 8), `conformance/preferences/reconcilier-*.json` (au moins 6)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/preferences/DevicePreferences.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `parseWorkspacePreferences`, `defaultWorkspacePreferences` (Task 2).
- Produces : `fun sharedWorkspacePreferences(preferences: JsonObject): JsonObject` ; `fun deviceWorkspacePreferences(preferences: JsonObject): JsonObject` ; `fun parseDeviceWorkspacePreferences(value: JsonElement?): JsonObject` ; `fun withDeviceWorkspacePreferences(preferences: JsonObject, device: JsonObject): JsonObject` ; `fun reconcileWorkspacePreferences(previous: JsonObject?, loaded: JsonObject, fileExisted: Boolean): JsonObject`.
- Opérations : `preferences.shared` `{preferences}` ; `preferences.device` `{preferences}` ; `preferences.deviceParse` `{value}` ; `preferences.withDevice` `{preferences, device}` ; `preferences.reconcile` `{previous, loaded, fileExisted}`. Les entrées `preferences`/`loaded`/`previous` passent d'abord par `preferences.parse` dans les DEUX adaptateurs, pour que le cas n'ait pas à écrire un objet complet.

- [x] **Step 1: Cas.** Reprendre `deviceWorkspacePreferences.test.ts` et `reconcileWorkspacePreferences.test.ts`. `dayCount` décimal arrondi, au-delà de 60 plafonné, 0 écarté ; `viewType` inconnu écarté ; appareil vide qui ne change rien ; appareil qui l'emporte sur le partagé ; séparation puis fusion qui rend l'original ; réconciliation sans `previous`, fichier absent, fichier présent, et chaque règle de `reconcileWorkspacePreferences` lue ligne à ligne.
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin.**
- [x] **Step 4: Porter `DevicePreferences.kt`.**
- [x] **Step 5: Vert des deux côtés, commit** « Corpus préférences : appareil et réconciliation, portés en Kotlin ».

---

## Après ce plan

- **L'écriture du fichier** n'est pas dans ce plan : sur PC elle passe par Rust (`save_desktop_preferences`, `apps/windows/src-tauri/src/lib.rs`), sur Android par `org.json` dans `MainActivity.java`. L'ordre et la mise en forme des clés écrites devront être figés par un cas quand l'app Compose écrira ce fichier, sinon PC et téléphone le réécriront chacun à sa façon et Syncthing verra un conflit à chaque réglage.
- Domaines suivants : `recurrence` (bibliothèque RRULE à choisir, `TZ=Europe/Paris` côté Jest), `reminders`, `ics`, `layout`.
