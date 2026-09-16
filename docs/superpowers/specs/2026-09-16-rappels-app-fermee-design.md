# Des rappels qui survivent à la fermeture, et qui se lisent sans calculer

## Demande

Demande d'Ahmed du 16 septembre 2026, en deux temps.

> Fait en sorte que les rappels fonctionnent même quand l'app est fermée et
> qu'ils soient plus intelligents car par exemple je mets un rappel 1 h 30 avant
> l'événement et ça met que l'événement est dans 90 min et je dois réfléchir à
> c'est dans combien de temps.

puis, précisé dans la foulée :

> Les notifications sur Android et PC doivent arriver même quand l'app est
> fermée et n'a pas été ouverte une seule fois.

## Ce que le code fait aujourd'hui, vérifié et non supposé

**Android tient déjà la promesse.** `ReminderScheduler.java` écrit la liste
entière dans une préférence partagée et arme **une** alarme
`setExactAndAllowWhileIdle` sur le rappel le plus proche ; la déclencher poste
la notification et arme la suivante. `ReminderReceiver` rejoue l'armement au
`BOOT_COMPLETED` et au `MY_PACKAGE_REPLACED`, et le manifeste porte
`USE_EXACT_ALARM` et `RECEIVE_BOOT_COMPLETED`. L'app fermée, et même le
téléphone redémarré, un rappel déjà inscrit part.

**Le PC ne la tient pas du tout.** `desktopReminderScheduler.ts` est un
`setTimeout` de 30 secondes qui vit dans la page. Il meurt avec la fenêtre. Son
propre commentaire d'en-tête le dit : « Windows has no such thing here, so the
app keeps the list itself and watches the clock while it is open ». C'est là
qu'est tout le travail.

**La formulation.** `bodyFor` (`apps/windows/src/platform/androidReminders.ts:66`)
écrit le délai ainsi :

```ts
const away =
    offsetMinutes % 60 === 0
        ? `${offsetMinutes / 60} h`
        : `${offsetMinutes} min`;
```

90 ne tombe pas juste sur 60, d'où « 90 min ». Et 1440 tombe juste, d'où
« 24 h » là où on dirait « 1 jour ». Le module `src/ui/calendar/reminderDelay.ts`
sait pourtant déjà découper un délai en ses parts (`reminderDelayLabel` rend
« 1 heure 30 minutes avant ») ; il n'est simplement pas branché sur la
notification.

Même défaut ailleurs : `reminderLabelParts`
(`src/ui/calendar/reminderChoices.ts:83`) fait `minutes / 60` sans reste, donc
un délai personnalisé de 90 minutes s'affiche « 1.5 hours » sur la puce du
panneau d'évènement. L'application dit aujourd'hui deux choses différentes du
même délai.

## Décisions prises avec Ahmed le 16 septembre 2026

| Question | Tranché |
|---|---|
| Qui tient la montre sur PC | Démarrage automatique + icône dans la zone de notification |
| Le bouton Fermer | Masque la fenêtre ; « Quitter » est dans le menu de l'icône |
| Le démarrage automatique | Un réglage dans l'application, activé au repos |
| Formulation du délai | `Dans 1 h 30 · 14:00` |
| Synchronisation Android en arrière-plan | Pas cette fois |

Écartées, avec leur raison : la **tâche planifiée Windows** (calque exact
d'Android, zéro processus au repos, mais un mode sans fenêtre de l'exécutable à
écrire et une inscription `schtasks` à tenir) et les **notifications programmées
Windows** (`ScheduledToastNotification` / `AddToSchedule` : le plus pur, plafond
documenté de 4096 notifications, mais du code WinRT en Rust et, pour une
application non empaquetée, un serveur COM enregistré pour que le clic sur la
notification fasse quelque chose).

## Résultat attendu

### 1. L'application réside

- Elle se lance à l'ouverture de session Windows, masquée, sans fenêtre qui
  clignote.
- Fermer la fenêtre la masque au lieu de quitter. L'icône reste dans la zone de
  notification.
