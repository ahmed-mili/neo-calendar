# Rappels app fermée et délais lisibles — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les rappels de Neo Calendar partent sur PC même quand la fenêtre est fermée, et leur ligne se lit sans calculer (« Dans 1 h 30 · 14:00 », pas « In 90 min »).

**Architecture:** Sur PC, l'application réside : elle se lance à l'ouverture de session, masquée, garde une icône dans la zone de notification, et fermer sa fenêtre la masque au lieu de quitter. Le planificateur JavaScript existant n'est donc plus interrompu, et le seul défaut que la résidence révèle — un « maintenant » figé dans un `useMemo` — est corrigé par un compteur horaire ajouté à ses dépendances. La formulation du délai est refaite une fois dans le module partagé, donc corrigée pour les deux plateformes à la fois.

**Tech Stack:** TypeScript / React 18, Jest + ts-jest (jsdom pour les composants, `ReactDOM.render` + `act`, pas de Testing Library), Rust / Tauri 2.11.5, `tauri-plugin-autostart` 2.

**Spec:** `docs/superpowers/specs/2026-09-16-rappels-app-fermee-design.md`

## Global Constraints

- **Langue du code et des commentaires** : commentaires en français, identifiants en anglais, comme le reste du dépôt. Pas d'emoji, pas de tiret cadratin.
- **Prettier** : `npm run lint` doit passer. Indentation 4 espaces, guillemets doubles.
- **Chaque tâche finit par un commit**, message en français décrivant ce qui change pour la personne qui se sert de l'app, et terminé par ces deux lignes :

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn
  ```

- **`npm test`** lance `jest`, puis `node --test scripts/*.test.mjs`, puis les tests d'empaquetage. Pendant le développement d'une tâche, lancer le fichier seul (`npx jest <chemin>`) ; avant de committer, lancer `npx jest` en entier.
- **Le dictionnaire anglais est vide** (`src/ui/i18n.ts:693`) : toute clé absente retombe sur elle-même. Ajouter les clés côté `FR` uniquement.
- **Ne pas toucher** `apps/windows/src/platform/desktopReminderScheduler.ts` : il est correct tel quel.
- **`tauri.conf.json` est suivi par git mais réécrit par `node scripts/configure-tauri-updater.mjs`** pour le build de dev. Ne jamais committer la version avec les clés de l'updater ; `git diff` avant chaque commit touchant ce fichier.
- **Valeurs exactes reprises de la spec** : horizon des rappels 30 jours (`REMINDER_HORIZON_DAYS`), abandon d'un rappel en retard au-delà de 5 minutes (`STALE_AFTER_MS`), compteur d'horizon rafraîchi **toutes les heures**.

---

### Task 1: Le délai court, « 1 h 30 »

**Files:**
- Modify: `src/ui/calendar/reminderDelay.ts` (ajout en fin de fichier)
- Modify: `src/ui/i18n.ts:305-315` (bloc `── Reminders ──`)
- Test: `src/ui/calendar/reminderDelay.test.ts`

**Interfaces:**
- Consomme : `t` de `../i18n`, déjà importé par `reminderDelay.ts`.
- Produit : `relativeDelayLabel(minutes: number): string`, utilisé par les tâches 2 et 3.

- [ ] **Step 1: Ajouter les trois clés du dictionnaire**

Dans `src/ui/i18n.ts`, dans le bloc `// ── Reminders ──`, juste après la ligne `In: "Dans",` :

```ts
    Tomorrow: "Demain",
    // Les unités abrégées de la ligne d'une notification, qu'on lit d'un coup
    // d'œil : « Dans 1 h 30 », « Dans 2 j ». Les réglages, eux, écrivent les
    // unités en toutes lettres (voir `reminderDelayLabel`).
    h: "h",
    j: "j",
```

- [ ] **Step 2: Écrire le test qui échoue**

À la fin de `src/ui/calendar/reminderDelay.test.ts`, en ajoutant `relativeDelayLabel` à l'import existant depuis `./reminderDelay` :

```ts
describe("relativeDelayLabel", () => {
    beforeEach(() => applyLanguage("fr"));

    /* Le défaut signalé par Ahmed le 2026-09-16 : un rappel réglé à 1 h 30
       annonçait « 90 min », et il fallait faire la division soi-même. */
    it("reads a compound delay the way it is said out loud", () => {
        expect(relativeDelayLabel(90)).toBe("1 h 30");
        expect(relativeDelayLabel(125)).toBe("2 h 05");
        expect(relativeDelayLabel(1439)).toBe("23 h 59");
    });

    it("keeps minutes below the hour", () => {
        expect(relativeDelayLabel(1)).toBe("1 min");
        expect(relativeDelayLabel(45)).toBe("45 min");
        expect(relativeDelayLabel(59)).toBe("59 min");
    });

    it("drops the remainder when there is none", () => {
        expect(relativeDelayLabel(60)).toBe("1 h");
        expect(relativeDelayLabel(120)).toBe("2 h");
        expect(relativeDelayLabel(2880)).toBe("2 j");
    });

    /* Un jour entier se dit « 1 j », jamais « 24 h » : c'est la même durée,
       mais pas la même façon de se la représenter. */
    it("counts in days past the day", () => {
        expect(relativeDelayLabel(1440)).toBe("1 j");
        expect(relativeDelayLabel(1470)).toBe("1 j 30 min");
        expect(relativeDelayLabel(3600)).toBe("2 j 12 h");
    });

    it("names silence rather than writing a zero", () => {
        expect(relativeDelayLabel(0)).toBe(t("Starting now"));
        expect(relativeDelayLabel(-10)).toBe(t("Starting now"));
    });
});
```

- [ ] **Step 3: Lancer le test et vérifier qu'il échoue**

Run: `npx jest src/ui/calendar/reminderDelay.test.ts`
Expected: FAIL, `relativeDelayLabel is not a function`.

- [ ] **Step 4: Écrire l'implémentation**

À la fin de `src/ui/calendar/reminderDelay.ts` :

```ts
/**
 * Le délai en abrégé, tel qu'on le dirait à voix haute : « 1 h 30 », pas
 * « 90 min ».
 *
 * `reminderDelayLabel` écrit la même durée en toutes lettres pour les réglages
 * (« 1 heure 30 minutes avant ») ; celle-ci en est la forme courte, pour la
 * ligne d'une notification qu'on lit d'un coup d'œil. Les deux découpent la
 * durée de la même manière — c'est ce qui fait que l'application ne dit pas
 * deux choses différentes du même délai.
 *
 * Le reste des heures est écrit sur deux chiffres et sans unité, comme on lit
 * une heure : « 2 h 05 », et non « 2 h 5 min ».
 */
