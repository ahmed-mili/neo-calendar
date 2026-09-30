# Corpus de conformité

Des cas JSON partagés, rejoués par deux runners : Jest (TypeScript, qui fait
foi) et JUnit (module Kotlin `apps/android/native/core`). Un écart entre les
deux langages fait échouer l'un des deux.

```
conformance/
├── README.md                règles d'écriture d'un cas
├── notes/*.json             note <-> évènement, nom de fichier
├── preferences/*.json       .neo-calendar.json : lecture tolérante, défauts
├── recurrence/*.json        occurrences d'un évènement dans une fenêtre
├── reminders/*.json         rappels calculés depuis évènements + préférences
├── ics/*.json               flux ICS -> occurrences ; plan de synchro en notes
└── layout/*.json            chevauchements de la grille, bandes all-day
```

## Format d'un cas

Un cas = un fichier JSON :

```json
{
  "name": "evenement horodate avec fin le lendemain",
  "fn": "notes.parse",
  "input": { "text": "---\ntitle: ...\n---\n" },
  "expected": { "title": "...", "allDay": false }
}
```

## Règles

- `fn` nomme une **opération du corpus**, pas une fonction du code : chaque
  langage a un adaptateur (`conformance/operations.ts` et `runner.test.ts`
  côté Jest, `Operations.kt` et `ConformanceTest.kt` côté Kotlin) qui relie
  `fn` à son implémentation, entrée JSON, sortie JSON. Renommer une fonction
  ne touche pas au corpus.
- Tout ce qui varie est dans l'entrée : `now`, la langue (`"fr"` par défaut),
  le fuseau (`Europe/Paris`, fixé dans la tâche Gradle par `-Duser.timezone`).
- Comparaison JSON profonde, ordre des clés ignoré ; les dates sont des
  chaînes ISO. Une clé absente vaut une clé absente.
- Un entier s'écrit `10`, jamais `10.0` (côté Kotlin, `JsonPrimitive(Long)`).
- **Le TypeScript fait foi.** Un cas s'écrit contre le code TypeScript
  actuel ; s'il révèle un bug TypeScript, le cas décrit le comportement
  actuel et le bug est noté dans `docs/PROCHAINE_VERSION.md`, pas corrigé en
  passant.
- **Discriminance** : un cas n'entre au corpus qu'après avoir été vu rouge.
  On casse la règle qu'il garde dans le TypeScript, l'assertion nommée
  rougit, on restaure. Un cas qui ne rougit pas ne garde rien.

## Lancer

- Jest, à la racine du dépôt : `npx jest conformance`
- JUnit, dans `apps/android/native`, sous PowerShell :
  `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat :core:test`

## Écarts connus

Aucun cas du corpus ne sépare le Kotlin (`ical4j`) du TypeScript (`ical.js`).
Ce que le port Kotlin de `ics.ts` ne reprend pas, faute de cas dans le corpus :

- `RANGE=THISANDFUTURE` sur un `RECURRENCE-ID` : ical.js décale toute la suite
  de la série, le Kotlin n'applique que l'instance nommée.
- Un `RDATE` de forme `PERIOD` (`début/fin`) est ignoré ; les `RDATE` date et
  date-heure sont fusionnés aux occurrences de la règle.
- Un VEVENT sans `DTSTART` : ical.js lève une exception et perd tout le flux,
  le Kotlin saute ce VEVENT.
- Un flux mal formé (`FREQ` ou `BYDAY` invalide, date illisible) lève une
  exception des deux côtés, sans message commun.
- ical.js garde ses fuseaux dans un registre global d'un appel à l'autre (un
  TZID enregistré par un flux reste connu du suivant) ; le Kotlin repart à zéro
  à chaque appel. Les cas ne redéfinissent donc jamais un TZID.
- Un VTIMEZONE que `ical4j` refuse retombe sur le fuseau IANA du même nom,
  puis sur l'heure flottante.

`safe_join` et `validate_single_name` (Rust, `apps/windows/src-tauri/src/lib.rs`)
ne passent pas par le corpus : `SafeNamesTest.kt` en porte les attendus, relevés
en exécutant le Rust sous Windows. Le port lit les composants comme Windows
(`/` et `\`, lecteur `C:`) sur tous les systèmes, et refuse un lecteur au milieu
d'un chemin (`a/C:/b`), que le Rust laisse sortir de la racine : `PathBuf::push`
d'un composant à préfixe remplace le chemin entier, la fonction rend `C:b`.