- Clic gauche sur l'icône : la fenêtre revient, démasquée, restaurée et au
  premier plan.
- Clic droit sur l'icône : **Ouvrir**, **Quitter**. « Quitter » est le seul
  moyen de terminer le processus depuis l'application.
- Tant qu'elle réside, les rappels partent — c'est le planificateur actuel, qui
  n'a plus besoin de changer de nature.

### 2. Le réglage

Une rangée dans les Paramètres, sous « Rappel », affichée sur PC seulement :

```
🔔  Rappel                        5 minutes avant   ›
⏻  Lancer au démarrage de Windows              [x]
```

**Un seul interrupteur, pas deux.** Le démarrage automatique implique le
démarrage masqué : un calendrier qui s'ouvre en grand à chaque ouverture de
session est une nuisance que personne ne choisirait, et le réglage qui la rend
possible ne serait jamais coché.

**L'état de l'interrupteur est lu dans le registre, pas dans les préférences.**
`isEnabled()` du greffon est la seule vérité. C'est ce qui fait qu'une entrée
désactivée depuis le Gestionnaire des tâches de Windows se voit dans
l'application, au lieu de créer deux vérités qui divergent en silence.

La seule chose persistée est `startupDefaultApplied: boolean`, dans
`DesktopPreferences`. Sans lui, le « activé au repos » se réappliquerait à
chaque lancement et annulerait la décision de l'avoir coupé.

### 3. Le message de la première fois

Au **premier** masquage seulement, une notification système :

> Neo Calendar continue de veiller ici.
> Clic droit sur l'icône pour quitter.

Drapeau `trayHintSeen: boolean` dans `DesktopPreferences`. Pas de boîte de
dialogue : elle demanderait un clic pour une information qui n'appelle aucune
décision.

### 4. L'horizon qui glisse

`reminderEvents` (`apps/windows/src/DesktopCalendar.tsx:3666`) écrit
`const from = new Date()` **à l'intérieur d'un `useMemo` dont les dépendances
sont `[calendarById, hiddenCalendars, storedEvents]`**. Ce `now` est donc figé
au dernier changement d'évènement, et l'horizon de 30 jours avec lui. L'effet
qui appelle `buildReminders` (ligne 3705) a le même défaut.

Aujourd'hui c'est sans conséquence : personne ne laisse l'application ouverte
trois semaines. Résidente, elle l'est. Sans correction, une application qui
réside depuis un mois ne voit plus aucun évènement neuf entrer dans sa liste de
rappels.

Correction : un état `reminderEpoch`, remis à l'heure **toutes les heures**,
ajouté aux dépendances des deux. L'horizon glisse alors avec le temps.

Bénéfice acquis sans être demandé : la resynchronisation des flux ICS tourne
déjà toutes les minutes (`DesktopCalendar.tsx:1496`). Une application résidente
la fait tourner en permanence, donc **le trou « un cours ajouté au flux Efrei
n'a pas de rappel » disparaît sur PC**. Il ne reste que sur Android.

### 5. La formulation

Un formateur neuf, `relativeDelayLabel(minutes: number): string`, dans
`src/ui/calendar/reminderDelay.ts` — là où les mots des délais vivent déjà.

| minutes | aujourd'hui | attendu |
|---|---|---|
| ≤ 0 | `Ça commence` | `Ça commence` |
| 1 | `1 min` | `1 min` |
| 45 | `45 min` | `45 min` |
| 59 | `59 min` | `59 min` |
| 60 | `1 h` | `1 h` |
| 90 | `90 min` | `1 h 30` |
| 120 | `2 h` | `2 h` |
| 125 | `125 min` | `2 h 05` |
| 1439 | `1439 min` | `23 h 59` |
| 1440 | `24 h` | `1 j` |
| 1470 | `1470 min` | `1 j 30 min` |
| 2880 | `48 h` | `2 j` |
| 3600 | `60 h` | `2 j 12 h` |

Règles, dans l'ordre :