export function relativeDelayLabel(minutes: number): string {
    if (minutes <= 0) return t("Starting now");
    if (minutes < MINUTES_PER.hours) return `${minutes} min`;

    if (minutes < MINUTES_PER.days) {
        const hours = Math.floor(minutes / MINUTES_PER.hours);
        const rest = minutes % MINUTES_PER.hours;
        if (rest === 0) return `${hours} ${t("h")}`;
        return `${hours} ${t("h")} ${String(rest).padStart(2, "0")}`;
    }

    const days = Math.floor(minutes / MINUTES_PER.days);
    const rest = minutes % MINUTES_PER.days;
    // Le reste repasse par la même règle : un jour et demi se dit « 1 j 12 h »,
    // une journée et demi-heure « 1 j 30 min ».
    if (rest === 0) return `${days} ${t("j")}`;
    return `${days} ${t("j")} ${relativeDelayLabel(rest)}`;
}
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

Run: `npx jest src/ui/calendar/reminderDelay.test.ts`
Expected: PASS, toutes les suites du fichier.

- [ ] **Step 6: Commit**

```bash
git add src/ui/calendar/reminderDelay.ts src/ui/calendar/reminderDelay.test.ts src/ui/i18n.ts
git commit -m "Un délai de rappel se dit « 1 h 30 », plus « 90 min »" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 2: La ligne de la notification

**Files:**
- Modify: `apps/windows/src/platform/androidReminders.ts:69-81` (`bodyFor`) et ses deux appels dans `buildReminders`
- Test: `apps/windows/src/platform/androidReminders.test.ts`

**Interfaces:**
- Consomme : `relativeDelayLabel(minutes: number): string` (tâche 1).
- Produit : rien de neuf à l'extérieur. `bodyFor` reste interne ; sa signature gagne un paramètre `now: Date` en troisième position.

Ce fichier sert les **deux** plateformes malgré son nom : la liste qu'il construit part vers l'alarme Android et vers le planificateur PC. Le corriger ici le corrige partout.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/windows/src/platform/androidReminders.test.ts`, ajouter cette suite. Reprendre le constructeur d'évènement déjà utilisé par le fichier s'il en existe un ; sinon, celui-ci :

```ts
describe("la ligne d'une notification", () => {
    const event = (start: Date): DisplayEvent =>
        ({
            id: "e1",
            title: "Ethical Hacking 1",
            start,
            end: new Date(+start + 60 * 60_000),
            allDay: false,
            calendarId: "c1",
            calendarName: "Efrei",
            color: "#888",
            editable: false,
            isSomeday: false,
        }) as unknown as DisplayEvent;

    const bodyOf = (now: Date, start: Date, offset: number): string =>
        buildReminders({
            events: [event(start)],
            now,
            minutesBefore: [offset],
            timeFormat24h: true,
        })[0].body;

    /* Le défaut signalé le 2026-09-16 : « In 90 min » obligeait à faire la
       division pour savoir de combien de temps on disposait. */
    it("says a compound delay instead of a heap of minutes", () => {
        const now = new Date(2026, 8, 16, 12, 30);
        const start = new Date(2026, 8, 16, 14, 0);
        expect(bodyOf(now, start, 90)).toBe("Dans 1 h 30 · 14:00");
    });

    it("keeps the hour bare when the event is today", () => {
        const now = new Date(2026, 8, 16, 8, 30);
        const start = new Date(2026, 8, 16, 9, 15);
        expect(bodyOf(now, start, 45)).toBe("Dans 45 min · 09:15");
    });

    /* Vingt minutes séparent ces deux instants, et pourtant l'évènement est
       demain : le qualificatif se compte en jours de calendrier, pas en
       heures écoulées. */
    it("says tomorrow across midnight, however close it is", () => {
        const now = new Date(2026, 8, 16, 23, 50);
        const start = new Date(2026, 8, 17, 0, 10);
        expect(bodyOf(now, start, 20)).toBe("Dans 20 min · Demain 00:10");
    });

    it("names the weekday inside the week, and dates it beyond", () => {
        const now = new Date(2026, 8, 16, 9, 0);
        expect(bodyOf(now, new Date(2026, 8, 18, 8, 0), 1440)).toBe(
            "Dans 1 j · ven 08:00"
        );
        expect(bodyOf(now, new Date(2026, 8, 28, 8, 0), 1440)).toBe(
            "Dans 1 j · lun 28 sept 08:00"
        );
    });

    it("still announces an event that starts now", () => {
        const now = new Date(2026, 8, 16, 13, 59);
        const start = new Date(2026, 8, 16, 14, 0);
        expect(bodyOf(now, start, 0)).toBe("Ça commence · 14:00");
    });
});
```

Vérifier en tête de fichier que `applyLanguage("fr")` est appelé (les autres suites du fichier le font déjà) ; sinon l'ajouter dans un `beforeEach`.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest apps/windows/src/platform/androidReminders.test.ts -t "la ligne d'une notification"`
Expected: FAIL. Le premier cas donne `"Dans 90 min · 14:00"`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `apps/windows/src/platform/androidReminders.ts`, compléter les imports du haut :

```ts
import { formatDatedDay, formatTime } from "../../../../src/ui/calendar/calendarFormatters";
import { DAYS_SHORT } from "../../../../src/ui/calendar/calendarConstants";
import { startOfDay } from "../../../../src/ui/calendar/calendarDateUtils";
import { relativeDelayLabel } from "../../../../src/ui/calendar/reminderDelay";
```

Puis remplacer `bodyFor` (lignes 69 à 81) par :

