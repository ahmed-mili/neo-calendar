# Corpus de conformité et noyau Kotlin

Date : 2026-09-30. Statut : validé (Ahmed a délégué les arbitrages : « le
choix recommandé, le meilleur sur le long terme »).

Sous-projet 1 de la migration Android décidée dans la note Obsidian
`Projets/Neo Calendar` (objectif 1, étapes 1 et 2) et justifiée dans
`Projets/Architecture multiplateforme`. Les étapes suivantes (application
Compose écran par écran, widget et rappels natifs, Syncthing embarqué) auront
chacune leur spec.

## But

Le bureau reste en TypeScript. L'Android devient une application Compose, dont
la logique vit dans un noyau Kotlin. Deux implémentations d'un même format de
notes divergent si rien ne les tient : ce sous-projet pose le filet
(`conformance/`) **avant** d'écrire le noyau Kotlin, puis écrit ce noyau
jusqu'à ce qu'il passe tout le corpus.

Réussi quand : chaque cas de `conformance/` passe à l'identique sous Jest
(TypeScript actuel) et sous JUnit (Kotlin), et que chaque cas a été éprouvé
par discriminance.

## Mesure du noyau (2026-09-30)

La note annonçait 1 416 lignes. Mesuré : ~4 700 lignes pures, plus ~1 800 de
support (`i18n.ts`, `linkInput.ts`, helpers), plus ~1 000 de logique de
grille que Compose devra reproduire. Toujours assez petit pour que la
duplication passe, mais c'est ce chiffre qui fait foi.

## Le corpus

```
conformance/
├── README.md                règles d'écriture d'un cas
├── notes/*.json             note ↔ évènement, nom de fichier
├── preferences/*.json       .neo-calendar.json : lecture tolérante, défauts
├── recurrence/*.json        occurrences d'un évènement dans une fenêtre
├── reminders/*.json         rappels calculés depuis évènements + préférences
├── ics/*.json               flux ICS → occurrences ; plan de synchro en notes
└── layout/*.json            chevauchements de la grille, bandes all-day
```

Un cas = un fichier JSON :

```json
{
  "name": "evenement horodate avec fin le lendemain",
  "fn": "notes.parse",
  "input": { "text": "---\ntitle: ...\n---\n" },
  "expected": { "title": "...", "allDay": false }
}
```

- `fn` nomme une **opération du corpus**, pas une fonction du code : chaque
  langage a un adaptateur (`conformance/runner.test.ts`,
  `ConformanceTest.kt`) qui relie `fn` à son implémentation, entrée JSON,
  sortie JSON. Renommer une fonction ne touche pas au corpus.
- Tout ce qui varie est dans l'entrée : `now`, la langue (`"fr"` par
  défaut), le fuseau (`Europe/Paris`, fixé dans les deux runners :
  `process.env.TZ` pour Jest, `-Duser.timezone` pour la tâche Gradle).
- Comparaison JSON profonde, clés triées ; les dates sont des chaînes ISO.
- **Le TypeScript fait foi.** Un cas s'écrit contre le code TypeScript
  actuel ; s'il révèle un bug TypeScript, le cas décrit le comportement
  actuel et le bug est noté dans `docs/PROCHAINE_VERSION.md`, pas corrigé
  en passant.
- **Discriminance** : un cas n'entre au corpus qu'après avoir été vu rouge.
  On casse la règle qu'il garde dans le TypeScript, l'assertion nommée
  rougit, on restaure. Un cas qui ne rougit pas ne garde rien.
- Les cas s'amorcent depuis les tests Jest existants (`desktopEventFormat`,
  `androidReminders`, `ics`, `icalNoteSync`, `eventExpansion`, `recurrence`,
  `useAllDayLanes`, `preferences`…), qui ont tous leurs données en ligne.

## Le noyau Kotlin

Module Gradle **Kotlin/JVM pur** `apps/android/native/core`, dépendance de
`:app`. Pas de Kotlin Multiplatform : le bureau reste en TypeScript, rien
d'autre ne consommerait le noyau, et un module JVM se teste en secondes sans
émulateur. Il pourra devenir KMP si un jour un autre client Kotlin existe.

- Aucune dépendance Android dans `core` : le compilateur le garantit.
- Paquet `com.ahmed.neocalendar.core`, un fichier par domaine du corpus.
- Dates : `java.time` (présent sur Android dès l'API 26 = `minSdk`).
- JSON : `kotlinx.serialization` (préférences, corpus).
- Récurrence et ICS : bibliothèques JVM éprouvées plutôt qu'un parseur
  maison. Candidats : `org.dmfs:lib-recur` pour l'expansion RRULE,
  `ical4j` ou `biweekly` pour l'ICS. Le choix se fait au plan, sur deux
  critères vérifiés : licence compatible MIT, et passage des cas `ics/` et
  `recurrence/`. Si aucune ne reproduit `ical.js`/`rrule` sur un cas, on
  écrit l'écart dans le README du corpus plutôt que de forcer.
- `rrule.toText()` (anglais, sert au nom de fichier des évènements rrule)
  est réimplémenté pour les seules formes que l'application écrit ; le
  corpus `notes/` fixe ces formes.
- i18n : seules les chaînes qu'emploie le noyau (texte des rappels, résumé
  de récurrence, noms de jours et de mois), en `fr` et `en`, copiées de
  `src/ui/i18n.ts`.
- `ensure_desktop_ics_folder` est aujourd'hui en Rust (`lib.rs:487`) : sa
  validation de nom (`validate_single_name`, `safe_join`) entre au noyau et
  au corpus.

## Ordre des domaines

Chaque domaine = cas du corpus (TypeScript vert, discriminance vue) puis
Kotlin jusqu'au vert. Un domaine n'est commencé qu'une fois le précédent
vert des deux côtés.

1. Fondation : runners Jest et JUnit, module `core`, un cas trivial.
2. `notes` : `parseStoredEvent`, `serializeEventMarkdown`,
   `filenameForEvent`, `sanitizeForFilename`, frontmatter maison.
3. `preferences` : `parseDesktopWorkspacePreferences`, défauts, migration.
4. `recurrence` : `neoEventToDisplayEvents` sur une fenêtre.
5. `reminders` : `buildReminders`, `prayerRemindersFor`.
6. `ics` : `parseIcsSnapshot`, `planIcsNoteSync`, noms de dossier ICS.
7. `layout` : `computeOverlapGroups`, `packAllDayLanes`, bornes de semaine.

## Hors périmètre

Aucun écran Compose, aucune modification de l'app WebView ni du bureau,
aucun changement de comportement du TypeScript. L'édition des séries
récurrentes (`recurringEdit*`, `seriesNavigation`) viendra avec l'écran qui
l'emploie.

## Vérification

- `npx jest conformance` vert.
- `gradlew.bat :core:test` vert sous JDK 21 Adoptium.
- La CI (`release.yml`) lance les deux : un écart TypeScript/Kotlin bloque
  une livraison.