- `≤ 0` → `t("Starting now")`.
- `< 60` → `N min`.
- `< 1440` → `H h` si le reste est nul, sinon `H h MM` — le reste sans unité et
  **sur deux chiffres**, comme on lit une heure : « 1 h 30 », « 2 h 05 ».
- `≥ 1440` → `J j` si le reste est nul, sinon `J j` suivi du reste passé à la
  même règle (`1 j 30 min`, `2 j 12 h`).

Le délai affiché est celui **demandé**, pas celui réellement restant : un rappel
posé avec jusqu'à cinq minutes de retard (`STALE_AFTER_MS`, machine sortant de
veille) dira encore « Dans 1 h 30 » alors qu'il en reste 1 h 25. C'est le
comportement actuel, et c'est le bon : l'heure exacte est sur la même ligne, et
un délai qui ne colle pas au réglage choisi serait plus déroutant que l'écart
qu'il corrige.

`bodyFor` s'en sert. L'heure se qualifie quand l'évènement n'est pas
aujourd'hui :

```
Ethical Hacking 1
Dans 1 h 30 · 14:00 · Efrei Bat. N N008

Dans 45 min · 09:15
Dans 1 j · demain 08:00
Dans 3 j · lun. 08:00
Ça commence · 14:00
```

Le qualificatif se calcule en jours calendaires locaux entre `now` et
`event.start`, pas en heures écoulées : un rappel posé à 23 h 50 pour un
évènement à 00 h 10 doit dire « demain », pas rien.

`reminderLabelParts` (`reminderChoices.ts`) est corrigé du même défaut, en
réutilisant le formateur au lieu d'en écrire un second.

Deux clés neuves dans `src/ui/i18n.ts` : `h` → `h`, `j` → `j`. Tout le reste
(`In`, `Starting now`, `Tomorrow, all day`, `min`) existe déjà.

## Architecture

### Rust — `apps/windows/src-tauri/`

`Cargo.toml` gagne `tauri-plugin-autostart = "2"` et la feature `tray-icon` sur
la caisse `tauri` (2.11.5, déjà en place).

`lib.rs`, dans `run()` :

- `.plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))`.
- Dans `.setup()`, un `TrayIconBuilder` : icône `icons/icon.ico`, infobulle
  « Neo Calendar », menu `Ouvrir` / `Quitter`, et un gestionnaire de clic
  gauche.
- `reveal_main_window(app)` : une seule fonction, appelée par le clic gauche de
  l'icône, par l'entrée « Ouvrir » et par le rappel de
  `tauri_plugin_single_instance` — qui fait déjà exactement ces trois gestes
  (`unminimize`, `show`, `set_focus`) et cesse de les écrire une seconde fois.
- `window.on_window_event` : `WindowEvent::CloseRequested` → `api.prevent_close()`
  puis `window.hide()`. Le gestionnaire `Focused(true)` déjà posé pour la
  recherche de mise à jour reste en place, dans le même appel.
- `app.exit(0)` sur « Quitter ».

`tauri.conf.json` : `"visible": false` sur la fenêtre `main`. Dans `.setup()`,
`window.show()` quand `std::env::args()` ne contient pas `--hidden`. L'inverse —
fenêtre visible qu'on masque aussitôt — fait clignoter une fenêtre à chaque
ouverture de session.

Une commande `tray_hint_shown()` n'est pas nécessaire : le drapeau
`trayHintSeen` passe par `save_desktop_preferences`, qui existe.

### TypeScript — `apps/windows/src/`

- `platform/preferences.ts` : `DesktopPreferences` gagne
  `startupDefaultApplied: boolean` et `trayHintSeen: boolean`, tous deux
  normalisés à `false` quand ils manquent.
- `platform/desktopAutostart.ts` (neuf, petit) : enveloppe `isEnabled`,
  `enable`, `disable` du greffon, chacun protégé par un `try/catch` qui rend un
  état sûr — une machine où l'écriture du registre échoue ne doit pas empêcher
  les Paramètres de s'ouvrir.
- `DesktopSettings.tsx` : la `SettingsToggleRow`, gardée par `!isAndroid`.
- `DesktopCalendar.tsx` : l'application du défaut au premier lancement, le
  `reminderEpoch` horaire, et l'écoute de l'évènement de masquage pour poser la
  notification de première fois.