```ts
/** Un jour entier, en millisecondes. */
const DAY_MS = 24 * 60 * 60_000;

/**
 * L'heure, qualifiée quand l'évènement n'est pas aujourd'hui.
 *
 * Le calcul est en jours de calendrier locaux, pas en heures écoulées : un
 * rappel posé à 23 h 50 pour un évènement à 00 h 10 doit dire « demain », alors
 * qu'il n'y a que vingt minutes entre les deux. `Math.round` absorbe au passage
 * les journées de 23 ou 25 heures des changements d'heure.
 */
function whenFor(start: Date, now: Date, timeFormat24h: boolean): string {
    const time = formatTime(start, timeFormat24h);
    const days = Math.round((+startOfDay(start) - +startOfDay(now)) / DAY_MS);
    if (days <= 0) return time;
    if (days === 1) return `${t("Tomorrow")} ${time}`;
    // Dans la semaine, le nom du jour suffit ; au-delà il ne suffit plus, deux
    // lundis tombant dans l'horizon de trente jours.
    if (days < 7) return `${DAYS_SHORT[start.getDay()]} ${time}`;
    return `${formatDatedDay(start)} ${time}`;
}

function bodyFor(
    offsetMinutes: number,
    start: Date,
    now: Date,
    timeFormat24h: boolean
): string {
    const when = whenFor(start, now, timeFormat24h);
    if (offsetMinutes <= 0) return `${t("Starting now")} · ${when}`;
    return `${t("In")} ${relativeDelayLabel(offsetMinutes)} · ${when}`;
}
```

Et dans `buildReminders`, le seul appel de `bodyFor` (dans le `offsets.map` final) passe `now` :

```ts
                    body: withPlace(
                        bodyFor(offset, event.start, now, timeFormat24h),
                        event.location
                    ),
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx jest apps/windows/src/platform/androidReminders.test.ts`
Expected: PASS, y compris les suites déjà présentes. Si une ancienne assertion attendait `"In 90 min"` ou `"24 h"`, la mettre à jour : c'était le défaut, pas le contrat.

- [ ] **Step 5: Commit**

```bash
git add apps/windows/src/platform/androidReminders.ts apps/windows/src/platform/androidReminders.test.ts
git commit -m "Une notification de rappel dit « Dans 1 h 30 · demain 14:00 »" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 3: La puce du panneau dit la même chose

**Files:**
- Modify: `src/ui/calendar/reminderChoices.ts:71-83` (`reminderLabelParts`)
- Test: `src/ui/calendar/reminderChoices.test.ts`

**Interfaces:**
- Consomme : `reminderDelayLabel(minutes: number): string`, déjà exporté par `./reminderDelay`.
- Produit : rien de neuf ; `reminderLabelParts` garde sa signature.

**Note sur l'écart avec la spec.** La spec disait « en réutilisant le formateur ». C'est bien ce que fait cette tâche, mais avec `reminderDelayLabel` (unités en toutes lettres) et non `relativeDelayLabel` (unités abrégées) : le panneau écrit « 1 heure » depuis toujours, et l'abréger changerait des puces dont personne ne s'est plaint. Les deux formateurs vivent dans le même module et découpent la durée de la même façon ; c'est la cohérence qui comptait, pas l'uniformité de l'abréviation.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `src/ui/calendar/reminderChoices.test.ts` :

```ts
describe("reminderLabelParts sur un délai composé", () => {
    beforeEach(() => {
        applyLanguage("fr");
        setReminderDisplayAllDay(false);
    });

    /* 90 minutes donnaient « 1.5 heures » : une division sans reste sur une
       durée qui en a un. La notification disait déjà autre chose du même
       délai. */
    it("writes the remainder instead of a decimal", () => {
        expect(reminderLabelParts(90)).toEqual({
            amount: "1 heure 30 minutes",
            suffix: "avant",
        });
    });

    it("counts a whole day in days", () => {
        expect(reminderLabelParts(1440)).toEqual({
            amount: "1 jour",
            suffix: "avant",
        });
    });

    it("leaves the short forms alone", () => {
        expect(reminderLabelParts(45)).toEqual({
            amount: "45 min",
            suffix: "avant",
        });
        expect(reminderLabelParts(60)).toEqual({
            amount: "1 heure",
            suffix: "avant",
        });
        expect(reminderLabelParts(0)).toEqual({
            amount: t("At start of event"),
            suffix: "",
        });
    });
});
```

Compléter les imports du fichier avec `reminderLabelParts`, `setReminderDisplayAllDay` depuis `./reminderChoices` et `applyLanguage`, `t` depuis `../i18n`.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest src/ui/calendar/reminderChoices.test.ts -t "délai composé"`
Expected: FAIL, reçu `{ amount: "1.5 heures", suffix: "avant" }`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/ui/calendar/reminderChoices.ts`, ajouter l'import :

```ts
import { reminderDelayLabel } from "./reminderDelay";
```

Puis remplacer les trois dernières lignes de `reminderLabelParts` (le calcul `const hours = minutes / 60` et le `return` qui suit) par :

```ts
    // `reminderDelayLabel` découpe la durée en toutes ses parts et finit par
    // « avant ». La puce porte ce mot dans son propre champ : on le retire
    // plutôt que d'écrire un second découpage qui dériverait du premier.
    const before = ` ${t("before")}`;
    return {
        amount: reminderDelayLabel(minutes).slice(0, -before.length),
        suffix: t("before"),
    };
