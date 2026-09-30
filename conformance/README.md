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
  le fuseau (`Europe/Paris`, fixé dans la tâche Gradle par `-Duser.timezone` et
  dans `runner.test.ts` par `process.env.TZ`, restauré après les tests).
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

`lib-recur` (Kotlin) ne reproduit pas `rrule` (TypeScript) sur des formes que
l'application n'écrit jamais (`recurrenceToRRule` ne produit que `FREQ`,
`INTERVAL` >= 1, `BYDAY`, `BYMONTHDAY`, `COUNT` >= 1, `UNTIL` en UTC). Aucune
n'est dans le corpus ; le Kotlin ne force pas la ressemblance :

- `COUNT=0` : `rrule` ne rend rien, `lib-recur` lit une série sans fin.
- `INTERVAL=0` : `rrule` ne rend rien, `lib-recur` rend des occurrences.
- règle finissant par `;` (`FREQ=DAILY;COUNT=2;`) : `rrule` la refuse, `lib-recur`
  l'accepte.
- `UNTIL` sans heure (`UNTIL=20260722`) : `rrule` le lit, `lib-recur` le refuse
  avec une date ancrée en UTC ; le Kotlin rend alors aucune occurrence.
- texte multiligne avec `DTSTART:` : `rrule` en tient compte, le résultat du
  Kotlin diffère (vu sur un cas `DTSTART` + `RRULE` écrit à la main).