- `platform/desktopReminderScheduler.ts` : **inchangé**. Son commentaire
  d'en-tête, qui explique pourquoi l'attente se prend par pas de 30 secondes
  plutôt qu'en un `setTimeout` d'un mois, devient plus vrai qu'avant : une
  machine qui sort de veille a bien un minuteur périmé.

### Partagé — `src/ui/`

- `calendar/reminderDelay.ts` : `relativeDelayLabel`.
- `calendar/reminderChoices.ts` : `reminderLabelParts` corrigé.
- `i18n.ts` : deux clés.

Et `apps/windows/src/platform/androidReminders.ts` : `bodyFor` réécrit. Le
fichier sert les deux plateformes malgré son nom — la liste qu'il construit part
vers l'alarme Android **et** vers le planificateur PC. La formulation est donc
corrigée une fois pour les deux.

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| L'écriture du registre est refusée | L'interrupteur revient à sa position réelle relue par `isEnabled()`, et un message sous la rangée le dit. Pas d'exception remontée. |
| L'icône de la zone de notification ne se construit pas | L'application démarre quand même, fenêtre visible, et Fermer redevient Fermer — sans quoi une fenêtre masquée serait irrécupérable. |
| Les notifications sont refusées par Windows | Déjà traité : `ensureNotificationPermission` rend `false` et le rappel est tu. Inchangé. |
| Un rappel dû pendant la veille de la machine | Déjà traité : `STALE_AFTER_MS` de 5 minutes. Au-delà, il est abandonné plutôt que posté en retard. |

## Tests

- `reminderDelay.test.ts` : la table de cas ci-dessus, en entier, y compris les
  bornes 59/60 et 1439/1440.
- `androidReminders.test.ts` : `bodyFor` traversé par `buildReminders` — le
  délai composé, et le qualificatif « demain » sur un évènement juste après
  minuit.
- `reminderChoices` : 90 minutes ne donne plus « 1.5 ».
- `DesktopCalendar` : avec de faux minuteurs, l'horizon glisse après une heure
  et un évènement à J+31 entre dans la liste le lendemain.
- `preferences.test.ts` : les deux drapeaux neufs, absents et présents.
- Rust : `--hidden` reconnu dans les arguments ; les identifiants du menu de
  l'icône ; le test existant qui garde `hidden_command` continue de passer.

**Ce qui ne se teste pas et doit être vu tourner** (`npm run dev`, après
`node scripts/configure-tauri-updater.mjs`) : l'icône dans la zone de
notification et son menu, Fermer qui masque, le clic gauche qui ramène la
fenêtre, le démarrage masqué à l'ouverture de session, et la notification de
première fois. Ces cinq-là vont dans une vérification explicite, pas dans un
« testé donc fait ».

## Hors périmètre

À reporter dans `docs/PROCHAINE_VERSION.md` plutôt qu'à laisser disparaître :

- **Android, synchronisation en arrière-plan.** La liste des alarmes n'est
  réécrite que quand l'application tourne, avec un horizon de 30 jours. Un
  évènement ajouté au flux ICS pendant qu'elle dort n'a pas de rappel tant
  qu'elle n'a pas été rouverte. Un `WorkManager` périodique le réglerait, mais
  le calcul des évènements vit en TypeScript dans la WebView : il faudrait le
  porter en natif ou lancer une WebView sans interface.
- **HyperOS.** Sans « Autostart » et sans exemption de batterie, le Xiaomi peut
  tuer l'application et avaler ses alarmes. Une détection
  (`isIgnoringBatteryOptimizations`) et un lien vers le bon écran de réglages
  restent à écrire.
- **Le clic sur une notification PC n'ouvre pas l'évènement.** Android le fait
  (`EXTRA_EVENT_ID`), le PC non — `sendNotification` du greffon ne porte pas
  d'action. Inchangé par ce travail, mais l'écart se remarquera davantage une
  fois les rappels fiables.