```

Le garde `if (minutes < 60) return { amount: \`${minutes} min\`, ... }` reste **au-dessus**, inchangé : sous l'heure, la puce a toujours dit « 45 min » et c'est bien.

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx jest src/ui/calendar/reminderChoices.test.ts src/ui/calendar/RemindersRow.test.tsx`
Expected: PASS des deux fichiers.

- [ ] **Step 5: Commit**

```bash
git add src/ui/calendar/reminderChoices.ts src/ui/calendar/reminderChoices.test.ts
git commit -m "La puce d'un rappel de 90 minutes dit « 1 heure 30 minutes », plus « 1.5 heures »" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 4: Les deux drapeaux de la machine

**Files:**
- Modify: `apps/windows/src/platform/preferences.ts:4-9` et `:52-71`
- Test: `apps/windows/src/platform/preferences.test.ts`

**Interfaces:**
- Produit : `DesktopPreferences.startupDefaultApplied: boolean` et `DesktopPreferences.trayHintSeen: boolean`, lus et écrits par la tâche 7 via `loadDesktopPreferences` / `saveDesktopPreferences` de `./tauriSettingsStore`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/windows/src/platform/preferences.test.ts`, la suite `normalizeDesktopPreferences` existe déjà. Mettre à jour son premier cas et en ajouter un :

```ts
    it("uses safe defaults for missing settings", () => {
        expect(normalizeDesktopPreferences(null)).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
            vaultFolders: [],
            disabledVaults: [],
            startupDefaultApplied: false,
            trayHintSeen: false,
        });
    });

    /* Les deux drapeaux de la machine, qui ne voyagent pas avec les
       préférences partagées : sans eux, le démarrage automatique se
       réappliquerait à chaque lancement et la bulle se remontrerait sans
       fin. Tout ce qui n'est pas exactement `true` vaut « pas encore ». */
    it("only accepts a real true for the machine's own flags", () => {
        expect(
            normalizeDesktopPreferences({
                startupDefaultApplied: true,
                trayHintSeen: true,
            })
        ).toMatchObject({ startupDefaultApplied: true, trayHintSeen: true });

        expect(
            normalizeDesktopPreferences({
                startupDefaultApplied: "true",
                trayHintSeen: 1,
            })
        ).toMatchObject({ startupDefaultApplied: false, trayHintSeen: false });
    });
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest apps/windows/src/platform/preferences.test.ts`
Expected: FAIL, les deux clés manquent de l'objet rendu.

- [ ] **Step 3: Écrire l'implémentation**

Dans `apps/windows/src/platform/preferences.ts`, l'interface :

```ts
export interface DesktopPreferences {
    dataFolder: string | null;
    themeId: ThemeId;
    vaultFolders: string[];
    disabledVaults: string[];
    /** Le démarrage automatique a déjà été posé une première fois. Sans ce
     *  drapeau, le « activé au repos » se réappliquerait à chaque lancement et
     *  annulerait la décision de l'avoir coupé. */
    startupDefaultApplied: boolean;
    /** La bulle « Neo Calendar continue de veiller ici » a été montrée. Elle
     *  répond à une question qu'on ne se pose qu'une fois. */
    trayHintSeen: boolean;
}
```

et, dans le `return` de `normalizeDesktopPreferences` :

```ts
        startupDefaultApplied: input.startupDefaultApplied === true,
        trayHintSeen: input.trayHintSeen === true,
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx jest apps/windows/src/platform/preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/windows/src/platform/preferences.ts apps/windows/src/platform/preferences.test.ts
git commit -m "Les préférences de la machine retiennent le démarrage automatique et la bulle déjà vue" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 5: L'application réside (Rust)

**Files:**
- Modify: `apps/windows/src-tauri/Cargo.toml` (dépendance et feature)
- Modify: `apps/windows/src-tauri/tauri.conf.json` (`"visible": false`)
- Modify: `apps/windows/src-tauri/capabilities/default.json` (trois permissions)
- Modify: `apps/windows/src-tauri/src/lib.rs` (imports, `starts_hidden`, `reveal_main_window`, `TRAY_READY`, `build_tray`, `run()`, module `tests`)
- Modify: `apps/windows/package.json` (dépendance JS du greffon)

**Interfaces:**
- Produit côté JS : les commandes `autostart:*`, consommées par la tâche 6.
- Produit côté Rust, tous internes au fichier : `fn starts_hidden<I: IntoIterator<Item = String>>(args: I) -> bool`, `fn reveal_main_window(app: &tauri::AppHandle)`, `fn build_tray(app: &tauri::AppHandle) -> Result<(), String>` et `static TRAY_READY: AtomicBool`.

API vérifiée sur `docs.rs/tauri/2.11.5` : `TrayIconBuilder::show_menu_on_left_click(bool)` (`menu_on_left_click` est déprécié depuis 2.2.0), `icon(Image<'_>)`, `tooltip<S: AsRef<str>>(S)`, `menu<M: ContextMenu>(&M)`, `on_menu_event`, `on_tray_icon_event`, `build<M: Manager<R>>(&M)`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans le module `mod tests` en fin de `apps/windows/src-tauri/src/lib.rs` :

```rust
    /// L'entree de demarrage de Windows lance l'application avec `--hidden`,
    /// et c'est le seul argument qui la fait se construire sans se montrer.
    /// L'inverse — une fenetre visible qu'on masque aussitot — ferait
    /// clignoter une fenetre a chaque ouverture de session.
    #[test]
    fn the_startup_entry_launches_without_showing_a_window() {
        let hidden = vec!["neo-calendar.exe".to_string(), "--hidden".to_string()];
        let plain = vec!["neo-calendar.exe".to_string()];
        let lookalike = vec![
            "neo-calendar.exe".to_string(),
            "--hidden-agenda".to_string(),
        ];

        assert!(starts_hidden(hidden));
        assert!(!starts_hidden(plain));
        assert!(!starts_hidden(lookalike));
    }
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `cd apps/windows/src-tauri && cargo test starts_hidden`
Expected: FAIL à la compilation, `cannot find function 'starts_hidden'`.

- [ ] **Step 3: Déclarer les dépendances**

`apps/windows/src-tauri/Cargo.toml` : la ligne `tauri` gagne la feature `tray-icon`, et une dépendance est ajoutée.

```toml
tauri = { version = "2", features = ["devtools", "tray-icon"] }
tauri-plugin-autostart = "2"
```

Côté JS, depuis `apps/windows/` : `npm install @tauri-apps/plugin-autostart@2`

`apps/windows/src-tauri/capabilities/default.json` : ajouter les trois permissions à la fin du tableau `permissions`.

```json
        "core:webview:allow-set-webview-zoom",
        "autostart:allow-enable",
        "autostart:allow-disable",
        "autostart:allow-is-enabled"
```

`apps/windows/src-tauri/tauri.conf.json` : la fenêtre `main` gagne `"visible": false`, après `"decorations": false`. C'est `setup()` qui la montre quand l'application n'a pas été lancée par l'entrée de démarrage.

- [ ] **Step 4: Écrire les deux fonctions et le test passe**

Dans `apps/windows/src-tauri/src/lib.rs`, au-dessus de `pub fn run()` :

```rust
/// Vrai quand l'application est lancee par l'entree de demarrage de Windows.
///
/// Elle doit alors se construire sans se montrer. L'inverse — une fenetre
/// visible qu'on masque aussitot — ferait clignoter une fenetre a chaque
/// ouverture de session. La comparaison est exacte plutot qu'un prefixe : un
/// futur `--hidden-quelque-chose` ne doit pas emprunter ce chemin par hasard.
fn starts_hidden<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter().any(|argument| argument == "--hidden")
}

