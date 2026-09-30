# Corpus de conformité et noyau Kotlin : fondation et notes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser `conformance/` (runner Jest + runner JUnit) et le module Kotlin `core`, puis porter le domaine `notes` (frontmatter, validation d'évènement, lecture, écriture, nom de fichier) jusqu'à ce que le même corpus passe des deux côtés.

**Architecture:** Un cas = un fichier JSON `{name, fn, input, expected}`. Chaque langage a un adaptateur qui relie `fn` (une opération du corpus) à son code. Le TypeScript actuel fait foi ; le Kotlin est écrit pour le reproduire. Domaines 1 et 2 de la spec ; les domaines 3 à 7 (préférences, récurrence, rappels, ICS, grille) auront chacun leur plan, sur le même moule.

**Tech Stack:** Jest 29 + ts-jest (existant) ; Kotlin 2.3.21 (plugin `org.jetbrains.kotlin.jvm`), `kotlinx-serialization-json` 1.11.0 (API `JsonElement` seulement, sans plugin de compilation), JUnit 4.13.2 ; Gradle 8.13, AGP 8.7.3 (existants).

**Spec:** `docs/superpowers/specs/2026-09-30-conformance-noyau-kotlin-design.md`

## Global Constraints

- Aucune modification de comportement du TypeScript, de l'app WebView ni du bureau. Un bug TypeScript découvert s'écrit dans `docs/PROCHAINE_VERSION.md` (non versionné) et le cas décrit le comportement ACTUEL.
- Le module `core` n'a aucune dépendance Android ; paquet `com.ahmed.neocalendar.core`.
- `jvmTarget` 17 (aligné sur `compileOptions` de `:app`).
- Versions exactes : Kotlin 2.3.21, kotlinx-serialization-json 1.11.0, JUnit 4.13.2. Aucune autre dépendance.
- Ne pas toucher aux lignes `versionCode = N` / `versionName = "x"` de `apps/android/native/app/build.gradle.kts` (lues par `scripts/set-version.mjs`).
- `:app` ne dépend PAS encore de `:core` (le branchement vient avec le premier écran Compose).
- Commandes locales Gradle : dans `apps/android/native`, sous PowerShell, `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"` puis `.\gradlew.bat :core:test`. Jest : `npx jest conformance` à la racine.
- Nombres : le JSON produit par Kotlin écrit un entier comme `10`, jamais `10.0` (TypeScript écrit `10`). Utiliser `JsonPrimitive(Long)` pour un entier.
- **Discriminance** : un cas n'entre au corpus qu'après avoir été vu ROUGE en cassant temporairement, dans le TypeScript, la règle qu'il garde, puis vert après restauration. Consigner dans le rapport de tâche, pour chaque cas, la ligne cassée.
- Messages de commit en français, terminés par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SVnCyEZaenrhG9fSESi2yR
  ```

## Review Focus

- Fin de ligne `\r\n` dans une note : `extractFrontmatter` normalise ; le Kotlin doit lire une note Windows à l'identique (cas dédié, Task 2).
- Clé du modèle absente de l'évènement mais présente dans l'ancienne note : supprimée si dans `KEYS_DROPPED_WHEN_ABSENT` ou `startTime`/`endTime` d'un all-day, conservée octet pour octet sinon (cas dédiés, Task 4).
- Ordre des clés à l'écriture d'une note neuve : celui de la sortie zod (`CommonSchema`, puis `TimeSchema`, puis la variante d'`EventSchema`). Un ordre différent réécrit toutes les notes à la première sauvegarde et fait des conflits Syncthing (cas dédiés, Task 4).
- Titre vide : `parseStoredEvent` prend le nom de fichier sans `.md` (cas dédié, Task 3).
- Nom de fichier : caractères interdits Windows, espaces multiples, points et espaces finaux, titre qui devient vide → `Untitled.md` (cas dédiés, Task 5).

---

### Task 1: Fondation : runners et module `core`

> Fait : commits 25357c0..a62cde6

**Files:**
- Create: `conformance/README.md`
- Create: `conformance/runner.test.ts`
- Create: `conformance/operations.ts`
- Create: `conformance/notes/filename-single.json`
- Modify: `apps/android/native/settings.gradle.kts`
- Modify: `apps/android/native/build.gradle.kts`
- Create: `apps/android/native/core/build.gradle.kts`
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/notes/Filename.kt`
- Create: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/ConformanceTest.kt`
- Create: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt`
- Modify: `.github/workflows/release.yml` (étape avant « Assembler l'APK signé »)

**Interfaces:**
- Produces (TS) : `OPERATIONS: Record<string, (input: any) => unknown>` dans `conformance/operations.ts`.
- Produces (Kotlin) : `val OPERATIONS: Map<String, (JsonObject) -> JsonElement>` dans `Operations.kt` (paquet `com.ahmed.neocalendar.core`, source set test) ; `fun filenameForEvent(event: JsonObject): String` dans `core/notes/Filename.kt` (sera retypé en Task 5).

- [x] **Step 1: Écrire le cas trivial**

`conformance/notes/filename-single.json` :
```json
{
  "name": "évènement ponctuel : date puis titre",
  "fn": "notes.filename",
  "input": { "event": { "title": "Dentiste", "allDay": true, "type": "single", "date": "2026-10-02", "endDate": null } },
  "expected": "2026-10-02 Dentiste.md"
}
```

- [x] **Step 2: Runner Jest**

`conformance/operations.ts` :
```ts
import { filenameForEvent } from "../apps/windows/src/platform/desktopEventFormat";
import type { NeoEvent } from "../src/types";

/** Relie chaque opération du corpus au code TypeScript qui fait foi.
 *  Le corpus nomme des opérations, pas des fonctions : renommer une
 *  fonction ne touche qu'ici. */
export const OPERATIONS: Record<string, (input: any) => unknown> = {
    "notes.filename": ({ event }) => filenameForEvent(event as NeoEvent),
};
```

`conformance/runner.test.ts` :
```ts
import * as fs from "fs";
import * as path from "path";
import { OPERATIONS } from "./operations";

interface ConformanceCase {
    name: string;
    fn: string;
    input: unknown;
    expected: unknown;
}

function caseFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) return caseFiles(full);
            return entry.name.endsWith(".json") ? [full] : [];
        })
        .sort();
}

// JSON.stringify retire les `undefined` : c'est la forme que le Kotlin
// compare aussi, clé absente = clé absente.
const asJson = (value: unknown) =>
    value === undefined ? null : JSON.parse(JSON.stringify(value));

const files = caseFiles(__dirname);

describe("corpus de conformité", () => {
    it("contient au moins un cas", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files.map((file) => [path.relative(__dirname, file), file]))(
        "%s",
        (_label, file) => {
            const c = JSON.parse(fs.readFileSync(file, "utf8")) as ConformanceCase;
            const operation = OPERATIONS[c.fn];
            if (!operation) throw new Error(`Opération inconnue : ${c.fn}`);
            expect(asJson(operation(c.input))).toEqual(c.expected);
        }
    );
});
```

- [x] **Step 3: Vérifier le runner Jest**

Run: `npx jest conformance`
Expected: PASS, 2 tests (le cas et le garde-fou « contient au moins un cas »).

Discriminance : dans `desktopEventFormat.ts`, `baseNameForEvent`, remplacer temporairement `${event.date} ${event.title}` par `${event.title}` ; relancer : FAIL sur `notes/filename-single.json` ; restaurer ; PASS.

- [x] **Step 4: Module Gradle `core`**

`apps/android/native/settings.gradle.kts` : ajouter `include(":core")` après `include(":app")`.

`apps/android/native/build.gradle.kts` :
```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.jvm") version "2.3.21" apply false
}
```

`apps/android/native/core/build.gradle.kts` :
```kotlin
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins { id("org.jetbrains.kotlin.jvm") }

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    // Le corpus vit à la racine du dépôt, partagé avec Jest.
    systemProperty("conformance.dir", rootProject.file("../../../conformance").absolutePath)
    jvmArgs("-Duser.timezone=Europe/Paris")
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
```

- [x] **Step 5: Runner JUnit (échoue : `filenameForEvent` n'existe pas)**

`core/src/test/kotlin/com/ahmed/neocalendar/core/Operations.kt` :
```kotlin
package com.ahmed.neocalendar.core

import com.ahmed.neocalendar.core.notes.filenameForEvent
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** Le pendant Kotlin de conformance/operations.ts : mêmes noms d'opération. */
val OPERATIONS: Map<String, (JsonObject) -> JsonElement> = mapOf(
    "notes.filename" to { input -> JsonPrimitive(filenameForEvent(input.getValue("event").jsonObject)) },
)
```

`core/src/test/kotlin/com/ahmed/neocalendar/core/ConformanceTest.kt` :
```kotlin
package com.ahmed.neocalendar.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class ConformanceTest(private val label: String, private val file: File) {
    companion object {
        private val root = File(
            System.getProperty("conformance.dir") ?: error("conformance.dir non fourni par Gradle")
        )

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases(): List<Array<Any>> {
            val files = root.walkTopDown().filter { it.isFile && it.extension == "json" }.sortedBy { it.path }.toList()
            assertTrue("le corpus est vide : $root", files.isNotEmpty())
            return files.map { arrayOf(it.relativeTo(root).invariantSeparatorsPath, it) }
        }
    }

    @Test
    fun reproduitLeTypeScript() {
        val case: JsonObject = Json.parseToJsonElement(file.readText()).jsonObject
        val fn = case.getValue("fn").jsonPrimitive.content
        val operation = OPERATIONS[fn] ?: error("Opération inconnue : $fn")
        // JsonObject est une Map : l'égalité ignore l'ordre des clés, comme toEqual.
        assertEquals(case.getValue("expected"), operation(case.getValue("input").jsonObject))
    }
}
```

Run (PowerShell, `apps/android/native`) : `.\gradlew.bat :core:test`
Expected: FAIL à la compilation, `Unresolved reference 'filenameForEvent'`.

- [x] **Step 6: Implémentation minimale**

`core/src/main/kotlin/com/ahmed/neocalendar/core/notes/Filename.kt` :
```kotlin
package com.ahmed.neocalendar.core.notes

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Port de filenameForEvent (desktopEventFormat.ts). Complété en Task 5. */
fun filenameForEvent(event: JsonObject): String {
    val title = event.getValue("title").jsonPrimitive.content
    val date = event.getValue("date").jsonPrimitive.content
    return "$date $title.md"
}
```

Run: `.\gradlew.bat :core:test` → PASS (1 cas). Et `.\gradlew.bat assembleDebug` → BUILD SUCCESSFUL (le module ne casse pas `:app`).

- [x] **Step 7: README du corpus et CI**

`conformance/README.md` : reprendre de la spec, section « Le corpus », le format d'un cas, les règles (le TypeScript fait foi, discriminance, entrée qui porte tout ce qui varie, entier sans `.0`), et les deux commandes de la contrainte globale.

`.github/workflows/release.yml`, juste avant l'étape `- name: Assembler l'APK signé`, même indentation :
```yaml
            # Le noyau Kotlin rejoue le corpus que Jest a déjà passé plus haut
            # (`npm test`) : un écart entre les deux langages bloque la livraison.
            - name: Vérifier le noyau Kotlin contre le corpus
              working-directory: apps/android/native
              run: ./gradlew --no-daemon :core:test
```

- [x] **Step 8: Commit**

```bash
git add conformance apps/android/native/settings.gradle.kts apps/android/native/build.gradle.kts apps/android/native/core .github/workflows/release.yml
git commit -m "Corpus de conformité : runners Jest et JUnit, module Kotlin core"
```

---

### Task 2: `notes.frontmatter` : lire l'en-tête YAML maison

> Fait : commits a62cde6..79b377b

Port de `extractFrontmatter`, `parseFrontmatter`, `unquote`, `splitYamlArray`, `parseTextScalar`, `parseYamlValue` (`apps/windows/src/platform/desktopEventFormat.ts:31-170`). Pas de bibliothèque YAML : le TypeScript n'en a pas, et le corpus fige SA grammaire.

**Files:**
- Create: `conformance/notes/frontmatter-*.json` (au moins 14 cas)
- Modify: `conformance/operations.ts`, `core/src/test/.../Operations.kt`
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/Frontmatter.kt`

**Interfaces:**
- Produces : `data class FrontmatterDocument(val lines: List<String>, val body: String)` ; `fun extractFrontmatter(contents: String): FrontmatterDocument?` ; `fun parseFrontmatter(contents: String): JsonObject?` (valeurs : `JsonPrimitive` chaîne/booléen/entier/décimal, `JsonNull`, `JsonArray`) ; `internal fun parseYamlValue(raw: String): JsonElement` ; `internal fun parseTextScalar(raw: String): String`.
- Opération : `notes.frontmatter`, entrée `{ "text": string }`, sortie `parseFrontmatter(text)` (objet ou `null`).

- [x] **Step 1: Écrire les cas**

Un fichier par cas. Couvrir, en lisant `parseYamlValue`/`unquote`/`splitYamlArray` ligne à ligne et en reprenant les données de `desktopEventFormat.test.ts` : note sans `---` → `null` ; `---` jamais refermé → `null` ; note en `\r\n` ; ligne vide et commentaire `#` ignorés ; ligne sans `:` ou clé vide ignorée ; valeur contenant `:` (`startTime: 09:30`) ; `true`/`false` ; `null` et valeur vide ; entier, décimal ; chaîne entre `"` avec échappements ; entre `'` ; tableau `[a, b]` et tableau de chaînes citées contenant `,` et `[` (le cas des sous-tâches `["[x] Book the van","[ ] Pack, then label"]`) ; `description` qui reste texte même si elle ressemble à un nombre ou à `true` ; clé en double (la dernière gagne).

Exemple `conformance/notes/frontmatter-heure-avec-deux-points.json` :
```json
{
  "name": "une heure garde ses deux-points",
  "fn": "notes.frontmatter",
  "input": { "text": "---\ntitle: TD\nallDay: false\nstartTime: 09:30\n---\n" },
  "expected": { "title": "TD", "allDay": false, "startTime": "09:30" }
}
```

Adaptateur TS : `"notes.frontmatter": ({ text }) => parseFrontmatter(text),` (import depuis `desktopEventFormat`).

- [x] **Step 2: Vert en TypeScript, discriminance vue**

Run: `npx jest conformance` → PASS. Pour chaque cas, casser la règle qu'il garde (ex. retirer `.replace(/\r\n/g, "\n")`), voir le cas rougir, restaurer. Un cas qui ne rougit sous aucune casse est retiré. Si la sortie attendue ne se devine pas, l'obtenir en exécutant la fonction TypeScript (script `npx ts-node` jetable ou `console.log` dans un test temporaire), jamais en la supposant.

- [x] **Step 3: Rouge en Kotlin**

Ajouter à `Operations.kt` : `"notes.frontmatter" to { input -> parseFrontmatter(input.getValue("text").jsonPrimitive.content) ?: JsonNull },`
Run: `.\gradlew.bat :core:test` → FAIL (référence non résolue).

- [x] **Step 4: Porter `Frontmatter.kt`**

Traduction fidèle des lignes 31-170, fonction pour fonction, mêmes noms, commentaires du POURQUOI repris. Pièges : `String.split("\n")` Kotlin garde les chaînes vides finales comme JS ; `trim()` Kotlin retire aussi les espaces Unicode comme JS `trim()` — vérifier sur le cas `\r\n` ; `toLocaleLowerCase("en-US")` → `lowercase(Locale.US)` ; un entier YAML → `JsonPrimitive(Long)`, un décimal → `JsonPrimitive(Double)` ; reproduire exactement la regex numérique de `parseYamlValue`.

- [x] **Step 5: Vert des deux côtés, commit**

Run: `npx jest conformance` et `.\gradlew.bat :core:test` → PASS tous les deux.
```bash
git add conformance apps/android/native/core
git commit -m "Corpus notes : en-tête YAML, porté en Kotlin"
```

---

### Task 3: `notes.validate` et `notes.parse` : de l'en-tête à l'évènement

> Fait : commits 79b377b..4178f2e

Port de `parseEvent`/`validateEvent` (`src/types/schema.ts`, zod), `calendarIdFromPath`, `parseStoredEvent` (`desktopEventFormat.ts:171-236`) et `managedMetadataFromMarkdown` (`apps/windows/src/platform/managedEventNote.ts:117-150`).

**Files:**
- Create: `conformance/notes/validate-*.json` (au moins 14), `conformance/notes/parse-*.json` (au moins 6)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/NeoEvent.kt`
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/StoredEvent.kt`
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/ManagedNote.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `parseFrontmatter`, `extractFrontmatter` (Task 2).
- Produces :
  - `sealed interface NeoEvent` avec `data class Single`, `Recurring`, `Rrule`, `Someday`, champs communs (`title`, `id?`, `location?`, `geo?`, `description?`, `attendees?`, `subtasks?`, `reminders?`), temps (`allDay`, `startTime?`, `endTime?`) et champs propres à chaque variante, noms identiques au schéma zod.
  - `fun validateEvent(raw: JsonObject): NeoEvent?` (null si zod rejetterait).
  - `fun NeoEvent.toRecord(): JsonObject` : les clés dans l'ORDRE de la sortie zod (`{...CommonSchema.parse, ...TimeSchema.parse, ...EventSchema.parse}`), clés absentes omises. C'est cet ordre que Task 4 écrit dans les notes.
  - `data class EventFile(val relativePath: String, val calendarPath: String, val fileName: String, val contents: String)`.
  - `data class StoredEvent(val id: String, val calendarId: String, val calendarPath: String, val relativePath: String, val fileName: String, val contents: String, val event: NeoEvent, val readOnly: Boolean? = null, val icsFeedId: String? = null)`.
  - `fun calendarIdFromPath(relativePath: String): String` ; `fun parseStoredEvent(file: EventFile, knownCalendarIds: Set<String>): StoredEvent?` ; `fun managedMetadataFromMarkdown(contents: String): JsonObject?`.
- Opérations :
  - `notes.validate` : entrée `{ "raw": objet }`, sortie `validateEvent(raw)` en record ordonné, ou `null`. Le runner compare sans ordre ; l'ORDRE est vérifié en Task 4 par le texte écrit.
  - `notes.parse` : entrée `{ "file": EventFile, "knownCalendarIds": [..] }`, sortie `StoredEvent` sans `contents` (écho inutile), `event` en record, ou `null`.

- [x] **Step 1: Cas `notes.validate`**

Couvrir chaque branche de `parseEvent` : `type` absent → `single` ; `allDay` absent → `false` ; `someday` force `allDay: true` ; `endTime` absent → `null` ; `endDate` absent → `null` ; `skipDates` absent : `[]` pour `recurring`, rejet pour `rrule` ; `daysOfWeek` avec lettre hors `UMTWRFS` → `null` ; `completed` : date, `false`, `"in-progress"`, `null`, et `true` → rejet ; `reminders` non numérique → rejet ; `title` absent → rejet ; clés inconnues retirées de la sortie ; `allDay: true` avec `startTime` → `startTime` retiré.

Adaptateur TS : `"notes.validate": ({ raw }) => validateEvent(raw),`

- [x] **Step 2: Cas `notes.parse`**

Titre vide → nom de fichier sans `.md` ; `id` absent → `path:<relativePath>` ; `id` blanc → `path:` ; calendrier inconnu → `null` ; frontmatter invalide → `null` ; note gérée par un flux ICS (marqueurs de `serializeManagedEventMarkdown`, en prendre un vrai depuis `managedEventNote.test.ts`) → `readOnly: true` et `icsFeedId`.

Adaptateur TS :
```ts
"notes.parse": ({ file, knownCalendarIds }) => {
    const stored = parseStoredEvent(file, new Set(knownCalendarIds));
    if (!stored) return null;
    const { contents: _contents, ...rest } = stored;
    return rest;
},
```

- [x] **Step 3: Vert en TypeScript, discriminance vue** (même méthode que Task 2, Step 2).

- [x] **Step 4: Rouge en Kotlin** : ajouter les deux opérations à `Operations.kt` (entrée JSON → `EventFile`/`Set`, sortie → `JsonObject` via `toRecord()` et les champs de `StoredEvent`, `readOnly`/`icsFeedId` omis quand null). `.\gradlew.bat :core:test` → FAIL.

- [x] **Step 5: Porter** `NeoEvent.kt` (validation explicite, champ par champ, dans l'ordre du schéma ; pas de bibliothèque de validation), `StoredEvent.kt`, `ManagedNote.kt`.

- [x] **Step 6: Vert des deux côtés, commit**
```bash
git add conformance apps/android/native/core
git commit -m "Corpus notes : validation et lecture d'un évènement, portées en Kotlin"
```

---

### Task 4: `notes.serialize` : écrire un évènement dans une note

> Fait : commits 4178f2e..7c3371d

Port de `serializeEventMarkdown`, `stringifyYamlAtom`, `stringifyYamlLine`, `lineKey` (`desktopEventFormat.ts:251-341`) et de `KEYS_DROPPED_WHEN_ABSENT` (`src/types/schema.ts`).

**Files:**
- Create: `conformance/notes/serialize-*.json` (au moins 12)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/Serialize.kt`
- Modify: les deux adaptateurs

**Interfaces:**
- Consumes : `validateEvent`, `NeoEvent.toRecord()` (Task 3), `extractFrontmatter` (Task 2).
- Produces : `class InvalidEventException : IllegalArgumentException` ; `fun serializeEventMarkdown(event: NeoEvent, previousContents: String = ""): String` ; `fun serializeEventMarkdown(raw: JsonObject, previousContents: String = ""): String` (valide d'abord, lève `InvalidEventException` si invalide).
- Opération `notes.serialize` : entrée `{ "event": objet, "previousContents"?: string }`, sortie `{ "text": string }` ou `{ "error": "invalid" }`.

- [x] **Step 1: Cas**

Note neuve : ordre des clés (un `single` horodaté, un `recurring`, un `rrule`, un `someday`, chacun avec `title` écrit en premier) ; chaînes à citer (deux-points, `#`, crochet initial, guillemet) ; tableaux ; sous-tâches `["[x] Book the van","[ ] Pack, then label"]` ; `description` multiligne si le TS la gère. Note existante : clé inconnue gardée octet pour octet et à sa place ; commentaire gardé ; clé de `KEYS_DROPPED_WHEN_ABSENT` absente → ligne retirée ; `startTime` retiré quand l'évènement passe en all-day ; clé nouvelle ajoutée à la fin ; corps de la note intact, `\r\n` compris ; évènement invalide → `{ "error": "invalid" }`.

Adaptateur TS :
```ts
"notes.serialize": ({ event, previousContents }) => {
    try {
        return { text: serializeEventMarkdown(event, previousContents ?? "") };
    } catch {
        return { error: "invalid" };
    }
},
```

- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin** (opération ajoutée, `InvalidEventException` → `{"error":"invalid"}`).
- [x] **Step 4: Porter `Serialize.kt`.**
- [x] **Step 5: Aller-retour** : ajouter à `core/src/test/kotlin/com/ahmed/neocalendar/core/notes/RoundTripTest.kt` un test JUnit qui, pour chaque cas `serialize-*` sans erreur, vérifie `validateEvent(parseFrontmatter(text)!!)` égal à `validateEvent(event)`.
- [x] **Step 6: Vert des deux côtés, commit**
```bash
git add conformance apps/android/native/core
git commit -m "Corpus notes : écriture d'un évènement, portée en Kotlin"
```

---

### Task 5: `notes.filename` complet, y compris le texte d'une règle rrule

> Fait : commits 7c3371d..5b01746

Port de `sanitizeForFilename`, `baseNameForEvent`, `filenameForEvent` (`desktopEventFormat.ts:343-377`). La branche `rrule` appelle `rrulestr(rule).toText()` de la bibliothèque `rrule` (anglais) : le Kotlin réimplémente ce texte pour les SEULES règles que l'application écrit, relevées dans `recurrenceToRRule` (`src/ui/calendar/recurrence.ts`), et retombe sur `"Recurring"` pour une règle qu'il ne sait pas lire, comme le `catch` TypeScript.

**Files:**
- Create: `conformance/notes/filename-*.json` (au moins 14, en plus de `filename-single.json`)
- Modify: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/Filename.kt` (signature passe à `fun filenameForEvent(event: NeoEvent): String`)
- Create: `core/src/main/kotlin/com/ahmed/neocalendar/core/notes/RruleText.kt`
- Modify: `Operations.kt` (l'opération valide l'entrée avec `validateEvent` avant d'appeler)

**Interfaces:**
- Consumes : `NeoEvent`, `validateEvent` (Task 3).
- Produces : `fun filenameForEvent(event: NeoEvent): String` ; `internal fun sanitizeForFilename(name: String): String` ; `internal fun rruleToText(rule: String): String?` (null = forme non reconnue).

- [x] **Step 1: Cas** : caractères `\/:*?"<>|` → `-` ; espaces multiples ; points et espaces finaux ; titre réduit à rien → `Untitled.md` ; `recurring` (`(Every M,W) Titre.md`) ; `someday` ; et pour `rrule` chaque forme produite par `recurrenceToRRule` (quotidien, tous les N jours, hebdo sur un et plusieurs jours, mensuel par jour du mois, mensuel « 2e mardi », annuel, avec `COUNT`, avec `UNTIL`) plus une règle malformée → `(Recurring) Titre.md`. Le texte attendu s'obtient en EXÉCUTANT `rrulestr(...).toText()`, jamais de mémoire.
- [x] **Step 2: Vert en TypeScript, discriminance vue.**
- [x] **Step 3: Rouge en Kotlin.**
- [x] **Step 4: Porter `Filename.kt` et `RruleText.kt`** (lire le `toText` de `node_modules/rrule/dist/es5/rrule.js` pour les formes couvertes ; ne rien inventer au-delà des cas).
- [x] **Step 5: Vert des deux côtés, commit**
```bash
git add conformance apps/android/native/core
git commit -m "Corpus notes : nom de fichier d'un évènement, porté en Kotlin"
```

---

## Après ce plan

Un plan par domaine restant, dans l'ordre de la spec : `preferences`, `recurrence` (choix de bibliothèque RRULE vérifié : licence compatible MIT et passage du corpus), `reminders`, `ics`, `layout`.