/// Ramener la fenetre : le meme geste pour le clic sur l'icone de la zone de
/// notification, pour son entree « Ouvrir », et pour un second lancement que
/// `single-instance` intercepte. Trois portes, une seule serrure.
fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

Run: `cd apps/windows/src-tauri && cargo test starts_hidden`
Expected: PASS.

- [ ] **Step 5: Poser l'icône, le menu et la fermeture qui masque**

Compléter les imports en tête de `lib.rs` :

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
```

Au-dessus de `pub fn run()`, à la suite de `reveal_main_window`, la
construction de l'icône. Elle rend un `Result` plutôt que de remonter son
erreur dans `setup()` : une icône qui ne se construit pas ne doit pas empêcher
l'application de démarrer, elle doit seulement rendre au bouton Fermer son sens
ordinaire — sans quoi une fenêtre masquée n'aurait plus aucune porte pour
revenir.

```rust
/// Vrai des que l'icone de la zone de notification existe.
///
/// C'est elle qui rend une fenetre masquee recuperable. Tant qu'elle n'existe
/// pas, masquer la fenetre l'enfermerait hors d'atteinte : le bouton Fermer
/// redevient donc un vrai Fermer.
static TRAY_READY: AtomicBool = AtomicBool::new(false);

/// L'icone de la zone de notification, son infobulle et son menu.
///
/// Elle est desormais ce qui fait vivre l'application quand sa fenetre est
/// fermee — c'est elle qui tient les rappels. Le clic gauche ramene la fenetre ;
/// c'est le clic droit qui ouvre le menu, comme partout ailleurs sur Windows.
fn build_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let open = MenuItem::with_id(app, "open", "Ouvrir", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&open, &quit]).map_err(|error| error.to_string())?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "aucune icone embarquee".to_string())?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Neo Calendar")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => reveal_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    TRAY_READY.store(true, Ordering::Relaxed);
    Ok(())
}
```

Dans `run()`, le rappel de `single_instance` se réduit à la fonction partagée :

```rust
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            reveal_main_window(app);
        }))
```

Ajouter le greffon, après `tauri_plugin_notification` :

```rust
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
```

Dans `.setup()`, à l'intérieur du bloc `#[cfg(desktop)]` et **avant** le
`if let Some(window) = app.get_webview_window("main")` existant :

```rust
                if let Err(reason) = build_tray(app.handle()) {
                    // Pas fatal : sans icone, la fenetre restera simplement
                    // une fenetre ordinaire, qui se ferme pour de bon.
                    eprintln!("Icone de la zone de notification indisponible : {reason}");
                }

                // La fenetre est declaree invisible dans tauri.conf.json. Sans
                // cela, un lancement par l'entree de demarrage montrerait une
                // fenetre le temps de la masquer. Elle est aussi montree quand
                // l'icone manque, quel que soit l'argument : mieux vaut une
                // fenetre non demandee qu'une application injoignable.
                if !starts_hidden(std::env::args()) || !TRAY_READY.load(Ordering::Relaxed) {
                    reveal_main_window(app.handle());
                }
```

Puis, dans le `window.on_window_event` déjà présent (celui qui guette
`Focused(true)` pour la recherche de mise à jour), traiter la fermeture
**avant** le filtre existant :

```rust
                    window.on_window_event(move |event| {
                        // Fermer masque : l'application doit continuer de
                        // veiller pour que ses rappels partent. « Quitter »,
                        // dans le menu de l'icone, est le seul vrai depart.
                        // Sans icone, en revanche, Fermer reste Fermer.
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            if !TRAY_READY.load(Ordering::Relaxed) {
                                return;
                            }
                            api.prevent_close();
                            if let Some(window) = focused.get_webview_window("main") {
                                let _ = window.hide();
                            }
                            return;
                        }
                        if !matches!(event, tauri::WindowEvent::Focused(true)) {
                            return;
                        }
                        let handle = focused.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = fetch_if_due(handle, false).await;
                        });
                    });
```

- [ ] **Step 6: Vérifier que tout compile et que les tests Rust passent**

Run: `cd apps/windows/src-tauri && cargo test`
Expected: PASS, y compris `console_programs_are_started_without_a_console` et `blocking_commands_are_kept_off_the_window_thread`, inchangés.

- [ ] **Step 7: Vérifier que la config de l'updater n'est pas partie dans le commit**

Run: `git diff apps/windows/src-tauri/tauri.conf.json`
Expected: la seule différence est l'ajout de `"visible": false`. Si des clés d'updater apparaissent, `git checkout` le fichier et refaire l'ajout à la main.

- [ ] **Step 8: Commit**

```bash
git add apps/windows/src-tauri/Cargo.toml apps/windows/src-tauri/Cargo.lock apps/windows/src-tauri/tauri.conf.json apps/windows/src-tauri/capabilities/default.json apps/windows/src-tauri/src/lib.rs apps/windows/package.json apps/windows/package-lock.json
git commit -m "Fermer la fenêtre range l'application dans la zone de notification, où elle continue de veiller" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 6: Le réglage du démarrage automatique

**Files:**
- Create: `apps/windows/src/platform/desktopAutostart.ts`
- Create: `apps/windows/src/platform/desktopAutostart.test.ts`
- Modify: `apps/windows/src/DesktopSettings.tsx` (imports, état, rangée sous « Rappel » ligne 762)
- Modify: `src/ui/i18n.ts` (une clé)
- Test: `apps/windows/src/DesktopSettings.test.tsx`

**Interfaces:**
- Consomme : `enable`, `disable`, `isEnabled` de `@tauri-apps/plugin-autostart` (tâche 5).
- Produit : `isStartupEnabled(): Promise<boolean>` et `setStartupEnabled(wanted: boolean): Promise<boolean>`, utilisés par la tâche 7.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/windows/src/platform/desktopAutostart.test.ts` :

```ts
const enable = jest.fn();
const disable = jest.fn();
const isEnabled = jest.fn();

jest.mock(
    "@tauri-apps/plugin-autostart",
    () => ({ enable, disable, isEnabled }),
    { virtual: true }
);

import { isStartupEnabled, setStartupEnabled } from "./desktopAutostart";

describe("le démarrage automatique", () => {
    beforeEach(() => {
        enable.mockReset().mockResolvedValue(undefined);
        disable.mockReset().mockResolvedValue(undefined);
        isEnabled.mockReset().mockResolvedValue(false);
    });

    it("reads its state from the registry, not from a preference", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(isStartupEnabled()).resolves.toBe(true);
    });

    it("writes, then reads back what actually took", async () => {
        isEnabled.mockResolvedValue(true);
        await expect(setStartupEnabled(true)).resolves.toBe(true);
        expect(enable).toHaveBeenCalledTimes(1);
        expect(disable).not.toHaveBeenCalled();
    });

    /* Une machine qui refuse l'ecriture du registre ne doit pas voir
       l'interrupteur mentir : il revient sur sa position reelle. */
    it("does not claim a write that the registry refused", async () => {
        enable.mockRejectedValue(new Error("access denied"));
        isEnabled.mockResolvedValue(false);
        await expect(setStartupEnabled(true)).resolves.toBe(false);
    });

    it("stays quiet when even the reading fails", async () => {
        isEnabled.mockRejectedValue(new Error("no registry"));
        await expect(isStartupEnabled()).resolves.toBe(false);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest apps/windows/src/platform/desktopAutostart.test.ts`
Expected: FAIL, `Cannot find module './desktopAutostart'`.

- [ ] **Step 3: Écrire le module**

Créer `apps/windows/src/platform/desktopAutostart.ts` :

```ts
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/**
 * Le démarrage automatique, et où vit sa vérité.
 *
 * L'état n'est pas rangé dans les préférences : il est lu dans le registre, où
 * Windows le tient. C'est ce qui fait qu'une entrée désactivée depuis le
 * Gestionnaire des tâches se voit dans l'application, au lieu de laisser deux
 * vérités diverger en silence.
 *
 * Chaque appel est protégé : une machine où l'écriture du registre est refusée
 * doit pouvoir ouvrir ses Paramètres, pas les voir jeter.
 */
export async function isStartupEnabled(): Promise<boolean> {
    try {
        return await isEnabled();
    } catch {
        // Pas de registre, pas de démarrage automatique : répondre « non » est
        // vrai, et c'est la seule réponse sur laquelle on peut s'appuyer.
        return false;
    }
}

/**
 * Écrit, puis relit. Ce qui est rendu est l'état réel, pas celui demandé : un
 * interrupteur qui reste allumé sur une écriture refusée est un interrupteur
 * qui ment, et la promesse « même app fermée » ne tiendrait plus.
 */
export async function setStartupEnabled(wanted: boolean): Promise<boolean> {
    try {
        if (wanted) await enable();
        else await disable();
    } catch {
        // Le registre a refusé ; la relecture qui suit dira l'état vrai.
    }
    return isStartupEnabled();
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx jest apps/windows/src/platform/desktopAutostart.test.ts`
Expected: PASS, quatre cas.

- [ ] **Step 5: Écrire le test de la rangée**

Dans `apps/windows/src/DesktopSettings.test.tsx`, ajouter le mock virtuel du greffon à côté du mock existant de `@tauri-apps/api/core` :

```ts
jest.mock(
    "@tauri-apps/plugin-autostart",
    () => ({
        enable: jest.fn(),
        disable: jest.fn(),
        isEnabled: jest.fn().mockResolvedValue(false),
    }),
    { virtual: true }
);
```

puis la suite :

```ts
describe("le réglage du démarrage automatique", () => {
    beforeEach(() => applyLanguage("fr"));

    /* Sans lui, la promesse « les rappels arrivent même app fermée » ne tient
       pas : c'est cette entrée qui relance l'application a l'ouverture de
       session. */
    it("is offered on the desktop", () => {
        const markup = renderToStaticMarkup(
            <DesktopSettings {...commonProps} />
        );
        expect(markup).toContain("Lancer au démarrage de Windows");
    });

    /* Le téléphone n'a pas d'ouverture de session : ses alarmes sont tenues
       par Android lui-même. */
    it("is absent on the phone", () => {
        const markup = renderToStaticMarkup(
            <DesktopSettings {...commonProps} isAndroid />
        );
        expect(markup).not.toContain("Lancer au démarrage de Windows");
    });
});
```

Vérifier le nom exact de la prop Android sur `DesktopSettings` (`isAndroid` est utilisé à la ligne 747 du composant) et l'aligner sur ce que `commonProps` fournit déjà.

- [ ] **Step 6: Lancer le test et vérifier qu'il échoue**

Run: `npx jest apps/windows/src/DesktopSettings.test.tsx -t "démarrage automatique"`
Expected: FAIL, le libellé est absent du markup.

- [ ] **Step 7: Ajouter la clé et la rangée**

`src/ui/i18n.ts`, dans le bloc `── Reminders ──`, sous la clé `j` ajoutée en tâche 1 :

```ts
    "Launch at Windows startup": "Lancer au démarrage de Windows",
```

`apps/windows/src/DesktopSettings.tsx` : ajouter `Power` à l'import de `lucide-react`, et :

```ts
import {
    isStartupEnabled,
    setStartupEnabled,
} from "./platform/desktopAutostart";
```

Près des autres `useState` du composant (à côté de `reminderOpen`, ligne 319) :

```tsx
    /* Relu à l'ouverture plutôt que gardé en préférence : c'est le registre
       qui tient cet état, et une entrée retirée depuis le Gestionnaire des
       tâches doit se voir ici. */
    const [startupOn, setStartupOn] = useState(false);
    useEffect(() => {
        if (isAndroid) return;
        let alive = true;
        void isStartupEnabled().then((value) => {
            if (alive) setStartupOn(value);
        });
        return () => {
            alive = false;
        };
    }, [isAndroid]);
```

Et la rangée, juste **après** le `<SettingsRow label={t("Reminder")} … />` (ligne 762) :

```tsx
                {/* Ce qui fait tenir la promesse de la ligne au-dessus : sans
                    l'application relancée à l'ouverture de session, un rappel
                    posé pour demain matin n'a personne pour le poster. */}
                {!isAndroid && (
                    <SettingsToggleRow
                        label={t("Launch at Windows startup")}
                        icon={<Power size={18} />}
                        checked={startupOn}
                        onChange={(checked) => {
                            void setStartupEnabled(checked).then(setStartupOn);
                        }}
                    />
                )}
```

- [ ] **Step 8: Lancer les tests et vérifier qu'ils passent**

Run: `npx jest apps/windows/src/DesktopSettings.test.tsx apps/windows/src/platform/desktopAutostart.test.ts`
Expected: PASS des deux fichiers.

- [ ] **Step 9: Commit**

```bash
git add apps/windows/src/platform/desktopAutostart.ts apps/windows/src/platform/desktopAutostart.test.ts apps/windows/src/DesktopSettings.tsx apps/windows/src/DesktopSettings.test.tsx src/ui/i18n.ts
git commit -m "Un réglage règle le lancement de Neo Calendar au démarrage de Windows" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

### Task 7: L'horizon qui glisse, le défaut, et la bulle

**Files:**
- Create: `apps/windows/src/platform/useHourlyEpoch.ts`
- Create: `apps/windows/src/platform/useHourlyEpoch.test.tsx`
- Modify: `apps/windows/src/DesktopCalendar.tsx` (imports, `reminderEvents` ligne 3666, l'effet `buildReminders` ligne 3705, un effet neuf au montage)
- Modify: `src/ui/i18n.ts` (deux clés)

**Interfaces:**
- Consomme : `useHourlyEpoch(): number` ; `isStartupEnabled` / `setStartupEnabled` (tâche 6) ; `loadDesktopPreferences` / `saveDesktopPreferences` de `./platform/tauriSettingsStore` ; `postReminder` déjà importé.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/windows/src/platform/useHourlyEpoch.test.tsx` :

```tsx
/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useHourlyEpoch } from "./useHourlyEpoch";

const HOUR_MS = 60 * 60 * 1000;

describe("useHourlyEpoch", () => {
    let host: HTMLDivElement;
    let seen: number[];

    function Probe(): JSX.Element {
        seen.push(useHourlyEpoch());
        return <span />;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        seen = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        jest.useRealTimers();
    });

    /* Ce que l'application résidente a révélé : `reminderEvents` écrit
       `new Date()` dans un `useMemo` dont les dépendances sont des évènements.
       Ce compteur est ce qui fait bouger son « maintenant ». */
    it("changes once an hour, and not before", () => {
        act(() => {
            ReactDOM.render(<Probe />, host);
        });
        expect(seen[seen.length - 1]).toBe(0);

        act(() => {
            jest.advanceTimersByTime(HOUR_MS - 1000);
        });
        expect(seen[seen.length - 1]).toBe(0);

        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(seen[seen.length - 1]).toBe(1);

        act(() => {
            jest.advanceTimersByTime(2 * HOUR_MS);
        });
        expect(seen[seen.length - 1]).toBe(3);
    });

    it("stops counting once the page is gone", () => {
        act(() => {
            ReactDOM.render(<Probe />, host);
        });
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        const after = seen.length;

        act(() => {
            jest.advanceTimersByTime(5 * HOUR_MS);
        });
        expect(seen.length).toBe(after);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx jest apps/windows/src/platform/useHourlyEpoch.test.tsx`
Expected: FAIL, `Cannot find module './useHourlyEpoch'`.

- [ ] **Step 3: Écrire le hook**

Créer `apps/windows/src/platform/useHourlyEpoch.ts` :

```ts
import { useEffect, useState } from "react";

/** Une heure : assez fin pour qu'un horizon de trente jours glisse sans qu'on
    le remarque, assez large pour ne rien recalculer pour rien. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * Un nombre qui change toutes les heures, à mettre dans les dépendances de ce
 * qui lit l'heure courante sans que React puisse le savoir.
 *
 * `reminderEvents` écrit `new Date()` dans un `useMemo` dont les dépendances
 * sont des évènements : son « maintenant » est donc figé au dernier changement
 * de calendrier. C'était sans conséquence tant qu'on fermait l'application le
 * soir. Elle réside désormais dans la zone de notification, et sans ce
 * compteur son horizon cesse d'avancer — les évènements qui y entrent jour
 * après jour n'auraient plus de rappel.
 */
export function useHourlyEpoch(): number {
    const [epoch, setEpoch] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(
            () => setEpoch((count) => count + 1),
            HOUR_MS
        );
        return () => window.clearInterval(timer);
    }, []);

    return epoch;
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx jest apps/windows/src/platform/useHourlyEpoch.test.tsx`
Expected: PASS, deux cas.

- [ ] **Step 5: Brancher le compteur dans DesktopCalendar**

Dans `apps/windows/src/DesktopCalendar.tsx`, ajouter l'import :

```ts
import { useHourlyEpoch } from "./platform/useHourlyEpoch";
```

Près des autres états du composant, avant `reminderEvents` :

```ts
    /* Ce qui fait avancer le « maintenant » des deux blocs ci-dessous, dont
       React ne peut pas deviner qu'ils lisent l'horloge. */
    const reminderEpoch = useHourlyEpoch();
```

Puis ajouter `reminderEpoch` aux dépendances du `useMemo` de `reminderEvents` :

```ts
    }, [calendarById, hiddenCalendars, reminderEpoch, storedEvents]);
```

et à celles de l'effet qui appelle `buildReminders` :

```ts
    }, [
        calendars,
        isAndroid,
        preferences.calendarReminderMinutes,
        preferences.reminderMinutes,
        preferences.timeFormat24h,
        reminderEpoch,
        reminderEvents,
    ]);
```

- [ ] **Step 6: Poser le défaut et la bulle**

Toujours dans `DesktopCalendar.tsx`, un effet neuf, au montage, à placer juste après l'effet qui crée le planificateur (ligne 3693) :

```ts
    /*
     * Deux choses qui n'arrivent qu'une fois par machine.
     *
     * Le démarrage automatique est posé au repos, parce que sans lui le réglage
     * « Rappel » juste au-dessus promet ce qu'il ne peut pas tenir. Il n'est
     * posé qu'une fois : le drapeau est ce qui sépare « pas encore proposé » de
     * « proposé, puis refusé », et sans lui chaque lancement ré-annulerait la
     * décision de l'avoir coupé.
     *
     * La bulle, elle, répond à la question qu'on se pose la première fois qu'on
     * ferme la fenêtre et que l'application est toujours là. Une seule fois
     * aussi : posée à chaque fermeture, elle deviendrait le bruit qu'elle est
     * censée éviter.
     */
    useEffect(() => {
        if (isAndroid) return;
        let alive = true;

        void (async () => {
            const stored = await loadMachinePreferences().catch(() => null);
            if (!alive || stored === null) return;

            let next = stored;
            if (!stored.startupDefaultApplied) {
                await setStartupEnabled(true);
                next = { ...next, startupDefaultApplied: true };
            }
            if (!stored.trayHintSeen) {
                await postTrayHint();
                next = { ...next, trayHintSeen: true };
            }
            if (next !== stored) await saveMachinePreferences(next);
        })();

        return () => {
            alive = false;
        };
    }, [isAndroid]);
```

**Piège vérifié, à ne pas manquer.** Deux modules différents exportent une
fonction nommée `saveDesktopPreferences`, et ce ne sont pas les mêmes :

| Module | Signature | Ce qu'elle écrit |
|---|---|---|
| `./platform/desktopCalendarStore` | `(dataFolder, preferences)` | le `.neo-calendar.json` du dossier de données, partagé avec le téléphone |
| `./platform/tauriSettingsStore` | `(preferences)` | le `desktop-settings.json` de cette machine seule |

`DesktopCalendar.tsx` importe **déjà** la première (ligne 157). Celle dont
cette tâche a besoin est la seconde — les deux drapeaux sont locaux à la
machine et ne doivent jamais partir vers le téléphone. Importer les deux sous
le même nom ne compile pas : renommer à l'import, en complétant le bloc
`tauriSettingsStore` déjà présent (ligne 161) plutôt qu'en en créant un
second.

```ts
import { setStartupEnabled } from "./platform/desktopAutostart";
import { postTrayHint } from "./platform/desktopNotifications";
import {
    loadDeviceWorkspacePreferences,
    saveDeviceWorkspacePreferences,
    loadIcsRuntimeState,
    saveIcsRuntimeState,
    loadDesktopPreferences as loadMachinePreferences,
    saveDesktopPreferences as saveMachinePreferences,
} from "./platform/tauriSettingsStore";
```

- [ ] **Step 7: Écrire la bulle**

Dans `apps/windows/src/platform/desktopNotifications.ts`, à la fin :

```ts
/**
 * Dit une fois que fermer la fenêtre n'a pas fermé l'application.
 *
 * C'est le prix du choix qui fait tenir les rappels : le bouton Fermer masque.
 * Sans un mot, on croit avoir quitté, et on découvre l'icône par hasard. Avec
 * une boîte de dialogue, on demanderait un clic pour une information qui
 * n'appelle aucune décision — une notification se lit et s'oublie.
 */
export async function postTrayHint(): Promise<void> {
    if (!(await ensureNotificationPermission())) return;
    try {
        sendNotification({
            title: t("Neo Calendar keeps watch here"),
            body: t("Right-click the icon to quit."),
        });
    } catch {
        // Une bulle qui n'a pas pu être posée ne vaut pas qu'on interrompe le
        // calendrier pour elle.
    }
}
```

avec, en tête du fichier, `import { t } from "../../../../src/ui/i18n";`, et dans `src/ui/i18n.ts`, bloc `── Reminders ──` :

```ts
    "Neo Calendar keeps watch here": "Neo Calendar continue de veiller ici.",
    "Right-click the icon to quit.":
        "Clic droit sur l'icône pour quitter.",
```

- [ ] **Step 8: Lancer la suite entière**

Run: `npx jest`
Expected: PASS de toutes les suites. Un test de `DesktopCalendar` qui casserait sur le mock manquant de `@tauri-apps/plugin-autostart` reçoit le même mock virtuel que celui de la tâche 6.

- [ ] **Step 9: Vérifier le style**

Run: `npm run lint`
Expected: aucun fichier signalé. Au besoin `npm run fix-lint`.

- [ ] **Step 10: Commit**

```bash
git add apps/windows/src/platform/useHourlyEpoch.ts apps/windows/src/platform/useHourlyEpoch.test.tsx apps/windows/src/platform/desktopNotifications.ts apps/windows/src/DesktopCalendar.tsx src/ui/i18n.ts
git commit -m "L'horizon des rappels avance d'heure en heure, et la première fermeture dit où l'application est passée" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01GJQ5YUcfXtt2SVFYqbcAkn"
```

---

## Vérification finale, à l'œil

Rien de ce qui suit n'est prouvé par un test, et rien n'est « fait » avant d'avoir été vu.

```powershell
node scripts/configure-tauri-updater.mjs
npm run dev
# puis, apres :
git checkout apps/windows/src-tauri/tauri.conf.json
```

À regarder, dans cet ordre :

1. **L'icône** apparaît dans la zone de notification au lancement, avec son infobulle.
2. **Fermer** la fenêtre la fait disparaître sans que le processus s'arrête, et la bulle « Neo Calendar continue de veiller ici » se pose — une seule fois, pas à la fermeture suivante.
3. **Clic gauche** sur l'icône ramène la fenêtre au premier plan ; **clic droit** ouvre « Ouvrir » et « Quitter » ; « Quitter » termine réellement le processus.
4. **Paramètres > Rappel** : la rangée « Lancer au démarrage de Windows » est là, cochée, et la décocher retire l'entrée de `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (vérifiable par `Get-ItemProperty`).
5. **Une session Windows rouverte** relance l'application masquée, sans fenêtre qui clignote.
6. **Un rappel réglé à 1 h 30** affiche « Dans 1 h 30 · <heure> », et un rappel de la veille « Dans 1 j · demain <heure> ».

Le point 5 demande une vraie déconnexion/reconnexion Windows ; il ne se simule pas.

## Ce que ce plan ne fait pas

Repris de la spec, et déjà consigné dans `docs/PROCHAINE_VERSION.md` : la synchronisation Android en arrière-plan, la détection de l'exemption de batterie HyperOS, et le clic sur une notification PC qui n'ouvre pas l'évènement.
