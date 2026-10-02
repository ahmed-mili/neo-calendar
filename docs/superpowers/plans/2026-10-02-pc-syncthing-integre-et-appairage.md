# PC : Syncthing intégré et appairage par QR code (parties 2 et 3) : plan d'implémentation

> **Pour les agents d'exécution :** SOUS-COMPÉTENCE REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**Goal :** l'app PC (Tauri 2) embarque et pilote elle-même un Syncthing officiel v2.1.5 qui synchronise le dossier de données, démarre avec Windows et vit dans la zone de notification ; un QR code affiché par le PC et scanné par l'app Android relie le téléphone sans jamais montrer d'identifiant.

**Architecture :** côté PC, un module Rust `sync/` sans dépendance à Tauri (client REST, configuration imposée avant le premier `serve`, superviseur du processus, appairage, reprise depuis un Syncthing installé, contrôleur) enveloppé par de fines commandes Tauri ; la page Synchronisation est un composant React qui lit l'état toutes les deux secondes. Côté Android, le noyau Kotlin de la partie 1 reçoit `PairingPayload` / `PairingName` / `SyncSetup.pairWithPc`, et la page Synchronisation un scanner (zxing, déjà présent). Le code d'appairage voyage dans le nom d'appareil que le téléphone présente au PC (`/rest/cluster/pending/devices`, vérifié sur deux vrais moteurs).

**Tech Stack :** Rust (Tauri 2.11.5, `ureq` 2 sans TLS, `quick-xml` 0.41, `bcrypt` 0.17, `qrcode` 0.14, `getrandom` 0.3, `windows-sys` 0.61), Syncthing v2.1.5 officiel (sidecar Tauri), React 17 + TypeScript + Jest, Node (`node --test`), Kotlin + JUnit (noyau Android), Compose (page Android).

**Spec :** `docs/superpowers/specs/2026-10-02-pc-syncthing-integre-et-appairage-design.md` (suite de `2026-10-01-android-syncthing-embarque-design.md`, partie 1, livrée en 1.86 / 1.87 ; plan de la partie 1 : `docs/superpowers/plans/2026-10-01-android-syncthing-embarque.md`).

## Global Constraints

Règles d'Ahmed, valeurs de la spec et décisions des essais. Elles s'imposent à toutes les tâches.

- **Fiabilité et sécurité d'abord.** Une simplification n'est retenue que si elle ne retire rien à l'une ni à l'autre.
- **Rien n'est accepté tout seul, sauf la demande portant le bon code d'appairage pendant sa fenêtre de 5 minutes** (code aléatoire de 10 caractères, à usage unique, `WINDOW = 5 min`, fermeture après 10 appareils fautifs distincts). Toute autre demande reste à accepter à la main, et le code ne s'affiche jamais à l'écran.
- **Jamais deux synchros sur le même dossier** : le moteur de l'app ne démarre pas tant que la configuration d'un Syncthing installé (`%LOCALAPPDATA%\Syncthing\config.xml`) contient un dossier dont le chemin est le dossier de données, et l'exclusivité est revérifiée toutes les 30 s pendant que le moteur tourne. **La détection se fait sur cette configuration, JAMAIS sur la seule présence de `.stfolder`** (un marqueur orphelin reste quand un partage est retiré : ce n'est pas un conflit, le moteur de l'app prend le dossier et Syncthing réécrit le marqueur). Une configuration illisible bloque par prudence.
- **La reprise depuis un Syncthing installé** ne se fait qu'après confirmation de l'utilisateur, avec sauvegarde de sa configuration (`config.xml.avant-reprise-<horodatage>` dans `%LOCALAPPDATA%\com.ahmed.neocalendar\syncthing\sauvegardes\`), et ne retire QUE le dossier Neo Calendar (le Syncthing réel d'Ahmed partage aussi ses coffres Obsidian). Le moteur de l'app reprend le même identifiant de dossier et la liste des appareils qui le partageaient ; au moindre échec le dossier est rendu au Syncthing installé. « Rendre le dossier à Syncthing » le lui remet depuis la configuration brute gardée dans `reprise.json`.
- **Lancement des deux apps non ralenti** (ULTRA IMPORTANT côté Android : rien avant le premier écran, ne pas contourner `CachedWorkspaceStorage`). PC : le contrôleur est posé dans `setup` (lecture d'un petit fichier), le moteur ne démarre qu'après le premier écran (`sync_start`, appelé 1,5 s après `isCalendarReady`), hors du fil de l'interface ; un lancement masqué a un filet à 15 s. Temps de lancement MESURÉ avant (Task 2) et après (Task 12) ; une régression de plus de 100 ms en médiane BLOQUE la livraison. Android : aucun fichier de démarrage n'est modifié (seulement `SyncPage.kt`, `SyncPageModel.kt`, `SyncSetup.kt`, `Pairing.kt`).
- **Tout code Android est en Kotlin ; aucun fichier Java créé.**
- **D'autres personnes ont l'app** : aucune migration forcée ; la synchro intégrée est désactivée tant que l'utilisateur ne l'active pas ; la coque Android du même écran (`apps/windows/src` est partagé) garde l'ancienne page quand `sync_status` n'existe pas ; mode clair ignoré.
- **JAMAIS tuer un processus par son nom** (`taskkill /IM`, `Stop-Process -Name`, `pkill`) : d'autres sessions, le vrai Syncthing d'Ahmed (`%LOCALAPPDATA%\Syncthing\syncthing.exe`), Neo Quiz et d'autres applications font tourner des `syncthing.exe` sur ce PC. On ne termine que le PID qu'on a lancé (l'objet `Child`) ou celui que `engine.pid` désigne ET dont le programme est exactement notre `syncthing.exe` (`process::kill_stale`). Un test garde les motifs interdits dans `process.rs`.
- **Pendant le développement, ne jamais toucher au vrai Syncthing d'Ahmed** (ports 8384 / 22000 / 21027, `%LOCALAPPDATA%\Syncthing`, y compris le lire) : la détection et la reprise s'essaient sur une configuration de test dans un dossier temporaire (`OldSyncthing` de `testing.rs`), sur des ports tirés au hasard et sans découverte locale. Seule la Task 12, avec Ahmed et sa sauvegarde, regarde le vrai.
- **adb** : CHAQUE commande porte `-s emulator-5554` (émulateur `Pixel_8`). Le téléphone `SGPZQ84XNFDQBE8L` n'est visé que par la vérification finale (Task 12), avec la version livrée. Ne jamais désinstaller l'app d'un émulateur sans demander (`adb install -r` seulement).
- **Valeurs de la spec (copiées telles quelles).** Binaire : Syncthing **v2.1.5**, `syncthing-windows-amd64` officiel, SHA-256 de l'archive lu dans `sha256sum.txt.asc` vérifié par `gpg` avec la clé d'empreinte épinglée `FBA2E162F2F44657B38F0309E5665F9BD5970C47` (même clé et même méthode que l'Android ; tout écart fait échouer le build). Dossier d'état : `%LOCALAPPDATA%\com.ahmed.neocalendar\syncthing\`, jamais dans le dossier de notes, jamais synchronisé. Réglages imposés : `autoUpgradeIntervalH = 0`, `urAccepted = -1`, `crashReportingEnabled = false`, `startBrowser = false`, découverte globale et relais activés, `localAnnounceEnabled = false`, port d'écoute libre choisi et gardé (revérifié à chaque lancement), un seul dossier `sendreceive`, surveillance des fichiers, versionnage `trashcan` 30 jours, `introducer = false`, `autoAcceptFolders = false`, configuration écrite AVANT le premier `serve`, `STNORESTART=1`, `STNOUPGRADE=1`. Supervision : relances à 2, 4, 8, 16 s, abandon au cinquième échec de suite jusqu'à une action, arrêt propre par `/rest/system/shutdown`, nettoyage d'un moteur resté, journal tournant (1 Mo). Cycle de vie : démarrage avec Windows (activé par défaut à l'activation de la synchro), fermer la fenêtre la masque, « Quitter » arrête le moteur puis l'app, une seule instance.
- **Décisions des essais (Task 2, faits constatés le 2026-10-02).** (1) Le nom d'un appareil encore inconnu est exposé par `/rest/cluster/pending/devices` : le téléphone y met son code. (2) Interface REST : `127.0.0.1` + port tiré au hasard à chaque lancement + clé d'API aléatoire passée par l'environnement (`STGUIADDRESS`, `STGUIAPIKEY`) + identifiant et mot de passe (bcrypt) écrits dans `config.xml` avant le premier `serve` ; Syncthing sait écouter sur une socket Unix (`unix://`) mais la bibliothèque standard de Rust n'a pas d'`UnixStream` sous Windows, et aucun canal nommé n'existe dans le code de la v2.1.5 : TCP loopback retenu. (3) Découverte locale : désactivée toujours (le second à démarrer perd son port UDP 21027 en silence, c'est le Syncthing installé d'Ahmed qui serait lésé). (4) Zone de notification : `tray-icon` est déjà une fonctionnalité de `tauri` dans `Cargo.toml` et `build_tray`, « fermer = masquer » et « Quitter » existent déjà dans `lib.rs` : seul l'arrêt du moteur s'y ajoute.
- **Commits** en français, avec les deux trailers : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex`. Branche `android-parite`, copie de travail `C:\dev\neo-calendar`. **Donner la commande `git ship` à copier-coller plutôt que l'exécuter** (Ahmed la lance dans son terminal).
- **Conventions de travail** (reprises de `.superpowers/sdd/2026-10-01-android-syncthing-embarque/global-constraints.md`) : sources en CRLF (`core.autocrlf=true`), workflows `.github/workflows/*.yml` en LF (`.gitattributes`) : créer les fichiers avec l'outil Write, modifier les existants avec l'outil Edit (qui garde les fins de ligne), un bloc `diff` se reporte hunk par hunk ; ne jamais réécrire un workflow avec un script qui convertit en CRLF (`scripts/release-workflow.test.mjs` coupe le fichier sur `\n    tests:\n`). Commandes Kotlin dans `C:\dev\neo-calendar\apps\android\native` avec `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"` ; **piège Windows** : `--tests '*mot*'` est transformé en nom de fichier par le lanceur Java, toujours des noms de classe complets (`--tests 'com.ahmed.neocalendar.core.sync.PairingTest'`). `adb` = `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`. Pas de revue d'agent pour les tâches à faible risque ; une revue (sonnet) seulement pour les Tasks 6 et 7 (écriture dans la configuration d'un autre programme, reprise de données) ; jamais de re-revue après un correctif. Tout agent délégué : modèle `sonnet` écrit explicitement ; lire `quota` avant chaque dispatch, s'arrêter à 90 % sur 5 h sauf reset dans 20 min ou moins.
- **Prérequis des commandes Rust.** `tauri-build` exige que `apps/windows/src-tauri/binaries/syncthing-x86_64-pc-windows-msvc.exe` existe pour TOUT `cargo check/test/build` : la Task 1 le pose (`node scripts/fetch-syncthing-windows.mjs`). Les tests à vrai moteur lisent `SYNCTHING_BINARY` (chemin imprimé par ce script) ; sans elle ils se sautent avec `SKIP` (en CI, `CI=true` les rend obligatoires). Dans la suite : `$env:SYNCTHING_BINARY = (node scripts/fetch-syncthing-windows.mjs)` depuis la racine du dépôt.

## Review Focus

Entrées et conditions que la spec implique, qu'aucune tâche ne teste d'elle-même, par ordre de probabilité de gêner une vraie personne. Chaque ligne a son test dans la tâche qui possède le code.

1. **Un `.stfolder` orphelin dans un dossier qu'aucun Syncthing ne partage plus** (Ahmed vient de retirer lui-même le partage de son Syncthing installé) : pas de conflit, pas de proposition de reprise, le moteur de l'app prend le dossier et garde le marqueur. Tests : `installed::tests::an_orphan_stfolder_marker_is_not_a_conflict` (Task 6), `control::tests::an_orphan_stfolder_marker_does_not_block_the_engine` (Task 7), `un marqueur orphelin n'est pas un conflit` (Task 9).
2. **Une reprise qui échoue à mi-chemin** (sauvegarde impossible, interface du Syncthing installé en HTTPS ou arrêtée, retrait qui emporte un autre dossier, moteur de l'app qui ne démarre pas) : la configuration d'origine est sauvegardée avant tout retrait, les coffres Obsidian et les appareils ne sont jamais touchés, le dossier est rendu au Syncthing installé, et le message dit quoi faire. Tests : `installed::tests::withdrawing_backs_up_first_then_removes_only_the_neo_calendar_folder`, `if_the_removal_touches_something_else_the_folder_is_put_back`, `a_failed_backup_stops_everything_before_any_removal`, `a_https_gui_is_refused_with_an_explanation` (Task 6) ; `control::tests::the_folder_is_taken_over_from_a_test_syncthing_then_given_back` (Task 7).
3. **Un code d'appairage faux, expiré, rejoué, ou un intrus qui se reconnecte chaque seconde** : jamais accepté, la demande reste à accepter à la main sans montrer le code, un seul appareil fautif compte une fois. Tests : `pairing::tests::*` (Task 4), `control::tests::qr_pairing_accepts_only_the_right_code_and_syncs_both_ways` (Task 7), `la fenêtre d'appairage montre le QR en image` et `les demandes entrantes se lisent par leur nom, sans code` (Task 9).
4. **Un moteur qui plante en boucle, un port pris, un `syncthing.exe` absent, un moteur resté après un plantage de l'app, un Syncthing installé qui reprend le dossier plus tard, une mise à jour ou « Quitter » pendant que le moteur tourne** : relances 2/4/8/16 s puis abandon, arrêt immédiat pendant une attente, PID d'un autre programme jamais touché, arrêt propre avant l'installateur, copie du moteur dans le dossier d'état (l'installateur ne trouve jamais `syncthing.exe` verrouillé). Tests : `supervision::tests::*` (Task 3), `engine::tests::*`, `process::tests::*` (Task 5), `control::tests::an_installed_syncthing_that_shares_the_folder_blocks_the_engine` et `an_unreadable_installed_config_blocks_by_prudence` (Task 7).
5. **Un téléphone qui a déjà des notes ou des réglages locaux, un appairage rejoué, une app Android tuée entre le scan et l'acceptation** : le dossier du PC n'est adopté sans question que sur un téléphone vierge (sinon la carte de confirmation habituelle), le nom du téléphone ne garde jamais le code (rendu à la connexion du PC, après 5 minutes, ou au redémarrage de l'app), un second code ne s'ajoute pas au premier. Tests : `PairingTest` et `SyncSetupPairingTest` (Task 10).

---

## Structure des fichiers

Créés (PC, Rust, `apps/windows/src-tauri/src/sync/`, un fichier = une responsabilité) :

| Fichier | Responsabilité |
|---|---|
| `mod.rs` | déclare les modules |
| `config.rs` | réglages imposés au moteur (options, appareil, dossier), `prepare_config` (édition XML avant le premier `serve`), tirages aléatoires |
| `api.rs` | client REST (`HttpTransport`, `UreqTransport`, `SyncthingApi`) |
| `testing.rs` | `FakeTransport`, `real_binary`, `OldSyncthing` (tests seulement) |
| `ports.rs` | ports libres (écoute TCP+UDP, REST loopback) |
| `log.rs` | journal tournant de 1 Mo |
| `supervision.rs` | `EngineState`, `RestartPolicy` |
| `settings.rs` | réglages propres à ce PC (`settings.json` du dossier d'état) |
| `pairing.rs` | code, fenêtre de 5 minutes, QR, lecture du nom présenté |
| `setup.rs` | gestes sur appareils et dossier (`SyncSetup`, `FolderSeed`, `same_path`) |
| `process.rs` | lancement, journal, `engine.pid`, copie du moteur, nettoyage d'un moteur resté |
| `engine.rs` (+ `engine_tests.rs`) | superviseur sur son fil |
| `installed.rs` | lecture de la configuration d'un Syncthing installé, détection, reprise, retour |
| `control.rs` (+ `control_tests.rs`) | contrôleur : cycle de vie, appairage, reprise, état de la page |
| `commands.rs` | commandes Tauri (enveloppes) |

Créés (autres) : `scripts/fetch-syncthing-windows.mjs` (+ `.test.mjs`), `.github/workflows/windows-sync-tests.yml`, `apps/windows/src/platform/desktopSync.ts` (+ test), `apps/windows/src/DesktopSyncPage.tsx` (+ test), `core/.../sync/Pairing.kt` (+ `PairingTest.kt`, `SyncSetupPairingTest.kt`).

Modifiés : `apps/android/native/syncthing/version.env`, `.gitignore`, `apps/windows/scripts/tauri-runner.mjs`, `.github/workflows/release.yml` et `windows-tauri-package-validation.yml`, `apps/windows/src-tauri/{Cargo.toml,tauri.conf.json,src/lib.rs}`, `apps/windows/src/{App.tsx,DesktopSettings.tsx,DesktopSettings.test.tsx,App.css}`, `src/ui/i18n.ts`, `SyncSetup.kt`, `SyncPageModel.kt`, `SyncPage.kt`.

Ce plan a été éprouvé à sa rédaction : tout le code Rust ci-dessous a été compilé et testé dans une copie de `src-tauri` (106 tests verts avec un vrai moteur, dont 21 préexistants), le code TypeScript dans une copie du dépôt (`tsc --noEmit` et Jest verts), le noyau Kotlin par `:core:test`, la page Android par `:app:compileDebugKotlin`. Les sorties attendues citées plus bas viennent de ces exécutions.

---

### Task 1 : Le syncthing.exe officiel, vérifié, embarqué comme sidecar

**Files:**
- Create: `scripts/fetch-syncthing-windows.mjs`
- Create: `scripts/fetch-syncthing-windows.test.mjs`
- Create: `.github/workflows/windows-sync-tests.yml`
- Modify: `apps/android/native/syncthing/version.env` (deux épinglages)
- Modify: `.gitignore`
- Modify: `apps/windows/scripts/tauri-runner.mjs`
- Modify: `apps/windows/src-tauri/tauri.conf.json` (`bundle.externalBin`)
- Modify: `.github/workflows/release.yml` (job `windows`), `.github/workflows/windows-tauri-package-validation.yml`

**Interfaces:**
- Consumes: `apps/android/native/syncthing/{version.env,release-key.asc}` (partie 1) : `SYNCTHING_VERSION=v2.1.5`, `SYNCTHING_KEY_FINGERPRINT`.
- Produces: `fetchSyncthingWindows(): Promise<string>` (chemin du sidecar, vérifié), `parsePins`, `sha256Hex`, `hashFromSums`, `assertSignedBy` ; le fichier `apps/windows/src-tauri/binaries/syncthing-x86_64-pc-windows-msvc.exe` ; les épinglages `SYNCTHING_WINDOWS_ZIP_SHA256` / `SYNCTHING_WINDOWS_EXE_SHA256`.

Méthode : même chaîne de confiance que l'Android (`gpg` sur `sha256sum.txt.asc`, empreinte épinglée), mais le binaire Windows est le binaire officiel (`go1.27.1 windows-amd64`, signé par le même fichier) : pas de recompilation. `gpg` s'exécute dans le dossier de travail avec des chemins relatifs (le `gpg` de Git for Windows est un programme MSYS et lit mal `C:\...` ; celui de Gpg4win lit mal `/c/...` ; un chemin relatif se lit pareil des deux côtés). Extraction par le `tar.exe` de Windows 10+ (il lit les `.zip`).

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `scripts/fetch-syncthing-windows.test.mjs` :

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    assertSignedBy,
    hashFromSums,
    parsePins,
    sha256Hex,
} from "./fetch-syncthing-windows.mjs";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
const FINGERPRINT = "FBA2E162F2F44657B38F0309E5665F9BD5970C47";

test("les épinglages du moteur Windows ont la bonne forme", async () => {
    const pins = parsePins(
        await read("apps/android/native/syncthing/version.env")
    );
    assert.match(pins.SYNCTHING_VERSION, /^v\d+\.\d+\.\d+$/);
    assert.equal(pins.SYNCTHING_KEY_FINGERPRINT, FINGERPRINT);
    assert.match(pins.SYNCTHING_WINDOWS_ZIP_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.SYNCTHING_WINDOWS_EXE_SHA256, /^[0-9a-f]{64}$/);
});

test("le SHA-256 d'une archive se lit dans sha256sum.txt, jamais par approximation", () => {
    const sums = [
        `${"a".repeat(64)}  syncthing-linux-amd64-v2.1.5.tar.gz`,
        `${"b".repeat(64)}  syncthing-windows-amd64-v2.1.5.zip`,
        `${"c".repeat(64)} *syncthing-windows-arm64-v2.1.5.zip`,
    ].join("\n");
    assert.equal(
        hashFromSums(sums, "syncthing-windows-amd64-v2.1.5.zip"),
        "b".repeat(64)
    );
    assert.equal(
        hashFromSums(sums, "syncthing-windows-arm64-v2.1.5.zip"),
        "c".repeat(64)
    );
    assert.throws(() => hashFromSums(sums, "syncthing-windows-amd64"), /absent/);
});

test("une signature n'est acceptée que valide ET de la clé épinglée", () => {
    const valid = `[GNUPG:] NEWSIG\n[GNUPG:] VALIDSIG ${FINGERPRINT} 2026-09-08 1788850675 0 4 0 22 8 00 ${FINGERPRINT}\n`;
    assert.doesNotThrow(() => assertSignedBy(valid, FINGERPRINT));
    assert.throws(
        () => assertSignedBy(`[GNUPG:] BADSIG 1234 syncthing\n${valid}`, FINGERPRINT),
        /INVALIDE/
    );
    assert.throws(
        () => assertSignedBy(valid.replaceAll(FINGERPRINT, "0".repeat(40)), FINGERPRINT),
        /épinglée/
    );
    assert.throws(() => assertSignedBy("[GNUPG:] NO_PUBKEY ABCDEF\n", FINGERPRINT), /épinglée/);
    assert.throws(() => assertSignedBy("", FINGERPRINT), /épinglée/);
});

test("sha256Hex est le SHA-256 hexadécimal", () => {
    assert.equal(
        sha256Hex(Buffer.from("abc")),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
});

test("Tauri embarque le moteur comme sidecar et le dépôt ne le commite pas", async () => {
    const conf = JSON.parse(await read("apps/windows/src-tauri/tauri.conf.json"));
    assert.deepEqual(conf.bundle.externalBin, ["binaries/syncthing"]);
    assert.ok((await read(".gitignore")).includes("apps/windows/src-tauri/binaries/"));
});

test("la release et la validation posent le moteur Windows vérifié", async () => {
    const release = await read(".github/workflows/release.yml");
    const windowsJob = release.slice(release.indexOf("    windows:"));
    assert.ok(windowsJob.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(
        windowsJob.indexOf("fetch-syncthing-windows.mjs") <
            windowsJob.indexOf("npm --prefix apps/windows run package")
    );
    const packaging = await read(
        ".github/workflows/windows-tauri-package-validation.yml"
    );
    assert.ok(packaging.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(packaging.includes("scripts/fetch-syncthing-windows.mjs"));
    const rust = await read(".github/workflows/windows-sync-tests.yml");
    assert.ok(rust.includes("node scripts/fetch-syncthing-windows.mjs"));
    assert.ok(rust.includes("SYNCTHING_BINARY"));
    assert.ok(rust.includes("cargo test"));
});
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run (racine du dépôt) : `node --test scripts/fetch-syncthing-windows.test.mjs`
Expected : échec, `Cannot find module '.../scripts/fetch-syncthing-windows.mjs'` (le test importe le script).

- [ ] **Step 3 : Écrire le script**

Créer `scripts/fetch-syncthing-windows.mjs` :

```js
#!/usr/bin/env node
/*
 * Pose le syncthing.exe officiel de la version épinglée là où Tauri l'attend
 * (`bundle.externalBin` : apps/windows/src-tauri/binaries/syncthing-x86_64-pc-windows-msvc.exe).
 *
 * Même méthode et mêmes épinglages que le moteur Android (apps/android/native/syncthing/version.env) :
 *   1. `sha256sum.txt.asc` de la release est vérifié par gpg avec la clé de release épinglée (empreinte
 *      FBA2E162F2F44657B38F0309E5665F9BD5970C47) : une signature absente, invalide ou d'une autre clé échoue ;
 *   2. le SHA-256 de l'archive doit être celui de ce fichier signé ET celui épinglé dans le dépôt ;
 *   3. le SHA-256 de l'exécutable extrait doit être celui épinglé.
 * Tout écart arrête le build. Sans réseau, un exécutable déjà posé et conforme à l'épinglage suffit.
 *
 *   node scripts/fetch-syncthing-windows.mjs      affiche le chemin du binaire sur la dernière ligne
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const syncthingDir = path.join(root, "apps", "android", "native", "syncthing");
export const SIDECAR = path.join(
    root,
    "apps",
    "windows",
    "src-tauri",
    "binaries",
    "syncthing-x86_64-pc-windows-msvc.exe"
);

/** Les lignes `CLÉ=valeur` de version.env. */
export function parsePins(text) {
    return Object.fromEntries(
        text
            .split(/\r?\n/)
            .filter((line) => /^[A-Z0-9_]+=/.test(line))
            .map((line) => [
                line.slice(0, line.indexOf("=")),
                line.slice(line.indexOf("=") + 1).trim(),
            ])
    );
}

export function sha256Hex(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

/** Le SHA-256 d'une archive dans un `sha256sum.txt` (« <hex>  <nom> » ou « <hex> *<nom> »). */
export function hashFromSums(sums, archiveName) {
    for (const line of sums.split(/\r?\n/)) {
        const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
        if (match && match[2] === archiveName) return match[1];
    }
    throw new Error(`${archiveName} est absent de sha256sum.txt`);
}

/**
 * Lit le statut machine de gpg (`--status-fd`) : la signature doit être valide ET faite par la clé épinglée.
 * Une mauvaise signature (BADSIG), une clé inconnue ou une autre empreinte échouent.
 */
export function assertSignedBy(statusText, fingerprint) {
    const lines = statusText.split(/\r?\n/);
    if (lines.some((line) => line.startsWith("[GNUPG:] BADSIG")))
        throw new Error("signature de sha256sum.txt INVALIDE");
    const valid = lines.filter((line) => line.startsWith("[GNUPG:] VALIDSIG"));
    if (!valid.some((line) => line.trim().split(/\s+/).pop() === fingerprint))
        throw new Error(
            "aucune signature valide de la clé de release épinglée"
        );
}

function gpgCommand() {
    const candidates = [
        process.env.GPG,
        "gpg",
        "C:\\Program Files\\Git\\usr\\bin\\gpg.exe",
        "C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0)
            return candidate;
    }
    throw new Error("gpg est introuvable (installer Git for Windows ou Gpg4win, ou définir GPG)");
}

/**
 * Vérifie `sha256sum.txt.asc` avec la clé épinglée et rend le texte signé. gpg tourne dans le dossier de travail avec
 * des chemins RELATIFS : le gpg de Git for Windows (MSYS) et celui de Gpg4win n'écrivent pas les chemins Windows
 * de la même façon, un chemin relatif se lit pareil des deux côtés.
 */
function verifiedSums(work, pins) {
    const gpg = gpgCommand();
    copyFileSync(path.join(syncthingDir, "release-key.asc"), path.join(work, "release-key.asc"));
    mkdirSync(path.join(work, "gnupg-home"), { recursive: true, mode: 0o700 });
    const run = (args) =>
        spawnSync(gpg, ["--batch", "--homedir", "gnupg-home", ...args], { cwd: work, encoding: "utf8" });
    const imported = run(["--import", "release-key.asc"]);
    if (imported.status !== 0) throw new Error(`import de la clé impossible : ${imported.stderr}`);
    const fingerprints = run(["--with-colons", "--list-keys"])
        .stdout.split(/\r?\n/)
        .filter((line) => line.startsWith("fpr:"))
        .map((line) => line.split(":")[9]);
    if (!fingerprints.includes(pins.SYNCTHING_KEY_FINGERPRINT))
        throw new Error("la clé release-key.asc n'a pas l'empreinte épinglée");
    const verified = run(["--status-fd", "1", "--output", "sha256sum.txt", "--decrypt", "sha256sum.txt.asc"]);
    assertSignedBy(verified.stdout, pins.SYNCTHING_KEY_FINGERPRINT);
    return readFileSync(path.join(work, "sha256sum.txt"), "utf8");
}

async function download(url, destination) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function extract(archive, folder) {
    // Windows 10 et suivants fournissent bsdtar, qui lit les .zip ; ailleurs, unzip.
    const windows = process.platform === "win32";
    const command = windows
        ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "unzip";
    const args = windows ? ["-xf", archive, "-C", folder] : ["-o", "-q", archive, "-d", folder];
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`extraction impossible : ${result.stderr}`);
}

export async function fetchSyncthingWindows() {
    const pins = parsePins(readFileSync(path.join(syncthingDir, "version.env"), "utf8"));
    const wantedExe = pins.SYNCTHING_WINDOWS_EXE_SHA256;
    if (existsSync(SIDECAR) && sha256Hex(readFileSync(SIDECAR)) === wantedExe) return SIDECAR;

    const version = pins.SYNCTHING_VERSION;
    const name = `syncthing-windows-amd64-${version}`;
    const archiveName = `${name}.zip`;
    const base = `https://github.com/syncthing/syncthing/releases/download/${version}`;
    const work = mkdtempSync(path.join(tmpdir(), "nc-syncthing-"));
    try {
        await download(`${base}/${archiveName}`, path.join(work, archiveName));
        await download(`${base}/sha256sum.txt.asc`, path.join(work, "sha256sum.txt.asc"));

        const signedHash = hashFromSums(verifiedSums(work, pins), archiveName);
        const archiveHash = sha256Hex(readFileSync(path.join(work, archiveName)));
        if (archiveHash !== signedHash)
            throw new Error(`SHA-256 de ${archiveName} différent de celui du fichier signé`);
        if (archiveHash !== pins.SYNCTHING_WINDOWS_ZIP_SHA256)
            throw new Error(`SHA-256 de ${archiveName} différent de l'épinglage du dépôt`);

        extract(path.join(work, archiveName), work);
        const exe = path.join(work, name, "syncthing.exe");
        if (sha256Hex(readFileSync(exe)) !== wantedExe)
            throw new Error("SHA-256 de syncthing.exe différent de l'épinglage du dépôt");

        mkdirSync(path.dirname(SIDECAR), { recursive: true });
        const temporary = `${SIDECAR}.neo-tmp`;
        writeFileSync(temporary, readFileSync(exe));
        renameSync(temporary, SIDECAR);
        return SIDECAR;
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    try {
        console.log(await fetchSyncthingWindows());
    } catch (error) {
        console.error(`ERREUR : ${error.message}`);
        process.exit(1);
    }
}
```

- [ ] **Step 4 : Épingler l'archive et l'exécutable, ignorer le binaire, déclarer le sidecar**

`apps/android/native/syncthing/version.env` (le fichier est en LF ; les deux valeurs sont celles de l'archive officielle `syncthing-windows-amd64-v2.1.5.zip`, lues dans `sha256sum.txt.asc` signé, et du `syncthing.exe` qu'elle contient) :

```diff
--- a/apps/android/native/syncthing/version.env
+++ b/apps/android/native/syncthing/version.env
@@ -18,2 +18,8 @@
 NDK_VERSION=30.0.16248370
 ANDROID_API=26
+
+# Le moteur de l'app PC (sidecar Tauri) : le syncthing.exe OFFICIEL de la même version, jamais recompilé. Vérifié par
+# scripts/fetch-syncthing-windows.mjs : SHA-256 de l'archive lu dans sha256sum.txt.asc (signé par la clé ci-dessus) ET égal à
+# ces épinglages ; SHA-256 de l'exécutable extrait égal au second.
+SYNCTHING_WINDOWS_ZIP_SHA256=39571e4d0900c2a2cab14c0b170f49751340a869e49734ccc8079d9b98a7974b
+SYNCTHING_WINDOWS_EXE_SHA256=36a0f7bc372f64fa7cc4f5654fa324c0dd9f7fef2e07565e00c6e1cf73f50344
```

`.gitignore` :

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -115,2 +115,5 @@
 apps/android/native/app/src/main/jniLibs/
 apps/android/native/syncthing/.work/
+
+# Le syncthing.exe du moteur intégré (sidecar Tauri) : posé et vérifié par scripts/fetch-syncthing-windows.mjs, jamais commité.
+apps/windows/src-tauri/binaries/
```

`apps/windows/src-tauri/tauri.conf.json` (Tauri copie `binaries/syncthing-<triplet>.exe` à côté de l'exécutable de l'app sous le nom `syncthing.exe`) :

```diff
--- a/apps/windows/src-tauri/tauri.conf.json
+++ b/apps/windows/src-tauri/tauri.conf.json
@@ -54,4 +54,7 @@
             }
         },
+        "externalBin": [
+            "binaries/syncthing"
+        ],
         "createUpdaterArtifacts": true
     },
```

`apps/windows/scripts/tauri-runner.mjs` (`npm run dev` et `npm run package` du dossier racine passent par lui : le moteur est posé avant `tauri dev` ou `tauri build`, instantané quand il est déjà là) :

```diff
--- a/apps/windows/scripts/tauri-runner.mjs
+++ b/apps/windows/scripts/tauri-runner.mjs
@@ -16,4 +16,5 @@
 import { fileURLToPath } from "node:url";
 
+import { fetchSyncthingWindows } from "../../../scripts/fetch-syncthing-windows.mjs";
 import { renameInstaller } from "./rename-installer.mjs";
 
@@ -48,4 +49,15 @@
         `Exécute d'abord : npm install`
     );
+    process.exit(1);
+}
+
+/*
+ * Le moteur de synchronisation (sidecar Tauri, `bundle.externalBin`) doit exister avant tout
+ * `tauri dev` ou `tauri build`. Déjà posé et conforme à l'épinglage : instantané, sans réseau.
+ */
+try {
+    await fetchSyncthingWindows();
+} catch (error) {
+    console.error(`\nMoteur Syncthing indisponible : ${error.message}`);
     process.exit(1);
 }
```

- [ ] **Step 5 : Les workflows**

`.github/workflows/release.yml`, job `windows` (le moteur est posé avant la préparation de l'updater ; un écart de vérification arrête la release) :

```diff
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -276,4 +276,10 @@
                   npm install --no-audit --no-fund
                   npm --prefix apps/windows install --ignore-scripts --no-audit --no-fund
+
+            # Le moteur de synchronisation intégré : le syncthing.exe officiel, vérifié (SHA-256 de l'archive lu dans
+            # sha256sum.txt.asc, signé par la clé de release épinglée, puis SHA-256 de l'exécutable). Tauri l'embarque
+            # comme sidecar (`bundle.externalBin`) : sans lui le build échoue, et un écart de vérification l'arrête.
+            - name: Poser le moteur Syncthing vérifié
+              run: node scripts/fetch-syncthing-windows.mjs
 
             - name: Préparer la configuration updater
```

`.github/workflows/windows-tauri-package-validation.yml` :

```diff
--- a/.github/workflows/windows-tauri-package-validation.yml
+++ b/.github/workflows/windows-tauri-package-validation.yml
@@ -7,4 +7,6 @@
             - "apps/windows/src-tauri/tauri.conf.json"
             - "scripts/windows-icon-format.test.mjs"
+            - "scripts/fetch-syncthing-windows.mjs"
+            - "apps/android/native/syncthing/version.env"
             - ".github/workflows/windows-tauri-package-validation.yml"
     workflow_dispatch:
@@ -45,4 +47,7 @@
                   npm --prefix apps/windows install --ignore-scripts --no-audit --no-fund
 
+            - name: Poser le moteur Syncthing vérifié
+              run: node scripts/fetch-syncthing-windows.mjs
+
             - name: Préparer la configuration updater
               run: node scripts/configure-tauri-updater.mjs
```

Créer `.github/workflows/windows-sync-tests.yml` (LF ; il fera tourner `cargo test --lib` des Tasks 3 à 8 avec le vrai moteur) :

```yaml
name: Windows sync tests

# Le moteur de synchronisation intégré de l'app PC (Rust) : les tests unitaires ET ceux qui lancent de vrais
# Syncthing (reprise depuis un Syncthing installé, appairage par QR code, synchro dans les deux sens).
# Le binaire est le syncthing.exe officiel de la version épinglée, vérifié par scripts/fetch-syncthing-windows.mjs.
on:
    pull_request:
        paths:
            - "apps/windows/src-tauri/**"
            - "scripts/fetch-syncthing-windows.mjs"
            - "apps/android/native/syncthing/version.env"
            - ".github/workflows/windows-sync-tests.yml"
    workflow_dispatch:

permissions:
    contents: read

jobs:
    rust:
        name: Moteur de synchronisation (Rust)
        runs-on: windows-latest
        env:
            # Les tests à vrai moteur refusent de se sauter eux-mêmes quand CI est posé et que le binaire manque.
            CI: "true"
        steps:
            - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
              with:
                  ref: ${{ github.event.pull_request.head.sha || github.sha }}

            - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
              with:
                  node-version: "20"

            - name: Réutiliser le cache Rust
              uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
              with:
                  path: |
                      ~/.cargo/registry
                      ~/.cargo/git
                      apps/windows/src-tauri/target
                  key: cargo-${{ runner.os }}-sync-${{ github.run_id }}
                  restore-keys: cargo-${{ runner.os }}-

            - name: Poser le moteur Syncthing vérifié
              id: engine
              shell: bash
              run: echo "binary=$(node scripts/fetch-syncthing-windows.mjs)" >> "$GITHUB_OUTPUT"

            - name: Tester le moteur de synchronisation
              working-directory: apps/windows/src-tauri
              env:
                  SYNCTHING_BINARY: ${{ steps.engine.outputs.binary }}
              run: cargo test --lib
```

- [ ] **Step 6 : Poser le moteur pour de vrai, puis lancer les tests**

Run : `node scripts/fetch-syncthing-windows.mjs`
Expected (première fois, ~45 s) : une seule ligne, `C:\dev\neo-calendar\apps\windows\src-tauri\binaries\syncthing-x86_64-pc-windows-msvc.exe`. Deuxième lancement : la même ligne en moins d'une seconde, sans réseau.

Run : `node scripts/fetch-syncthing-windows.mjs; (Get-FileHash apps\windows\src-tauri\binaries\syncthing-x86_64-pc-windows-msvc.exe -Algorithm SHA256).Hash.ToLower()`
Expected : `36a0f7bc372f64fa7cc4f5654fa324c0dd9f7fef2e07565e00c6e1cf73f50344`.

Essai négatif : changer provisoirement les deux premiers caractères de `SYNCTHING_WINDOWS_ZIP_SHA256`, supprimer le binaire, relancer. Expected : `ERREUR : SHA-256 de syncthing-windows-amd64-v2.1.5.zip différent de l'épinglage du dépôt`, code de sortie 1. Remettre la valeur.

Run : `node --test scripts/fetch-syncthing-windows.test.mjs scripts/syncthing-pins.test.mjs scripts/release-workflow.test.mjs`
Expected : tous verts (les 6 tests de ce fichier + ceux de la partie 1).

- [ ] **Step 7 : Valider le sidecar jusqu'au bout**

Run : `npm test` (racine). Expected : Jest et `node --test` verts.
Run : `cd apps\windows\src-tauri; cargo check --lib`. Expected : `Finished` (tauri-build a trouvé le sidecar).

- [ ] **Step 8 : Commit**

```bash
git add scripts/fetch-syncthing-windows.mjs scripts/fetch-syncthing-windows.test.mjs .github/workflows/windows-sync-tests.yml .github/workflows/release.yml .github/workflows/windows-tauri-package-validation.yml apps/android/native/syncthing/version.env .gitignore apps/windows/scripts/tauri-runner.mjs apps/windows/src-tauri/tauri.conf.json
git commit -m "PC : le syncthing.exe officiel, vérifié (gpg + SHA-256 épinglés), embarqué comme sidecar Tauri" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

(`tauri.conf.json` est commité ici : le protocole « Vérifier une modification d'interface » du `CLAUDE.md` du projet fait `git checkout` de ce fichier après un `npm run dev`, ce qui doit rendre la version AVEC `externalBin`.)

---

### Task 2 : Essais préalables : confirmer les points tranchés, mesurer le lancement actuel

**Files:**
- Create (jetable, ignoré par git) : `.superpowers/syncthing/pc/essais-pc.mjs`
- Create (ignoré par git) : `.superpowers/syncthing/essais-pc.md`

**Interfaces:**
- Consumes: le sidecar de la Task 1.
- Produces: la preuve écrite des quatre décisions des Global Constraints, et le temps de lancement de l'app PC installée (référence de la Task 12). Aucun code de production.

À la rédaction du plan, ces essais ont été faits et donnent les résultats cités. L'agent les REFAIT (deux vrais moteurs officiels dans des dossiers temporaires, aucun port ni dossier du vrai Syncthing) et note l'écart éventuel.

- [ ] **Step 1 : Écrire le script d'essai**

Créer `.superpowers/syncthing/pc/essais-pc.mjs` :

```js
// Essais jetables de la partie 2 (PC) : deux vrais Syncthing v2.1.5 officiels dans des dossiers temporaires, ports tirés au
// hasard, SANS découverte locale (l'UDP 21027 est celui du vrai Syncthing de l'utilisateur) : aucun port ni dossier du vrai
// Syncthing n'est approché. On ne termine que les processus lancés ici (par leur objet `child`), jamais par leur nom.
//
//   SYNCTHING_BINARY=<syncthing.exe> node essais-pc.mjs
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.env.SYNCTHING_BINARY;
if (!EXE) throw new Error("SYNCTHING_BINARY est requis");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () =>
    new Promise((resolve) => {
        const server = createServer().listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });

async function engine(name) {
    const home = mkdtempSync(join(tmpdir(), "st-essai-"));
    const generated = execFileSync(EXE, ["generate", `--home=${home}`], { encoding: "utf8" });
    const config = readFileSync(join(home, "config.xml"), "utf8");
    const listen = await freePort();
    const gui = await freePort();
    const key = `essai-${name}-0123456789abcdef`;
    const quiet = config
        .replace(/<listenAddress>[^<]*<\/listenAddress>\s*/g, "")
        .replace("</options>", `<listenAddress>tcp://127.0.0.1:${listen}</listenAddress></options>`)
        .replace(/<(localAnnounceEnabled|globalAnnounceEnabled|relaysEnabled|natEnabled|startBrowser|crashReportingEnabled)>true</g, "<$1>false<")
        .replace(/<device id="([^"]+)" name="[^"]*"/, `<device id="$1" name="${name}"`);
    writeFileSync(join(home, "config.xml"), quiet);
    const child = spawn(EXE, ["serve", `--home=${home}`, "--no-browser", "--no-restart", "--no-upgrade", "--log-file=-"], {
        env: { ...process.env, STGUIADDRESS: `127.0.0.1:${gui}`, STGUIAPIKEY: key, STNORESTART: "1", STNOUPGRADE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const call = async (method, path, body, withKey = true) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                const response = await fetch(`http://127.0.0.1:${gui}${path}`, {
                    method,
                    headers: { ...(withKey ? { "X-API-Key": key } : {}), "Content-Type": "application/json" },
                    body: body ? JSON.stringify(body) : undefined,
                });
                return { code: response.status, body: await response.text() };
            } catch {
                await sleep(300); // l'interface se recharge après un changement de configuration
            }
        }
        throw new Error(`${path} ne répond pas`);
    };
    for (let i = 0; i < 60 && (await call("GET", "/rest/noauth/health", null, false).catch(() => ({ code: 0 }))).code !== 200; i++) await sleep(500);
    const id = JSON.parse((await call("GET", "/rest/system/status")).body).myID;
    return {
        home, generated, config, listen, call, id, child,
        log: () => output,
        stop: async () => {
            await call("POST", "/rest/system/shutdown").catch(() => undefined);
            await sleep(2000);
            child.kill();
        },
    };
}

const A = await engine("PC-essai");
const B = await engine("tel-essai");
try {
    console.log("== 1. Configuration générée par `syncthing generate` (aucune écriture ailleurs que dans le dossier temporaire)");
    console.log("   dossier par défaut dans la config :", /<folder id="[^"]+"/.test(A.config.replace(/<defaults>[\s\S]*<\/defaults>/, "")) ? "OUI" : "non");
    console.log("   ports tirés libres par generate :", /<address>127\.0\.0\.1:\d+<\/address>/.test(A.config), /<listenAddress>tcp:\/\/0\.0\.0\.0:\d+/.test(A.config));
    console.log("   journal sur stdout (--log-file=-) :", /INF /.test(A.log()) ? "oui" : "NON");

    console.log("== 2. Interface web protégée, clé d'API toujours acceptée");
    console.log("   PATCH gui                     ", (await A.call("PATCH", "/rest/config/gui", { user: "neo", password: "mot-de-passe-aleatoire" })).code);
    console.log("   sans clé /rest/system/status  ", (await A.call("GET", "/rest/system/status", null, false)).code);
    console.log("   avec clé                      ", (await A.call("GET", "/rest/system/status")).code);
    const gui = JSON.parse((await A.call("GET", "/rest/config/gui")).body);
    console.log("   mot de passe stocké haché     ", String(gui.password).startsWith("$2"));

    console.log("== 3. Le nom présenté pendant l'appairage est lisible par le PC (/rest/cluster/pending/devices)");
    const code = "K7Q2M9XPAB";
    await B.call("PATCH", `/rest/config/devices/${B.id}`, { name: `Pixel essai [NC:${code}]` });
    await B.call("PUT", `/rest/config/devices/${A.id}`, { deviceID: A.id, name: "PC", addresses: [`tcp://127.0.0.1:${A.listen}`] });
    for (let i = 0; i < 40; i++) {
        const pending = JSON.parse((await A.call("GET", "/rest/cluster/pending/devices")).body);
        if (Object.keys(pending).length) {
            console.log("   pending chez le PC            ", JSON.stringify(Object.values(pending)[0]));
            break;
        }
        await sleep(1000);
    }
} finally {
    await A.stop();
    await B.stop();
}
```

- [ ] **Step 2 : Le lancer**

Run : `$env:SYNCTHING_BINARY = (node scripts/fetch-syncthing-windows.mjs); node .superpowers/syncthing/pc/essais-pc.mjs`
Expected (obtenu le 2026-10-02) :

```
== 1. Configuration générée par `syncthing generate` (aucune écriture ailleurs que dans le dossier temporaire)
   dossier par défaut dans la config : non
   ports tirés libres par generate : true true
   journal sur stdout (--log-file=-) : oui
== 2. Interface web protégée, clé d'API toujours acceptée
   PATCH gui                      200
   sans clé /rest/system/status   403
   avec clé                       200
   mot de passe stocké haché      true
== 3. Le nom présenté pendant l'appairage est lisible par le PC (/rest/cluster/pending/devices)
   pending chez le PC             {"time":"…","name":"Pixel essai [NC:K7Q2M9XPAB]","address":"127.0.0.1:…"}
```

Ce que chaque ligne tranche : (1) un moteur neuf n'a AUCUN dossier (la v2 ne crée plus de « Default Folder ») et `generate` tire déjà des ports libres ; (2) la clé d'API passe même quand un mot de passe est posé, et sans elle le moteur répond 403 ; (3) **le nom que le téléphone se donne est exposé tel quel par `/rest/cluster/pending/devices`** (dans le code : `hello.DeviceName` = `myCfg.Name` de l'appareil qui se connecte, recopié dans `AddOrUpdatePendingDevice`) : c'est le canal du code d'appairage. Si une de ces lignes diffère (version du binaire, autre format), s'arrêter et le dire : toute la partie 3 en dépend.

- [ ] **Step 3 : Constats par lecture (pas d'essai possible sans toucher aux ports du vrai Syncthing)**

Noter dans `essais-pc.md`, avec les chemins relus dans `C:\dev\syncthing-essais\src-tgz\syncthing` (le tarball signé de la partie 1) :
1. Pas de canal nommé : `grep -rn "npipe" lib cmd` ne trouve rien. Socket Unix : `lib/api/api.go:178` (`guiCfg.Network() == "unix"`) existe, mais `std::os::unix::net` n'existe pas sous Windows : décision TCP `127.0.0.1` + clé d'API + identifiant et mot de passe.
2. Découverte locale : `lib/beacon/broadcast.go` n'écoute en IPv4 que sur `:21027` sans `SO_REUSEADDR` et n'en journalise l'échec qu'en DEBUG (essai 2 de la partie 1) : décision `localAnnounceEnabled = false`, sans lancer d'essai sur le port 21027 du vrai Syncthing.
3. Zone de notification : `rg "tray-icon" apps/windows/src-tauri/Cargo.toml` (déjà activé) et `rg "fn build_tray|TRAY_READY|CloseRequested" apps/windows/src-tauri/src/lib.rs` (déjà là) ; version : `rg -n -A1 '^name = "tauri"$' apps/windows/src-tauri/Cargo.lock` (2.11.5).

- [ ] **Step 4 : Mesurer le lancement de l'app PC actuelle (référence)**

L'app installée est la 1.88.0 (`%LOCALAPPDATA%\Programs\Neo Calendar\neo-calendar.exe`, à vérifier : `Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory`). Fermer l'app avant chaque mesure (Quitter dans le menu de l'icône). Mesurer le délai entre `Start-Process` et la première fenêtre visible, 7 fois, en prenant la médiane :

```powershell
function Measure-Launch([string]$Exe, [int]$Runs = 7) {
    $times = foreach ($i in 1..$Runs) {
        $started = [DateTime]::UtcNow
        $process = Start-Process -FilePath $Exe -PassThru
        $deadline = $started.AddSeconds(30)
        while ([DateTime]::UtcNow -lt $deadline) {
            $process.Refresh()
            if ($process.MainWindowHandle -ne 0) { break }
            Start-Sleep -Milliseconds 20
        }
        $elapsed = ([DateTime]::UtcNow - $started).TotalMilliseconds
        Stop-Process -Id $process.Id   # le PID qu'on vient de lancer, jamais un nom
        Start-Sleep -Seconds 2
        [int]$elapsed
    }
    $sorted = $times | Sort-Object
    [pscustomobject]@{ Runs = ($times -join ' '); MedianMs = $sorted[[int][math]::Floor($Runs / 2)] }
}
Measure-Launch "$env:LOCALAPPDATA\Programs\Neo Calendar\neo-calendar.exe"
```

Si l'app exige son instance unique (`single-instance`), s'assurer qu'aucune autre n'est lancée. Noter `MedianMs` dans `essais-pc.md` : c'est la référence que la Task 12 compare (régression de plus de 100 ms en médiane : la livraison est bloquée).

- [ ] **Step 5 : Écrire `essais-pc.md` et vérifier que rien ne traîne**

Run : `Get-CimInstance Win32_Process -Filter "Name='syncthing.exe'" | Select-Object ProcessId, ExecutablePath`
Expected : seulement les `syncthing.exe` qui ne sont pas les nôtres (le vrai Syncthing d'Ahmed, Neo Quiz) ; aucun dont le chemin contient `st-essai-` ou `.superpowers`. On ne termine rien d'autre que ce que le script a lancé (il l'arrête lui-même par son objet `child`). `.superpowers` est ignoré par git : pas de commit pour cette tâche.

---

### Task 3 : Rust, socle pur : configuration imposée, client REST, ports, journal, supervision, réglages

**Files:**
- Modify: `apps/windows/src-tauri/Cargo.toml` (dépendances, fonctionnalité `windows-sys`)
- Modify: `apps/windows/src-tauri/src/lib.rs` (`mod sync;`)
- Create: `apps/windows/src-tauri/src/sync/{mod.rs,config.rs,api.rs,testing.rs,ports.rs,log.rs,supervision.rs,settings.rs}`

**Interfaces:**
- Consumes: rien (premiers modules).
- Produces: `config::{options, options_json, device, folder, folder_devices, new_folder_id, random_chars, prepare_config, listen_addresses, FOLDER_LABEL, RELAY_POOL}` ; `api::{HttpTransport, UreqTransport, SyncthingApi, ApiError, ConfiguredFolder, ConfiguredDevice, PendingDevice, FolderState, urlencode}` avec `SyncthingApi::{new, is_healthy, my_id, patch_options, devices, put_device, remove_device, folders, folder_config, put_folder, set_folder_devices, remove_folder, pending_devices, dismiss_pending_device, connections, last_seen, folder_state, shutdown}` ; `testing::{FakeTransport, real_binary, OldSyncthing}` ; `ports::{pick_listen_port, pick_gui_port, pick_free_port, binds_tcp_and_udp}` ; `log::RotatingLog::{new, write, note, read_all}` ; `supervision::{EngineState, RestartPolicy, Decision}` ; `settings::SyncSettings::{load, save, ensure_gui_credentials}`.

Les commandes sont à lancer dans `C:\dev\neo-calendar\apps\windows\src-tauri`. Chaque module suit le même rythme : tests seuls (la compilation échoue), puis l'implémentation AU-DESSUS du bloc `#[cfg(test)]` (le fichier final est l'implémentation suivie des tests).

- [ ] **Step 1 : Dépendances et squelette**

`apps/windows/src-tauri/Cargo.toml` :

```diff
--- a/apps/windows/src-tauri/Cargo.toml
+++ b/apps/windows/src-tauri/Cargo.toml
@@ -27,4 +27,9 @@
 tauri-plugin-notification = "2.3.3"
 tauri-plugin-autostart = "2"
+ureq = { version = "2", default-features = false }
+quick-xml = "0.41"
+bcrypt = "0.17"
+qrcode = { version = "0.14", default-features = false, features = ["svg"] }
+getrandom = "0.3"
 
 [target.'cfg(windows)'.dependencies]
@@ -35,6 +40,10 @@
     "Win32_System_DataExchange",
     "Win32_System_Memory",
+    "Win32_System_Threading",
     "Win32_System_Ole",
     "Win32_UI_Shell",
     "Win32_UI_WindowsAndMessaging",
 ] }
+
+[dev-dependencies]
+tempfile = "3"
```

`apps/windows/src-tauri/src/lib.rs` : déclarer le module avant `window_commands` (le hunk du début du fichier, seul pour l'instant ; les autres hunks de `lib.rs` sont à la Task 8) :

```diff
--- a/apps/windows/src-tauri/src/lib.rs
+++ b/apps/windows/src-tauri/src/lib.rs
@@ -1,2 +1,3 @@
+mod sync;
 #[cfg(windows)]
 mod window_commands;
```

Créer `apps/windows/src-tauri/src/sync/mod.rs` (les modules s'ajoutent un à un aux étapes suivantes) :

```rust
pub mod config;
```

- [ ] **Step 2 : `config.rs`, tests seuls**

Créer `apps/windows/src-tauri/src/sync/config.rs` avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const GENERATED: &str = r#"<configuration version="52">
    <device id="AAAA" name="PC d'Ahmed &amp; fils" compression="metadata">
        <address>dynamic</address>
    </device>
    <gui enabled="true" tls="false" sendBasicAuthPrompt="false">
        <address>127.0.0.1:64119</address>
        <apikey>GC36hTWQs7j2N9csTHm9NWuNKSYsrFzi</apikey>
        <user>ancien</user>
    </gui>
    <options>
        <listenAddress>tcp://0.0.0.0:64122</listenAddress>
        <listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress>
        <globalAnnounceEnabled>true</globalAnnounceEnabled>
        <localAnnounceEnabled>true</localAnnounceEnabled>
        <relaysEnabled>true</relaysEnabled>
        <startBrowser>true</startBrowser>
        <urAccepted>0</urAccepted>
        <autoUpgradeIntervalH>12</autoUpgradeIntervalH>
        <crashReportingEnabled>true</crashReportingEnabled>
        <natEnabled>true</natEnabled>
    </options>
</configuration>"#;

    fn count(haystack: &str, needle: &str) -> usize {
        haystack.matches(needle).count()
    }

    #[test]
    fn the_options_body_carries_the_imposed_settings() {
        let body = options_json(22001);
        assert_eq!(body["autoUpgradeIntervalH"], 0);
        assert_eq!(body["urAccepted"], -1);
        assert_eq!(body["crashReportingEnabled"], false);
        assert_eq!(body["localAnnounceEnabled"], false);
        assert_eq!(body["globalAnnounceEnabled"], true);
        assert_eq!(body["relaysEnabled"], true);
        assert_eq!(body["listenAddresses"][0], "tcp://0.0.0.0:22001");
        assert_eq!(body["listenAddresses"][1], "quic://0.0.0.0:22001");
        assert_eq!(body["listenAddresses"][2], RELAY_POOL);
    }

    #[test]
    fn prepare_config_imposes_options_before_the_first_serve() {
        let out = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        assert!(out.contains("<localAnnounceEnabled>false</localAnnounceEnabled>"));
        assert!(out.contains("<autoUpgradeIntervalH>0</autoUpgradeIntervalH>"));
        assert!(out.contains("<urAccepted>-1</urAccepted>"));
        assert!(out.contains("<crashReportingEnabled>false</crashReportingEnabled>"));
        assert!(out.contains("<startBrowser>false</startBrowser>"));
        assert!(out.contains("<listenAddress>tcp://0.0.0.0:50123</listenAddress>"));
        assert!(out.contains("<listenAddress>quic://0.0.0.0:50123</listenAddress>"));
        assert!(!out.contains("64122"), "l'ancien port d'écoute est retiré");
        assert_eq!(count(&out, "<listenAddress>"), 3);
        assert_eq!(count(&out, "<localAnnounceEnabled>"), 1);
        // Ce que l'app ne règle pas traverse tel quel.
        assert!(out.contains("<natEnabled>true</natEnabled>"));
        assert!(out.contains(r#"name="PC d'Ahmed &amp; fils""#));
        assert!(out.contains("<apikey>GC36hTWQs7j2N9csTHm9NWuNKSYsrFzi</apikey>"));
    }

    #[test]
    fn prepare_config_locks_the_web_interface() {
        let out = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        assert!(out.contains("<user>neo</user>"));
        assert!(out.contains("<password>$2b$10$hash</password>"));
        assert!(!out.contains("ancien"));
        assert_eq!(count(&out, "<user>"), 1);
    }

    #[test]
    fn prepare_config_is_idempotent() {
        let once = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        let twice = prepare_config(&once, 50123, "neo", "$2b$10$hash").unwrap();
        assert_eq!(count(&twice, "<listenAddress>"), 3);
        assert_eq!(count(&twice, "<password>"), 1);
        assert_eq!(once, twice);
    }

    #[test]
    fn prepare_config_refuses_what_is_not_a_syncthing_config() {
        assert!(prepare_config("<configuration></configuration>", 1, "u", "h").is_err());
        assert!(prepare_config("pas du xml <<<", 1, "u", "h").is_err());
        let doctype = "<!DOCTYPE x [<!ENTITY a \"b\">]><configuration><options></options><gui></gui></configuration>";
        assert!(prepare_config(doctype, 1, "u", "h").unwrap_err().contains("type"));
    }

    #[test]
    fn the_folder_body_is_send_receive_with_a_thirty_day_trashcan() {
        let body = folder("neo-aaaaa-bbbbb", "Neo Calendar", "C:\\Neo Calendar", &["ME".to_string(), "ME".to_string(), "TEL".to_string()]);
        assert_eq!(body["type"], "sendreceive");
        assert_eq!(body["path"], "C:\\Neo Calendar");
        assert_eq!(body["fsWatcherEnabled"], true);
        assert_eq!(body["versioning"]["type"], "trashcan");
        assert_eq!(body["versioning"]["params"]["cleanoutDays"], "30");
        assert_eq!(body["devices"].as_array().unwrap().len(), 2, "pas de doublon");
    }

    #[test]
    fn a_new_remote_device_is_never_an_introducer_nor_auto_accepting() {
        let body = device("ABC", "Pixel");
        assert_eq!(body["introducer"], false);
        assert_eq!(body["autoAcceptFolders"], false);
        assert_eq!(body["addresses"][0], "dynamic");
    }

    #[test]
    fn folder_ids_have_the_expected_shape_and_differ() {
        let a = new_folder_id();
        let b = new_folder_id();
        assert_ne!(a, b);
        assert_eq!(a.len(), "neo-xxxxx-xxxxx".len());
        assert!(a.starts_with("neo-"));
        assert!(a[4..].chars().all(|c| c == '-' || c.is_ascii_lowercase() || ('2'..='7').contains(&c)));
    }
}
```

- [ ] **Step 3 : Voir l'échec**

Run : `cargo test --lib sync::config::`
Expected : échec de compilation (`cannot find function \`options_json\` in this scope`, `prepare_config`, `folder`…).

- [ ] **Step 4 : `config.rs`, implémentation**

Placer ce code AU-DESSUS du bloc `#[cfg(test)]` du fichier :

```rust
//! Ce que l'app impose au moteur : fonctions pures, testées sans moteur. Les noms de champs sont ceux
//! de `lib/config/` de la v2.1.5 (les mêmes réglages que l'Android).

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use serde_json::{json, Map, Value};
use std::io::Cursor;

/// Le serveur de relais public : sans lui, pas de synchro hors du même réseau quand aucune connexion directe n'est possible.
pub const RELAY_POOL: &str = "dynamic+https://relays.syncthing.net/endpoint";
pub const TRASHCAN_DAYS: &str = "30";
pub const FOLDER_LABEL: &str = "Neo Calendar";

pub enum Opt {
    Bool(bool),
    Int(i64),
    List(Vec<String>),
}

pub fn listen_addresses(port: u16) -> Vec<String> {
    vec![format!("tcp://0.0.0.0:{port}"), format!("quic://0.0.0.0:{port}"), RELAY_POOL.to_string()]
}

/// Les options imposées, sous le nom de leur élément XML (`listenAddress` : un élément par adresse).
/// Pas de mise à jour automatique (l'app fixe la version), pas de statistiques d'usage ni de rapport de
/// plantage, découverte globale et relais activés, découverte locale désactivée (le port UDP 21027 n'est
/// pas partageable avec un Syncthing installé sur le même PC : le second à démarrer y perd en silence).
pub fn options(port: u16) -> Vec<(&'static str, Opt)> {
    vec![
        ("autoUpgradeIntervalH", Opt::Int(0)),
        ("urAccepted", Opt::Int(-1)),
        ("crashReportingEnabled", Opt::Bool(false)),
        ("startBrowser", Opt::Bool(false)),
        ("globalAnnounceEnabled", Opt::Bool(true)),
        ("localAnnounceEnabled", Opt::Bool(false)),
        ("relaysEnabled", Opt::Bool(true)),
        ("listenAddress", Opt::List(listen_addresses(port))),
    ]
}

/// Le corps du PATCH `/rest/config/options` : les mêmes options (l'API REST reste la source de vérité après le démarrage).
pub fn options_json(port: u16) -> Value {
    let mut map = Map::new();
    for (key, opt) in options(port) {
        match opt {
            Opt::Bool(b) => map.insert(key.to_string(), json!(b)),
            Opt::Int(i) => map.insert(key.to_string(), json!(i)),
            Opt::List(list) => map.insert("listenAddresses".to_string(), json!(list)),
        };
    }
    Value::Object(map)
}

/// Un appareil distant, en PUT sur `/rest/config/devices/{id}`. Adresse « dynamic » : découverte globale.
pub fn device(device_id: &str, name: &str) -> Value {
    json!({
        "deviceID": device_id,
        "name": name,
        "addresses": ["dynamic"],
        "compression": "metadata",
        "introducer": false,
        "autoAcceptFolders": false,
        "paused": false
    })
}

/// Le dossier de notes, en PUT sur `/rest/config/folders/{id}` : envoi et réception, surveillance des
/// fichiers, `ignorePerms` (les droits d'un autre système n'ont pas de sens ici), corbeille de 30 jours
/// (une note écrasée ou supprimée par une synchro reste dans `.stversions`). `device_ids` contient
/// l'identifiant de CET appareil.
pub fn folder(id: &str, label: &str, path: &str, device_ids: &[String]) -> Value {
    json!({
        "id": id,
        "label": label,
        "path": path,
        "type": "sendreceive",
        "fsWatcherEnabled": true,
        "ignorePerms": true,
        "rescanIntervalS": 3600,
        "devices": folder_devices(device_ids),
        "versioning": { "type": "trashcan", "params": { "cleanoutDays": TRASHCAN_DAYS } }
    })
}

/// La liste `devices` d'un dossier, sans doublon.
pub fn folder_devices(device_ids: &[String]) -> Value {
    let mut seen: Vec<&String> = Vec::new();
    for id in device_ids {
        if !seen.contains(&id) {
            seen.push(id);
        }
    }
    Value::Array(seen.iter().map(|id| json!({ "deviceID": id })).collect())
}

/// Des caractères tirés au hasard dans un alphabet de 32 symboles (5 bits chacun : aucun biais de tirage).
pub fn random_chars(alphabet: &[u8; 32], len: usize) -> String {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).expect("le générateur aléatoire du système");
    bytes.iter().map(|b| alphabet[(*b & 31) as usize] as char).collect()
}

const ID_ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

/// Un identifiant de dossier du genre `neo-k3x9a-2fq7z`.
pub fn new_folder_id() -> String {
    format!("neo-{}-{}", random_chars(ID_ALPHABET, 5), random_chars(ID_ALPHABET, 5))
}

fn xml_text(opt: &Opt) -> Vec<String> {
    match opt {
        Opt::Bool(b) => vec![b.to_string()],
        Opt::Int(i) => vec![i.to_string()],
        Opt::List(list) => list.clone(),
    }
}

/// Remplace, dans `<configuration><section>`, les éléments enfants nommés dans `values` par leurs nouvelles
/// valeurs (un élément par valeur, ajoutés en fin de section). Le reste du fichier traverse tel quel.
fn set_section(xml: &str, section: &str, values: &[(&str, Vec<String>)]) -> Result<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut writer = Writer::new(Cursor::new(Vec::new()));
    let mut path: Vec<String> = Vec::new();
    let mut skipping = 0usize;
    let mut found = false;
    let managed = |path: &[String], name: &str| {
        path.len() == 2 && path[1] == section && values.iter().any(|(tag, _)| *tag == name)
    };
    loop {
        let event = reader.read_event().map_err(|e| format!("config.xml illisible : {e}"))?;
        match event {
            Event::Eof => break,
            Event::Start(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if skipping > 0 {
                    skipping += 1;
                    continue;
                }
                if managed(&path, &name) {
                    skipping = 1;
                    continue;
                }
                path.push(name);
                writer.write_event(event).map_err(|e| e.to_string())?;
            }
            Event::Empty(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if skipping > 0 || managed(&path, &name) {
                    continue;
                }
                writer.write_event(event).map_err(|e| e.to_string())?;
            }
            Event::End(ref e) => {
                if skipping > 0 {
                    skipping -= 1;
                    continue;
                }
                if path.len() == 2 && path[1] == section {
                    found = true;
                    for (tag, list) in values {
                        for value in list {
                            writer.write_event(Event::Start(BytesStart::new(*tag))).map_err(|e| e.to_string())?;
                            writer.write_event(Event::Text(BytesText::new(value))).map_err(|e| e.to_string())?;
                            writer.write_event(Event::End(BytesEnd::new(*tag))).map_err(|e| e.to_string())?;
                        }
                    }
                }
                path.pop();
                writer.write_event(Event::End(e.borrow())).map_err(|e| e.to_string())?;
            }
            _ if skipping > 0 => {}
            _ => writer.write_event(event).map_err(|e| e.to_string())?,
        }
    }
    if !found {
        return Err(format!("config.xml sans <{section}>"));
    }
    String::from_utf8(writer.into_inner().into_inner()).map_err(|e| e.to_string())
}

/// Pose, dans le `config.xml` qu'un `syncthing generate` a écrit, les options imposées ET l'identifiant et le
/// mot de passe (haché, bcrypt) de l'interface web, AVANT le premier `serve` : le moteur n'écoute jamais sur
/// un port non choisi, n'annonce jamais sur le réseau local, et son interface web n'est jamais ouverte.
/// Idempotent : l'appliquer deux fois donne le même fichier.
pub fn prepare_config(xml: &str, port: u16, gui_user: &str, gui_password_hash: &str) -> Result<String, String> {
    if xml.to_ascii_lowercase().contains("<!doctype") {
        return Err("déclaration de type refusée dans config.xml".to_string());
    }
    let options: Vec<(&str, Vec<String>)> = options(port).iter().map(|(tag, opt)| (*tag, xml_text(opt))).collect();
    let with_options = set_section(xml, "options", &options)?;
    set_section(
        &with_options,
        "gui",
        &[("user", vec![gui_user.to_string()]), ("password", vec![gui_password_hash.to_string()])],
    )
}
```

- [ ] **Step 5 : Voir le succès**

Run : `cargo test --lib sync::config::`
Expected : `test result: ok. 8 passed; 0 failed`. (Au premier lancement la compilation des nouvelles dépendances prend quelques minutes, et `Cargo.lock` change : il est commité avec la tâche.)

- [ ] **Step 6 : `testing.rs` et `api.rs`, tests seuls**

`mod.rs` devient :

```rust
pub mod api;
pub mod config;

#[cfg(test)]
pub mod testing;
```

Créer `apps/windows/src-tauri/src/sync/testing.rs` (infrastructure de test : un transport factice ; les deux autres assistants, `real_binary` et `OldSyncthing`, s'ajoutent aux Tasks 5 et 7, quand les modules qu'ils utilisent existent) :

```rust
//! Un transport pour les tests : réponses fixées d'avance, liste des requêtes reçues.

use super::api::{HttpResult, HttpTransport};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Call {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
}

#[derive(Default)]
pub struct FakeTransport {
    pub calls: Mutex<Vec<Call>>,
    answers: Mutex<Vec<(String, u16, String)>>,
    once: Mutex<Vec<(String, String)>>,
}

impl FakeTransport {
    /// `key` = « MÉTHODE chemin » exact ; une clé qui finit par `*` répond à tout chemin qui commence par elle.
    /// La dernière réponse posée pour une même clé l'emporte.
    pub fn answer(&self, key: &str, body: &str) {
        self.answer_code(key, 200, body);
    }

    pub fn answer_code(&self, key: &str, code: u16, body: &str) {
        self.answers.lock().unwrap().push((key.to_string(), code, body.to_string()));
    }

    /// Une réponse consommée au premier appel qui correspond (avant les réponses permanentes) : pour une lecture qui change.
    pub fn answer_once(&self, key: &str, body: &str) {
        self.once.lock().unwrap().push((key.to_string(), body.to_string()));
    }

    pub fn sent(&self, method: &str, path: &str) -> Option<String> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|c| c.method == method && c.path == path)
            .and_then(|c| c.body.clone())
    }

    pub fn count(&self, method: &str, path_prefix: &str) -> usize {
        self.calls.lock().unwrap().iter().filter(|c| c.method == method && c.path.starts_with(path_prefix)).count()
    }
}

impl HttpTransport for FakeTransport {
    fn request(&self, method: &str, path: &str, body: Option<&str>, _timeout: Duration) -> Result<HttpResult, String> {
        self.calls.lock().unwrap().push(Call {
            method: method.to_string(),
            path: path.to_string(),
            body: body.map(str::to_string),
        });
        let key = format!("{method} {path}");
        {
            let mut once = self.once.lock().unwrap();
            if let Some(index) = once.iter().position(|(k, _)| *k == key) {
                let (_, text) = once.remove(index);
                return Ok(HttpResult { code: 200, body: text });
            }
        }
        let answers = self.answers.lock().unwrap();
        let found = answers
            .iter()
            .rev()
            .find(|(k, _, _)| *k == key)
            .or_else(|| answers.iter().rev().find(|(k, _, _)| k.ends_with('*') && key.starts_with(&k[..k.len() - 1])));
        match found {
            Some((_, code, text)) => Ok(HttpResult { code: *code, body: text.clone() }),
            None => Ok(HttpResult { code: 404, body: format!("pas de réponse prévue pour {key}") }),
        }
    }
}
```

Créer `apps/windows/src-tauri/src/sync/api.rs` avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;

    fn api(fake: &Arc<FakeTransport>) -> SyncthingApi {
        SyncthingApi::new(fake.clone())
    }

    #[test]
    fn urlencode_escapes_everything_but_unreserved() {
        assert_eq!(urlencode("AB-c_1.~"), "AB-c_1.~");
        assert_eq!(urlencode("a b/é"), "a%20b%2F%C3%A9");
    }

    #[test]
    fn pending_devices_read_the_name_the_device_presents() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/cluster/pending/devices",
            r#"{"ABC":{"time":"2026-10-02T18:23:21Z","name":"Pixel [NC:K7Q2M9XPAB]","address":"127.0.0.1:55148"}}"#,
        );
        let pending = api(&fake).pending_devices().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "ABC");
        assert_eq!(pending[0].name, "Pixel [NC:K7Q2M9XPAB]");
    }

    #[test]
    fn a_refusal_carries_the_code_and_an_excerpt() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer_code("PUT /rest/config/folders/f1", 400, "bad folder");
        let error = api(&fake).put_folder(&json!({"id": "f1"})).unwrap_err();
        assert_eq!(error.code, 400);
        assert!(error.message.contains("bad folder"));
    }

    #[test]
    fn folders_list_their_devices() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/config/folders",
            r#"[{"id":"f1","label":"Neo","path":"C:\\Neo","devices":[{"deviceID":"A"},{"deviceID":"B"}]}]"#,
        );
        let folders = api(&fake).folders().unwrap();
        assert_eq!(folders[0].path, "C:\\Neo");
        assert_eq!(folders[0].device_ids, vec!["A", "B"]);
    }

    #[test]
    fn shutdown_tolerates_a_dropped_connection_but_not_a_refusal() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer_code("POST /rest/system/shutdown", 403, "no");
        assert!(api(&fake).shutdown().is_err());
        let fake = Arc::new(FakeTransport::default());
        fake.answer("POST /rest/system/shutdown", "{}");
        assert!(api(&fake).shutdown().is_ok());
    }

    #[test]
    fn last_seen_maps_epoch_zero_to_never() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/stats/device",
            r#"{"A":{"lastSeen":"1970-01-01T00:00:00Z"},"B":{"lastSeen":"2026-10-02T10:00:00Z"}}"#,
        );
        let seen = api(&fake).last_seen().unwrap();
        assert_eq!(seen["A"], None);
        assert_eq!(seen["B"].as_deref(), Some("2026-10-02T10:00:00Z"));
    }
}
```

Run : `cargo test --lib sync::api::` ; Expected : échec de compilation (`cannot find type \`SyncthingApi\``).

- [ ] **Step 7 : `api.rs`, implémentation**

Placer AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! Le client de l'API REST de Syncthing v2 (chemins relus dans `lib/api/api.go` de la v2.1.5).
//! Bloquant : il tourne toujours hors du fil de l'interface.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;

pub struct HttpResult {
    pub code: u16,
    pub body: String,
}

/// Le transport HTTP. `Err` = pas de réponse du tout (moteur éteint, délai dépassé).
pub trait HttpTransport: Send + Sync {
    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        read_timeout: Duration,
    ) -> Result<HttpResult, String>;
}

/// HTTP sur `127.0.0.1` ; la clé d'API est ajoutée à chaque requête.
pub struct UreqTransport {
    base: String,
    key: String,
}

impl UreqTransport {
    pub fn new(address: &str, key: &str) -> Self {
        Self { base: format!("http://{address}"), key: key.to_string() }
    }
}

impl HttpTransport for UreqTransport {
    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        read_timeout: Duration,
    ) -> Result<HttpResult, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(2))
            .timeout_read(read_timeout)
            .timeout_write(Duration::from_secs(5))
            .build();
        let request = agent
            .request(method, &format!("{}{}", self.base, path))
            .set("X-API-Key", &self.key);
        let outcome = match body {
            Some(text) => request.set("Content-Type", "application/json").send_string(text),
            None => request.call(),
        };
        match outcome {
            Ok(response) => {
                let code = response.status();
                let body = response.into_string().map_err(|e| e.to_string())?;
                Ok(HttpResult { code, body })
            }
            Err(ureq::Error::Status(code, response)) => {
                Ok(HttpResult { code, body: response.into_string().unwrap_or_default() })
            }
            Err(ureq::Error::Transport(transport)) => Err(transport.to_string()),
        }
    }
}

/// `code` = 0 : le moteur n'a pas répondu.
#[derive(Debug, Clone, PartialEq)]
pub struct ApiError {
    pub code: u16,
    pub message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Clone, PartialEq)]
pub struct ConfiguredDevice {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConfiguredFolder {
    pub id: String,
    pub label: String,
    pub path: String,
    pub device_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PendingDevice {
    pub id: String,
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct FolderState {
    pub state: String,
    pub need_files: u64,
    pub need_bytes: u64,
    pub error: String,
}

/// Encodage d'une valeur de chemin ou de requête : tout ce qui n'est pas « non réservé » est échappé.
pub fn urlencode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => out.push(byte as char),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

#[derive(Clone)]
pub struct SyncthingApi {
    transport: Arc<dyn HttpTransport>,
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn folder_from(value: &Value) -> ConfiguredFolder {
    ConfiguredFolder {
        id: text(value, "id"),
        label: text(value, "label"),
        path: text(value, "path"),
        device_ids: value
            .get("devices")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(|d| text(d, "deviceID")).collect())
            .unwrap_or_default(),
    }
}

impl SyncthingApi {
    pub fn new(transport: Arc<dyn HttpTransport>) -> Self {
        Self { transport }
    }

    fn call(&self, method: &str, path: &str, body: Option<&Value>, timeout_ms: u64) -> ApiResult<String> {
        let payload = body.map(Value::to_string);
        let result = self
            .transport
            .request(method, path, payload.as_deref(), Duration::from_millis(timeout_ms))
            .map_err(|e| ApiError { code: 0, message: format!("Le moteur ne répond pas : {e}") })?;
        if !(200..300).contains(&result.code) {
            let excerpt: String = result.body.chars().take(200).collect();
            return Err(ApiError {
                code: result.code,
                message: format!("Syncthing a refusé {method} {path} ({}) : {excerpt}", result.code),
            });
        }
        Ok(result.body)
    }

    pub(crate) fn get(&self, path: &str) -> ApiResult<Value> {
        let body = self.call("GET", path, None, 15_000)?;
        serde_json::from_str(&body)
            .map_err(|e| ApiError { code: 0, message: format!("Réponse illisible pour {path} : {e}") })
    }

    /// Vrai quand le moteur répond (`/rest/noauth/health`). Ne lève jamais.
    pub fn is_healthy(&self) -> bool {
        matches!(
            self.transport.request("GET", "/rest/noauth/health", None, Duration::from_secs(3)),
            Ok(HttpResult { code: 200, .. })
        )
    }

    /// L'identifiant de CET appareil.
    pub fn my_id(&self) -> ApiResult<String> {
        Ok(text(&self.get("/rest/system/status")?, "myID"))
    }

    pub fn patch_options(&self, options: &Value) -> ApiResult<()> {
        self.call("PATCH", "/rest/config/options", Some(options), 15_000).map(|_| ())
    }

    pub fn devices(&self) -> ApiResult<Vec<ConfiguredDevice>> {
        let list = self.get("/rest/config/devices")?;
        Ok(list
            .as_array()
            .map(|items| {
                items.iter().map(|d| ConfiguredDevice { id: text(d, "deviceID"), name: text(d, "name") }).collect()
            })
            .unwrap_or_default())
    }

    pub fn put_device(&self, device: &Value) -> ApiResult<()> {
        let id = text(device, "deviceID");
        self.call("PUT", &format!("/rest/config/devices/{}", urlencode(&id)), Some(device), 15_000).map(|_| ())
    }

    pub fn remove_device(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/config/devices/{}", urlencode(id)), None, 15_000).map(|_| ())
    }

    pub fn folders(&self) -> ApiResult<Vec<ConfiguredFolder>> {
        let list = self.get("/rest/config/folders")?;
        Ok(list.as_array().map(|items| items.iter().map(folder_from).collect()).unwrap_or_default())
    }

    /// La configuration brute d'un dossier : la reprise la sauvegarde pour pouvoir le rendre tel quel.
    pub fn folder_config(&self, id: &str) -> ApiResult<Value> {
        self.get(&format!("/rest/config/folders/{}", urlencode(id)))
    }

    pub fn put_folder(&self, folder: &Value) -> ApiResult<()> {
        let id = text(folder, "id");
        self.call("PUT", &format!("/rest/config/folders/{}", urlencode(&id)), Some(folder), 15_000).map(|_| ())
    }

    pub fn set_folder_devices(&self, folder_id: &str, device_ids: &[String]) -> ApiResult<()> {
        let body = json!({ "devices": super::config::folder_devices(device_ids) });
        self.call("PATCH", &format!("/rest/config/folders/{}", urlencode(folder_id)), Some(&body), 15_000)
            .map(|_| ())
    }

    pub fn remove_folder(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/config/folders/{}", urlencode(id)), None, 15_000).map(|_| ())
    }

    /// Les appareils inconnus qui ont tenté de se connecter ; `name` est celui que l'appareil se donne.
    pub fn pending_devices(&self) -> ApiResult<Vec<PendingDevice>> {
        let map = self.get("/rest/cluster/pending/devices")?;
        Ok(map
            .as_object()
            .map(|entries| {
                entries
                    .iter()
                    .map(|(id, v)| PendingDevice { id: id.clone(), name: text(v, "name"), address: text(v, "address") })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub fn dismiss_pending_device(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/cluster/pending/devices?device={}", urlencode(id)), None, 15_000)
            .map(|_| ())
    }

    /// Pour chaque appareil : connecté ou non (`/rest/system/connections`).
    pub fn connections(&self) -> ApiResult<HashMap<String, bool>> {
        let value = self.get("/rest/system/connections")?;
        Ok(value
            .get("connections")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .map(|(id, c)| (id.clone(), c.get("connected").and_then(Value::as_bool).unwrap_or(false)))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Dernière connexion de chaque appareil (texte ISO), `None` s'il ne s'est jamais connecté.
    pub fn last_seen(&self) -> ApiResult<HashMap<String, Option<String>>> {
        let value = self.get("/rest/stats/device")?;
        Ok(value
            .as_object()
            .map(|m| {
                m.iter()
                    .map(|(id, s)| {
                        let seen = text(s, "lastSeen");
                        let never = seen.is_empty() || seen.starts_with("1970-") || seen.starts_with("0001-");
                        (id.clone(), if never { None } else { Some(seen) })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub fn folder_state(&self, folder_id: &str) -> ApiResult<FolderState> {
        let v = self.get(&format!("/rest/db/status?folder={}", urlencode(folder_id)))?;
        Ok(FolderState {
            state: text(&v, "state"),
            need_files: v.get("needFiles").and_then(Value::as_u64).unwrap_or(0),
            need_bytes: v.get("needBytes").and_then(Value::as_u64).unwrap_or(0),
            error: text(&v, "error"),
        })
    }

    /// Arrêt propre. Le moteur peut couper la connexion avant de répondre : ce n'est pas une erreur.
    pub fn shutdown(&self) -> ApiResult<()> {
        match self.call("POST", "/rest/system/shutdown", None, 3_000) {
            Err(e) if e.code != 0 => Err(e),
            _ => Ok(()),
        }
    }
}
```

Run : `cargo test --lib sync::api::` ; Expected : `test result: ok. 6 passed`.

- [ ] **Step 8 : `ports.rs`**

Ajouter `pub mod ports;` à `mod.rs`. Créer le fichier avec les tests seuls :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn it_skips_taken_and_privileged_ports() {
        let sequence = [80u16, 40000, 40001];
        let index = Cell::new(0usize);
        let candidate = || {
            let port = sequence[index.get()];
            index.set(index.get() + 1);
            port
        };
        let port = pick_free_port(&|p| p == 40001, &candidate, 10).unwrap();
        assert_eq!(port, 40001);
        assert_eq!(index.get(), 3);
    }

    #[test]
    fn it_gives_up_after_the_allowed_tries() {
        let error = pick_free_port(&|_| false, &|| 40000, 5).unwrap_err();
        assert!(error.contains("Aucun port libre"));
    }

    #[test]
    fn a_port_held_by_someone_else_is_not_free() {
        let held = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = held.local_addr().unwrap().port();
        assert!(!binds_loopback_tcp(port));
        drop(held);
        assert!(binds_loopback_tcp(port));
    }

    #[test]
    fn real_picks_are_usable() {
        assert!(pick_listen_port().unwrap() >= 1024);
        assert!(pick_gui_port().unwrap() >= 1024);
    }
}
```

Run : `cargo test --lib sync::ports::` ; Expected : échec de compilation (`cannot find function \`pick_free_port\``). Puis placer AU-DESSUS :

```rust
//! Des ports libres pour le moteur : un d'écoute (TCP et UDP : Syncthing écoute en TCP et en QUIC sur le
//! même numéro) et un pour l'interface REST (TCP, sur `127.0.0.1`).

use std::net::{TcpListener, UdpSocket};

/// Libre en TCP ET en UDP sur toutes les interfaces (là où le moteur écoute).
pub fn binds_tcp_and_udp(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok() && UdpSocket::bind(("0.0.0.0", port)).is_ok()
}

/// Libre en TCP sur la boucle locale (là où écoute l'interface REST).
pub fn binds_loopback_tcp(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn ephemeral_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .unwrap_or(0)
}

/// Un port libre selon `is_free`, tiré par le système (`candidate`) : au plus `tries` essais.
pub fn pick_free_port(
    is_free: &dyn Fn(u16) -> bool,
    candidate: &dyn Fn() -> u16,
    tries: usize,
) -> Result<u16, String> {
    for _ in 0..tries {
        let port = candidate();
        if port >= 1024 && is_free(port) {
            return Ok(port);
        }
    }
    Err("Aucun port libre trouvé pour la synchronisation.".to_string())
}

pub fn pick_listen_port() -> Result<u16, String> {
    pick_free_port(&binds_tcp_and_udp, &ephemeral_port, 50)
}

pub fn pick_gui_port() -> Result<u16, String> {
    pick_free_port(&binds_loopback_tcp, &ephemeral_port, 50)
}
```

Run : `cargo test --lib sync::ports::` ; Expected : `4 passed`.

- [ ] **Step 9 : `log.rs`**

Ajouter `pub mod log;`. Tests seuls :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_appends_and_reads_back_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 1000);
        log.note("un");
        log.note("deux");
        assert_eq!(log.read_all(), "un\ndeux\n");
    }

    #[test]
    fn it_never_exceeds_its_cap_and_keeps_the_newest_lines() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 100);
        for i in 0..50 {
            log.note(&format!("ligne {i:03}"));
        }
        let total = fs::metadata(dir.path().join("engine.log")).unwrap().len()
            + fs::metadata(dir.path().join("engine.log.1")).unwrap().len();
        assert!(total <= 100, "total {total}");
        assert!(log.read_all().ends_with("ligne 049\n"));
        assert!(!log.read_all().contains("ligne 000"));
    }

    #[test]
    fn a_huge_chunk_keeps_only_its_tail() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 100);
        let chunk = vec![b'x'; 500];
        log.write(&chunk);
        log.note("fin");
        assert!(log.read_all().len() <= 100);
        assert!(log.read_all().ends_with("fin\n"));
    }

    #[test]
    fn an_unwritable_log_never_panics() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("fichier");
        fs::write(&blocked, "x").unwrap();
        // Le « dossier » du journal est un fichier : l'ouverture échoue, l'écriture est perdue sans bruit.
        let log = RotatingLog::new(blocked.join("sous"), 100);
        log.note("perdue");
        assert_eq!(log.read_all(), "");
    }
}
```

Run : `cargo test --lib sync::log::` ; Expected : échec (`cannot find type \`RotatingLog\``). Puis AU-DESSUS :

```rust
//! Le journal du moteur (sa sortie) : deux fichiers, `engine.log` et `engine.log.1`, qui ne dépassent jamais
//! `max_bytes` à eux deux (1 Mo). Quand le fichier courant atteint la moitié, il devient `engine.log.1`
//! (l'ancien `.1` disparaît). Même principe que `RotatingLog` de l'Android.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct RotatingLog {
    current: PathBuf,
    previous: PathBuf,
    max_bytes: u64,
    inner: Mutex<Inner>,
}

struct Inner {
    out: Option<File>,
    size: u64,
}

impl RotatingLog {
    pub fn new(dir: PathBuf, max_bytes: u64) -> Self {
        Self {
            current: dir.join("engine.log"),
            previous: dir.join("engine.log.1"),
            max_bytes,
            inner: Mutex::new(Inner { out: None, size: 0 }),
        }
    }

    fn open(&self, inner: &mut Inner) -> std::io::Result<()> {
        if let Some(parent) = self.current.parent() {
            fs::create_dir_all(parent)?;
        }
        inner.size = fs::metadata(&self.current).map(|m| m.len()).unwrap_or(0);
        inner.out = Some(OpenOptions::new().create(true).append(true).open(&self.current)?);
        Ok(())
    }

    /// Ne rend jamais d'erreur : un journal qui ne peut pas écrire (disque plein, dossier disparu) perd la
    /// ligne, mais celui qui vide la sortie du processus doit continuer, sinon le moteur se bloque sur son tuyau.
    pub fn write(&self, bytes: &[u8]) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if self.write_locked(&mut inner, bytes).is_err() {
            inner.out = None;
        }
    }

    fn write_locked(&self, inner: &mut Inner, bytes: &[u8]) -> std::io::Result<()> {
        if inner.out.is_none() {
            self.open(inner)?;
        }
        let half = (self.max_bytes / 2) as usize;
        // Un seul morceau plus gros que la moitié du plafond : on n'en garde que la fin.
        let kept = &bytes[bytes.len().saturating_sub(half)..];
        if inner.size + kept.len() as u64 > half as u64 {
            inner.out = None;
            let _ = fs::remove_file(&self.previous);
            let _ = fs::rename(&self.current, &self.previous);
            self.open(inner)?;
        }
        let out = inner.out.as_mut().expect("ouvert juste au-dessus");
        out.write_all(kept)?;
        out.flush()?;
        inner.size += kept.len() as u64;
        Ok(())
    }

    /// Une ligne de l'app elle-même (« démarrage », « abandon »…), horodatée par l'appelant.
    pub fn note(&self, line: &str) {
        self.write(format!("{line}\n").as_bytes());
    }

    /// Tout le journal, le plus ancien d'abord.
    pub fn read_all(&self) -> String {
        let old = fs::read(&self.previous).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        let now = fs::read(&self.current).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        old + &now
    }
}
```

Run : `cargo test --lib sync::log::` ; Expected : `4 passed`.

- [ ] **Step 10 : `supervision.rs`**

Ajouter `pub mod supervision;`. Tests seuls :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn it_retries_after_2_4_8_16_seconds_then_gives_up_at_the_fifth_failure() {
        let mut policy = RestartPolicy::default();
        for (expected, attempt) in [(2, 1), (4, 2), (8, 3), (16, 4)] {
            assert_eq!(policy.on_exit(secs(1), true), Decision::RetryIn { delay: secs(expected), attempt });
        }
        assert_eq!(policy.on_exit(secs(1), true), Decision::GiveUp);
    }

    #[test]
    fn a_minute_of_stable_running_resets_the_count() {
        let mut policy = RestartPolicy::default();
        policy.on_exit(secs(1), true);
        policy.on_exit(secs(1), true);
        assert_eq!(policy.on_exit(secs(120), true), Decision::RetryIn { delay: secs(2), attempt: 1 });
    }

    #[test]
    fn an_engine_that_never_answered_is_never_stable() {
        let mut policy = RestartPolicy::default();
        for _ in 0..4 {
            policy.on_exit(secs(3600), false);
        }
        assert_eq!(policy.on_exit(secs(3600), false), Decision::GiveUp);
    }

    #[test]
    fn the_delay_is_capped() {
        let mut policy = RestartPolicy::new(100, secs(2), secs(10), secs(60));
        let mut last = Duration::ZERO;
        for _ in 0..30 {
            if let Decision::RetryIn { delay, .. } = policy.on_exit(secs(1), true) {
                last = delay;
            }
        }
        assert_eq!(last, secs(10));
    }

    #[test]
    fn the_state_serialises_with_a_kind_tag_for_the_page() {
        let json = serde_json::to_string(&EngineState::Backoff { attempt: 2, retry_in_ms: 4000, error: "x".into() }).unwrap();
        assert!(json.contains(r#""kind":"backoff""#));
        assert!(json.contains(r#""retryInMs":4000"#));
        assert_eq!(serde_json::to_string(&EngineState::BlockedByInstalled).unwrap(), r#"{"kind":"blockedByInstalled"}"#);
    }
}
```

Run : `cargo test --lib sync::supervision::` ; Expected : échec (`cannot find type \`RestartPolicy\``). Puis AU-DESSUS :

```rust
//! Quand relancer un moteur qui s'est arrêté seul : 2 s, 4 s, 8 s, 16 s, abandon au cinquième échec de suite
//! (même règle que l'Android).

use serde::Serialize;
use std::time::Duration;

/// Où en est le processus Syncthing.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EngineState {
    /// Pas lancé (ou arrêté proprement, ou synchro désactivée).
    Stopped,
    /// `syncthing.exe` est absent du dossier de l'application.
    Missing,
    /// Un Syncthing installé partage déjà le dossier : le moteur de l'app ne démarre pas dessus.
    BlockedByInstalled,
    Starting,
    Running,
    /// S'est arrêté de lui-même : une relance est programmée.
    #[serde(rename_all = "camelCase")]
    Backoff { attempt: u32, retry_in_ms: u64, error: String },
    /// Trop d'échecs de suite : plus de relance automatique jusqu'à une action de l'utilisateur.
    Failed { error: String },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Decision {
    RetryIn { delay: Duration, attempt: u32 },
    GiveUp,
}

pub struct RestartPolicy {
    max_failures: u32,
    base: Duration,
    cap: Duration,
    stable_after: Duration,
    failures: u32,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self::new(5, Duration::from_secs(2), Duration::from_secs(300), Duration::from_secs(60))
    }
}

impl RestartPolicy {
    pub fn new(max_failures: u32, base: Duration, cap: Duration, stable_after: Duration) -> Self {
        Self { max_failures, base, cap, stable_after, failures: 0 }
    }

    /// `ran` : durée de marche mesurée depuis l'instant où le moteur répondait. `answered = false` : il n'a
    /// jamais répondu (vivant mais muet, tué par l'app) : jamais stable, quelle que soit sa durée de vie.
    pub fn on_exit(&mut self, ran: Duration, answered: bool) -> Decision {
        if answered && ran >= self.stable_after {
            self.failures = 0;
        }
        self.failures += 1;
        if self.failures >= self.max_failures {
            return Decision::GiveUp;
        }
        let doubled = self.base.saturating_mul(1u32 << (self.failures - 1).min(20));
        Decision::RetryIn { delay: doubled.min(self.cap), attempt: self.failures }
    }
}
```

Run : `cargo test --lib sync::supervision::` ; Expected : `5 passed`.

- [ ] **Step 11 : `settings.rs`**

Ajouter `pub mod settings;`. Tests seuls :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_means_sync_is_off() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(SyncSettings::load(dir.path()), SyncSettings::default());
        assert!(!SyncSettings::load(dir.path()).enabled);
    }

    #[test]
    fn settings_survive_a_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let settings = SyncSettings {
            enabled: true,
            folder_path: Some("C:\\Neo Calendar".into()),
            listen_port: Some(40123),
            ..Default::default()
        };
        settings.save(dir.path()).unwrap();
        assert_eq!(SyncSettings::load(dir.path()), settings);
        assert!(!dir.path().join("settings.json.tmp").exists());
    }

    #[test]
    fn an_unreadable_file_is_set_aside_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), "{ pas du json").unwrap();
        assert_eq!(SyncSettings::load(dir.path()), SyncSettings::default());
        assert_eq!(fs::read_to_string(dir.path().join("settings.json.illisible")).unwrap(), "{ pas du json");
    }

    #[test]
    fn unknown_fields_and_missing_fields_are_tolerated() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), r#"{"enabled":true,"futur":1}"#).unwrap();
        assert!(SyncSettings::load(dir.path()).enabled);
    }

    #[test]
    fn web_credentials_are_created_once_and_only_the_hash_is_kept() {
        let mut settings = SyncSettings::default();
        assert!(settings.ensure_gui_credentials().unwrap());
        let hash = settings.gui_password_hash.clone().unwrap();
        assert!(hash.starts_with("$2"));
        assert!(!settings.ensure_gui_credentials().unwrap());
        assert_eq!(settings.gui_password_hash.unwrap(), hash);
    }
}
```

Run : `cargo test --lib sync::settings::` ; Expected : échec (`cannot find type \`SyncSettings\``). Puis AU-DESSUS :

```rust
//! Les réglages de la synchro propres à CE PC, dans le dossier d'état du moteur : jamais dans le dossier de
//! notes (le fichier `.neo-calendar.json` s'y synchronise avec les autres appareils, ceci ne doit pas).

use super::config::random_chars;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;

const FILE_NAME: &str = "settings.json";
const PASSWORD_ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyzABCDEF";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncSettings {
    /// La synchro intégrée est active sur ce PC.
    pub enabled: bool,
    /// Le dossier de données qui est synchronisé (celui choisi dans l'app).
    pub folder_path: Option<String>,
    /// Le port d'écoute TCP/QUIC, choisi libre une fois puis gardé (revérifié à chaque lancement).
    pub listen_port: Option<u16>,
    /// Identifiant et mot de passe (haché) de l'interface web du moteur. Le mot de passe en clair n'est jamais gardé.
    pub gui_user: Option<String>,
    pub gui_password_hash: Option<String>,
}

impl SyncSettings {
    /// Un fichier absent donne les réglages par défaut (synchro désactivée). Un fichier illisible est mis de côté
    /// (`settings.json.illisible`) plutôt qu'écrasé en silence, puis les réglages par défaut s'appliquent.
    pub fn load(dir: &Path) -> SyncSettings {
        let path = dir.join(FILE_NAME);
        let Ok(bytes) = fs::read(&path) else {
            return SyncSettings::default();
        };
        match serde_json::from_slice(&bytes) {
            Ok(settings) => settings,
            Err(_) => {
                let _ = fs::rename(&path, dir.join(format!("{FILE_NAME}.illisible")));
                SyncSettings::default()
            }
        }
    }

    /// Écriture atomique : fichier temporaire du même dossier, puis renommage.
    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let temporary = dir.join(format!("{FILE_NAME}.tmp"));
        fs::write(&temporary, serde_json::to_vec_pretty(self).map_err(io::Error::other)?)?;
        fs::rename(&temporary, dir.join(FILE_NAME))
    }

    /// Pose l'identifiant et le mot de passe de l'interface web s'ils manquent. Rend vrai si quelque chose a changé.
    pub fn ensure_gui_credentials(&mut self) -> Result<bool, String> {
        if self.gui_user.is_some() && self.gui_password_hash.is_some() {
            return Ok(false);
        }
        let password = random_chars(PASSWORD_ALPHABET, 32);
        let hash = bcrypt::hash(&password, 10).map_err(|e| e.to_string())?;
        self.gui_user = Some("neo-calendar".to_string());
        self.gui_password_hash = Some(hash);
        Ok(true)
    }
}
```

Run : `cargo test --lib sync::settings::` ; Expected : `5 passed`.

- [ ] **Step 12 : Tout le socle, puis commit**

Run : `cargo test --lib sync::`
Expected : `test result: ok. 32 passed` (8 + 6 + 4 + 4 + 5 + 5). Des avertissements `never used` sont normaux jusqu'à la Task 8 (aucune commande n'utilise encore ces modules) ; seul l'état final doit être sans avertissement.

```bash
git add apps/windows/src-tauri/Cargo.toml apps/windows/src-tauri/Cargo.lock apps/windows/src-tauri/src/lib.rs apps/windows/src-tauri/src/sync
git commit -m "PC : socle de la synchro intégrée (configuration imposée, client REST, ports, journal, supervision, réglages)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 4 : Rust : appairage par code et gestes sur les appareils

**Files:**
- Create: `apps/windows/src-tauri/src/sync/pairing.rs`
- Create: `apps/windows/src-tauri/src/sync/setup.rs`
- Modify: `apps/windows/src-tauri/src/sync/mod.rs`

**Interfaces:**
- Consumes: `config::{random_chars, folder, device, new_folder_id, FOLDER_LABEL}`, `api::{SyncthingApi, ApiError, ApiResult, ConfiguredFolder}`, `testing::FakeTransport`.
- Produces: `pairing::{Pairing, Verdict, WINDOW, MAX_WRONG, CODE_LEN, new_code, qr_payload, qr_svg, split_name}` avec `Pairing::{start, cancel, remaining, judge}` (`judge(now, device_id, device_name) -> Verdict`) ; `setup::{SyncSetup, FolderSeed, same_path}` avec `SyncSetup { api, folder_path }::{ensure_folder, ensure_folder_seeded, folder_mismatch, repoint_folder, accept_device, reject_device, remove_device}`.

Le contrat du QR code est `neo-calendar://pair?device=<ID>&code=<CODE>` (le schéma `neo-calendar://` est déjà celui de l'app). Le code se compare en temps constant, ne sert qu'une fois, vit 5 minutes ; chaque appareil fautif ne compte qu'une fois (un intrus qui se reconnecte chaque seconde ne ferme pas la fenêtre du bon téléphone). Le même vecteur d'essai est dans `PairingTest.kt` (Task 10).

- [ ] **Step 1 : `pairing.rs`, tests seuls**

Ajouter `pub mod pairing;` à `mod.rs`. Créer le fichier avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX";

    fn open_at(now: Instant) -> Pairing {
        let mut pairing = Pairing::default();
        pairing.start(now, "K7Q2M9XPAB".to_string());
        pairing
    }

    #[test]
    fn the_payload_is_the_agreed_contract_with_the_phone() {
        // Même vecteur que `PairingPayloadTest` côté Android : si l'un change, l'autre doit changer.
        assert_eq!(
            qr_payload(ID, "K7Q2M9XPAB"),
            "neo-calendar://pair?device=7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX&code=K7Q2M9XPAB"
        );
    }

    #[test]
    fn the_qr_is_an_svg_in_black_on_white() {
        let svg = qr_svg(&qr_payload(ID, "K7Q2M9XPAB")).unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("#ffffff") && svg.contains("#000000"));
    }

    #[test]
    fn codes_are_random_and_use_the_agreed_alphabet() {
        let a = new_code();
        assert_eq!(a.len(), CODE_LEN);
        assert_ne!(a, new_code());
        assert!(a.bytes().all(|b| CODE_ALPHABET.contains(&b)));
    }

    #[test]
    fn the_code_is_read_from_the_end_of_the_device_name() {
        assert_eq!(split_name("Pixel 8 [NC:K7Q2M9XPAB]"), ("Pixel 8".to_string(), Some("K7Q2M9XPAB".to_string())));
        assert_eq!(split_name("  Pixel [NC:K7Q2M9XPAB] "), ("Pixel".to_string(), Some("K7Q2M9XPAB".to_string())));
        assert_eq!(split_name("[NC:K7Q2M9XPAB]"), (String::new(), Some("K7Q2M9XPAB".to_string())));
    }

    #[test]
    fn a_malformed_marker_is_just_part_of_the_name() {
        for name in ["Pixel [NC:COURT]", "Pixel [NC:K7Q2M9XPAB] suite", "Pixel [NC:k7q2m9xpab]", "Pixel [NC:K7Q2M9XPA0]", "Pixel"] {
            assert_eq!(split_name(name), (name.trim().to_string(), None), "{name}");
        }
    }

    #[test]
    fn the_right_code_is_accepted_once_inside_the_window() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.judge(t0 + Duration::from_secs(10), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        assert_eq!(pairing.judge(t0 + Duration::from_secs(11), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed, "usage unique");
        assert!(pairing.remaining(t0 + Duration::from_secs(12)).is_none());
    }

    #[test]
    fn the_window_lasts_five_minutes() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.remaining(t0), Some(WINDOW));
        assert_eq!(pairing.judge(t0 + WINDOW, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        let mut late = open_at(t0);
        assert_eq!(late.judge(t0 + WINDOW + Duration::from_millis(1), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn a_wrong_code_is_never_accepted_and_the_window_closes_after_too_many() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        for i in 0..MAX_WRONG {
            assert_eq!(pairing.judge(t0, &format!("intrus-{i}"), "Intrus [NC:AAAAAAAAAA]"), Verdict::Wrong);
        }
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn one_device_retrying_every_second_counts_as_one_wrong_attempt() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        for _ in 0..(MAX_WRONG * 3) {
            assert_eq!(pairing.judge(t0, "meme-intrus", "Intrus [NC:AAAAAAAAAA]"), Verdict::Wrong);
        }
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept, "la fenêtre reste ouverte");
    }

    #[test]
    fn an_ordinary_request_stays_manual_and_does_not_burn_the_window() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.judge(t0, "karim", "Le PC de Karim"), Verdict::NotACode);
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
    }

    #[test]
    fn without_a_window_a_code_is_closed_and_cancel_closes_it() {
        let t0 = Instant::now();
        let mut pairing = Pairing::default();
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
        let mut opened = open_at(t0);
        opened.cancel();
        assert_eq!(opened.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn a_new_window_replaces_the_old_code() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        pairing.start(t0, "ZZZZZZZZZZ".to_string());
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Wrong);
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:ZZZZZZZZZZ]"), Verdict::Accept);
    }
}
```

Run : `cargo test --lib sync::pairing::` ; Expected : échec de compilation (`cannot find type \`Pairing\``).

- [ ] **Step 2 : `pairing.rs`, implémentation**

Placer AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! L'appairage par QR code : un code à usage unique, valable 5 minutes, que le téléphone annonce au PC dans le
//! nom d'appareil qu'il présente (`Pixel 8 [NC:K7Q2M9XPAB]`) : le seul canal que l'API REST de la v2.1.5 expose
//! pour un appareil encore inconnu (`/rest/cluster/pending/devices` rend son `name`, vérifié sur deux vrais moteurs).
//!
//! Règle : rien n'est accepté tout seul, sauf la demande qui porte le bon code pendant la fenêtre ouverte.

use super::config::random_chars;
use std::collections::HashSet;
use std::time::{Duration, Instant};

pub const WINDOW: Duration = Duration::from_secs(5 * 60);
/// Au-delà, la fenêtre se ferme : un code de 50 bits ne se devine pas, mais rien n'oblige à laisser essayer.
pub const MAX_WRONG: u32 = 10;
pub const CODE_LEN: usize = 10;
const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MARKER_OPEN: &str = "[NC:";

pub fn new_code() -> String {
    random_chars(CODE_ALPHABET, CODE_LEN)
}

/// Ce que contient le QR code : le schéma `neo-calendar://` est déjà celui de l'app.
pub fn qr_payload(device_id: &str, code: &str) -> String {
    format!("neo-calendar://pair?device={device_id}&code={code}")
}

/// Le QR code en SVG, noir sur blanc quel que soit le thème (un lecteur ne lit pas un QR sombre).
pub fn qr_svg(payload: &str) -> Result<String, String> {
    let code = qrcode::QrCode::new(payload.as_bytes()).map_err(|e| e.to_string())?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(220, 220)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build())
}

/// Sépare le nom d'appareil de son éventuel code : `("Pixel 8", Some("K7Q2M9XPAB"))`. Le code doit finir le nom,
/// avoir la bonne longueur et l'alphabet ; sinon le nom est rendu tel quel, sans code.
pub fn split_name(name: &str) -> (String, Option<String>) {
    let trimmed = name.trim();
    if let Some(open) = trimmed.rfind(MARKER_OPEN) {
        if let Some(code) = trimmed[open + MARKER_OPEN.len()..].strip_suffix(']') {
            let valid = code.len() == CODE_LEN && code.bytes().all(|b| CODE_ALPHABET.contains(&b));
            if valid {
                return (trimmed[..open].trim().to_string(), Some(code.to_string()));
            }
        }
    }
    (trimmed.to_string(), None)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Verdict {
    /// Le bon code, dans la fenêtre : la demande s'accepte sans question.
    Accept,
    /// Pas de code dans le nom : demande ordinaire, à accepter à la main.
    NotACode,
    /// Un code, mais pas le bon.
    Wrong,
    /// Un code, mais aucune fenêtre ouverte (jamais ouverte, expirée, déjà utilisée, ou trop d'essais).
    Closed,
}

struct Session {
    code: String,
    opened: Instant,
    /// Les appareils qui ont présenté un mauvais code : chacun compte une fois, même s'il se reconnecte chaque seconde.
    wrong: HashSet<String>,
    used: bool,
}

#[derive(Default)]
pub struct Pairing {
    session: Option<Session>,
}

fn same_code(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Pairing {
    /// Ouvre une fenêtre (la précédente, s'il y en avait une, est fermée).
    pub fn start(&mut self, now: Instant, code: String) {
        self.session = Some(Session { code, opened: now, wrong: HashSet::new(), used: false });
    }

    /// Le code de la fenêtre en cours (les tests jouent le téléphone avec).
    #[cfg(test)]
    pub fn current_code(&self) -> Option<String> {
        self.session.as_ref().map(|s| s.code.clone())
    }

    pub fn cancel(&mut self) {
        self.session = None;
    }

    fn open(&self, now: Instant) -> Option<&Session> {
        self.session
            .as_ref()
            .filter(|s| !s.used && (s.wrong.len() as u32) < MAX_WRONG && now.saturating_duration_since(s.opened) <= WINDOW)
    }

    /// Le temps qu'il reste à la fenêtre ouverte, s'il y en a une.
    pub fn remaining(&self, now: Instant) -> Option<Duration> {
        self.open(now).map(|s| WINDOW.saturating_sub(now.saturating_duration_since(s.opened)))
    }

    /// Juge une demande entrante (l'identifiant de l'appareil et le nom qu'il présente). Un code correct est consommé :
    /// le même ne passe jamais deux fois.
    pub fn judge(&mut self, now: Instant, device_id: &str, device_name: &str) -> Verdict {
        let (_, presented) = split_name(device_name);
        let Some(presented) = presented else {
            return Verdict::NotACode;
        };
        if self.open(now).is_none() {
            return Verdict::Closed;
        }
        let session = self.session.as_mut().expect("fenêtre ouverte");
        if same_code(&session.code, &presented) {
            session.used = true;
            Verdict::Accept
        } else {
            session.wrong.insert(device_id.to_string());
            Verdict::Wrong
        }
    }
}
```

Run : `cargo test --lib sync::pairing::` ; Expected : `test result: ok. 12 passed`.

- [ ] **Step 3 : `setup.rs`, tests seuls**

Ajouter `pub mod setup;`. Créer le fichier avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;
    use std::sync::Arc;

    const ME: &str = "ME-ME-ME";
    const PHONE: &str = "PHONE-ID";

    fn fixture() -> (Arc<FakeTransport>, SyncthingApi, tempfile::TempDir) {
        let fake = Arc::new(FakeTransport::default());
        fake.answer("GET /rest/system/status", &format!(r#"{{"myID":"{ME}"}}"#));
        let api = SyncthingApi::new(fake.clone());
        (fake, api, tempfile::tempdir().unwrap())
    }

    #[test]
    fn paths_compare_like_windows_does() {
        assert!(same_path("C:\\Neo Calendar", "c:/neo calendar/"));
        assert!(same_path("\\\\?\\C:\\Neo Calendar", "C:\\Neo Calendar"));
        assert!(!same_path("C:\\Neo Calendar", "C:\\Neo Calendar 2"));
    }

    #[test]
    fn the_first_accepted_device_creates_the_folder_shared_with_it() {
        let (fake, api, dir) = fixture();
        fake.answer("GET /rest/config/folders", "[]");
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PUT /rest/config/folders/*", "");
        fake.answer("PATCH /rest/config/folders/*", "");
        fake.answer("DELETE /rest/cluster/pending/devices*", "");
        let setup = SyncSetup { api: &api, folder_path: dir.path() };
        setup.accept_device(PHONE, "  Pixel 8 ").unwrap();
        assert!(fake.sent("PUT", &format!("/rest/config/devices/{PHONE}")).unwrap().contains("\"name\":\"Pixel 8\""));
        let calls = fake.calls.lock().unwrap();
        let folder_put = calls.iter().find(|c| c.method == "PUT" && c.path.starts_with("/rest/config/folders/neo-")).unwrap();
        assert!(folder_put.body.as_ref().unwrap().contains(ME));
        assert!(dir.path().join(".stfolder").is_dir(), "le marqueur est posé");
        drop(calls);
        assert_eq!(fake.count("DELETE", "/rest/cluster/pending/devices"), 1);
    }

    #[test]
    fn a_seeded_folder_keeps_the_old_id_and_shares_with_the_old_devices() {
        let (fake, api, dir) = fixture();
        fake.answer("GET /rest/config/folders", "[]");
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PUT /rest/config/folders/*", "");
        let seed = FolderSeed { folder_id: Some("neo-old".into()), devices: vec![("LAPTOP".into(), "Laptop".into()), ("PHONE".into(), "Pixel".into())] };
        SyncSetup { api: &api, folder_path: dir.path() }.ensure_folder_seeded(&seed).unwrap();
        let body = fake.sent("PUT", "/rest/config/folders/neo-old").expect("même identifiant que l'ancien partage");
        for id in [ME, "LAPTOP", "PHONE"] {
            assert!(body.contains(id), "{id}");
        }
        assert!(fake.sent("PUT", "/rest/config/devices/LAPTOP").unwrap().contains("\"name\":\"Laptop\""));
    }

    #[test]
    fn a_second_device_is_added_to_the_existing_folder_never_a_second_folder() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"Neo","path":"C:\\N","devices":[{{"deviceID":"{ME}"}}]}}]"#),
        );
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PATCH /rest/config/folders/neo-x", "");
        fake.answer("DELETE /rest/cluster/pending/devices*", "");
        SyncSetup { api: &api, folder_path: dir.path() }.accept_device(PHONE, "").unwrap();
        assert_eq!(fake.count("PUT", "/rest/config/folders/"), 0);
        let patch = fake.sent("PATCH", "/rest/config/folders/neo-x").unwrap();
        assert!(patch.contains(PHONE) && patch.contains(ME));
        assert!(fake.sent("PUT", &format!("/rest/config/devices/{PHONE}")).unwrap().contains("\"name\":\"PHONE-I\""));
    }

    #[test]
    fn this_pcs_own_id_is_refused_before_any_write() {
        let (fake, api, dir) = fixture();
        let error = SyncSetup { api: &api, folder_path: dir.path() }.accept_device(ME, "moi").unwrap_err();
        assert!(error.message.contains("ce PC"));
        assert_eq!(fake.count("PUT", "/rest"), 0);
    }

    #[test]
    fn removing_a_device_leaves_it_out_of_the_folder_first() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"N","path":"C:\\N","devices":[{{"deviceID":"{ME}"}},{{"deviceID":"{PHONE}"}}]}}]"#),
        );
        fake.answer("PATCH /rest/config/folders/neo-x", "");
        fake.answer(&format!("DELETE /rest/config/devices/{PHONE}"), "");
        SyncSetup { api: &api, folder_path: dir.path() }.remove_device(PHONE).unwrap();
        let patch = fake.sent("PATCH", "/rest/config/folders/neo-x").unwrap();
        assert!(!patch.contains(PHONE) && patch.contains(ME));
    }

    #[test]
    fn a_changed_data_folder_is_detected_and_repointed_with_the_same_id() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"N","path":"C:\\Ancien","devices":[{{"deviceID":"{ME}"}}]}}]"#),
        );
        fake.answer("DELETE /rest/config/folders/neo-x", "");
        fake.answer("PUT /rest/config/folders/neo-x", "");
        let setup = SyncSetup { api: &api, folder_path: dir.path() };
        assert_eq!(setup.folder_mismatch().unwrap().unwrap().id, "neo-x");
        setup.repoint_folder().unwrap();
        let put = fake.sent("PUT", "/rest/config/folders/neo-x").unwrap();
        assert!(put.contains("\"id\":\"neo-x\""));
        let path = dir.path().to_string_lossy().replace('\\', "\\\\");
        assert!(put.contains(&path), "{put}");
    }

    #[test]
    fn a_folder_already_on_the_right_path_is_no_mismatch() {
        let (fake, api, dir) = fixture();
        let path = dir.path().to_string_lossy().replace('\\', "\\\\");
        fake.answer("GET /rest/config/folders", &format!(r#"[{{"id":"neo-x","label":"N","path":"{path}","devices":[]}}]"#));
        assert!(SyncSetup { api: &api, folder_path: dir.path() }.folder_mismatch().unwrap().is_none());
    }
}
```

Run : `cargo test --lib sync::setup::` ; Expected : échec de compilation (`cannot find struct \`SyncSetup\``).

- [ ] **Step 4 : `setup.rs`, implémentation**

AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! Les gestes de l'utilisateur sur les appareils et le dossier, traduits en appels à l'API du moteur de l'app.
//! Rien n'est accepté ici sans qu'un appelant l'ait décidé (geste de l'utilisateur ou code d'appairage valide).

use super::api::{ApiError, ApiResult, ConfiguredFolder, SyncthingApi};
use super::config;
use std::fs;
use std::path::Path;

/// Deux chemins Windows désignent-ils le même dossier ? (casse, sens des barres, barre finale, préfixe `\\?\`)
pub fn same_path(a: &str, b: &str) -> bool {
    fn normal(path: &str) -> String {
        let flat = path.trim().replace('/', "\\");
        let flat = flat.strip_prefix("\\\\?\\").unwrap_or(&flat);
        flat.trim_end_matches('\\').to_lowercase()
    }
    normal(a) == normal(b)
}

/// Ce qu'un dossier neuf reprend d'une reprise : son identifiant et les appareils qui le partageaient (identifiant, nom).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FolderSeed {
    pub folder_id: Option<String>,
    pub devices: Vec<(String, String)>,
}

pub struct SyncSetup<'a> {
    pub api: &'a SyncthingApi,
    pub folder_path: &'a Path,
}

fn local_error(message: String) -> ApiError {
    ApiError { code: 0, message }
}

impl SyncSetup<'_> {
    /// Le moteur refuse un dossier sans `.stfolder`. Un marqueur déjà là (resté d'un ancien partage) est repris tel quel.
    fn ensure_marker(&self) -> ApiResult<()> {
        fs::create_dir_all(self.folder_path.join(".stfolder")).map_err(|e| {
            local_error(format!("Impossible de préparer le dossier « {} » : {e}", self.folder_path.display()))
        })
    }

    fn path_text(&self) -> String {
        self.folder_path.to_string_lossy().into_owned()
    }

    /// Le dossier de notes dans le moteur. Absent (premier démarrage), il est créé, partagé avec personne.
    /// Un seul dossier est synchronisé : un moteur qui en a déjà un n'en reçoit jamais un deuxième.
    pub fn ensure_folder(&self) -> ApiResult<ConfiguredFolder> {
        self.ensure_folder_seeded(&FolderSeed::default())
    }

    /// Comme `ensure_folder`, mais un dossier absent est créé avec l'identifiant et les appareils de la `seed` (reprise
    /// depuis un Syncthing installé : les autres appareils reconnaissent le dossier à son identifiant).
    pub fn ensure_folder_seeded(&self, seed: &FolderSeed) -> ApiResult<ConfiguredFolder> {
        if let Some(folder) = self.api.folders()?.into_iter().next() {
            return Ok(folder);
        }
        let me = self.api.my_id()?;
        self.ensure_marker()?;
        for (id, name) in &seed.devices {
            self.api.put_device(&config::device(id, name))?;
        }
        let id = seed.folder_id.clone().unwrap_or_else(config::new_folder_id);
        let mut device_ids = vec![me];
        device_ids.extend(seed.devices.iter().map(|(id, _)| id.clone()));
        self.api.put_folder(&config::folder(&id, config::FOLDER_LABEL, &self.path_text(), &device_ids))?;
        Ok(ConfiguredFolder { id, label: config::FOLDER_LABEL.to_string(), path: self.path_text(), device_ids })
    }

    /// Le dossier du moteur n'est plus le dossier de données choisi dans l'app (changement de dossier de données).
    pub fn folder_mismatch(&self) -> ApiResult<Option<ConfiguredFolder>> {
        Ok(self.api.folders()?.into_iter().next().filter(|f| !same_path(&f.path, &self.path_text())))
    }

    /// Remet le dossier du moteur sur le dossier de données actuel, au même identifiant : retiré puis reposé, pour
    /// repartir d'un index vide (recréer `.stfolder` à la main sur un index ancien désactiverait la sécurité de
    /// Syncthing, qui prendrait les fichiers « absents » pour des suppressions à propager).
    pub fn repoint_folder(&self) -> ApiResult<()> {
        let Some(old) = self.api.folders()?.into_iter().next() else {
            return Ok(());
        };
        self.ensure_marker()?;
        self.api.remove_folder(&old.id)?;
        self.api.put_folder(&config::folder(&old.id, &old.label, &self.path_text(), &old.device_ids))
    }

    fn share_with(&self, device_id: &str) -> ApiResult<()> {
        let folder = self.ensure_folder()?;
        if !folder.device_ids.iter().any(|d| d == device_id) {
            let mut devices = folder.device_ids.clone();
            devices.push(device_id.to_string());
            self.api.set_folder_devices(&folder.id, &devices)?;
        }
        Ok(())
    }

    /// Accepte un appareil (demande entrante) ou le reprend (reprise depuis un Syncthing installé) et lui partage le dossier.
    /// Jamais appelé sans geste de l'utilisateur ni code d'appairage valide.
    pub fn accept_device(&self, id: &str, name: &str) -> ApiResult<()> {
        if id == self.api.my_id()? {
            return Err(local_error("C'est l'identifiant de ce PC.".to_string()));
        }
        let name = name.trim();
        let name = if name.is_empty() { id.chars().take(7).collect::<String>() } else { name.to_string() };
        self.api.put_device(&config::device(id, &name))?;
        self.share_with(id)?;
        let _ = self.api.dismiss_pending_device(id);
        Ok(())
    }

    pub fn reject_device(&self, id: &str) -> ApiResult<()> {
        self.api.dismiss_pending_device(id)
    }

    /// Retire l'appareil, d'abord du dossier puis du moteur. Les notes locales ne sont pas touchées.
    pub fn remove_device(&self, id: &str) -> ApiResult<()> {
        if let Some(folder) = self.api.folders()?.into_iter().find(|f| f.device_ids.iter().any(|d| d == id)) {
            let remaining: Vec<String> = folder.device_ids.iter().filter(|d| *d != id).cloned().collect();
            self.api.set_folder_devices(&folder.id, &remaining)?;
        }
        self.api.remove_device(id)
    }
}
```

Run : `cargo test --lib sync::setup::` ; Expected : `test result: ok. 8 passed`.

- [ ] **Step 5 : Commit**

```bash
git add apps/windows/src-tauri/src/sync
git commit -m "PC : code d'appairage à usage unique (5 minutes) et gestes sur les appareils et le dossier" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 5 : Rust : le processus Syncthing et son superviseur

**Files:**
- Create: `apps/windows/src-tauri/src/sync/process.rs`
- Create: `apps/windows/src-tauri/src/sync/engine.rs`, `apps/windows/src-tauri/src/sync/engine_tests.rs`
- Modify: `apps/windows/src-tauri/src/sync/mod.rs`

**Interfaces:**
- Consumes: Tasks 3 et 4 (`config::prepare_config`, `config::random_chars`, `config::options_json`, `ports::{pick_listen_port, pick_gui_port, binds_tcp_and_udp}`, `api::{SyncthingApi, UreqTransport}`, `log::RotatingLog`, `supervision::*`, `setup::{SyncSetup, FolderSeed}`, `testing::real_binary`).
- Produces: `process::{engine_exe_beside, ensure_engine_copy, ensure_generated, spawn, pump_output, write_pidfile, remove_pidfile, kill_stale, is_our_engine, CREATE_NO_WINDOW}` ; `engine::{Engine, EngineParams, Hooks, Snapshot}` avec `Engine::{new, snapshot, is_active, set_state, start(params, hooks, policy), stop}` et `Hooks { on_listen_port: Box<dyn Fn(u16)>, on_tick: Box<dyn Fn(&SyncthingApi) -> bool> }` (`false` = arrêter : exclusivité).

Points qui comptent : le moteur tourne depuis une COPIE dans `<dossier d'état>\bin\syncthing-2.1.5.exe` (l'installateur ne trouve jamais le fichier verrouillé par un moteur resté) ; l'adresse et la clé de l'interface passent par l'environnement, jamais par la ligne de commande ; `config.xml` est réécrit (atomiquement) avant CHAQUE `serve` ; l'arrêt forcé ne vise que le `Child` lancé ; le nettoyage d'un moteur resté lit `engine.pid` et ne termine le PID que si son programme est exactement notre copie.

- [ ] **Step 1 : `process.rs`, tests seuls**

Ajouter `pub mod process;`. Créer le fichier avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_our_exact_program_counts_as_our_engine() {
        let exe = Path::new(r"C:\Program Files\Neo Calendar\syncthing.exe");
        assert!(is_our_engine(Some(r"c:\program files\neo calendar\SYNCTHING.EXE"), exe));
        assert!(!is_our_engine(Some(r"C:\Users\Ahmed\AppData\Local\Syncthing\syncthing.exe"), exe));
        assert!(!is_our_engine(Some(r"C:\Program Files\Neo Calendar\syncthing.exe.bak"), exe));
        assert!(!is_our_engine(None, exe));
    }

    #[test]
    fn the_engine_is_copied_once_and_old_versions_are_cleaned() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("syncthing.exe");
        fs::write(&source, b"moteur v2").unwrap();
        let bin = dir.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("syncthing-2.1.4.exe"), b"ancien").unwrap();

        let copy = ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(copy, bin.join("syncthing-2.1.5.exe"));
        assert_eq!(fs::read(&copy).unwrap(), b"moteur v2");
        assert!(!bin.join("syncthing-2.1.4.exe").exists());
        // Déjà là, même taille : rien n'est recopié.
        fs::write(&copy, b"MOTEUR V2").unwrap();
        ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(fs::read(&copy).unwrap(), b"MOTEUR V2");
        // Une taille différente (copie interrompue, mise à jour) : refaite.
        fs::write(&copy, b"court").unwrap();
        ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(fs::read(&copy).unwrap(), b"moteur v2");
        assert!(ensure_engine_copy(&dir.path().join("absent.exe"), &bin, "2.1.5").is_err());
    }

    #[test]
    fn the_engine_sits_beside_the_app_executable() {
        assert_eq!(
            engine_exe_beside(Path::new(r"C:\Apps\Neo Calendar\neo-calendar.exe")),
            PathBuf::from(r"C:\Apps\Neo Calendar\syncthing.exe")
        );
    }

    #[test]
    fn the_process_is_started_without_a_console_and_never_killed_by_name() {
        let source = include_str!("process.rs");
        assert!(source.contains("creation_flags(CREATE_NO_WINDOW)"));
        // Les motifs sont assemblés : écrits en clair, ce test se compterait lui-même.
        for forbidden in [["task", "kill"].concat(), ["Stop-Process", " -Name"].concat(), ["pk", "ill"].concat(), ["/", "IM"].concat()] {
            assert_eq!(source.matches(&forbidden).count(), 0, "{forbidden}");
        }
    }

    #[test]
    fn a_missing_or_garbled_pid_file_kills_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("syncthing.exe");
        assert_eq!(kill_stale(dir.path(), &exe), None);
        fs::write(dir.path().join(PID_FILE), "pas un nombre").unwrap();
        assert_eq!(kill_stale(dir.path(), &exe), None);
        assert!(!dir.path().join(PID_FILE).exists(), "le fichier est consommé");
    }

    /// Un vrai processus, lancé depuis une copie de `ping.exe` renommée `syncthing.exe` : c'est NOTRE moteur.
    #[cfg(windows)]
    fn fake_engine(dir: &Path) -> (PathBuf, Child) {
        let system = std::env::var("SystemRoot").unwrap();
        let exe = dir.join("syncthing.exe");
        fs::copy(Path::new(&system).join("System32").join("PING.EXE"), &exe).unwrap();
        let child = command(&exe).args(["-n", "60", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        (exe, child)
    }

    #[cfg(windows)]
    #[test]
    fn a_stale_engine_of_ours_is_terminated_by_pid() {
        let dir = tempfile::tempdir().unwrap();
        let (exe, mut child) = fake_engine(dir.path());
        write_pidfile(dir.path(), child.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), &exe), Some(child.id()));
        assert!(child.wait().is_ok(), "le processus est bien terminé");
    }

    #[cfg(windows)]
    #[test]
    fn a_pid_reused_by_another_program_is_never_touched() {
        let dir = tempfile::tempdir().unwrap();
        let (_ours, mut ours) = fake_engine(dir.path());
        let _ = ours.kill();
        let _ = ours.wait();
        // Un autre programme (un Syncthing d'un autre dossier, par exemple) : même nom de fichier, autre chemin.
        let other_dir = tempfile::tempdir().unwrap();
        let (_other_exe, mut other) = fake_engine(other_dir.path());
        write_pidfile(dir.path(), other.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), &dir.path().join("syncthing.exe")), None);
        assert!(other.try_wait().unwrap().is_none(), "l'autre processus tourne toujours");
        other.kill().unwrap();
        other.wait().unwrap();
    }
}
```

Run : `cargo test --lib sync::process::` ; Expected : échec de compilation (`cannot find function \`kill_stale\``).

- [ ] **Step 2 : `process.rs`, implémentation**

AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! Le processus Syncthing : génération de l'identité, lancement, journal, nettoyage d'un moteur resté d'un
//! lancement précédent. Jamais un arrêt « par nom » : d'autres Syncthing tournent sur ce PC (celui de
//! l'utilisateur, ceux d'autres applications). On ne termine que le PID qu'on a lancé, ou celui que notre
//! fichier `engine.pid` désigne ET dont le programme est exactement notre `syncthing.exe`.

use super::log::RotatingLog;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;

/// Le moteur est un programme console : sans ce drapeau, Windows lui ouvre une fenêtre noire.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PID_FILE: &str = "engine.pid";

/// `syncthing.exe` est posé par Tauri (`bundle.externalBin`) à côté de l'exécutable de l'app.
pub fn engine_exe_beside(current_exe: &Path) -> PathBuf {
    current_exe.with_file_name("syncthing.exe")
}

fn command(exe: &Path) -> Command {
    let mut command = Command::new(exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Le moteur tourne depuis une COPIE dans le dossier d'état de l'app, jamais depuis le dossier d'installation : un
/// moteur resté après un plantage de l'app ne verrouille alors pas `syncthing.exe` pendant une mise à jour ou une
/// réinstallation. La copie est refaite si elle manque ou si sa taille diffère ; les copies d'anciennes versions sont
/// supprimées quand elles ne sont pas en cours d'utilisation.
pub fn ensure_engine_copy(source: &Path, bin_dir: &Path, version: &str) -> Result<PathBuf, String> {
    let destination = bin_dir.join(format!("syncthing-{version}.exe"));
    let expected = fs::metadata(source).map_err(|e| format!("Le moteur est introuvable ({}) : {e}", source.display()))?.len();
    if fs::metadata(&destination).map(|m| m.len()).ok() == Some(expected) {
        return Ok(destination);
    }
    fs::create_dir_all(bin_dir).map_err(|e| format!("Dossier du moteur impossible à créer : {e}"))?;
    let temporary = bin_dir.join(format!("syncthing-{version}.exe.neo-tmp"));
    fs::copy(source, &temporary).map_err(|e| format!("Copie du moteur impossible : {e}"))?;
    fs::rename(&temporary, &destination).map_err(|e| format!("Copie du moteur impossible à finaliser : {e}"))?;
    if let Ok(entries) = fs::read_dir(bin_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("syncthing-") && name.ends_with(".exe") && entry.path() != destination {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(destination)
}

/// Crée la clé, le certificat et la configuration du moteur s'ils manquent (`syncthing generate`).
pub fn ensure_generated(exe: &Path, home: &Path) -> Result<(), String> {
    let complete = ["config.xml", "cert.pem", "key.pem"].iter().all(|f| home.join(f).is_file());
    if complete {
        return Ok(());
    }
    fs::create_dir_all(home).map_err(|e| format!("Dossier d'état impossible à créer : {e}"))?;
    let output = command(exe)
        .arg("generate")
        .arg(format!("--home={}", home.display()))
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Syncthing ne se lance pas : {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("syncthing generate a échoué : {}", String::from_utf8_lossy(&output.stderr).trim()))
    }
}

/// Lance le moteur. L'adresse et la clé de l'interface passent par l'environnement, jamais par la ligne de
/// commande (que les autres programmes du PC peuvent lire).
pub fn spawn(exe: &Path, home: &Path, gui_address: &str, api_key: &str) -> io::Result<Child> {
    command(exe)
        .arg("serve")
        .arg(format!("--home={}", home.display()))
        .args(["--no-browser", "--no-restart", "--no-upgrade", "--log-file=-"])
        .env("STGUIADDRESS", gui_address)
        .env("STGUIAPIKEY", api_key)
        .env("STNORESTART", "1")
        .env("STNOUPGRADE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

/// Vide la sortie du processus dans le journal (un tuyau qui n'est pas lu bloque le moteur).
pub fn pump_output(child: &mut Child, log: &Arc<RotatingLog>) {
    fn pump(mut source: impl Read + Send + 'static, log: Arc<RotatingLog>) {
        std::thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            while let Ok(n) = source.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                log.write(&buffer[..n]);
            }
        });
    }
    if let Some(out) = child.stdout.take() {
        pump(out, log.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump(err, log.clone());
    }
}

pub fn write_pidfile(home: &Path, pid: u32) -> io::Result<()> {
    fs::write(home.join(PID_FILE), pid.to_string())
}

pub fn remove_pidfile(home: &Path) {
    let _ = fs::remove_file(home.join(PID_FILE));
}

/// Le programme du processus est-il exactement notre `syncthing.exe` ? (casse ignorée, comme Windows)
pub fn is_our_engine(image: Option<&str>, exe: &Path) -> bool {
    match image {
        Some(image) => image.eq_ignore_ascii_case(&exe.to_string_lossy()),
        None => false,
    }
}

/// Un moteur resté d'un lancement précédent (l'app a été tuée sans l'arrêter) : le PID de `engine.pid`, s'il
/// désigne toujours NOTRE `syncthing.exe`, est terminé. Un PID réutilisé par un autre programme n'est jamais touché.
/// Rend le PID terminé.
pub fn kill_stale(home: &Path, exe: &Path) -> Option<u32> {
    let text = fs::read_to_string(home.join(PID_FILE)).ok()?;
    remove_pidfile(home);
    let pid: u32 = text.trim().parse().ok()?;
    if pid == std::process::id() || !is_our_engine(sys::image_path(pid).as_deref(), exe) {
        return None;
    }
    sys::terminate(pid).then_some(pid)
}

#[cfg(windows)]
mod sys {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_TERMINATE,
    };

    /// Le chemin du programme d'un processus, `None` s'il n'existe plus ou n'est pas lisible.
    pub fn image_path(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut buffer = [0u16; 1024];
            let mut length = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length);
            CloseHandle(handle);
            (ok != 0).then(|| String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    pub fn terminate(pid: u32) -> bool {
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if handle.is_null() {
                return false;
            }
            let ok = TerminateProcess(handle, 1);
            CloseHandle(handle);
            ok != 0
        }
    }
}

#[cfg(not(windows))]
mod sys {
    pub fn image_path(_pid: u32) -> Option<String> {
        None
    }
    pub fn terminate(_pid: u32) -> bool {
        false
    }
}
```

Run : `cargo test --lib sync::process::` ; Expected : `test result: ok. 7 passed` (dont deux tests qui lancent un vrai processus copié de `ping.exe`).

- [ ] **Step 3 : `engine_tests.rs` (tests seuls)**

Ajouter `pub mod engine;`. Créer `apps/windows/src-tauri/src/sync/engine_tests.rs` :

```rust
use super::*;

use crate::sync::testing::real_binary;

fn fast_policy() -> RestartPolicy {
    RestartPolicy::new(5, Duration::from_millis(20), Duration::from_millis(100), Duration::from_secs(60))
}

fn hooks(keep_running: Arc<AtomicBool>) -> Arc<Hooks> {
    Arc::new(Hooks {
        on_listen_port: Box::new(|_| {}),
        on_tick: Box::new(move |_| keep_running.load(Ordering::SeqCst)),
    })
}

fn params(dir: &Path, exe: PathBuf) -> EngineParams {
    EngineParams {
        exe,
        home: dir.join("etat"),
        folder_path: dir.join("Neo Calendar"),
        listen_port: None,
        gui_user: "neo-calendar".into(),
        gui_password_hash: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234".into(),
        seed: FolderSeed::default(),
    }
}

fn wait_for(engine: &Engine, what: &str, check: impl Fn(&EngineState) -> bool, seconds: u64) {
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        if check(&engine.snapshot().state) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("{what} : état {:?}", engine.snapshot().state);
}

fn new_engine(dir: &Path) -> (Engine, Arc<RotatingLog>) {
    let log = Arc::new(RotatingLog::new(dir.join("journal"), 100_000));
    (Engine::new(log.clone()), log)
}

#[test]
fn a_missing_engine_binary_is_reported_not_retried() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let result = engine.start(
        params(dir.path(), dir.path().join("absent.exe")),
        hooks(Arc::new(AtomicBool::new(true))),
        fast_policy(),
    );
    assert!(result.is_err());
    assert_eq!(engine.snapshot().state, EngineState::Missing);
    assert!(!engine.is_active());
}

/// Un « moteur » qui échoue toujours : une copie de `find.exe` renommée `syncthing.exe` (`find generate --home=…` échoue aussitôt).
#[cfg(windows)]
fn failing_engine(dir: &Path) -> PathBuf {
    let exe = dir.join("syncthing.exe");
    let system = std::env::var("SystemRoot").unwrap();
    fs::copy(Path::new(&system).join("System32").join("FIND.EXE"), &exe).unwrap();
    exe
}

#[cfg(windows)]
#[test]
fn an_engine_that_keeps_failing_is_retried_then_abandoned_at_the_fifth_failure() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, log) = new_engine(dir.path());
    let exe = failing_engine(dir.path());
    engine.start(params(dir.path(), exe.clone()), hooks(Arc::new(AtomicBool::new(true))), fast_policy()).unwrap();
    wait_for(&engine, "abandon", |s| matches!(s, EngineState::Failed { .. }), 20);
    assert!(log.read_all().contains("Trop d'échecs de suite"));
    // « Réessayer » : on repart de zéro, et on abandonne de nouveau au cinquième échec.
    engine.start(params(dir.path(), exe), hooks(Arc::new(AtomicBool::new(true))), fast_policy()).unwrap();
    wait_for(&engine, "nouvel abandon", |s| matches!(s, EngineState::Failed { .. }), 20);
    engine.stop();
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
}

#[cfg(windows)]
#[test]
fn stopping_during_a_retry_delay_is_immediate() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let slow = RestartPolicy::new(5, Duration::from_secs(30), Duration::from_secs(300), Duration::from_secs(60));
    engine.start(params(dir.path(), failing_engine(dir.path())), hooks(Arc::new(AtomicBool::new(true))), slow).unwrap();
    wait_for(&engine, "attente de relance", |s| matches!(s, EngineState::Backoff { .. }), 20);
    let started = Instant::now();
    engine.stop();
    assert!(started.elapsed() < Duration::from_secs(3));
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
}

#[test]
fn the_real_engine_runs_with_the_imposed_configuration_and_stops_cleanly() {
    let Some(exe) = real_binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let p = params(dir.path(), exe);
    let home = p.home.clone();
    engine.start(p.clone(), hooks(Arc::new(AtomicBool::new(true))), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt", |s| *s == EngineState::Running, 90);

    let snapshot = engine.snapshot();
    let api = snapshot.api.clone().unwrap();
    // Un moteur neuf n'a aucun dossier par défaut : seulement celui de l'app, créé sur le dossier de données.
    let folders = api.folders().unwrap();
    assert_eq!(folders.len(), 1);
    assert!(crate::sync::setup::same_path(&folders[0].path, &p.folder_path.to_string_lossy()));
    assert!(p.folder_path.join(".stfolder").is_dir());
    assert!(snapshot.mismatch.is_none());
    // L'interface web est verrouillée et les options imposées sont écrites avant le premier serve.
    let written = fs::read_to_string(home.join("config.xml")).unwrap();
    assert!(written.contains("<user>neo-calendar</user>") && written.contains("<password>$2b$"));
    assert!(written.contains("<localAnnounceEnabled>false</localAnnounceEnabled>"));
    assert!(home.join("engine.pid").is_file());

    engine.stop();
    assert!(!home.join("engine.pid").exists(), "le fichier de PID est retiré à l'arrêt propre");
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
    assert!(api.my_id().is_err(), "le moteur ne répond plus");

    // Relance : même identité, même dossier.
    engine.start(p, hooks(Arc::new(AtomicBool::new(true))), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt (2)", |s| *s == EngineState::Running, 90);
    assert_eq!(engine.snapshot().api.unwrap().folders().unwrap().len(), 1);
    engine.stop();
}

#[test]
fn the_real_engine_stops_itself_when_the_exclusivity_hook_says_so() {
    let Some(exe) = real_binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let keep = Arc::new(AtomicBool::new(true));
    engine.start(params(dir.path(), exe), hooks(keep.clone()), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt", |s| *s == EngineState::Running, 90);
    keep.store(false, Ordering::SeqCst);
    wait_for(&engine, "blocage", |s| *s == EngineState::BlockedByInstalled, 30);
    engine.stop();
}
```

Ajouter à `testing.rs`, en fin de fichier, le chemin du vrai binaire (les tests à vrai moteur se sautent sans lui, sauf en CI) :

```rust
/// Le vrai `syncthing.exe` de la version épinglée (`scripts/fetch-syncthing-windows.mjs` donne son chemin).
pub fn real_binary() -> Option<std::path::PathBuf> {
    let found = std::env::var_os("SYNCTHING_BINARY").map(std::path::PathBuf::from).filter(|p| p.is_file());
    // En CI le moteur réel est toujours fourni : son absence serait un test sauté en silence.
    assert!(found.is_some() || std::env::var_os("CI").is_none(), "SYNCTHING_BINARY manque en CI");
    if found.is_none() {
        eprintln!("SKIP : SYNCTHING_BINARY non défini (voir scripts/fetch-syncthing-windows.mjs)");
    }
    found
}
```

Créer `engine.rs` avec seulement les lignes qui relient le fichier de tests (le moteur est écrit à l'étape suivante) :

```rust
#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
```

Run : `$env:SYNCTHING_BINARY = (node ..\..\..\scripts\fetch-syncthing-windows.mjs); cargo test --lib sync::engine::` (depuis `src-tauri`)
Expected : échec de compilation (`cannot find type \`Engine\``).

- [ ] **Step 4 : `engine.rs`, implémentation**

Remplacer le contenu de `engine.rs` par :

```rust
//! Le superviseur du moteur : lancement, configuration imposée AVANT le premier `serve`, relances espacées,
//! arrêt propre. Tout tourne sur un fil à lui : l'interface n'attend jamais le moteur.

use super::api::{SyncthingApi, UreqTransport};
use super::config;
use super::log::RotatingLog;
use super::ports;
use super::process;
use super::setup::{FolderSeed, SyncSetup};
use super::supervision::{Decision, EngineState, RestartPolicy};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct EngineParams {
    pub exe: PathBuf,
    /// Le dossier d'état du moteur (clé, certificat, `config.xml`, index, journal) : jamais dans le dossier de notes.
    pub home: PathBuf,
    /// Le dossier synchronisé : le dossier de données choisi dans l'app, directement.
    pub folder_path: PathBuf,
    pub listen_port: Option<u16>,
    pub gui_user: String,
    pub gui_password_hash: String,
    pub seed: FolderSeed,
}

pub struct Hooks {
    /// Le port d'écoute réellement utilisé (le réglage gardé n'était plus libre : un autre a été tiré).
    pub on_listen_port: Box<dyn Fn(u16) + Send + Sync>,
    /// Appelé chaque seconde tant que le moteur tourne. Rend `false` pour demander l'arrêt (un Syncthing installé
    /// partage maintenant le dossier : jamais deux synchros sur le même dossier).
    pub on_tick: Box<dyn Fn(&SyncthingApi) -> bool + Send + Sync>,
}

#[derive(Clone)]
pub struct Snapshot {
    pub state: EngineState,
    pub api: Option<SyncthingApi>,
    pub my_id: Option<String>,
    /// Le chemin du dossier du moteur quand il n'est plus le dossier de données de l'app.
    pub mismatch: Option<String>,
}

impl Snapshot {
    fn idle(state: EngineState) -> Self {
        Self { state, api: None, my_id: None, mismatch: None }
    }
}

pub struct Engine {
    snapshot: Arc<Mutex<Snapshot>>,
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
    pub log: Arc<RotatingLog>,
}

enum Outcome {
    Stopped,
    Blocked,
    Exited { answered_at: Option<Instant>, error: String },
}

const READY_TIMEOUT: Duration = Duration::from_secs(60);
const STOP_TIMEOUT: Duration = Duration::from_secs(10);

impl Engine {
    pub fn new(log: Arc<RotatingLog>) -> Self {
        Self {
            snapshot: Arc::new(Mutex::new(Snapshot::idle(EngineState::Stopped))),
            stop: Arc::new(AtomicBool::new(false)),
            thread: Mutex::new(None),
            log,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        self.snapshot.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Le fil superviseur tourne (le moteur marche, ou une relance est programmée).
    pub fn is_active(&self) -> bool {
        self.thread.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|t| !t.is_finished())
    }

    pub fn set_state(&self, state: EngineState) {
        self.snapshot.lock().unwrap_or_else(|e| e.into_inner()).state = state;
    }

    /// Lance le superviseur, sans attendre le moteur. Un superviseur qui a abandonné se relance ici (« Réessayer »).
    pub fn start(&self, params: EngineParams, hooks: Arc<Hooks>, policy: RestartPolicy) -> Result<(), String> {
        let mut slot = self.thread.lock().unwrap_or_else(|e| e.into_inner());
        if slot.as_ref().is_some_and(|t| !t.is_finished()) {
            return Err("Le moteur de synchronisation est déjà lancé.".to_string());
        }
        if let Some(finished) = slot.take() {
            let _ = finished.join();
        }
        if !params.exe.is_file() {
            self.set_state(EngineState::Missing);
            return Err(format!("Le moteur de synchronisation est introuvable : {}", params.exe.display()));
        }
        self.stop.store(false, Ordering::SeqCst);
        self.set_state(EngineState::Starting);
        let (snapshot, stop, log) = (self.snapshot.clone(), self.stop.clone(), self.log.clone());
        *slot = Some(
            std::thread::Builder::new()
                .name("syncthing-supervisor".into())
                .spawn(move || supervise(params, hooks, policy, snapshot, stop, log))
                .map_err(|e| e.to_string())?,
        );
        Ok(())
    }

    /// Arrêt propre (`/rest/system/shutdown`, puis fin du processus) : bloque jusqu'à 10 s.
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        let handle = self.thread.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(handle) = handle {
            let _ = handle.join();
        }
        *self.snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Stopped);
    }
}

fn sleep_unless_stopped(stop: &AtomicBool, total: Duration) -> bool {
    let end = Instant::now() + total;
    while Instant::now() < end {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    !stop.load(Ordering::SeqCst)
}

fn supervise(
    params: EngineParams,
    hooks: Arc<Hooks>,
    mut policy: RestartPolicy,
    snapshot: Arc<Mutex<Snapshot>>,
    stop: Arc<AtomicBool>,
    log: Arc<RotatingLog>,
) {
    let set = |state: EngineState| snapshot.lock().unwrap_or_else(|e| e.into_inner()).state = state;
    while !stop.load(Ordering::SeqCst) {
        set(EngineState::Starting);
        match run_once(&params, &hooks, &snapshot, &stop, &log) {
            Outcome::Stopped => break,
            Outcome::Blocked => {
                log.note("Un Syncthing installé partage maintenant le dossier : le moteur de l'app s'arrête.");
                *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::BlockedByInstalled);
                return;
            }
            Outcome::Exited { answered_at, error } => {
                log.note(&format!("Moteur arrêté : {error}"));
                *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Starting);
                let ran = answered_at.map(|at| at.elapsed()).unwrap_or_default();
                match policy.on_exit(ran, answered_at.is_some()) {
                    Decision::RetryIn { delay, attempt } => {
                        set(EngineState::Backoff { attempt, retry_in_ms: delay.as_millis() as u64, error });
                        if !sleep_unless_stopped(&stop, delay) {
                            break;
                        }
                    }
                    Decision::GiveUp => {
                        log.note("Trop d'échecs de suite : plus de relance automatique.");
                        set(EngineState::Failed { error });
                        return;
                    }
                }
            }
        }
    }
    *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Stopped);
}

/// Réécrit `config.xml` avec les options imposées (écriture atomique). Appelé avant CHAQUE `serve` : le port d'écoute
/// gardé est revérifié, et un autre est tiré s'il n'est plus libre.
fn prepare_home(params: &EngineParams, hooks: &Hooks) -> Result<u16, String> {
    process::ensure_generated(&params.exe, &params.home)?;
    let port = match params.listen_port {
        Some(port) if ports::binds_tcp_and_udp(port) => port,
        _ => {
            let port = ports::pick_listen_port()?;
            (hooks.on_listen_port)(port);
            port
        }
    };
    let path = params.home.join("config.xml");
    let xml = fs::read_to_string(&path).map_err(|e| format!("config.xml illisible : {e}"))?;
    let prepared = config::prepare_config(&xml, port, &params.gui_user, &params.gui_password_hash)?;
    let temporary = params.home.join("config.xml.neo-tmp");
    fs::write(&temporary, prepared).map_err(|e| format!("config.xml impossible à écrire : {e}"))?;
    fs::rename(&temporary, &path).map_err(|e| format!("config.xml impossible à remplacer : {e}"))?;
    Ok(port)
}

fn run_once(
    params: &EngineParams,
    hooks: &Hooks,
    snapshot: &Mutex<Snapshot>,
    stop: &AtomicBool,
    log: &Arc<RotatingLog>,
) -> Outcome {
    let failed = |error: String| Outcome::Exited { answered_at: None, error };
    log.note("Démarrage du moteur de synchronisation");
    if let Some(pid) = process::kill_stale(&params.home, &params.exe) {
        log.note(&format!("Moteur resté d'un lancement précédent terminé (PID {pid})"));
    }
    let port = match prepare_home(params, hooks) {
        Ok(port) => port,
        Err(e) => return failed(e),
    };
    let gui_port = match ports::pick_gui_port() {
        Ok(p) => p,
        Err(e) => return failed(e),
    };
    let key = config::random_chars(b"abcdefghijklmnopqrstuvwxyzABCDEF", 32);
    let address = format!("127.0.0.1:{gui_port}");
    let mut child = match process::spawn(&params.exe, &params.home, &address, &key) {
        Ok(child) => child,
        Err(e) => return failed(format!("Syncthing ne se lance pas : {e}")),
    };
    let _ = process::write_pidfile(&params.home, child.id());
    process::pump_output(&mut child, log);
    let api = SyncthingApi::new(Arc::new(UreqTransport::new(&address, &key)));

    // Attente de la réponse du moteur.
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if stop.load(Ordering::SeqCst) {
            shut_down(&api, &mut child, &params.home, log);
            return Outcome::Stopped;
        }
        if let Ok(Some(status)) = child.try_wait() {
            process::remove_pidfile(&params.home);
            return failed(format!("Le moteur s'est arrêté au démarrage ({status})"));
        }
        if api.is_healthy() {
            break;
        }
        if Instant::now() > deadline {
            shut_down(&api, &mut child, &params.home, log);
            return failed("Le moteur ne répond pas".to_string());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let answered_at = Instant::now();

    let my_id = match configure(&api, params, port) {
        Ok((id, mismatch)) => {
            let mut shared = snapshot.lock().unwrap_or_else(|e| e.into_inner());
            *shared = Snapshot { state: EngineState::Running, api: Some(api.clone()), my_id: Some(id.clone()), mismatch };
            id
        }
        Err(e) => {
            shut_down(&api, &mut child, &params.home, log);
            return failed(format!("Configuration refusée par le moteur : {e}"));
        }
    };
    log.note(&format!("Moteur prêt (appareil {})", my_id.chars().take(7).collect::<String>()));

    let mut last_tick = Instant::now() - Duration::from_secs(1);
    loop {
        if stop.load(Ordering::SeqCst) {
            shut_down(&api, &mut child, &params.home, log);
            return Outcome::Stopped;
        }
        if let Ok(Some(status)) = child.try_wait() {
            process::remove_pidfile(&params.home);
            return Outcome::Exited { answered_at: Some(answered_at), error: format!("Le moteur s'est arrêté ({status})") };
        }
        if last_tick.elapsed() >= Duration::from_secs(1) {
            last_tick = Instant::now();
            if !(hooks.on_tick)(&api) {
                shut_down(&api, &mut child, &params.home, log);
                return Outcome::Blocked;
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Options par l'API (la source de vérité après le démarrage), dossier de notes, détection d'un changement de dossier de données.
fn configure(api: &SyncthingApi, params: &EngineParams, port: u16) -> Result<(String, Option<String>), String> {
    api.patch_options(&config::options_json(port)).map_err(|e| e.to_string())?;
    let setup = SyncSetup { api, folder_path: Path::new(&params.folder_path) };
    setup.ensure_folder_seeded(&params.seed).map_err(|e| e.to_string())?;
    let mismatch = setup.folder_mismatch().map_err(|e| e.to_string())?.map(|f| f.path);
    Ok((api.my_id().map_err(|e| e.to_string())?, mismatch))
}

/// `/rest/system/shutdown`, puis fin du processus ; au bout de 10 s, fin forcée DU PROCESSUS QU'ON A LANCÉ (notre `Child`).
fn shut_down(api: &SyncthingApi, child: &mut Child, home: &Path, log: &RotatingLog) {
    let _ = api.shutdown();
    let end = Instant::now() + STOP_TIMEOUT;
    while Instant::now() < end {
        if matches!(child.try_wait(), Ok(Some(_))) {
            process::remove_pidfile(home);
            log.note("Moteur arrêté proprement");
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    process::remove_pidfile(home);
    log.note("Moteur arrêté de force (il n'a pas répondu à l'arrêt propre)");
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
```

Run : `cargo test --lib sync::engine::`
Expected : `test result: ok. 5 passed; … finished in 4.54s` environ. Les trois premiers tests (moteur absent, abandon au cinquième échec, arrêt immédiat pendant une attente) n'ont pas besoin du binaire ; les deux autres lancent le vrai Syncthing : il démarre, n'a que le dossier de l'app, `config.xml` porte l'identifiant et le mot de passe haché et `localAnnounceEnabled=false`, `engine.pid` existe puis disparaît à l'arrêt propre, une relance garde l'identité, et le crochet d'exclusivité l'arrête (`BlockedByInstalled`).

- [ ] **Step 5 : Aucun processus ne traîne, puis commit**

Run : `Get-CimInstance Win32_Process -Filter "Name='syncthing.exe'" | Select-Object ProcessId, ExecutablePath`
Expected : aucun chemin sous `%TEMP%` ni sous `...\syncthing\bin\` (les moteurs de test sont arrêtés proprement). S'il en reste un, relever son PID et ne terminer QUE ce PID après avoir vérifié son `ExecutablePath`.

```bash
git add apps/windows/src-tauri/src/sync
git commit -m "PC : le processus Syncthing (copie dans le dossier d'état, nettoyage par PID) et son superviseur (relances 2/4/8/16 s)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 6 : Rust : détecter un Syncthing installé, lui reprendre le seul dossier Neo Calendar, le lui rendre

**Files:**
- Create: `apps/windows/src-tauri/src/sync/installed.rs`
- Modify: `apps/windows/src-tauri/src/sync/mod.rs`

**Interfaces:**
- Consumes: `api::{SyncthingApi, UreqTransport}`, `setup::same_path`, `testing::FakeTransport`.
- Produces: `installed::{InstalledConfig, InstalledFolder, Detection, Takeover, config_path, parse_config, read_config, detect, withdraw_folder, restore_folder}` ; `InstalledConfig::{sharing(data_folder), api()}`.

Tâche à risque (écriture dans la configuration d'un autre programme) : **revue sonnet à la fin**. Règles codées ici : la détection lit la CONFIGURATION (`<folder path=…>` de premier niveau, jamais le bloc `<defaults>`) et ne regarde pas le disque ; une interface HTTPS est refusée avec une explication (le client n'a pas de TLS) ; la sauvegarde est copiée, relue et analysée AVANT tout retrait ; le retrait est suivi d'une relecture de la liste des dossiers, qui doit être exactement celle d'avant moins Neo Calendar, sinon le dossier est remis.

- [ ] **Step 1 : Tests seuls**

Ajouter `pub mod installed;`. Créer le fichier avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;

    const CONFIG: &str = r#"<configuration version="52">
    <folder id="neo-old" label="Neo Calendar" path="C:\Neo Calendar" type="sendreceive">
        <device id="OLDPC" introducedBy=""></device>
        <device id="LAPTOP" introducedBy=""></device>
        <device id="PHONE" introducedBy=""></device>
    </folder>
    <folder id="vault" label="Coffre" path="C:\Vaults\Perso" type="sendreceive">
        <device id="OLDPC" introducedBy=""></device>
        <device id="LAPTOP" introducedBy=""></device>
    </folder>
    <device id="OLDPC" name="DESKTOP-1" compression="metadata"><address>dynamic</address></device>
    <device id="LAPTOP" name="Laptop d'Ahmed" compression="metadata"><address>dynamic</address></device>
    <device id="PHONE" name="Pixel" compression="metadata"><address>dynamic</address></device>
    <gui enabled="true" tls="false"><address>127.0.0.1:8384</address><apikey>CLE</apikey></gui>
    <defaults>
        <folder id="" label="" path="~"><device id="OLDPC"></device></folder>
        <device id="" compression="metadata"></device>
    </defaults>
</configuration>"#;

    #[test]
    fn the_installed_config_is_read_without_the_defaults_block() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(config.folders.len(), 2, "les modèles de <defaults> ne sont pas des partages");
        assert_eq!(config.folders[0].device_ids, vec!["OLDPC", "LAPTOP", "PHONE"]);
        assert_eq!(config.devices.len(), 3);
        assert_eq!(config.devices[1], ("LAPTOP".to_string(), "Laptop d'Ahmed".to_string()));
        assert_eq!((config.gui_address.as_str(), config.api_key.as_str(), config.gui_tls), ("127.0.0.1:8384", "CLE", false));
    }

    #[test]
    fn something_else_than_a_config_is_refused() {
        assert!(parse_config("<html></html>").is_err());
    }

    #[test]
    fn sharing_is_decided_on_the_config_path_not_on_the_filesystem() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(config.sharing("c:/neo calendar/").unwrap().id, "neo-old");
        assert!(config.sharing("C:\\Vaults").is_none());
    }

    #[test]
    fn an_orphan_stfolder_marker_is_not_a_conflict() {
        // Ahmed a retiré le partage dans son Syncthing : `.stfolder` reste, la configuration ne partage plus rien.
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".stfolder")).unwrap();
        let only_vaults = CONFIG.replace(r#"path="C:\Neo Calendar""#, r#"path="C:\Ailleurs""#);
        let config = parse_config(&only_vaults).unwrap();
        let data_folder = dir.path().to_string_lossy().into_owned();
        assert_eq!(detect(Some(&config), &data_folder, &|_| true), Detection::NotSharing);
    }

    #[test]
    fn detection_covers_every_case() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(detect(None, "C:\\Neo Calendar", &|_| true), Detection::NotInstalled);
        assert_eq!(detect(Some(&config), "D:\\Autre", &|_| true), Detection::NotSharing);
        assert_eq!(
            detect(Some(&config), "C:\\Neo Calendar", &|_| false),
            Detection::Shares { folder_id: "neo-old".into(), label: "Neo Calendar".into(), running: false, tls: false, other_folders: 1 }
        );
        let tls = parse_config(&CONFIG.replace(r#"tls="false""#, r#"tls="true""#)).unwrap();
        let Detection::Shares { running, tls: is_tls, .. } = detect(Some(&tls), "C:\\Neo Calendar", &|_| true) else {
            panic!("doit partager")
        };
        assert!(is_tls && !running, "en HTTPS la reprise automatique n'est pas proposée");
    }

    fn old_syncthing() -> (Arc<FakeTransport>, SyncthingApi) {
        let fake = Arc::new(FakeTransport::default());
        fake.answer("GET /rest/system/status", r#"{"myID":"OLDPC"}"#);
        fake.answer("GET /rest/config/devices", r#"[{"deviceID":"OLDPC","name":"DESKTOP-1"},{"deviceID":"LAPTOP","name":"Laptop d'Ahmed"},{"deviceID":"PHONE","name":"Pixel"}]"#);
        fake.answer("GET /rest/config/folders/neo-old", r#"{"id":"neo-old","label":"Neo Calendar","path":"C:\\Neo Calendar","devices":[{"deviceID":"OLDPC"},{"deviceID":"LAPTOP"},{"deviceID":"PHONE"}]}"#);
        let api = SyncthingApi::new(fake.clone());
        (fake, api)
    }

    fn setup_files() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config.xml");
        fs::write(&file, CONFIG).unwrap();
        (dir, file)
    }

    #[test]
    fn withdrawing_backs_up_first_then_removes_only_the_neo_calendar_folder() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"vault"}]"#);
        fake.answer("DELETE /rest/config/folders/neo-old", "");

        let takeover = withdraw_folder(&config, &api, &file, &dir.path().join("sauvegardes"), "20261002-190000", "C:\\Neo Calendar").unwrap();

        let backup = dir.path().join("sauvegardes").join("config.xml.avant-reprise-20261002-190000");
        assert_eq!(fs::read_to_string(backup).unwrap(), CONFIG, "sauvegarde identique à l'original");
        assert_eq!(takeover.folder_id, "neo-old");
        assert_eq!(takeover.devices, vec![("LAPTOP".to_string(), "Laptop d'Ahmed".to_string()), ("PHONE".to_string(), "Pixel".to_string())]);
        assert_eq!(takeover.old_device_id, "OLDPC");
        let calls = fake.calls.lock().unwrap();
        let deletes: Vec<&str> = calls.iter().filter(|c| c.method == "DELETE").map(|c| c.path.as_str()).collect();
        assert_eq!(deletes, vec!["/rest/config/folders/neo-old"], "un seul retrait, et pas celui des coffres");
        assert!(calls.iter().all(|c| !c.path.contains("/devices/") || c.method == "GET"), "aucun appareil retiré ou modifié");
    }

    #[test]
    fn if_the_removal_touches_something_else_the_folder_is_put_back() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", r#"[]"#);
        fake.answer("DELETE /rest/config/folders/neo-old", "");
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let error = withdraw_folder(&config, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert!(error.contains("remis"));
        assert_eq!(fake.count("PUT", "/rest/config/folders/neo-old"), 1);
    }

    #[test]
    fn a_failed_backup_stops_everything_before_any_removal() {
        let (fake, api) = old_syncthing();
        let config = parse_config(CONFIG).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("absent.xml");
        assert!(withdraw_folder(&config, &api, &missing, dir.path(), "x", "C:\\Neo Calendar").is_err());
        assert_eq!(fake.count("DELETE", "/rest"), 0);
    }

    #[test]
    fn a_https_gui_is_refused_with_an_explanation() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let tls = parse_config(&CONFIG.replace(r#"tls="false""#, r#"tls="true""#)).unwrap();
        let error = withdraw_folder(&tls, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert!(error.contains("HTTPS"));
        assert_eq!(fake.calls.lock().unwrap().len(), 0);
    }

    #[test]
    fn giving_back_puts_the_saved_folder_into_the_installed_syncthing() {
        let (fake, api) = old_syncthing();
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let takeover = Takeover {
            folder_id: "neo-old".into(),
            folder: serde_json::json!({"id": "neo-old", "path": "C:\\Neo Calendar"}),
            devices: vec![],
            old_device_id: "OLDPC".into(),
            backup_path: String::new(),
            taken_at: String::new(),
        };
        restore_folder(&api, &takeover).unwrap();
        assert!(fake.sent("PUT", "/rest/config/folders/neo-old").unwrap().contains("C:\\\\Neo Calendar"));
    }
}
```

Run : `cargo test --lib sync::installed::` ; Expected : échec de compilation (`cannot find function \`parse_config\``).

- [ ] **Step 2 : Implémentation**

AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! Un Syncthing installé à côté de l'app : le détecter, et lui reprendre le seul dossier Neo Calendar.
//!
//! Règles d'Ahmed : jamais deux synchros sur le même dossier ; la détection ne repose JAMAIS sur la présence de
//! `.stfolder` (un marqueur orphelin reste quand on retire un partage : ce n'est pas un conflit) mais sur la
//! configuration du Syncthing installé ; la reprise se fait après confirmation, avec sauvegarde de sa
//! configuration, et ne retire QUE le dossier Neo Calendar (ses autres dossiers et appareils ne sont pas touchés).

use super::api::{SyncthingApi, UreqTransport};
use super::setup::same_path;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq)]
pub struct InstalledFolder {
    pub id: String,
    pub label: String,
    pub path: String,
    pub device_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct InstalledConfig {
    pub gui_address: String,
    pub gui_tls: bool,
    pub api_key: String,
    pub folders: Vec<InstalledFolder>,
    /// Les appareils déclarés (identifiant, nom), le Syncthing installé compris.
    pub devices: Vec<(String, String)>,
}

/// `%LOCALAPPDATA%\Syncthing\config.xml`.
pub fn config_path(local_app_data: &Path) -> PathBuf {
    local_app_data.join("Syncthing").join("config.xml")
}

fn attribute(element: &quick_xml::events::BytesStart<'_>, name: &str) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|a| a.key.as_ref() == name.as_bytes())
        .and_then(|a| a.normalized_value(quick_xml::XmlVersion::Implicit1_0).ok())
        .map(|v| v.into_owned())
}

/// Lit la configuration d'un Syncthing (lecture seule). Seuls les éléments de premier niveau comptent : les
/// `<folder>` et `<device>` du bloc `<defaults>` sont des modèles, pas des partages.
pub fn parse_config(xml: &str) -> Result<InstalledConfig, String> {
    let mut reader = Reader::from_str(xml);
    let mut config = InstalledConfig::default();
    let mut path: Vec<String> = Vec::new();
    let mut saw_configuration = false;
    loop {
        let event = reader.read_event().map_err(|e| format!("config.xml illisible : {e}"))?;
        match event {
            Event::Eof => break,
            Event::Start(ref e) | Event::Empty(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                let here: Vec<&str> = path.iter().map(String::as_str).chain([name.as_str()]).collect();
                match here.as_slice() {
                    ["configuration"] => saw_configuration = true,
                    ["configuration", "gui"] => config.gui_tls = attribute(e, "tls").as_deref() == Some("true"),
                    ["configuration", "folder"] => config.folders.push(InstalledFolder {
                        id: attribute(e, "id").unwrap_or_default(),
                        label: attribute(e, "label").unwrap_or_default(),
                        path: attribute(e, "path").unwrap_or_default(),
                        device_ids: Vec::new(),
                    }),
                    ["configuration", "folder", "device"] => {
                        if let (Some(folder), Some(id)) = (config.folders.last_mut(), attribute(e, "id")) {
                            folder.device_ids.push(id);
                        }
                    }
                    ["configuration", "device"] => config
                        .devices
                        .push((attribute(e, "id").unwrap_or_default(), attribute(e, "name").unwrap_or_default())),
                    _ => {}
                }
                if matches!(event, Event::Start(_)) {
                    path.push(name);
                }
            }
            Event::End(_) => {
                path.pop();
            }
            Event::Text(ref t) => {
                let text = t.decode().map(|c| c.trim().to_string()).unwrap_or_default();
                match path.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
                    ["configuration", "gui", "address"] => config.gui_address = text,
                    ["configuration", "gui", "apikey"] => config.api_key = text,
                    _ => {}
                }
            }
            _ => {}
        }
    }
    if !saw_configuration {
        return Err("ce n'est pas une configuration Syncthing".to_string());
    }
    Ok(config)
}

/// `None` quand aucun Syncthing n'est installé pour cet utilisateur.
pub fn read_config(local_app_data: &Path) -> Result<Option<InstalledConfig>, String> {
    let path = config_path(local_app_data);
    if !path.is_file() {
        return Ok(None);
    }
    let xml = fs::read_to_string(&path).map_err(|e| format!("Lecture de {} impossible : {e}", path.display()))?;
    parse_config(&xml).map(Some)
}

impl InstalledConfig {
    /// Le dossier de ce Syncthing qui est le dossier de données de l'app, s'il y en a un.
    pub fn sharing(&self, data_folder: &str) -> Option<&InstalledFolder> {
        self.folders.iter().find(|f| same_path(&f.path, data_folder))
    }

    pub fn api(&self) -> SyncthingApi {
        SyncthingApi::new(Arc::new(UreqTransport::new(&self.gui_address, &self.api_key)))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Detection {
    /// Pas de Syncthing installé.
    NotInstalled,
    /// Un Syncthing est installé mais ne partage pas le dossier de données (un `.stfolder` orphelin n'y change rien).
    NotSharing,
    /// Il partage le dossier : le moteur de l'app ne démarre pas dessus. `running` : son API répond, la reprise est possible.
    Shares { folder_id: String, label: String, running: bool, tls: bool, other_folders: usize },
}

pub fn detect(config: Option<&InstalledConfig>, data_folder: &str, running: &dyn Fn(&InstalledConfig) -> bool) -> Detection {
    let Some(config) = config else {
        return Detection::NotInstalled;
    };
    match config.sharing(data_folder) {
        None => Detection::NotSharing,
        Some(folder) => Detection::Shares {
            folder_id: folder.id.clone(),
            label: folder.label.clone(),
            running: !config.gui_tls && running(config),
            tls: config.gui_tls,
            other_folders: config.folders.len() - 1,
        },
    }
}

/// Ce qu'il faut garder pour rendre le dossier : sa configuration brute, les appareils qui le partageaient, la sauvegarde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Takeover {
    pub folder_id: String,
    pub folder: Value,
    /// Les appareils qui partageaient le dossier (identifiant, nom), sans le Syncthing installé lui-même.
    pub devices: Vec<(String, String)>,
    pub old_device_id: String,
    pub backup_path: String,
    pub taken_at: String,
}

/// Étapes 1 à 3 de la reprise, côté Syncthing installé : sauvegarde de sa configuration, lecture du dossier, retrait
/// de CE dossier seulement. Rien ne touche au moteur de l'app. Si le retrait n'a pas l'effet attendu (un autre dossier
/// a disparu aussi), le dossier est remis et la reprise échoue.
pub fn withdraw_folder(
    config: &InstalledConfig,
    old: &SyncthingApi,
    config_file: &Path,
    backup_dir: &Path,
    stamp: &str,
    data_folder: &str,
) -> Result<Takeover, String> {
    if config.gui_tls {
        return Err("L'interface de ce Syncthing est en HTTPS : l'app ne peut pas la piloter. Retirez le dossier Neo Calendar dans Syncthing, puis relancez la détection.".to_string());
    }
    let folder = config.sharing(data_folder).ok_or("Ce Syncthing ne partage pas le dossier de Neo Calendar.")?;

    fs::create_dir_all(backup_dir).map_err(|e| format!("Sauvegarde impossible : {e}"))?;
    let backup = backup_dir.join(format!("config.xml.avant-reprise-{stamp}"));
    fs::copy(config_file, &backup).map_err(|e| format!("Sauvegarde de la configuration impossible : {e}"))?;
    let copy = fs::read_to_string(&backup).map_err(|e| format!("Sauvegarde illisible : {e}"))?;
    if parse_config(&copy).map(|c| c.folders.len()) != Ok(config.folders.len()) {
        return Err("La sauvegarde de la configuration n'est pas conforme : reprise annulée.".to_string());
    }

    let raw = old.folder_config(&folder.id).map_err(|e| e.to_string())?;
    let old_device_id = old.my_id().map_err(|e| e.to_string())?;
    let names = old.devices().map_err(|e| e.to_string())?;
    let before: Vec<String> = old.folders().map_err(|e| e.to_string())?.into_iter().map(|f| f.id).collect();

    let takeover = Takeover {
        folder_id: folder.id.clone(),
        folder: raw,
        devices: folder
            .device_ids
            .iter()
            .filter(|id| **id != old_device_id)
            .map(|id| (id.clone(), names.iter().find(|d| &d.id == id).map(|d| d.name.clone()).unwrap_or_default()))
            .collect(),
        old_device_id,
        backup_path: backup.to_string_lossy().into_owned(),
        taken_at: stamp.to_string(),
    };

    old.remove_folder(&folder.id).map_err(|e| e.to_string())?;
    let after: Vec<String> = old.folders().map_err(|e| e.to_string())?.into_iter().map(|f| f.id).collect();
    let expected: Vec<String> = before.iter().filter(|id| **id != folder.id).cloned().collect();
    if after != expected {
        let _ = old.put_folder(&takeover.folder);
        return Err("Le retrait du dossier a touché autre chose que Neo Calendar : le dossier a été remis, reprise annulée.".to_string());
    }
    Ok(takeover)
}

/// Remet le dossier dans le Syncthing installé, tel qu'il était (« Rendre le dossier à Syncthing »).
pub fn restore_folder(old: &SyncthingApi, takeover: &Takeover) -> Result<(), String> {
    old.put_folder(&takeover.folder).map_err(|e| e.to_string())
}
```

Run : `cargo test --lib sync::installed::` ; Expected : `test result: ok. 10 passed`.

- [ ] **Step 3 : Revue (sonnet)** : relire `installed.rs` contre la section 3 de la spec (sauvegarde avant retrait, un seul dossier retiré, retour en arrière, exclusivité), sans re-revue après correctif.

- [ ] **Step 4 : Commit**

```bash
git add apps/windows/src-tauri/src/sync/installed.rs apps/windows/src-tauri/src/sync/mod.rs
git commit -m "PC : détection d'un Syncthing installé par sa configuration, reprise du seul dossier Neo Calendar avec sauvegarde, retour en arrière" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 7 : Rust : le contrôleur et les essais à vrais moteurs (reprise, retour, appairage, synchro dans les deux sens)

**Files:**
- Create: `apps/windows/src-tauri/src/sync/control.rs`, `apps/windows/src-tauri/src/sync/control_tests.rs`
- Modify: `apps/windows/src-tauri/src/sync/mod.rs`

**Interfaces:**
- Consumes: toutes les tâches précédentes.
- Produces: `control::{Controller, StatusDto, DeviceDto, PendingDto, FolderDto, PairingDto, DetectionDto, ENGINE_VERSION}` avec `Controller::{new(state_dir, local_app_data, exe), start_if_enabled(Option<&str>), enable, disable, retry, shutdown, status, pairing_start, pairing_cancel, accept_device, reject_device, remove_device, repoint_folder, detect, take_over(data_folder, stamp), give_back, log_text}`. Les DTO se sérialisent en camelCase (`kind` pour les enums) : c'est le contrat lu par `desktopSync.ts` (Task 9).

Le contrôleur ne dépend pas de Tauri : ses tests pilotent de vrais moteurs. Il garde l'ordre qui protège les données : à la reprise le dossier est retiré de l'ancien Syncthing, `reprise.json` est écrit, le moteur de l'app démarre sur le MÊME identifiant ; au retour le dossier est retiré du moteur de l'app AVANT d'être remis dans l'autre. L'appairage accepte, à chaque seconde, la seule demande dont le nom porte le bon code (`Pairing::judge`), avec son nom nettoyé du code.

- [ ] **Step 1 : Les essais d'abord**

Ajouter `pub mod control;`. Créer `apps/windows/src-tauri/src/sync/control_tests.rs` :

```rust
use super::*;
use crate::sync::config;
use crate::sync::testing::{real_binary, OldSyncthing};
use serde_json::json;

const DEVICE_LAPTOP: &str = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX";
const DEVICE_PHONE: &str = "FZPTIO7-2SEHRTD-BIQMJM4-3SJGFHY-6RRULGN-Z4STOOQ-NUXYDXE-AIGNRAI";

struct Dirs {
    root: tempfile::TempDir,
}

impl Dirs {
    fn new() -> Self {
        Self { root: tempfile::tempdir().unwrap() }
    }
    fn state(&self) -> PathBuf {
        self.root.path().join("etat")
    }
    /// Le faux `%LOCALAPPDATA%`.
    fn lad(&self) -> PathBuf {
        self.root.path().join("lad")
    }
    fn notes(&self) -> PathBuf {
        self.root.path().join("Neo Calendar")
    }
    fn controller(&self, exe: PathBuf) -> Arc<Controller> {
        fs::create_dir_all(self.lad()).unwrap();
        fs::create_dir_all(self.notes()).unwrap();
        Controller::new(self.state(), self.lad(), exe)
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn write_installed_config(lad: &Path, xml: &str) {
    fs::create_dir_all(lad.join("Syncthing")).unwrap();
    fs::write(lad.join("Syncthing").join("config.xml"), xml).unwrap();
}

fn installed_config_sharing(path: &Path) -> String {
    format!(
        r#"<configuration version="52"><folder id="neo-old" label="Neo" path="{}"><device id="OLD"></device></folder><gui tls="false"><address>127.0.0.1:1</address><apikey>k</apikey></gui></configuration>"#,
        path.display()
    )
}

#[test]
fn a_disabled_sync_never_starts_the_engine() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.start_if_enabled(Some(&path_text(&dirs.notes()))).unwrap();
    assert_eq!(controller.status().state, EngineState::Stopped);
    assert!(!controller.status().enabled);
}

#[test]
fn enabling_is_remembered_for_the_next_launch() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let _ = controller.enable(&path_text(&dirs.notes()));
    let saved = SyncSettings::load(&dirs.state());
    assert!(saved.enabled);
    assert_eq!(saved.folder_path.as_deref(), Some(path_text(&dirs.notes()).as_str()));
    assert!(saved.gui_password_hash.is_some());
    controller.disable().unwrap();
    assert!(!SyncSettings::load(&dirs.state()).enabled);
}

#[test]
fn an_installed_syncthing_that_shares_the_folder_blocks_the_engine() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.notes()));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.enable(&path_text(&dirs.notes())).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
    assert!(controller.log_text().contains("partage ce dossier"));
}

#[test]
fn an_unreadable_installed_config_blocks_by_prudence() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), "pas du xml <<<");
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.enable(&path_text(&dirs.notes())).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
}

#[test]
fn an_orphan_stfolder_marker_does_not_block_the_engine() {
    // Le partage a été retiré du Syncthing installé : `.stfolder` reste, la configuration ne partage plus ce dossier.
    let dirs = Dirs::new();
    fs::create_dir_all(dirs.notes().join(".stfolder")).unwrap();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    // Le moteur est introuvable (fichier absent) : c'est la preuve qu'il a été DEMANDÉ, donc pas bloqué.
    assert!(controller.enable(&path_text(&dirs.notes())).is_err());
    assert_eq!(controller.status().state, EngineState::Missing);
    assert!(controller.detect(&path_text(&dirs.notes())).is_ok_and(|d| matches!(d, DetectionDto::NotSharing)));
}

#[test]
fn no_installed_syncthing_means_not_installed() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    assert!(matches!(controller.detect(&path_text(&dirs.notes())).unwrap(), DetectionDto::NotInstalled));
}

#[test]
fn take_over_refuses_when_the_installed_syncthing_does_not_share_the_folder() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let error = controller.take_over(&path_text(&dirs.notes()), "x").unwrap_err();
    assert!(error.contains("ne partage pas"));
    assert!(!dirs.state().join("sauvegardes").exists(), "rien n'a été sauvegardé ni touché");
}

fn wait_for_file(path: &Path, seconds: u64) -> bool {
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        if path.is_file() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

#[test]
fn the_folder_is_taken_over_from_a_test_syncthing_then_given_back() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let notes = dirs.notes();
    fs::create_dir_all(&notes).unwrap();
    fs::create_dir_all(dirs.lad()).unwrap();
    let vault = dirs.root.path().join("Coffre");
    fs::create_dir_all(vault.join(".stfolder")).unwrap();
    fs::create_dir_all(notes.join(".stfolder")).unwrap();

    // Le « Syncthing installé » : Neo Calendar (partagé avec un laptop et un téléphone) ET un coffre Obsidian.
    let old = OldSyncthing::start(&exe, &dirs.lad());
    let old_id = old.api.my_id().unwrap();
    old.api.put_device(&config::device(DEVICE_LAPTOP, "Laptop")).unwrap();
    old.api.put_device(&config::device(DEVICE_PHONE, "Pixel")).unwrap();
    let neo = config::folder("neo-old", "Neo Calendar", &path_text(&notes), &[old_id.clone(), DEVICE_LAPTOP.into(), DEVICE_PHONE.into()]);
    old.api.put_folder(&neo).unwrap();
    old.api.put_folder(&config::folder("vault", "Coffre", &path_text(&vault), &[old_id.clone(), DEVICE_LAPTOP.into()])).unwrap();
    let config_file = dirs.lad().join("Syncthing").join("config.xml");
    let before = loop {
        let text = fs::read_to_string(&config_file).unwrap();
        if text.contains("neo-old") && text.contains(r#"id="vault""#) {
            break text;
        }
        std::thread::sleep(Duration::from_millis(200));
    };

    let controller = dirs.controller(exe);
    let data = path_text(&notes);
    assert!(matches!(controller.detect(&data).unwrap(), DetectionDto::Shares { running: true, other_folders: 1, .. }));

    // Tant que l'autre Syncthing partage le dossier, le moteur de l'app ne démarre pas dessus.
    controller.enable(&data).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);

    controller.take_over(&data, "20261002-190000").unwrap();

    let status = controller.status();
    assert_eq!(status.state, EngineState::Running);
    assert!(status.taken_over);
    let engine_folders = controller.api().unwrap().folders().unwrap();
    assert_eq!(engine_folders.len(), 1);
    assert_eq!(engine_folders[0].id, "neo-old", "même identifiant : les autres appareils reconnaissent le dossier");
    for id in [DEVICE_LAPTOP, DEVICE_PHONE] {
        assert!(engine_folders[0].device_ids.iter().any(|d| d == id), "{id} est proposé");
    }
    // Le Syncthing installé ne garde que le coffre, et ses appareils ne sont pas touchés.
    let old_folders = old.api.folders().unwrap();
    assert_eq!(old_folders.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["vault"]);
    assert_eq!(old.api.devices().unwrap().len(), 3);
    let backup = dirs.state().join("sauvegardes").join("config.xml.avant-reprise-20261002-190000");
    assert_eq!(fs::read_to_string(backup).unwrap(), before, "sauvegarde identique à la configuration d'origine");

    // Retour en arrière.
    controller.give_back().unwrap();
    assert_eq!(controller.status().state, EngineState::Stopped);
    assert!(!controller.status().taken_over);
    let mut back: Vec<String> = old.api.folders().unwrap().into_iter().map(|f| f.id).collect();
    back.sort();
    assert_eq!(back, vec!["neo-old", "vault"]);
    let restored = old.api.folders().unwrap().into_iter().find(|f| f.id == "neo-old").unwrap();
    assert_eq!(restored.device_ids.len(), 3);
    // Et le moteur de l'app ne redémarre pas dessus tant que l'autre Syncthing le partage.
    controller.enable(&data).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
    controller.shutdown();
}

#[test]
fn qr_pairing_accepts_only_the_right_code_and_syncs_both_ways() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let controller = dirs.controller(exe.clone());
    let data = path_text(&dirs.notes());
    fs::write(dirs.notes().join("depuis-le-pc.md"), "du PC").unwrap();
    controller.enable(&data).unwrap();
    let pc_api = controller.wait_until_running(Duration::from_secs(90)).unwrap();
    let pc_id = pc_api.my_id().unwrap();
    let folder_id = controller.status().folder.unwrap().id;
    let pc_port = loop {
        if let Some(port) = controller.lock_settings().listen_port {
            break port;
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let pairing = controller.pairing_start().unwrap();
    assert!(pairing.qr_svg.contains("<svg") && pairing.expires_in_ms == 300_000);
    let code = controller.pairing.lock().unwrap().current_code().unwrap();

    // Deux « téléphones » : le bon (il a scanné) et un intrus qui présente un mauvais code.
    let phone_engine = |name: &str| -> (Engine, SyncthingApi, String, PathBuf) {
        let base = dirs.root.path().join(name);
        let notes = base.join("notes");
        fs::create_dir_all(&notes).unwrap();
        let engine = Engine::new(Arc::new(RotatingLog::new(base.join("journal"), 100_000)));
        let params = EngineParams {
            exe: exe.clone(),
            home: base.join("etat"),
            folder_path: notes.clone(),
            listen_port: None,
            gui_user: "essai".into(),
            gui_password_hash: bcrypt::hash("essai", 4).unwrap(),
            seed: FolderSeed::default(),
        };
        let hooks = Arc::new(Hooks { on_listen_port: Box::new(|_| {}), on_tick: Box::new(|_| true) });
        engine.start(params, hooks, RestartPolicy::default()).unwrap();
        let end = Instant::now() + Duration::from_secs(90);
        let api = loop {
            let snapshot = engine.snapshot();
            if let (EngineState::Running, Some(api)) = (snapshot.state, snapshot.api) {
                break api;
            }
            assert!(Instant::now() < end, "le moteur {name} ne démarre pas");
            std::thread::sleep(Duration::from_millis(200));
        };
        let id = api.my_id().unwrap();
        // Le téléphone neuf n'a pas encore de dossier : celui du moteur de test est retiré.
        let own = api.folders().unwrap().remove(0);
        api.remove_folder(&own.id).unwrap();
        (engine, api, id, notes)
    };
    let (good_engine, good_api, good_id, good_notes) = phone_engine("tel");
    let (bad_engine, bad_api, bad_id, _) = phone_engine("intrus");

    let present = |api: &SyncthingApi, id: &str, name: &str| {
        api.put_device(&config::device(id, name)).unwrap();
        let mut pc = config::device(&pc_id, "PC");
        pc["addresses"] = json!([format!("tcp://127.0.0.1:{pc_port}")]);
        api.put_device(&pc).unwrap();
    };
    present(&bad_api, &bad_id, "Intrus [NC:AAAAAAAAAA]");
    present(&good_api, &good_id, &format!("Pixel 8 [NC:{code}]"));

    // Le bon code est accepté sans question, avec le nom propre (sans code), et le dossier lui est partagé.
    let end = Instant::now() + Duration::from_secs(90);
    loop {
        if pc_api.devices().unwrap().iter().any(|d| d.id == good_id) {
            break;
        }
        assert!(Instant::now() < end, "le téléphone n'a pas été accepté");
        std::thread::sleep(Duration::from_millis(500));
    }
    let accepted = pc_api.devices().unwrap().into_iter().find(|d| d.id == good_id).unwrap();
    assert_eq!(accepted.name, "Pixel 8");
    assert!(pc_api.folders().unwrap()[0].device_ids.contains(&good_id));
    assert_eq!(controller.status().pairing_remaining_ms, None, "le code est à usage unique");

    // L'intrus n'est jamais accepté : sa demande reste à accepter à la main, sans son code à l'écran.
    assert!(pc_api.devices().unwrap().iter().all(|d| d.id != bad_id));
    let pending = controller.status().pending;
    if let Some(request) = pending.iter().find(|p| p.id == bad_id) {
        assert_eq!(request.name, "Intrus");
    }

    // Le téléphone adopte le dossier proposé, puis les notes passent dans les deux sens.
    let proposal_path = format!("/rest/cluster/pending/folders?device={}", crate::sync::api::urlencode(&pc_id));
    let end = Instant::now() + Duration::from_secs(90);
    loop {
        let offered = good_api.get(&proposal_path).unwrap();
        if offered.get(&folder_id).is_some() {
            break;
        }
        assert!(Instant::now() < end, "le dossier n'est pas proposé au téléphone");
        std::thread::sleep(Duration::from_millis(500));
    }
    fs::create_dir_all(good_notes.join(".stfolder")).unwrap();
    good_api.put_folder(&config::folder(&folder_id, "Neo Calendar", &path_text(&good_notes), &[good_id.clone(), pc_id.clone()])).unwrap();
    assert!(wait_for_file(&good_notes.join("depuis-le-pc.md"), 120), "PC vers téléphone");
    fs::write(good_notes.join("depuis-le-tel.md"), "du téléphone").unwrap();
    assert!(wait_for_file(&dirs.notes().join("depuis-le-tel.md"), 120), "téléphone vers PC");

    good_engine.stop();
    bad_engine.stop();
    controller.shutdown();
}
```

Ajouter à `testing.rs`, en fin de fichier, le « Syncthing installé » de test : un vrai moteur dont le dossier d'état est `<faux %LOCALAPPDATA%>\Syncthing` (là où l'app cherche `config.xml`), sur des ports tirés au hasard et SANS découverte locale (l'UDP 21027 est celui du vrai Syncthing d'Ahmed) ; il s'arrête proprement quand l'objet est détruit :

```rust
/// Un « Syncthing installé » de test : un vrai moteur dont le dossier d'état est `<lad>/Syncthing` (là où l'app cherche
/// `%LOCALAPPDATA%\Syncthing\config.xml`), sur des ports tirés au hasard, SANS découverte locale (l'UDP 21027 est celui
/// du vrai Syncthing de l'utilisateur : un essai n'y touche jamais).
pub struct OldSyncthing {
    pub api: super::api::SyncthingApi,
    child: std::process::Child,
}

impl OldSyncthing {
    pub fn config_only(exe: &std::path::Path, local_app_data: &std::path::Path) -> std::path::PathBuf {
        let home = local_app_data.join("Syncthing");
        super::process::ensure_generated(exe, &home).unwrap();
        let xml = std::fs::read_to_string(home.join("config.xml")).unwrap();
        let port = super::ports::pick_listen_port().unwrap();
        let quiet = super::config::prepare_config(&xml, port, "essai", &bcrypt::hash("essai", 4).unwrap()).unwrap();
        std::fs::write(home.join("config.xml"), quiet).unwrap();
        home
    }

    pub fn start(exe: &std::path::Path, local_app_data: &std::path::Path) -> Self {
        let home = Self::config_only(exe, local_app_data);
        let config = super::installed::parse_config(&std::fs::read_to_string(home.join("config.xml")).unwrap()).unwrap();
        let mut child = super::process::spawn(exe, &home, &config.gui_address, &config.api_key).unwrap();
        super::process::pump_output(&mut child, &std::sync::Arc::new(super::log::RotatingLog::new(home.join("journal"), 100_000)));
        let api = config.api();
        for _ in 0..240 {
            if api.is_healthy() {
                return Self { api, child };
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        panic!("le Syncthing de test ne répond pas");
    }
}

impl Drop for OldSyncthing {
    fn drop(&mut self) {
        let _ = self.api.shutdown();
        for _ in 0..100 {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
```

Créer `control.rs` avec seulement les lignes qui relient le fichier de tests :

```rust
#[cfg(test)]
#[path = "control_tests.rs"]
mod tests;
```

Run : `$env:SYNCTHING_BINARY = (node ..\..\..\scripts\fetch-syncthing-windows.mjs); cargo test --lib sync::control::` ; Expected : échec de compilation (`cannot find type \`Controller\``).

- [ ] **Step 2 : Le contrôleur**

Remplacer le contenu de `control.rs` par :

```rust
//! Le chef d'orchestre de la synchro intégrée : réglages, moteur, appairage, reprise depuis un Syncthing installé.
//! Aucune dépendance à Tauri : les commandes de `commands.rs` ne sont que de fines enveloppes, et les tests
//! pilotent ce module avec de vrais moteurs.

use super::api::SyncthingApi;
use super::engine::{Engine, EngineParams, Hooks};
use super::installed::{self, Detection, Takeover};
use super::log::RotatingLog;
use super::pairing::{self, Pairing, Verdict};
use super::settings::SyncSettings;
use super::setup::{FolderSeed, SyncSetup};
use super::supervision::{EngineState, RestartPolicy};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// La version du moteur embarqué, affichée sur la page.
pub const ENGINE_VERSION: &str = "2.1.5";
const TAKEOVER_FILE: &str = "reprise.json";
/// L'exclusivité est revérifiée toutes les 30 secondes : un Syncthing installé qui reprendrait le dossier plus tard ne doit pas coexister.
const EXCLUSIVITY_EVERY_TICKS: u64 = 30;

pub struct Controller {
    state_dir: PathBuf,
    local_app_data: PathBuf,
    /// Le `syncthing.exe` posé par l'installateur à côté de l'app (la source de la copie qui tourne).
    exe: PathBuf,
    engine: Engine,
    settings: Mutex<SyncSettings>,
    pairing: Mutex<Pairing>,
    /// Un seul geste lourd (reprise, retour en arrière) à la fois.
    heavy: Mutex<()>,
    takeover_running: AtomicBool,
    ticks: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingDto {
    pub id: String,
    /// Le nom présenté par l'appareil, sans son éventuel code d'appairage (qui ne s'affiche jamais).
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    pub id: String,
    pub path: String,
    pub state: String,
    pub need_files: u64,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDto {
    pub enabled: bool,
    pub engine_version: &'static str,
    pub state: EngineState,
    pub my_id: Option<String>,
    pub folder_path: Option<String>,
    pub folder: Option<FolderDto>,
    pub devices: Vec<DeviceDto>,
    pub pending: Vec<PendingDto>,
    /// Le dossier du moteur n'est plus le dossier de données de l'app : le chemin que le moteur synchronise encore.
    pub mismatch: Option<String>,
    pub pairing_remaining_ms: Option<u64>,
    /// Le dossier a été repris à un Syncthing installé : « Rendre le dossier à Syncthing » est proposé.
    pub taken_over: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingDto {
    pub qr_svg: String,
    pub expires_in_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DetectionDto {
    NotInstalled,
    NotSharing,
    #[serde(rename_all = "camelCase")]
    Shares { folder_id: String, label: String, running: bool, tls: bool, other_folders: usize },
}

impl Controller {
    pub fn new(state_dir: PathBuf, local_app_data: PathBuf, exe: PathBuf) -> Arc<Self> {
        let log = Arc::new(RotatingLog::new(state_dir.join("journal"), 1_048_576));
        let settings = SyncSettings::load(&state_dir);
        Arc::new(Self {
            engine: Engine::new(log),
            settings: Mutex::new(settings),
            pairing: Mutex::new(Pairing::default()),
            heavy: Mutex::new(()),
            takeover_running: AtomicBool::new(false),
            ticks: AtomicU64::new(0),
            state_dir,
            local_app_data,
            exe,
        })
    }

    fn lock_settings(&self) -> std::sync::MutexGuard<'_, SyncSettings> {
        self.settings.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn save_settings(&self, settings: &SyncSettings) -> Result<(), String> {
        settings.save(&self.state_dir).map_err(|e| format!("Réglages de la synchro impossibles à enregistrer : {e}"))
    }

    pub fn log_text(&self) -> String {
        self.engine.log.read_all()
    }

    fn home(&self) -> PathBuf {
        self.state_dir.join("moteur")
    }

    fn takeover_path(&self) -> PathBuf {
        self.state_dir.join(TAKEOVER_FILE)
    }

    fn read_takeover(&self) -> Option<Takeover> {
        serde_json::from_slice(&fs::read(self.takeover_path()).ok()?).ok()
    }

    /// Un Syncthing installé partage-t-il ce dossier ? Dans le doute (configuration illisible), oui : la fiabilité d'abord.
    fn installed_shares(&self, data_folder: &str) -> bool {
        match installed::read_config(&self.local_app_data) {
            Ok(None) => false,
            Ok(Some(config)) => config.sharing(data_folder).is_some(),
            Err(e) => {
                self.engine.log.note(&format!("Configuration du Syncthing installé illisible, par prudence le moteur de l'app ne démarre pas : {e}"));
                true
            }
        }
    }

    // ----- Cycle de vie -----

    /// Lance le moteur si la synchro est active. À appeler APRÈS le premier écran, jamais sur le chemin du lancement :
    /// ne bloque pas (le superviseur a son fil). `data_folder` : le dossier de données actuel de l'app.
    pub fn start_if_enabled(self: &Arc<Self>, data_folder: Option<&str>) -> Result<(), String> {
        {
            let mut settings = self.lock_settings();
            if !settings.enabled {
                return Ok(());
            }
            if let Some(folder) = data_folder {
                if settings.folder_path.as_deref() != Some(folder) {
                    settings.folder_path = Some(folder.to_string());
                    self.save_settings(&settings)?;
                }
            }
        }
        if self.engine.is_active() {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    fn start_engine(self: &Arc<Self>, skip_exclusivity: bool, seed: FolderSeed) -> Result<(), String> {
        let params = {
            let mut settings = self.lock_settings();
            let folder = settings.folder_path.clone().ok_or("Aucun dossier de données choisi.")?;
            if settings.ensure_gui_credentials()? {
                self.save_settings(&settings)?;
            }
            if !skip_exclusivity && self.installed_shares(&folder) {
                self.engine.set_state(EngineState::BlockedByInstalled);
                self.engine.log.note("Un Syncthing installé partage ce dossier : le moteur de l'app ne démarre pas dessus.");
                return Ok(());
            }
            let exe = match super::process::ensure_engine_copy(&self.exe, &self.state_dir.join("bin"), ENGINE_VERSION) {
                Ok(exe) => exe,
                Err(e) => {
                    self.engine.set_state(EngineState::Missing);
                    return Err(e);
                }
            };
            EngineParams {
                exe,
                home: self.home(),
                folder_path: PathBuf::from(&folder),
                listen_port: settings.listen_port,
                gui_user: settings.gui_user.clone().unwrap_or_default(),
                gui_password_hash: settings.gui_password_hash.clone().unwrap_or_default(),
                seed,
            }
        };
        let (for_port, for_tick) = (self.clone(), self.clone());
        let hooks = Arc::new(Hooks {
            on_listen_port: Box::new(move |port| {
                let mut settings = for_port.lock_settings();
                settings.listen_port = Some(port);
                let _ = for_port.save_settings(&settings);
            }),
            on_tick: Box::new(move |api| for_tick.tick(api)),
        });
        self.engine.start(params, hooks, RestartPolicy::default())
    }

    /// Active la synchro intégrée sur ce dossier de données (geste de l'utilisateur) et lance le moteur.
    pub fn enable(self: &Arc<Self>, data_folder: &str) -> Result<(), String> {
        {
            let mut settings = self.lock_settings();
            settings.enabled = true;
            settings.folder_path = Some(data_folder.to_string());
            self.save_settings(&settings)?;
        }
        if self.engine.is_active() {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    pub fn disable(&self) -> Result<(), String> {
        self.pairing.lock().unwrap_or_else(|e| e.into_inner()).cancel();
        self.engine.stop();
        let mut settings = self.lock_settings();
        settings.enabled = false;
        self.save_settings(&settings)
    }

    /// « Réessayer » après un abandon : on repart de zéro.
    pub fn retry(self: &Arc<Self>) -> Result<(), String> {
        self.engine.stop();
        if !self.lock_settings().enabled {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    /// À la fermeture de l'app (« Quitter », mise à jour) : arrêt propre du moteur.
    pub fn shutdown(&self) {
        self.engine.stop();
    }

    // ----- Chaque seconde, fil du moteur -----

    fn tick(&self, api: &SyncthingApi) -> bool {
        let count = self.ticks.fetch_add(1, Ordering::SeqCst) + 1;
        if count % EXCLUSIVITY_EVERY_TICKS == 0 && !self.takeover_running.load(Ordering::SeqCst) {
            let folder = self.lock_settings().folder_path.clone();
            if folder.is_some_and(|f| self.installed_shares(&f)) {
                return false;
            }
        }
        self.accept_paired(api);
        true
    }

    /// Accepte la demande qui porte le bon code d'appairage, et elle seule. Toute autre reste à accepter à la main.
    fn accept_paired(&self, api: &SyncthingApi) {
        let Ok(pending) = api.pending_devices() else { return };
        if pending.is_empty() {
            return;
        }
        let Some(folder) = self.lock_settings().folder_path.clone() else { return };
        for request in pending {
            let verdict = self.pairing.lock().unwrap_or_else(|e| e.into_inner()).judge(Instant::now(), &request.id, &request.name);
            if verdict != Verdict::Accept {
                continue;
            }
            let (name, _) = pairing::split_name(&request.name);
            let setup = SyncSetup { api, folder_path: Path::new(&folder) };
            match setup.accept_device(&request.id, &name) {
                Ok(()) => self.engine.log.note("Appairage par QR code : appareil accepté"),
                Err(e) => self.engine.log.note(&format!("Appairage par QR code : échec ({e})")),
            }
        }
    }

    // ----- La page -----

    fn api(&self) -> Result<SyncthingApi, String> {
        self.engine.snapshot().api.ok_or_else(|| "Le moteur de synchronisation démarre : réessayez dans un instant.".to_string())
    }

    pub fn status(&self) -> StatusDto {
        let snapshot = self.engine.snapshot();
        let settings = self.lock_settings().clone();
        let mut dto = StatusDto {
            enabled: settings.enabled,
            engine_version: ENGINE_VERSION,
            state: snapshot.state.clone(),
            my_id: snapshot.my_id.clone(),
            folder_path: settings.folder_path.clone(),
            folder: None,
            devices: Vec::new(),
            pending: Vec::new(),
            mismatch: snapshot.mismatch.clone(),
            pairing_remaining_ms: self
                .pairing
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remaining(Instant::now())
                .map(|d| d.as_millis() as u64),
            taken_over: self.read_takeover().is_some(),
        };
        let (Some(api), Some(me)) = (snapshot.api, snapshot.my_id) else { return dto };
        if let Ok(Some(folder)) = api.folders().map(|f| f.into_iter().next()) {
            let state = api.folder_state(&folder.id).unwrap_or_default();
            dto.folder = Some(FolderDto {
                id: folder.id,
                path: folder.path,
                state: state.state,
                need_files: state.need_files,
                error: state.error,
            });
        }
        let connections = api.connections().unwrap_or_default();
        let seen = api.last_seen().unwrap_or_default();
        dto.devices = api
            .devices()
            .unwrap_or_default()
            .into_iter()
            .filter(|d| d.id != me)
            .map(|d| DeviceDto {
                connected: connections.get(&d.id).copied().unwrap_or(false),
                last_seen: seen.get(&d.id).cloned().flatten(),
                name: if d.name.is_empty() { d.id.chars().take(7).collect() } else { d.name },
                id: d.id,
            })
            .collect();
        dto.pending = api
            .pending_devices()
            .unwrap_or_default()
            .into_iter()
            .map(|p| PendingDto { name: pairing::split_name(&p.name).0, id: p.id, address: p.address })
            .collect();
        dto
    }

    // ----- Appairage par QR code -----

    pub fn pairing_start(&self) -> Result<PairingDto, String> {
        let snapshot = self.engine.snapshot();
        let my_id = snapshot.my_id.ok_or("Le moteur de synchronisation démarre : réessayez dans un instant.")?;
        let code = pairing::new_code();
        let svg = pairing::qr_svg(&pairing::qr_payload(&my_id, &code))?;
        self.pairing.lock().unwrap_or_else(|e| e.into_inner()).start(Instant::now(), code);
        Ok(PairingDto { qr_svg: svg, expires_in_ms: pairing::WINDOW.as_millis() as u64 })
    }

    pub fn pairing_cancel(&self) {
        self.pairing.lock().unwrap_or_else(|e| e.into_inner()).cancel();
    }

    // ----- Appareils (gestes de l'utilisateur) -----

    fn with_setup<T>(&self, run: impl FnOnce(&SyncSetup<'_>) -> Result<T, super::api::ApiError>) -> Result<T, String> {
        let api = self.api()?;
        let folder = self.lock_settings().folder_path.clone().ok_or("Aucun dossier de données choisi.")?;
        run(&SyncSetup { api: &api, folder_path: Path::new(&folder) }).map_err(|e| e.message)
    }

    /// Accepte une demande entrante : toujours un geste de l'utilisateur ici (l'appairage par QR code a son propre chemin).
    pub fn accept_device(&self, id: &str) -> Result<(), String> {
        let name = self
            .api()?
            .pending_devices()
            .map_err(|e| e.message)?
            .into_iter()
            .find(|p| p.id == id)
            .map(|p| pairing::split_name(&p.name).0)
            .ok_or("Cette demande n'existe plus.")?;
        self.with_setup(|setup| setup.accept_device(id, &name))
    }

    pub fn reject_device(&self, id: &str) -> Result<(), String> {
        self.with_setup(|setup| setup.reject_device(id))
    }

    pub fn remove_device(&self, id: &str) -> Result<(), String> {
        self.with_setup(|setup| setup.remove_device(id))
    }

    /// Le dossier de données a changé : le moteur synchronise le nouveau (même identifiant, index repartant de zéro).
    pub fn repoint_folder(&self) -> Result<(), String> {
        self.with_setup(|setup| setup.repoint_folder())
    }

    // ----- Reprise depuis un Syncthing installé -----

    pub fn detect(&self, data_folder: &str) -> Result<DetectionDto, String> {
        let config = installed::read_config(&self.local_app_data)?;
        Ok(match installed::detect(config.as_ref(), data_folder, &|c| c.api().is_healthy()) {
            Detection::NotInstalled => DetectionDto::NotInstalled,
            Detection::NotSharing => DetectionDto::NotSharing,
            Detection::Shares { folder_id, label, running, tls, other_folders } => {
                DetectionDto::Shares { folder_id, label, running, tls, other_folders }
            }
        })
    }

    fn wait_until_running(&self, timeout: Duration) -> Result<SyncthingApi, String> {
        let end = Instant::now() + timeout;
        while Instant::now() < end {
            let snapshot = self.engine.snapshot();
            match (&snapshot.state, snapshot.api) {
                (EngineState::Running, Some(api)) => return Ok(api),
                (EngineState::Failed { error }, _) => return Err(format!("Le moteur n'a pas démarré : {error}")),
                (EngineState::Missing, _) => return Err("Le moteur de synchronisation est introuvable.".to_string()),
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }
        Err("Le moteur n'a pas démarré à temps.".to_string())
    }

    /// Après confirmation de l'utilisateur : sauvegarde la configuration du Syncthing installé, lui retire le seul
    /// dossier Neo Calendar, et le moteur de l'app le prend (même identifiant, mêmes appareils proposés).
    /// Au moindre échec, le dossier est rendu au Syncthing installé.
    pub fn take_over(self: &Arc<Self>, data_folder: &str, stamp: &str) -> Result<(), String> {
        let _heavy = self.heavy.lock().unwrap_or_else(|e| e.into_inner());
        self.takeover_running.store(true, Ordering::SeqCst);
        let result = self.take_over_locked(data_folder, stamp);
        self.takeover_running.store(false, Ordering::SeqCst);
        result
    }

    fn take_over_locked(self: &Arc<Self>, data_folder: &str, stamp: &str) -> Result<(), String> {
        let config = installed::read_config(&self.local_app_data)?.ok_or("Aucun Syncthing n'est installé.")?;
        let folder_id = config.sharing(data_folder).ok_or("Ce Syncthing ne partage pas le dossier de Neo Calendar.")?.id.clone();

        // Le moteur de l'app ne doit avoir aucun autre dossier : jamais deux dossiers synchronisés.
        let engine_config = fs::read_to_string(self.home().join("config.xml")).ok().and_then(|x| installed::parse_config(&x).ok());
        if engine_config.is_some_and(|c| c.folders.iter().any(|f| f.id != folder_id)) {
            return Err("Le moteur de l'app synchronise déjà un autre dossier : désactivez la synchro intégrée d'abord.".to_string());
        }

        self.engine.stop();
        let old = config.api();
        if !old.is_healthy() {
            return Err("Lancez votre Syncthing, puis réessayez : la reprise passe par son interface locale.".to_string());
        }
        let takeover = installed::withdraw_folder(
            &config,
            &old,
            &installed::config_path(&self.local_app_data),
            &self.state_dir.join("sauvegardes"),
            stamp,
            data_folder,
        )?;

        let give_back = |reason: String| -> String {
            let _ = fs::remove_file(self.takeover_path());
            match installed::restore_folder(&old, &takeover) {
                Ok(()) => format!("{reason} Le dossier a été rendu à votre Syncthing."),
                Err(e) => format!(
                    "{reason} Le dossier n'a pas pu être rendu à votre Syncthing ({e}). Sa configuration d'origine est sauvegardée : {}",
                    takeover.backup_path
                ),
            }
        };

        if let Err(e) = fs::create_dir_all(&self.state_dir)
            .and_then(|_| fs::write(self.takeover_path(), serde_json::to_vec_pretty(&takeover).unwrap_or_default()))
        {
            return Err(give_back(format!("Reprise impossible à enregistrer ({e}).")));
        }
        {
            let mut settings = self.lock_settings();
            settings.enabled = true;
            settings.folder_path = Some(data_folder.to_string());
            if let Err(e) = self.save_settings(&settings) {
                drop(settings);
                return Err(give_back(e));
            }
        }
        let seed = FolderSeed { folder_id: Some(takeover.folder_id.clone()), devices: takeover.devices.clone() };
        if let Err(e) = self.start_engine(true, seed) {
            return Err(give_back(e));
        }
        if let Err(e) = self.wait_until_running(Duration::from_secs(90)) {
            self.engine.stop();
            return Err(give_back(e));
        }
        self.engine.log.note(&format!("Reprise du dossier {} depuis le Syncthing installé", takeover.folder_id));
        Ok(())
    }

    /// « Rendre le dossier à Syncthing » : le moteur de l'app lâche le dossier et s'arrête, puis le Syncthing installé le reprend.
    pub fn give_back(self: &Arc<Self>) -> Result<(), String> {
        let _heavy = self.heavy.lock().unwrap_or_else(|e| e.into_inner());
        self.takeover_running.store(true, Ordering::SeqCst);
        let result = self.give_back_locked();
        self.takeover_running.store(false, Ordering::SeqCst);
        result
    }

    fn give_back_locked(self: &Arc<Self>) -> Result<(), String> {
        let takeover = self.read_takeover().ok_or("Aucune reprise à annuler.")?;
        let config = installed::read_config(&self.local_app_data)?.ok_or("Aucun Syncthing n'est installé.")?;
        let old = config.api();
        if config.gui_tls || !old.is_healthy() {
            return Err("Lancez votre Syncthing (interface en HTTP), puis réessayez : le dossier lui est rendu par son interface locale.".to_string());
        }
        if !self.engine.is_active() {
            self.start_engine(true, FolderSeed::default())?;
        }
        let api = self.wait_until_running(Duration::from_secs(90))?;
        // Le dossier part du moteur de l'app AVANT de revenir dans l'autre : jamais deux synchros sur le même dossier.
        api.remove_folder(&takeover.folder_id).map_err(|e| e.message)?;
        self.engine.stop();
        {
            let mut settings = self.lock_settings();
            settings.enabled = false;
            self.save_settings(&settings)?;
        }
        installed::restore_folder(&old, &takeover)?;
        let _ = fs::remove_file(self.takeover_path());
        Ok(())
    }
}

#[cfg(test)]
#[path = "control_tests.rs"]
mod tests;
```

Run : `cargo test --lib sync::control::`
Expected : `test result: ok. 9 passed; … finished in ~18s`. Sept tests n'ont pas besoin du binaire (synchro désactivée, activation mémorisée, Syncthing installé qui partage, configuration illisible, marqueur orphelin, pas de Syncthing installé, reprise refusée), deux lancent de vrais moteurs : **la reprise sur un Syncthing de test** (Neo Calendar partagé avec deux appareils plus un coffre ; détection, moteur bloqué, reprise, un seul `DELETE` côté ancien, coffre et appareils intacts, sauvegarde identique, retour en arrière, moteur bloqué de nouveau) et **l'appairage par QR code avec un bon téléphone et un intrus** (bon code accepté sans question et sous son nom propre, intrus jamais accepté, code à usage unique, dossier proposé puis adopté, notes dans les deux sens).

- [ ] **Step 3 : Revue (sonnet)** : relire `control.rs` (ordre des étapes de `take_over_locked` et `give_back_locked`, exclusivité, `accept_paired`), sans re-revue après correctif.

- [ ] **Step 4 : Aucun processus ne traîne, puis commit**

Run : `Get-CimInstance Win32_Process -Filter "Name='syncthing.exe'" | Select-Object ProcessId, ExecutablePath` ; Expected : aucun chemin sous `%TEMP%`.

```bash
git add apps/windows/src-tauri/src/sync
git commit -m "PC : contrôleur de la synchro intégrée, essais à vrais moteurs (reprise, retour, appairage par QR code, deux sens)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 8 : Tauri : commandes, cycle de vie « comme le .exe » (Quitter, mise à jour, fin de session)

**Files:**
- Create: `apps/windows/src-tauri/src/sync/commands.rs`
- Modify: `apps/windows/src-tauri/src/sync/mod.rs`
- Modify: `apps/windows/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `control::Controller` et ses DTO.
- Produces: les commandes Tauri `sync_start(dataFolder?)`, `sync_status`, `sync_enable(dataFolder)`, `sync_disable`, `sync_retry`, `sync_pairing_start`, `sync_pairing_cancel`, `sync_accept_device(deviceId)`, `sync_reject_device(deviceId)`, `sync_remove_device(deviceId)`, `sync_repoint_folder`, `sync_detect(dataFolder)`, `sync_take_over(dataFolder, stamp)`, `sync_give_back`, `sync_log` (toutes `async` : Tauri les porte sur son pool, pas sur le fil de la fenêtre) ; `commands::{setup, shutdown, resume}`.

Ce qui existe déjà et ne change pas : l'icône de la zone de notification avec « Ouvrir » et « Quitter », « fermer = masquer » (`TRAY_READY`), l'instance unique, le plugin `autostart` (`--hidden`). Ce qui s'ajoute : « Quitter » arrête le moteur (sur un fil à part, jusqu'à 10 s) avant `exit(0)` ; la mise à jour arrête le moteur avant `update.install` et le relance si l'installation échoue ; `RunEvent::Exit` arrête le moteur quelle que soit la sortie ; `setup` pose le contrôleur sans rien lancer (lecture d'un petit fichier) et un filet à 15 s démarre le moteur d'un lancement masqué dont l'interface n'a jamais appelé `sync_start`.

- [ ] **Step 1 : Tests seuls**

Ajouter `pub mod commands;` à `mod.rs`. Créer `commands.rs` avec :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_sync_command_runs_off_the_window_thread() {
        let source = include_str!("commands.rs");
        let mut checked = 0;
        for (index, _) in source.match_indices("\npub fn sync_") {
            let attribute_start = source[..index].rfind("#[tauri::command").expect("une commande Tauri");
            let attribute = &source[attribute_start..index];
            assert!(attribute.contains("async"), "{}", &source[index..index + 40]);
            checked += 1;
        }
        assert_eq!(checked, 15);
    }

    #[test]
    fn a_stamp_is_digits_and_dashes_only() {
        assert!(valid_stamp("20261002-190000"));
        for bad in ["", "..\\x", "a/b", "2026 10", &"1".repeat(33)] {
            assert!(!valid_stamp(bad), "{bad}");
        }
    }
}
```

Run : `cargo test --lib sync::commands::` ; Expected : échec de compilation (`cannot find function \`valid_stamp\``).

- [ ] **Step 2 : Implémentation**

AU-DESSUS du bloc `#[cfg(test)]` :

```rust
//! Les commandes Tauri de la synchro : de fines enveloppes autour de `Controller` (qui porte toute la logique et
//! ses tests). Chaque commande est `async` : Tauri la porte alors sur son pool de threads, pas sur celui de la
//! fenêtre (elles attendent le moteur, le disque ou un autre Syncthing).

use super::control::{Controller, DetectionDto, PairingDto, StatusDto};
use super::process::engine_exe_beside;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub struct SyncState(pub Arc<Controller>);

fn controller(app: &AppHandle) -> Arc<Controller> {
    app.state::<SyncState>().0.clone()
}

/// Pose le contrôleur (une lecture de petit fichier : rien qui retarde le premier écran) ; ne lance PAS le moteur.
/// Le moteur démarre quand l'interface appelle `sync_start`, une fois la grille affichée. Un lancement masqué (au
/// démarrage de Windows) a un filet : sans appel de l'interface au bout de 15 secondes, le moteur démarre seul.
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let state_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("syncthing");
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or("LOCALAPPDATA est absent")?;
    let exe = engine_exe_beside(&std::env::current_exe().map_err(|e| e.to_string())?);
    app.manage(SyncState(Controller::new(state_dir, local_app_data, exe)));

    let fallback = controller(app);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(15));
        let _ = fallback.start_if_enabled(None);
    });
    Ok(())
}

/// Arrêt propre du moteur avant « Quitter », une mise à jour ou la fin du processus.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<SyncState>() {
        state.0.shutdown();
    }
}

/// Relance le moteur après une mise à jour qui a échoué (il avait été arrêté pour elle).
pub fn resume(app: &AppHandle) {
    if let Some(state) = app.try_state::<SyncState>() {
        let _ = state.0.start_if_enabled(None);
    }
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_start(app: AppHandle, data_folder: Option<String>) -> Result<(), String> {
    controller(&app).start_if_enabled(data_folder.as_deref())
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_status(app: AppHandle) -> StatusDto {
    controller(&app).status()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_enable(app: AppHandle, data_folder: String) -> Result<(), String> {
    controller(&app).enable(&data_folder)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_disable(app: AppHandle) -> Result<(), String> {
    controller(&app).disable()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_retry(app: AppHandle) -> Result<(), String> {
    controller(&app).retry()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_pairing_start(app: AppHandle) -> Result<PairingDto, String> {
    controller(&app).pairing_start()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_pairing_cancel(app: AppHandle) {
    controller(&app).pairing_cancel();
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_accept_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app).accept_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_reject_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app).reject_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_remove_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app).remove_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_repoint_folder(app: AppHandle) -> Result<(), String> {
    controller(&app).repoint_folder()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_detect(app: AppHandle, data_folder: String) -> Result<DetectionDto, String> {
    controller(&app).detect(&data_folder)
}

/// `stamp` (horodatage choisi par l'interface, `20261002-190000`) ne sert qu'à nommer la sauvegarde : chiffres et
/// tirets seulement, jamais un chemin.
fn valid_stamp(stamp: &str) -> bool {
    !stamp.is_empty() && stamp.len() <= 32 && stamp.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_take_over(app: AppHandle, data_folder: String, stamp: String) -> Result<(), String> {
    if !valid_stamp(&stamp) {
        return Err("Horodatage de sauvegarde invalide.".to_string());
    }
    controller(&app).take_over(&data_folder, &stamp)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_give_back(app: AppHandle) -> Result<(), String> {
    controller(&app).give_back()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_log(app: AppHandle) -> String {
    controller(&app).log_text()
}
```

- [ ] **Step 3 : Brancher dans `lib.rs`** (reporter les hunks à partir du deuxième ; le premier, `mod sync;`, est déjà posé à la Task 3)

```diff
--- a/apps/windows/src-tauri/src/lib.rs
+++ b/apps/windows/src-tauri/src/lib.rs
@@ -1,2 +1,3 @@
+mod sync;
 #[cfg(windows)]
 mod window_commands;
@@ -1796,5 +1797,10 @@
 
     let (update, bytes) = selected;
+    // Le moteur de synchronisation s'arrete avant l'installation : l'installateur ne doit trouver aucun processus
+    // de l'application. Il repart si l'installation echoue.
+    let stopping = app.clone();
+    let _ = tauri::async_runtime::spawn_blocking(move || sync::commands::shutdown(&stopping)).await;
     if let Err(error) = update.install(&bytes) {
+        sync::commands::resume(&app);
         if let Ok(mut held) = app.state::<PendingUpdate>().0.lock() {
             *held = Some((update, bytes));
@@ -1846,4 +1852,14 @@
         let _ = window.set_focus();
     }
+}
+
+/// « Quitter » : le moteur de synchronisation s'arrete proprement (jusqu'a dix secondes), puis l'application.
+/// Sur un fil a part : le menu de l'icone ne gele pas pendant l'arret.
+fn quit_app(app: &tauri::AppHandle) {
+    let handle = app.clone();
+    std::thread::spawn(move || {
+        sync::commands::shutdown(&handle);
+        handle.exit(0);
+    });
 }
 
@@ -1878,5 +1894,5 @@
         .on_menu_event(|app, event| match event.id.as_ref() {
             "open" => reveal_main_window(app),
-            "quit" => app.exit(0),
+            "quit" => quit_app(app),
             _ => {}
         })
@@ -1915,4 +1931,10 @@
                     // une fenetre ordinaire, qui se ferme pour de bon.
                     eprintln!("Icone de la zone de notification indisponible : {reason}");
+                }
+
+                // La synchro integree : le controleur est pose ici (une lecture de petit fichier), le moteur
+                // ne demarre qu'apres le premier ecran (`sync_start`, appele par l'interface).
+                if let Err(reason) = sync::commands::setup(app.handle()) {
+                    eprintln!("Synchronisation integree indisponible : {reason}");
                 }
 
@@ -2025,8 +2047,29 @@
             check_desktop_updates,
             fetch_desktop_ics,
-            debug_log
+            debug_log,
+            sync::commands::sync_start,
+            sync::commands::sync_status,
+            sync::commands::sync_enable,
+            sync::commands::sync_disable,
+            sync::commands::sync_retry,
+            sync::commands::sync_pairing_start,
+            sync::commands::sync_pairing_cancel,
+            sync::commands::sync_accept_device,
+            sync::commands::sync_reject_device,
+            sync::commands::sync_remove_device,
+            sync::commands::sync_repoint_folder,
+            sync::commands::sync_detect,
+            sync::commands::sync_take_over,
+            sync::commands::sync_give_back,
+            sync::commands::sync_log
         ])
-        .run(tauri::generate_context!())
-        .expect("error while running Neo Calendar");
+        .build(tauri::generate_context!())
+        .expect("error while building Neo Calendar")
+        .run(|app, event| {
+            // Quelle que soit la sortie (Quitter, fin de session, arret), le moteur s'arrete proprement.
+            if let tauri::RunEvent::Exit = event {
+                sync::commands::shutdown(app);
+            }
+        });
 }
 
```

- [ ] **Step 4 : Tout le crate**

Run : `$env:SYNCTHING_BINARY = (node ..\..\..\scripts\fetch-syncthing-windows.mjs); cargo test --lib`
Expected : `test result: ok. 106 passed; 0 failed` (21 tests préexistants de `lib.rs`, dont `console_programs_are_started_without_a_console` et `blocking_commands_are_kept_off_the_window_thread`, plus 85 de la synchro). `cargo check` ne signale aucun avertissement.

- [ ] **Step 5 : Commit**

```bash
git add apps/windows/src-tauri/src/lib.rs apps/windows/src-tauri/src/sync
git commit -m "PC : commandes Tauri de la synchro, arrêt propre du moteur à Quitter, à la mise à jour et à la fin de session" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 9 : La page Synchronisation du PC

**Files:**
- Create: `apps/windows/src/platform/desktopSync.ts`, `apps/windows/src/platform/desktopSync.test.ts`
- Create: `apps/windows/src/DesktopSyncPage.tsx`, `apps/windows/src/DesktopSyncPage.test.tsx`
- Create: `apps/windows/src/assets/syncthing-logo.svg` (le logo officiel, `assets/logo-only.svg` du tarball signé de la v2.1.5)
- Modify: `apps/windows/src/DesktopSettings.tsx`, `apps/windows/src/DesktopSettings.test.tsx`, `apps/windows/src/App.tsx`, `apps/windows/src/App.css`, `src/ui/i18n.ts`

**Interfaces:**
- Consumes: les commandes Tauri de la Task 8 et les DTO de la Task 7 (camelCase).
- Produces: `desktopSync.ts` : types `SyncStatusDto`, `SyncDetectionDto`, `SyncPairingDto`, `EngineStateDto`, fonctions `loadSyncStatus(): Promise<SyncStatusDto | null>` (`null` = pas de moteur intégré sur cette plateforme), `startSyncSoon(dataFolder, delayMs = 1500): () => void`, `syncCommands`, `syncStamp(date)`, `svgDataUrl`, `statusLine`, `deviceLine`, `remainingLabel` ; `DesktopSyncPage` (contenant) et `SyncPageView` (pure) ; l'appel de `startSyncSoon` dans `App.tsx`.

Règles : l'écran est PARTAGÉ avec la coque Android (`apps/android/src/main.tsx` importe `../../windows/src/App`) : là, `sync_status` n'existe pas, `loadSyncStatus` rend `null` et la page garde l'ancien contenu (« Méthodes possibles ») ; le QR code est un SVG rendu par une balise `<img>` (jamais inséré dans la page, un `<img>` n'exécute pas de script) ; le code d'appairage n'est jamais affiché (les noms de demandes sont nettoyés côté Rust, `split_name`) ; le moteur démarre 1,5 s après `isCalendarReady`, sans rien attendre et sans jamais lever.

- [ ] **Step 1 : Tests de `desktopSync.ts` (échec attendu)**

Créer `apps/windows/src/platform/desktopSync.test.ts` :

```ts
const invoke = jest.fn();
jest.mock(
    "@tauri-apps/api/core",
    () => ({ invoke: (...args: unknown[]) => invoke(...args) }),
    {
        virtual: true,
    }
);

import {
    deviceLine,
    loadSyncStatus,
    remainingLabel,
    startSyncSoon,
    statusLine,
    svgDataUrl,
    syncCommands,
    syncStamp,
    type SyncStatusDto,
} from "./desktopSync";
import { applyLanguage } from "../../../../src/ui/i18n";

const running = (patch: Partial<SyncStatusDto> = {}): SyncStatusDto => ({
    enabled: true,
    engineVersion: "2.1.5",
    state: { kind: "running" },
    myId: "ABC",
    folderPath: "C:\\Neo Calendar",
    folder: {
        id: "neo-x",
        path: "C:\\Neo Calendar",
        state: "idle",
        needFiles: 0,
        error: "",
    },
    devices: [{ id: "T", name: "Pixel 8", connected: true, lastSeen: null }],
    pending: [],
    mismatch: null,
    pairingRemainingMs: null,
    takenOver: false,
    ...patch,
});

beforeEach(() => {
    invoke.mockReset();
    applyLanguage("fr");
});
afterEach(() => {
    jest.useRealTimers();
    applyLanguage("fr");
});

describe("loadSyncStatus", () => {
    it("rend l'état du moteur", async () => {
        invoke.mockResolvedValue(running());
        expect((await loadSyncStatus())?.engineVersion).toBe("2.1.5");
        expect(invoke).toHaveBeenCalledWith("sync_status");
    });

    it("rend null quand la commande n'existe pas (coque Android), jamais une erreur", async () => {
        invoke.mockRejectedValue(new Error("command sync_status not found"));
        await expect(loadSyncStatus()).resolves.toBeNull();
    });
});

describe("startSyncSoon", () => {
    it("ne démarre rien avant le délai, puis lance sync_start", () => {
        jest.useFakeTimers();
        invoke.mockResolvedValue(undefined);
        startSyncSoon("C:\\Neo Calendar", 1500);
        jest.advanceTimersByTime(1499);
        expect(invoke).not.toHaveBeenCalled();
        jest.advanceTimersByTime(2);
        expect(invoke).toHaveBeenCalledWith("sync_start", {
            dataFolder: "C:\\Neo Calendar",
        });
    });

    it("peut être annulé (la fenêtre se ferme avant)", () => {
        jest.useFakeTimers();
        const cancel = startSyncSoon("C:\\N", 1500);
        cancel();
        jest.advanceTimersByTime(5000);
        expect(invoke).not.toHaveBeenCalled();
    });

    it("ne lève jamais, même si invoke échoue ou lève sur-le-champ", () => {
        jest.useFakeTimers();
        invoke.mockImplementation(() => {
            throw new Error("pas de pont natif");
        });
        startSyncSoon("C:\\N", 10);
        expect(() => jest.advanceTimersByTime(20)).not.toThrow();
        invoke.mockReset().mockRejectedValue(new Error("refus"));
        startSyncSoon("C:\\N", 10);
        expect(() => jest.advanceTimersByTime(20)).not.toThrow();
    });
});

describe("syncCommands", () => {
    it("appelle les commandes Rust par leur nom et leurs arguments camelCase", async () => {
        invoke.mockResolvedValue(undefined);
        await syncCommands.enable("C:\\N");
        await syncCommands.acceptDevice("ABC");
        await syncCommands.takeOver("C:\\N", "20261002-190000");
        expect(invoke.mock.calls).toEqual([
            ["sync_enable", { dataFolder: "C:\\N" }],
            ["sync_accept_device", { deviceId: "ABC" }],
            [
                "sync_take_over",
                { dataFolder: "C:\\N", stamp: "20261002-190000" },
            ],
        ]);
    });
});

describe("syncStamp", () => {
    it("n'écrit que des chiffres et un tiret (le nom d'un fichier de sauvegarde)", () => {
        expect(syncStamp(new Date(2026, 9, 2, 19, 5, 7))).toBe(
            "20261002-190507"
        );
        expect(syncStamp(new Date(2026, 0, 3, 4, 5, 6))).toMatch(/^[0-9-]+$/);
    });
});

describe("svgDataUrl", () => {
    it("encode le SVG : aucun caractère de balise ne reste dans l'URL", () => {
        const url = svgDataUrl("<svg><script>alert(1)</script></svg>");
        expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(url).not.toMatch(/[<>"]/);
    });
});

describe("statusLine", () => {
    it("dit que la synchro est désactivée", () => {
        expect(statusLine(running({ enabled: false }))).toBe(
            "La synchronisation intégrée est désactivée"
        );
    });

    it("suit la priorité : moteur absent, bloqué, démarrage, échec, dossier en erreur, synchro, aucun appareil, hors ligne, à jour", () => {
        const line = (patch: Partial<SyncStatusDto>) =>
            statusLine(running(patch));
        expect(line({ state: { kind: "missing" } })).toContain("absent");
        expect(line({ state: { kind: "blockedByInstalled" } })).toContain(
            "Syncthing installé"
        );
        expect(line({ state: { kind: "starting" } })).toBe("Démarrage…");
        expect(
            line({
                state: {
                    kind: "backoff",
                    attempt: 2,
                    retryInMs: 4000,
                    error: "port pris",
                },
            })
        ).toBe("Erreur : port pris (nouvel essai dans 4 s)");
        expect(
            line({ state: { kind: "failed", error: "trop d'échecs" } })
        ).toBe("Erreur : trop d'échecs");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "idle",
                    needFiles: 0,
                    error: "disque plein",
                },
            })
        ).toBe("Erreur : disque plein");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "syncing",
                    needFiles: 1,
                    error: "",
                },
            })
        ).toBe("Synchronisation en cours (1 fichier)");
        expect(
            line({
                folder: {
                    id: "x",
                    path: "p",
                    state: "idle",
                    needFiles: 3,
                    error: "",
                },
            })
        ).toBe("Synchronisation en cours (3 fichiers)");
        expect(line({ devices: [] })).toBe(
            "Aucun appareil : ajoutez votre téléphone"
        );
        expect(
            line({
                devices: [
                    {
                        id: "T",
                        name: "Pixel",
                        connected: false,
                        lastSeen: null,
                    },
                ],
            })
        ).toBe("Hors ligne : aucun appareil connecté");
        expect(line({})).toBe("À jour");
    });

    it("démarre quand le moteur tourne mais que le dossier n'est pas encore lu", () => {
        expect(statusLine(running({ folder: null }))).toBe("Démarrage…");
    });
});

describe("deviceLine", () => {
    it("distingue connecté, jamais connecté et dernière connexion", () => {
        expect(
            deviceLine({ id: "a", name: "a", connected: true, lastSeen: null })
        ).toBe("Connecté");
        expect(
            deviceLine({ id: "a", name: "a", connected: false, lastSeen: null })
        ).toBe("Jamais connecté");
        expect(
            deviceLine({
                id: "a",
                name: "a",
                connected: false,
                lastSeen: "pas une date",
            })
        ).toBe("Jamais connecté");
        expect(
            deviceLine({
                id: "a",
                name: "a",
                connected: false,
                lastSeen: "2026-10-02T10:30:00Z",
            })
        ).toMatch(/^Dernière connexion 02\/10\/2026/);
    });
});

describe("remainingLabel", () => {
    it("écrit minutes et secondes, jamais négatif", () => {
        expect(remainingLabel(300_000)).toBe("5 min 00 s");
        expect(remainingLabel(252_300)).toBe("4 min 13 s");
        expect(remainingLabel(-5)).toBe("0 min 00 s");
    });
});
```

Run (racine du dépôt) : `npx jest apps/windows/src/platform/desktopSync.test.ts`
Expected : `Cannot find module './desktopSync'`.

- [ ] **Step 2 : `desktopSync.ts`**

Créer `apps/windows/src/platform/desktopSync.ts` :

```ts
import { invoke } from "@tauri-apps/api/core";
import { getLanguage, t } from "../../../../src/ui/i18n";

/*
 * La synchronisation intégrée (Syncthing embarqué) vue de l'interface : les types que le côté Rust sérialise
 * (`sync/control.rs`), les commandes Tauri, et les phrases de la page. Aucun état ici : le moteur est la vérité.
 */

export type EngineStateDto =
    | {
          kind:
              | "stopped"
              | "missing"
              | "blockedByInstalled"
              | "starting"
              | "running";
      }
    | { kind: "backoff"; attempt: number; retryInMs: number; error: string }
    | { kind: "failed"; error: string };

export interface SyncDeviceDto {
    id: string;
    name: string;
    connected: boolean;
    lastSeen: string | null;
}

export interface SyncPendingDto {
    id: string;
    name: string;
    address: string;
}

export interface SyncFolderDto {
    id: string;
    path: string;
    state: string;
    needFiles: number;
    error: string;
}

export interface SyncStatusDto {
    enabled: boolean;
    engineVersion: string;
    state: EngineStateDto;
    myId: string | null;
    folderPath: string | null;
    folder: SyncFolderDto | null;
    devices: SyncDeviceDto[];
    pending: SyncPendingDto[];
    /** Le chemin que le moteur synchronise encore quand le dossier de données de l'app a changé. */
    mismatch: string | null;
    pairingRemainingMs: number | null;
    takenOver: boolean;
}

export type SyncDetectionDto =
    | { kind: "notInstalled" | "notSharing" }
    | {
          kind: "shares";
          folderId: string;
          label: string;
          running: boolean;
          tls: boolean;
          otherFolders: number;
      };

export interface SyncPairingDto {
    qrSvg: string;
    expiresInMs: number;
}

/**
 * Vrai quand le moteur intégré existe sur cette plateforme. Le même écran sert la coque Android, où ces commandes
 * n'existent pas : toute erreur de lecture vaut « pas de synchro intégrée ici », jamais une page cassée.
 */
export async function loadSyncStatus(): Promise<SyncStatusDto | null> {
    try {
        return await invoke<SyncStatusDto>("sync_status");
    } catch {
        return null;
    }
}

/**
 * Lance le moteur une fois le premier écran rempli. Jamais attendu, jamais bloquant, jamais une erreur : la
 * synchro est un service de fond, l'ouverture de l'app ne dépend pas d'elle. Le léger délai laisse le premier
 * affichage se terminer avant que le moindre travail de synchro ne commence.
 */
export function startSyncSoon(dataFolder: string, delayMs = 1500): () => void {
    const timer = setTimeout(() => {
        try {
            void invoke("sync_start", { dataFolder }).catch(() => undefined);
        } catch {
            // Pas de moteur intégré sur cette plateforme (coque Android) : rien à démarrer.
        }
    }, delayMs);
    return () => clearTimeout(timer);
}

export const syncCommands = {
    enable: (dataFolder: string) => invoke<void>("sync_enable", { dataFolder }),
    disable: () => invoke<void>("sync_disable"),
    retry: () => invoke<void>("sync_retry"),
    pairingStart: () => invoke<SyncPairingDto>("sync_pairing_start"),
    pairingCancel: () => invoke<void>("sync_pairing_cancel"),
    acceptDevice: (deviceId: string) =>
        invoke<void>("sync_accept_device", { deviceId }),
    rejectDevice: (deviceId: string) =>
        invoke<void>("sync_reject_device", { deviceId }),
    removeDevice: (deviceId: string) =>
        invoke<void>("sync_remove_device", { deviceId }),
    repointFolder: () => invoke<void>("sync_repoint_folder"),
    detect: (dataFolder: string) =>
        invoke<SyncDetectionDto>("sync_detect", { dataFolder }),
    takeOver: (dataFolder: string, stamp: string) =>
        invoke<void>("sync_take_over", { dataFolder, stamp }),
    giveBack: () => invoke<void>("sync_give_back"),
    log: () => invoke<string>("sync_log"),
};

const pad = (value: number) => String(value).padStart(2, "0");

/** `20261002-190000` : le nom de la sauvegarde de la configuration d'un Syncthing installé (chiffres et tirets). */
export function syncStamp(date: Date): string {
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
            date.getDate()
        )}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
            date.getSeconds()
        )}`
    );
}

/** Les SVG du QR code passent par une image : l'élément `<img>` n'exécute jamais de script. */
export function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** La seule ligne d'état de la page, la plus importante (même priorité que sur le téléphone). */
export function statusLine(status: SyncStatusDto): string {
    if (!status.enabled) return t("Built-in sync is off");
    const { state } = status;
    switch (state.kind) {
        case "missing":
            return t("The sync engine is missing from this version");
        case "blockedByInstalled":
            return t("An installed Syncthing already syncs this folder");
        case "stopped":
        case "starting":
            return t("Starting…");
        case "backoff":
            return `${t("Error")} : ${state.error} (${t(
                "retrying in"
            )} ${Math.round(state.retryInMs / 1000)} s)`;
        case "failed":
            return `${t("Error")} : ${state.error}`;
    }
    const folder = status.folder;
    if (!folder) return t("Starting…");
    if (folder.error) return `${t("Error")} : ${folder.error}`;
    if (
        folder.needFiles > 0 ||
        folder.state === "syncing" ||
        folder.state === "scanning"
    )
        return `${t("Syncing")} (${folder.needFiles} ${
            folder.needFiles === 1 ? t("file") : t("files")
        })`;
    if (status.devices.length === 0) return t("No device yet: add your phone");
    if (!status.devices.some((device) => device.connected))
        return t("Offline: no device connected");
    return t("Up to date");
}

/** « Connecté », « Jamais connecté » ou la dernière connexion. */
export function deviceLine(device: SyncDeviceDto): string {
    if (device.connected) return t("Connected");
    if (!device.lastSeen) return t("Never connected");
    const when = new Date(device.lastSeen);
    if (Number.isNaN(when.getTime())) return t("Never connected");
    return `${t("Last seen")} ${when.toLocaleString(
        getLanguage() === "fr" ? "fr-FR" : "en-GB",
        { dateStyle: "short", timeStyle: "short" }
    )}`;
}

/** Le temps restant d'une fenêtre d'appairage, en « 4 min 12 s ». */
export function remainingLabel(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)} min ${pad(seconds % 60)} s`;
}
```

Les phrases françaises passent par `t()` : ajouter les entrées à `src/ui/i18n.ts` (après `"Close settings"`) :

```diff
--- a/src/ui/i18n.ts
+++ b/src/ui/i18n.ts
@@ -565,4 +565,70 @@
     "Close settings": "Fermer les paramètres",
 
+    // ── Synchronisation intégrée (Syncthing embarqué) ────────
+    "Built-in sync is off": "La synchronisation intégrée est désactivée",
+    "The sync engine is missing from this version":
+        "Le moteur de synchronisation est absent de cette version",
+    "An installed Syncthing already syncs this folder":
+        "Un Syncthing installé synchronise déjà ce dossier",
+    "Starting…": "Démarrage…",
+    Error: "Erreur",
+    "retrying in": "nouvel essai dans",
+    Syncing: "Synchronisation en cours",
+    file: "fichier",
+    files: "fichiers",
+    "No device yet: add your phone":
+        "Aucun appareil : ajoutez votre téléphone",
+    "Offline: no device connected": "Hors ligne : aucun appareil connecté",
+    "Up to date": "À jour",
+    Connected: "Connecté",
+    "Never connected": "Jamais connecté",
+    "Last seen": "Dernière connexion",
+    "The Neo Calendar folder is synced by an installed Syncthing":
+        "Le dossier de Neo Calendar est synchronisé par un Syncthing installé sur ce PC",
+    "The Neo Calendar folder is synced by Neo Calendar (built-in Syncthing v{version})":
+        "Le dossier de Neo Calendar est synchronisé par Neo Calendar (Syncthing intégré v{version})",
+    "Sync with the built-in Syncthing":
+        "Synchroniser avec le Syncthing intégré",
+    "Your Syncthing's web interface uses HTTPS, so Neo Calendar cannot drive it. Remove the Neo Calendar folder in Syncthing yourself, then check again.":
+        "L'interface de votre Syncthing est en HTTPS : Neo Calendar ne peut pas la piloter. Retirez vous-même le dossier Neo Calendar dans Syncthing, puis vérifiez à nouveau.",
+    "Neo Calendar will back up your Syncthing configuration, then remove only the Neo Calendar folder from it. Your other shares stay in Syncthing.":
+        "Neo Calendar sauvegardera la configuration de votre Syncthing, puis n'en retirera que le dossier Neo Calendar. Vos autres partages restent dans Syncthing.",
+    "Start your Syncthing to take the folder over.":
+        "Lancez votre Syncthing pour reprendre le dossier.",
+    "Take the folder over in Neo Calendar":
+        "Reprendre le dossier dans Neo Calendar",
+    "Check again": "Vérifier à nouveau",
+    "The data folder changed. The engine still syncs:":
+        "Le dossier de données a changé. Le moteur synchronise encore :",
+    "Sync the current folder": "Synchroniser le dossier actuel",
+    "Try again": "Réessayer",
+    Devices: "Appareils",
+    "Add the phone": "Ajouter le téléphone",
+    "Requests to accept": "Demandes à accepter",
+    "Only accept a device you recognise.":
+        "N'acceptez qu'un appareil que vous reconnaissez.",
+    "wants to connect": "demande à se connecter",
+    Accept: "Accepter",
+    Refuse: "Refuser",
+    "Remove this device": "Retirer cet appareil",
+    "Give the folder back to Syncthing": "Rendre le dossier à Syncthing",
+    Log: "Journal",
+    "The log is empty.": "Le journal est vide.",
+    "Syncthing is free, open-source software that keeps files in step between your devices.":
+        "Syncthing est un logiciel libre et gratuit qui garde des fichiers à jour entre vos appareils.",
+    "Learn more": "En savoir plus",
+    Details: "Détails",
+    "Scan this QR code with Neo Calendar on your phone (Settings, Sync, Scan the PC's QR code).":
+        "Scannez ce QR code avec Neo Calendar sur votre téléphone (Réglages, Synchronisation, Scanner le QR code du PC).",
+    "QR code to pair the phone": "QR code pour appairer le téléphone",
+    "This code works once and expires in":
+        "Ce code ne sert qu'une fois et expire dans",
+    "Neo Calendar will back up your Syncthing configuration, then remove only the Neo Calendar folder from it. Your other folders and devices are not touched. The devices that shared the folder will have to accept this PC again (your phone: with the QR code).":
+        "Neo Calendar sauvegardera la configuration de votre Syncthing, puis n'en retirera que le dossier Neo Calendar. Vos autres dossiers et appareils ne sont pas touchés. Les appareils qui partageaient le dossier devront accepter de nouveau ce PC (votre téléphone : avec le QR code).",
+    "Take over": "Reprendre",
+    "Neo Calendar stops syncing this folder and your installed Syncthing takes it back, as it was before. It must be running.":
+        "Neo Calendar arrête de synchroniser ce dossier et votre Syncthing installé le reprend, tel qu'il était avant. Il doit être lancé.",
+    "Give back": "Rendre",
+
     // ── Themes, wallpapers and dialogs ───────────────────────
     Background: "Arrière-plan",
```

Run : `npx jest apps/windows/src/platform/desktopSync.test.ts` ; Expected : `Tests: 13 passed`.

- [ ] **Step 3 : Tests de la page (échec attendu)**

Créer `apps/windows/src/DesktopSyncPage.test.tsx` :

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }), {
    virtual: true,
});

import DesktopSyncPage, {
    SyncPageView,
    type SyncPageActions,
    type SyncPageViewProps,
} from "./DesktopSyncPage";
import type { SyncStatusDto } from "./platform/desktopSync";
import { applyLanguage } from "../../../src/ui/i18n";

const noop = () => undefined;
const actions: SyncPageActions = {
    toggle: noop,
    startPairing: noop,
    closePairing: noop,
    askDevice: noop,
    askRequest: noop,
    retry: noop,
    repoint: noop,
    recheck: noop,
    askTakeOver: noop,
    askGiveBack: noop,
    showLog: noop,
    toggleStartup: noop,
};

const status = (patch: Partial<SyncStatusDto> = {}): SyncStatusDto => ({
    enabled: true,
    engineVersion: "2.1.5",
    state: { kind: "running" },
    myId: "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX",
    folderPath: "C:\\Neo Calendar",
    folder: {
        id: "neo-x",
        path: "C:\\Neo Calendar",
        state: "idle",
        needFiles: 0,
        error: "",
    },
    devices: [{ id: "T", name: "Pixel 8", connected: true, lastSeen: null }],
    pending: [],
    mismatch: null,
    pairingRemainingMs: null,
    takenOver: false,
    ...patch,
});

const view = (
    patch: Partial<SyncPageViewProps> & { status?: SyncStatusDto } = {}
) =>
    renderToStaticMarkup(
        <SyncPageView
            status={status()}
            detection={null}
            pairing={null}
            startup={true}
            busy={false}
            error={null}
            dataFolderRow={<div>LIGNE-DOSSIER</div>}
            actions={actions}
            {...patch}
        />
    );

beforeEach(() => applyLanguage("fr"));
afterEach(() => applyLanguage("fr"));

describe("page Synchronisation du PC", () => {
    it("dit en une phrase qui synchronise, l'état, les appareils, et garde le lien Syncthing en bas", () => {
        const html = view();
        expect(html).toContain(
            "synchronisé par Neo Calendar (Syncthing intégré v2.1.5)"
        );
        expect(html).toContain("À jour");
        expect(html).toContain("Pixel 8");
        expect(html).toContain("Connecté");
        expect(html).toContain("Ajouter le téléphone");
        expect(html).toContain("LIGNE-DOSSIER");
        expect(html).toContain('alt="Syncthing"');
        expect(html).toContain('href="https://syncthing.net"');
        expect(html).toContain("En savoir plus");
        // L'identifiant complet reste consultable, dans « Détails » seulement.
        expect(html).toContain("7ZSUPCU-MIU3GEY");
    });

    it("désactivée : ni appareils ni bouton d'ajout", () => {
        const html = view({
            status: status({ enabled: false, state: { kind: "stopped" } }),
        });
        expect(html).toContain("désactivée");
        expect(html).not.toContain("Ajouter le téléphone");
        expect(html).not.toContain("Appareils");
    });

    it("propose la reprise d'un Syncthing installé qui tourne, jamais automatiquement", () => {
        const html = view({
            status: status({ state: { kind: "blockedByInstalled" } }),
            detection: {
                kind: "shares",
                folderId: "neo-old",
                label: "Neo",
                running: true,
                tls: false,
                otherFolders: 1,
            },
        });
        expect(html).toContain("synchronisé par un Syncthing installé");
        expect(html).toContain("Reprendre le dossier dans Neo Calendar");
        expect(html).toContain("Vos autres partages restent dans Syncthing");
    });

    it("Syncthing installé arrêté ou en HTTPS : pas de reprise, une explication et « Vérifier à nouveau »", () => {
        const stopped = view({
            detection: {
                kind: "shares",
                folderId: "x",
                label: "N",
                running: false,
                tls: false,
                otherFolders: 0,
            },
        });
        expect(stopped).toContain("Lancez votre Syncthing");
        expect(stopped).toContain("Vérifier à nouveau");
        expect(stopped).not.toContain("Reprendre le dossier dans Neo Calendar");
        const tls = view({
            detection: {
                kind: "shares",
                folderId: "x",
                label: "N",
                running: false,
                tls: true,
                otherFolders: 0,
            },
        });
        expect(tls).toContain("HTTPS");
        expect(tls).not.toContain("Reprendre le dossier dans Neo Calendar");
    });

    it("un marqueur orphelin n'est pas un conflit : aucun Syncthing ne partage, aucune proposition", () => {
        const html = view({ detection: { kind: "notSharing" } });
        expect(html).not.toContain("Reprendre le dossier");
        expect(html).toContain("synchronisé par Neo Calendar");
    });

    it("les demandes entrantes se lisent par leur nom, sans code", () => {
        const html = view({
            status: status({
                pending: [
                    {
                        id: "ABCDEFGHIJ",
                        name: "Pixel 8",
                        address: "192.168.1.9:22000",
                    },
                ],
            }),
        });
        expect(html).toContain("Demandes à accepter");
        expect(html).toContain("Pixel 8");
        expect(html).toContain("demande à se connecter");
        expect(html).not.toContain("[NC:");
    });

    it("la fenêtre d'appairage montre le QR en image (jamais du SVG inséré tel quel) et le temps restant", () => {
        const html = view({
            pairing: {
                qrSvg: "<svg><script>alert(1)</script></svg>",
                expiresInMs: 300_000,
            },
            status: status({ pairingRemainingMs: 252_000 }),
        });
        expect(html).toContain("<img");
        expect(html).toContain("data:image/svg+xml");
        expect(html).not.toContain("<script");
        expect(html).toContain("4 min 12 s");
        expect(html).toContain("ne sert qu&#x27;une fois");
    });

    it("un dossier de données changé propose de synchroniser le dossier actuel", () => {
        const html = view({ status: status({ mismatch: "C:\\Ancien" }) });
        expect(html).toContain("C:\\Ancien");
        expect(html).toContain("Synchroniser le dossier actuel");
    });

    it("une reprise faite propose de rendre le dossier à Syncthing", () => {
        expect(view({ status: status({ takenOver: true }) })).toContain(
            "Rendre le dossier à Syncthing"
        );
        expect(view()).not.toContain("Rendre le dossier à Syncthing");
    });

    it("un moteur abandonné propose de réessayer", () => {
        const html = view({
            status: status({ state: { kind: "failed", error: "port pris" } }),
        });
        expect(html).toContain("Erreur : port pris");
        expect(html).toContain("Réessayer");
    });
});

describe("contenant", () => {
    it("avant la première lecture, il ne montre que la ligne du dossier (ni clignotement de l'ancienne page, ni page vide)", () => {
        const html = renderToStaticMarkup(
            <DesktopSyncPage
                dataFolder="C:\\N"
                dataFolderRow={<div>LIGNE-DOSSIER</div>}
                fallback={<div>ANCIENNE-PAGE</div>}
            />
        );
        expect(html).toContain("LIGNE-DOSSIER");
        expect(html).not.toContain("ANCIENNE-PAGE");
    });

    it("là où le moteur intégré n'existe pas (coque Android), la page garde ce qu'elle montrait", () => {
        const html = renderToStaticMarkup(
            <DesktopSyncPage
                dataFolder="C:\\N"
                dataFolderRow={<div>LIGNE-DOSSIER</div>}
                fallback={<div>ANCIENNE-PAGE</div>}
                initialStatus={null}
            />
        );
        expect(html).toContain("ANCIENNE-PAGE");
    });
});
```

Run : `npx jest apps/windows/src/DesktopSyncPage.test.tsx` ; Expected : `Cannot find module './DesktopSyncPage'`.

- [ ] **Step 4 : Le logo et `DesktopSyncPage.tsx`**

Créer `apps/windows/src/assets/syncthing-logo.svg` (copie exacte du fichier `assets/logo-only.svg` du tarball signé de Syncthing v2.1.5, 1 762 octets ; en cas de doute `Compare-Object (Get-Content <tarball>\assets\logo-only.svg) (Get-Content apps\windows\src\assets\syncthing-logo.svg)`) :

```svg
<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 18.1.1, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 117.3 117.3" enable-background="new 0 0 117.3 117.3" xml:space="preserve">
<g>
	<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="58.666" y1="117.332" x2="58.666" y2="0">
		<stop  offset="0" style="stop-color:#0882C8"/>
		<stop  offset="1" style="stop-color:#26B6DB"/>
	</linearGradient>
	<circle fill="url(#SVGID_1_)" cx="58.7" cy="58.7" r="58.7"/>
	<g>
		<circle fill="none" stroke="#FFFFFF" stroke-width="6" stroke-miterlimit="10" cx="58.7" cy="58.5" r="43.7"/>
		<g>
			<path fill="#FFFFFF" d="M94.7,47.8c4.7,1.6,9.8-0.9,11.4-5.6c1.6-4.7-0.9-9.8-5.6-11.4c-4.7-1.6-9.8,0.9-11.4,5.6
				C87.5,41.1,90,46.2,94.7,47.8z"/>
			<line fill="none" stroke="#FFFFFF" stroke-width="6" stroke-miterlimit="10" x1="97.6" y1="39.4" x2="67.5" y2="64.4"/>
		</g>
		<g>
			<path fill="#FFFFFF" d="M77.6,91c-0.4,4.9,3.2,9.3,8.2,9.8c5,0.4,9.3-3.2,9.8-8.2c0.4-4.9-3.2-9.3-8.2-9.8
				C82.4,82.4,78,86,77.6,91z"/>
			<line fill="none" stroke="#FFFFFF" stroke-width="6" stroke-miterlimit="10" x1="86.5" y1="91.8" x2="67.5" y2="64.4"/>
		</g>
		<path fill="#FFFFFF" d="M60,69.3c2.7,4.2,8.3,5.4,12.4,2.7c4.2-2.7,5.4-8.3,2.7-12.4c-2.7-4.2-8.3-5.4-12.4-2.7
			C58.5,59.5,57.3,65.1,60,69.3z"/>
		<g>
			<path fill="#FFFFFF" d="M21.2,61.4c-4.3-2.5-9.8-1.1-12.3,3.1c-2.5,4.3-1.1,9.8,3.1,12.3c4.3,2.5,9.8,1.1,12.3-3.1
				C26.8,69.5,25.4,64,21.2,61.4z"/>
			<line fill="none" stroke="#FFFFFF" stroke-width="6" stroke-miterlimit="10" x1="16.6" y1="69.1" x2="67.5" y2="64.4"/>
		</g>
	</g>
</g>
</svg>
```

Créer `apps/windows/src/DesktopSyncPage.tsx` :

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Activity,
    FileText,
    FolderSync,
    Info,
    Power,
    QrCode,
    RefreshCw,
    Smartphone,
    Undo2,
} from "lucide-react";
import { t } from "../../../src/ui/i18n";
import syncthingLogo from "./assets/syncthing-logo.svg";
import ConfirmDialog from "./ConfirmDialog";
import {
    SettingsChoiceDialog,
    SettingsDialog,
    SettingsGroup,
    SettingsRow,
    SettingsToggleRow,
    type SettingsChoice,
} from "./SettingsPrimitives";
import {
    deviceLine,
    loadSyncStatus,
    remainingLabel,
    statusLine,
    svgDataUrl,
    syncCommands,
    syncStamp,
    type SyncDetectionDto,
    type SyncPairingDto,
    type SyncStatusDto,
} from "./platform/desktopSync";
import {
    isStartupEnabled,
    setStartupEnabled,
} from "./platform/desktopAutostart";

const SYNCTHING_URL = "https://syncthing.net";

export interface SyncPageActions {
    toggle: (enabled: boolean) => void;
    startPairing: () => void;
    closePairing: () => void;
    askDevice: (id: string, name: string) => void;
    askRequest: (id: string, name: string) => void;
    retry: () => void;
    repoint: () => void;
    recheck: () => void;
    askTakeOver: () => void;
    askGiveBack: () => void;
    showLog: () => void;
    toggleStartup: (enabled: boolean) => void;
}

export interface SyncPageViewProps {
    status: SyncStatusDto;
    detection: SyncDetectionDto | null;
    pairing: SyncPairingDto | null;
    startup: boolean;
    busy: boolean;
    error: string | null;
    /** La ligne « Dossier de données » de la page, que l'hôte garde pour sa navigation. */
    dataFolderRow: React.ReactNode;
    actions: SyncPageActions;
}

const fill = (template: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, value),
        template
    );

/** La page, sans état : tout ce qu'elle affiche vient de `props`, tout ce qu'elle déclenche part dans `actions`. */
export function SyncPageView({
    status,
    detection,
    pairing,
    startup,
    busy,
    error,
    dataFolderRow,
    actions,
}: SyncPageViewProps) {
    const running = status.state.kind === "running";
    const shared = detection?.kind === "shares" ? detection : null;
    const statement = shared
        ? t("The Neo Calendar folder is synced by an installed Syncthing")
        : fill(
              t(
                  "The Neo Calendar folder is synced by Neo Calendar (built-in Syncthing v{version})"
              ),
              { version: status.engineVersion }
          );

    return (
        <div className="nc-set-groups">
            <SettingsGroup note={statement}>
                {dataFolderRow}
                <SettingsToggleRow
                    label={t("Sync with the built-in Syncthing")}
                    icon={<FolderSync size={18} />}
                    checked={status.enabled}
                    onChange={actions.toggle}
                />
                <SettingsRow
                    label={t("Status")}
                    icon={<Activity size={18} />}
                    value={statusLine(status)}
                />
                {error && <SettingsRow label={error} />}
            </SettingsGroup>

            {shared && (
                <SettingsGroup
                    note={
                        shared.tls
                            ? t(
                                  "Your Syncthing's web interface uses HTTPS, so Neo Calendar cannot drive it. Remove the Neo Calendar folder in Syncthing yourself, then check again."
                              )
                            : shared.running
                            ? t(
                                  "Neo Calendar will back up your Syncthing configuration, then remove only the Neo Calendar folder from it. Your other shares stay in Syncthing."
                              )
                            : t("Start your Syncthing to take the folder over.")
                    }
                >
                    {shared.running && !shared.tls ? (
                        <SettingsRow
                            label={t("Take the folder over in Neo Calendar")}
                            icon={<Undo2 size={18} />}
                            onClick={actions.askTakeOver}
                            disabled={busy}
                            navigates
                        />
                    ) : (
                        <SettingsRow
                            label={t("Check again")}
                            icon={<RefreshCw size={18} />}
                            onClick={actions.recheck}
                            disabled={busy}
                        />
                    )}
                </SettingsGroup>
            )}

            {status.mismatch && (
                <SettingsGroup
                    note={`${t(
                        "The data folder changed. The engine still syncs:"
                    )} ${status.mismatch}`}
                >
                    <SettingsRow
                        label={t("Sync the current folder")}
                        icon={<FolderSync size={18} />}
                        onClick={actions.repoint}
                        disabled={busy}
                        navigates
                    />
                </SettingsGroup>
            )}

            {(status.state.kind === "failed" ||
                status.state.kind === "backoff") && (
                <SettingsGroup>
                    <SettingsRow
                        label={t("Try again")}
                        icon={<RefreshCw size={18} />}
                        onClick={actions.retry}
                        disabled={busy}
                    />
                </SettingsGroup>
            )}

            {status.enabled && running && (
                <SettingsGroup
                    title={t("Devices")}
                    note={
                        status.devices.length === 0
                            ? t("No device yet: add your phone")
                            : undefined
                    }
                >
                    {status.devices.map((device) => (
                        <SettingsRow
                            key={device.id}
                            label={device.name}
                            icon={<Smartphone size={18} />}
                            value={deviceLine(device)}
                            onClick={() =>
                                actions.askDevice(device.id, device.name)
                            }
                        />
                    ))}
                    <SettingsRow
                        label={t("Add the phone")}
                        icon={<QrCode size={18} />}
                        onClick={actions.startPairing}
                        disabled={busy}
                        navigates
                    />
                </SettingsGroup>
            )}

            {status.enabled && running && status.pending.length > 0 && (
                <SettingsGroup
                    title={t("Requests to accept")}
                    note={t("Only accept a device you recognise.")}
                >
                    {status.pending.map((request) => (
                        <SettingsRow
                            key={request.id}
                            label={request.name || request.id.slice(0, 7)}
                            icon={<Smartphone size={18} />}
                            value={t("wants to connect")}
                            onClick={() =>
                                actions.askRequest(request.id, request.name)
                            }
                        />
                    ))}
                </SettingsGroup>
            )}

            <SettingsGroup>
                <SettingsToggleRow
                    label={t("Launch at Windows startup")}
                    icon={<Power size={18} />}
                    checked={startup}
                    onChange={actions.toggleStartup}
                />
                {status.takenOver && (
                    <SettingsRow
                        label={t("Give the folder back to Syncthing")}
                        icon={<Undo2 size={18} />}
                        onClick={actions.askGiveBack}
                        disabled={busy}
                        navigates
                    />
                )}
                <SettingsRow
                    label={t("Log")}
                    icon={<FileText size={18} />}
                    onClick={actions.showLog}
                    navigates
                />
            </SettingsGroup>

            <SettingsGroup
                note={
                    <>
                        <img
                            className="nc-sync-logo"
                            src={syncthingLogo}
                            alt="Syncthing"
                            width={22}
                            height={22}
                        />
                        {t(
                            "Syncthing is free, open-source software that keeps files in step between your devices."
                        )}{" "}
                        <a
                            href={SYNCTHING_URL}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t("Learn more")}
                        </a>
                    </>
                }
            >
                <SettingsRow
                    label={t("Details")}
                    icon={<Info size={18} />}
                    value={status.myId ?? "-"}
                />
            </SettingsGroup>

            {pairing && (
                <SettingsDialog
                    title={t("Add the phone")}
                    onClose={actions.closePairing}
                >
                    <p>
                        {t(
                            "Scan this QR code with Neo Calendar on your phone (Settings, Sync, Scan the PC's QR code)."
                        )}
                    </p>
                    <img
                        className="nc-sync-qr"
                        src={svgDataUrl(pairing.qrSvg)}
                        alt={t("QR code to pair the phone")}
                        width={220}
                        height={220}
                    />
                    <p>
                        {t("This code works once and expires in")}{" "}
                        {remainingLabel(
                            status.pairingRemainingMs ?? pairing.expiresInMs
                        )}
                    </p>
                </SettingsDialog>
            )}
        </div>
    );
}

const messageOf = (reason: unknown) =>
    reason instanceof Error ? reason.message : String(reason);

interface DesktopSyncPageProps {
    dataFolder: string;
    dataFolderRow: React.ReactNode;
    /** Ce que la page montrait avant le moteur intégré : gardé tel quel là où il n'existe pas (coque Android). */
    fallback: React.ReactNode;
    /** Pour le rendu statique des tests : `null` montre tout de suite la page de repli. */
    initialStatus?: SyncStatusDto | null;
}

/** Le contenant : lit le moteur toutes les deux secondes, porte les dialogues, lance les gestes. */
export default function DesktopSyncPage({
    dataFolder,
    dataFolderRow,
    fallback,
    initialStatus,
}: DesktopSyncPageProps) {
    // `undefined` : pas encore lu ; `null` : pas de synchro intégrée sur cette plateforme.
    const [status, setStatus] = useState<SyncStatusDto | null | undefined>(
        initialStatus
    );
    const [detection, setDetection] = useState<SyncDetectionDto | null>(null);
    const [pairing, setPairing] = useState<SyncPairingDto | null>(null);
    const [startup, setStartup] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [choice, setChoice] = useState<SettingsChoice | null>(null);
    const [confirm, setConfirm] = useState<"takeOver" | "giveBack" | null>(
        null
    );
    const [log, setLog] = useState<string | null>(null);
    const alive = useRef(true);

    const refresh = useCallback(async () => {
        const next = await loadSyncStatus();
        if (alive.current) setStatus(next);
    }, []);

    const detect = useCallback(async () => {
        try {
            const found = await syncCommands.detect(dataFolder);
            if (alive.current) setDetection(found);
        } catch {
            if (alive.current) setDetection(null);
        }
    }, [dataFolder]);

    useEffect(() => {
        alive.current = true;
        void refresh();
        void detect();
        void isStartupEnabled().then((on) => alive.current && setStartup(on));
        const timer = setInterval(() => void refresh(), pairing ? 1000 : 2000);
        return () => {
            alive.current = false;
            clearInterval(timer);
        };
    }, [refresh, detect, pairing]);

    // La fenêtre se ferme d'elle-même quand le code a servi ou expiré.
    useEffect(() => {
        if (pairing && status && status.pairingRemainingMs === null) {
            const handle = setTimeout(() => setPairing(null), 1500);
            return () => clearTimeout(handle);
        }
    }, [pairing, status]);

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (reason) {
            setError(messageOf(reason));
        } finally {
            setBusy(false);
            void refresh();
            void detect();
        }
    };

    if (status === undefined)
        return <div className="nc-set-groups">{dataFolderRow}</div>;
    if (status === null) return <>{fallback}</>;

    const actions: SyncPageActions = {
        toggle: (enabled) =>
            void run(async () => {
                if (enabled) {
                    await syncCommands.enable(dataFolder);
                    // Comme le .exe de Syncthing : le moteur démarre avec Windows, sans qu'on ait à y penser.
                    if (!(await isStartupEnabled()))
                        setStartup(await setStartupEnabled(true));
                } else {
                    await syncCommands.disable();
                }
            }),
        startPairing: () =>
            void run(async () => setPairing(await syncCommands.pairingStart())),
        closePairing: () => {
            void syncCommands.pairingCancel().catch(() => undefined);
            setPairing(null);
        },
        askDevice: (id, name) =>
            setChoice({
                title: name,
                value: "",
                options: [{ value: "remove", label: t("Remove this device") }],
                onPick: () => void run(() => syncCommands.removeDevice(id)),
            }),
        askRequest: (id, name) =>
            setChoice({
                title: name || id.slice(0, 7),
                value: "",
                options: [
                    { value: "accept", label: t("Accept") },
                    { value: "refuse", label: t("Refuse") },
                ],
                onPick: (value) =>
                    void run(() =>
                        value === "accept"
                            ? syncCommands.acceptDevice(id)
                            : syncCommands.rejectDevice(id)
                    ),
            }),
        retry: () => void run(() => syncCommands.retry()),
        repoint: () => void run(() => syncCommands.repointFolder()),
        recheck: () => void detect(),
        askTakeOver: () => setConfirm("takeOver"),
        askGiveBack: () => setConfirm("giveBack"),
        showLog: () =>
            void syncCommands
                .log()
                .then(setLog)
                .catch(() => setLog("")),
        toggleStartup: (enabled) =>
            void setStartupEnabled(enabled).then(setStartup),
    };

    return (
        <>
            <SyncPageView
                status={status}
                detection={detection}
                pairing={pairing}
                startup={startup}
                busy={busy}
                error={error}
                dataFolderRow={dataFolderRow}
                actions={actions}
            />
            {choice && (
                <SettingsChoiceDialog
                    choice={choice}
                    onClose={() => setChoice(null)}
                />
            )}
            <ConfirmDialog
                open={confirm === "takeOver"}
                title={t("Take the folder over in Neo Calendar")}
                message={t(
                    "Neo Calendar will back up your Syncthing configuration, then remove only the Neo Calendar folder from it. Your other folders and devices are not touched. The devices that shared the folder will have to accept this PC again (your phone: with the QR code)."
                )}
                confirmLabel={t("Take over")}
                onClose={() => setConfirm(null)}
                onConfirm={() =>
                    syncCommands.takeOver(dataFolder, syncStamp(new Date()))
                }
            />
            <ConfirmDialog
                open={confirm === "giveBack"}
                title={t("Give the folder back to Syncthing")}
                message={t(
                    "Neo Calendar stops syncing this folder and your installed Syncthing takes it back, as it was before. It must be running."
                )}
                confirmLabel={t("Give back")}
                onClose={() => setConfirm(null)}
                onConfirm={() => syncCommands.giveBack()}
            />
            {log !== null && (
                <SettingsDialog title={t("Log")} onClose={() => setLog(null)}>
                    <pre className="nc-sync-log">
                        {log || t("The log is empty.")}
                    </pre>
                </SettingsDialog>
            )}
        </>
    );
}
```

- [ ] **Step 5 : Brancher la page, le démarrage différé et le style**

`DesktopSettings.tsx` (la page de repli garde l'ancien contenu pour la coque Android) :

```diff
--- a/apps/windows/src/DesktopSettings.tsx
+++ b/apps/windows/src/DesktopSettings.tsx
@@ -6,4 +6,5 @@
 import WallpaperEffectsControls from "./WallpaperEffectsControls";
 import ConfirmDialog from "./ConfirmDialog";
+import DesktopSyncPage from "./DesktopSyncPage";
 import type { WallpaperId } from "./themes/wallpapers";
 import { ThemeId } from "./themes/types";
@@ -1368,32 +1369,43 @@
     );
 
+    const syncDataFolderRow = (
+        <SettingsRow
+            label={t("Data folder")}
+            icon={<FolderOpen size={18} />}
+            value={folderName(dataFolder)}
+            navigates
+            onClick={() => openPage({ kind: "section", id: "folder" })}
+        />
+    );
+
+    // Le moteur intégré n'existe que sur le bureau : ailleurs (coque Android), la page garde ses trois méthodes.
     const renderSync = () => (
-        <div className="nc-set-groups">
-            <SettingsGroup
-                note={t(
-                    "Neo Calendar keeps its data in the folder you choose. Syncing is done by whichever tool you settle on."
-                )}
-            >
-                <SettingsRow
-                    label={t("Data folder")}
-                    icon={<FolderOpen size={18} />}
-                    value={folderName(dataFolder)}
-                    navigates
-                    onClick={() => openPage({ kind: "section", id: "folder" })}
-                />
-            </SettingsGroup>
-
-            <SettingsGroup title={t("Possible methods")}>
-                <SettingsRow label="Syncthing" value={t("Recommended")} />
-                <SettingsRow
-                    label={t("Online storage")}
-                    value={t("OneDrive, Google Drive, Dropbox")}
-                />
-                <SettingsRow
-                    label={t("Manual transfer")}
-                    value={t("Over USB")}
-                />
-            </SettingsGroup>
-        </div>
+        <DesktopSyncPage
+            dataFolder={dataFolder}
+            dataFolderRow={syncDataFolderRow}
+            fallback={
+                <div className="nc-set-groups">
+                    <SettingsGroup
+                        note={t(
+                            "Neo Calendar keeps its data in the folder you choose. Syncing is done by whichever tool you settle on."
+                        )}
+                    >
+                        {syncDataFolderRow}
+                    </SettingsGroup>
+
+                    <SettingsGroup title={t("Possible methods")}>
+                        <SettingsRow label="Syncthing" value={t("Recommended")} />
+                        <SettingsRow
+                            label={t("Online storage")}
+                            value={t("OneDrive, Google Drive, Dropbox")}
+                        />
+                        <SettingsRow
+                            label={t("Manual transfer")}
+                            value={t("Over USB")}
+                        />
+                    </SettingsGroup>
+                </div>
+            }
+        />
     );
 
```

`DesktopSettings.test.tsx` (deux tests lisaient l'ancienne page dans le rendu statique : jusqu'à la réponse du moteur, la page ne montre que la ligne du dossier de données ; le repli est testé dans `DesktopSyncPage.test.tsx`) :

```diff
--- a/apps/windows/src/DesktopSettings.test.tsx
+++ b/apps/windows/src/DesktopSettings.test.tsx
@@ -84,5 +84,8 @@
     });
 
-    it("keeps synchronization guidance on the sync page", () => {
+    // Le moteur intégré se lit après le premier rendu : jusqu'à sa réponse, la page ne montre que la ligne du
+    // dossier de données. Le contenu complet, et la page de repli de la coque Android, sont dans
+    // DesktopSyncPage.test.tsx.
+    it("opens the sync page on the data folder row while the engine is read", () => {
         const html = renderToStaticMarkup(
             <DesktopSettings open initialTab="sync" {...commonProps} />
@@ -90,9 +93,5 @@
 
         expect(html).toContain('data-settings-page="sync"');
-        expect(html).toContain("Syncthing");
-        expect(html).toContain("Recommandé");
-        expect(html).toContain("OneDrive");
-        expect(html).toContain("Google Drive");
-        expect(html).toContain("Dropbox");
+        expect(html).toContain("Dossier de données");
     });
 
@@ -114,5 +113,5 @@
 
         expect(html).toContain("nc-settings__desktop-page");
-        expect(html).toContain("Syncthing");
+        expect(html).toContain("Dossier de données");
         expect(html).not.toContain("nc-choice-dialog");
         expect(html).not.toContain("nc-settings__page--buried");
```

`App.tsx` (le moteur démarre après le premier écran) :

```diff
--- a/apps/windows/src/App.tsx
+++ b/apps/windows/src/App.tsx
@@ -21,4 +21,5 @@
 import "./themes/wallpaperEffects";
 import { useStartupReveal } from "./useStartupReveal";
+import { startSyncSoon } from "./platform/desktopSync";
 import appIcon from "./assets/app-icon.png";
 import { WINDOWS_PLATFORM_CLASS } from "../../../src/ui/calendar/shortcutRegistry";
@@ -117,4 +118,9 @@
         !!preferences && (!dataFolder || isCalendarReady)
     );
+    // La synchro intégrée démarre APRÈS le premier écran, jamais avant : rien de l'affichage n'attend le moteur.
+    useEffect(() => {
+        if (!dataFolder || !isCalendarReady) return;
+        return startSyncSoon(dataFolder);
+    }, [dataFolder, isCalendarReady]);
 
     const appearanceMode = useMemo(
```

`App.css` (le QR code et le journal ; fichier en CRLF : utiliser l'outil Edit) :

```diff
--- a/apps/windows/src/App.css
+++ b/apps/windows/src/App.css
@@ -4594,4 +4594,31 @@
 }
 
+/* Le QR code d'appairage : noir sur blanc quel que soit le thème (un lecteur ne lit pas un QR sombre). */
+.nc-sync-qr {
+    display: block;
+    margin: 12px auto;
+    padding: 12px;
+    border-radius: 10px;
+    background: #fff;
+}
+
+/* Le logo officiel de Syncthing, au début de la note du bas de page. */
+.nc-sync-logo {
+    display: inline-block;
+    margin-right: 8px;
+    vertical-align: middle;
+}
+
+/* Le journal du moteur de synchronisation. */
+.nc-sync-log {
+    max-height: 320px;
+    margin: 0;
+    overflow: auto;
+    color: var(--nc-text-secondary, inherit);
+    font: 12px/1.45 ui-monospace, "Cascadia Mono", Consolas, monospace;
+    white-space: pre-wrap;
+    word-break: break-word;
+}
+
 .nc-set-group__rows {
     display: grid;
```

- [ ] **Step 6 : Vérifier**

Run : `npx jest apps/windows/src src/ui/i18n.test.ts` ; Expected : toutes les suites vertes (aucune ne dépend d'un moteur réel).
Run : `cd apps\windows; npx tsc --noEmit` ; Expected : aucune sortie.
Run (racine) : `npx prettier --check apps/windows/src/DesktopSyncPage.tsx apps/windows/src/DesktopSyncPage.test.tsx apps/windows/src/platform/desktopSync.ts apps/windows/src/platform/desktopSync.test.ts` ; Expected : `All matched files use Prettier code style!` (les fichiers ci-dessus sont déjà formatés ; `App.tsx` et `DesktopSettings.tsx` ne passent pas Prettier AVANT ce plan, ne pas les reformater).

- [ ] **Step 7 : Voir la page tourner**

Protocole du `CLAUDE.md` du projet : `node scripts/configure-tauri-updater.mjs`, puis `npm run dev` (Tauri, depuis la racine ; le moteur est posé par le lanceur), ouvrir Paramètres, Synchronisation : la page montre « synchronisé par Neo Calendar (Syncthing intégré v2.1.5) », l'interrupteur, « Statut », et en bas le logo Syncthing avec « En savoir plus » (ouvre https://syncthing.net). Activer la synchro sur un dossier de données de TEST (pas `C:\Neo Calendar`) : état « Démarrage… » puis « Aucun appareil : ajoutez votre téléphone », « Ajouter le téléphone » ouvre le QR code avec le décompte. Capturer l'écran. Après coup : `git checkout apps/windows/src-tauri/tauri.conf.json` (ce fichier est suivi ; la version commitée contient `externalBin`) et vérifier avec `Get-CimInstance Win32_Process -Filter "Name='syncthing.exe'"` qu'aucun moteur de l'app ne reste après avoir fermé la fenêtre de dev (Quitter par l'icône). Le mode `dev` n'a pas le plugin `autostart` : l'interrupteur « Lancer au démarrage de Windows » y lit « non », c'est normal.

- [ ] **Step 8 : Commit**

```bash
git add apps/windows/src/assets/syncthing-logo.svg apps/windows/src/platform/desktopSync.ts apps/windows/src/platform/desktopSync.test.ts apps/windows/src/DesktopSyncPage.tsx apps/windows/src/DesktopSyncPage.test.tsx apps/windows/src/DesktopSettings.tsx apps/windows/src/DesktopSettings.test.tsx apps/windows/src/App.tsx apps/windows/src/App.css src/ui/i18n.ts
git commit -m "PC : page Synchronisation (état, appareils, demandes, QR code d'appairage, reprise), moteur démarré après le premier écran" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 10 : Android : le noyau de l'appairage (QR code, nom présenté, `SyncSetup.pairWithPc`)

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/Pairing.kt`
- Create: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/sync/PairingTest.kt`, `.../SyncSetupPairingTest.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/SyncSetup.kt`

**Interfaces:**
- Consumes: `DeviceIds.normalize`, `SyncthingApi.{myId, devices, renameDevice, putDevice}`, `FakeTransport` (partie 1).
- Produces: `PairingPayload(deviceId, code)` avec `PairingPayload.parse(text): PairingPayload?` ; `PairingName.{hasCode, strip, withCode}` ; `PairingFollowUp.{WINDOW_MS, shouldClearName(nameHasCode, startedAtMs, nowMs, pcConnected), shouldAutoAdopt(offeredByPairedPc, localNotes, hasLocalPreferences)}` ; `SyncSetup.pairWithPc(payload, pcName = "PC"): String` (rend le nom d'origine) et `SyncSetup.clearPairingName()`.

Le téléphone se présente au PC sous `Nom [NC:code]` (posé AVANT l'ajout du PC : le nom part dans le message de bienvenue de la première connexion), ajoute le PC et ne partage RIEN : c'est le PC qui accepte le bon code puis partage son dossier, que le téléphone adopte ensuite. Un identifiant invalide ou celui du téléphone est refusé avant toute modification ; si l'ajout du PC échoue, le nom d'origine est rendu.

- [ ] **Step 1 : Tests (échec attendu)**

Créer `PairingTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingTest {
    // Même vecteur que `the_payload_is_the_agreed_contract_with_the_phone` (sync/pairing.rs) : un identifiant produit par un vrai Syncthing.
    private val pcId = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX"
    private val qr = "neo-calendar://pair?device=$pcId&code=K7Q2M9XPAB"

    @Test fun `le QR code du PC est lu, identifiant normalise et code`() {
        assertEquals(PairingPayload(pcId, "K7Q2M9XPAB"), PairingPayload.parse(qr))
        assertEquals(PairingPayload(pcId, "K7Q2M9XPAB"), PairingPayload.parse("  $qr \n"))
    }

    @Test fun `un QR code qui n'est pas un appairage Neo Calendar est refuse`() {
        val invalid = listOf(
            pcId, // l'identifiant seul (le QR d'un autre Syncthing)
            "https://example.com/?device=$pcId&code=K7Q2M9XPAB",
            "neo-calendar://pair?device=$pcId", // pas de code
            "neo-calendar://pair?code=K7Q2M9XPAB", // pas d'identifiant
            "neo-calendar://pair?device=$pcId&code=COURT",
            "neo-calendar://pair?device=$pcId&code=k7q2m9xpab", // minuscules
            "neo-calendar://pair?device=$pcId&code=K7Q2M9XPA0", // 0 hors de l'alphabet
            "neo-calendar://pair?device=PAS-UN-IDENTIFIANT&code=K7Q2M9XPAB",
            "neo-calendar://pair?device=${pcId.dropLast(1)}A&code=K7Q2M9XPAB", // somme de contrôle fausse
            "",
        )
        for (text in invalid) assertNull(text, PairingPayload.parse(text))
    }

    @Test fun `le code voyage dans le nom d'appareil, a la fin`() {
        assertEquals("Pixel 8 [NC:K7Q2M9XPAB]", PairingName.withCode("Pixel 8", "K7Q2M9XPAB"))
        assertEquals("Android [NC:K7Q2M9XPAB]", PairingName.withCode("  ", "K7Q2M9XPAB"))
        // Un nom qui porte déjà un code (appairage rejoué) n'en accumule pas deux.
        assertEquals("Pixel 8 [NC:ZZZZZZZZZZ]", PairingName.withCode("Pixel 8 [NC:K7Q2M9XPAB]", "ZZZZZZZZZZ"))
    }

    @Test fun `le nom est rendu sans son code`() {
        assertEquals("Pixel 8", PairingName.strip("Pixel 8 [NC:K7Q2M9XPAB]"))
        assertEquals("Pixel 8", PairingName.strip("Pixel 8"))
        assertEquals("Pixel [NC:court]", PairingName.strip("Pixel [NC:court]"))
        assertTrue(PairingName.hasCode("Pixel 8 [NC:K7Q2M9XPAB]"))
        assertFalse(PairingName.hasCode("Pixel 8"))
        assertFalse(PairingName.hasCode("Pixel [NC:K7Q2M9XPAB] suite"))
    }

    @Test fun `le nom reprend sa forme normale quand le PC est connecte, la fenetre passee, ou l'app redemarree`() {
        val start = 1_000_000L
        assertFalse(PairingFollowUp.shouldClearName(true, start, start + 10_000, pcConnected = false))
        assertTrue(PairingFollowUp.shouldClearName(true, start, start + 10_000, pcConnected = true))
        assertTrue(PairingFollowUp.shouldClearName(true, start, start + PairingFollowUp.WINDOW_MS + 1, pcConnected = false))
        assertFalse(PairingFollowUp.shouldClearName(true, start, start + PairingFollowUp.WINDOW_MS, pcConnected = false))
        assertTrue(PairingFollowUp.shouldClearName(true, null, start, pcConnected = false))
        assertFalse("rien à rendre quand le nom est propre", PairingFollowUp.shouldClearName(false, null, start, pcConnected = true))
    }

    @Test fun `le dossier du PC est adopte sans question seulement sur un telephone vierge`() {
        assertTrue(PairingFollowUp.shouldAutoAdopt(true, 0, false))
        assertFalse("des notes locales : confirmation", PairingFollowUp.shouldAutoAdopt(true, 3, false))
        assertFalse("des réglages locaux : confirmation", PairingFollowUp.shouldAutoAdopt(true, 0, true))
        assertFalse("proposé par un autre appareil que le PC appairé", PairingFollowUp.shouldAutoAdopt(false, 0, false))
    }
}
```

Créer `SyncSetupPairingTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SyncSetupPairingTest {
    private val me = "MEMEME7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"
    private val pc = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX"
    private val payload = PairingPayload(pc, "K7Q2M9XPAB")
    private val fake = FakeTransport()
    private val setup = SyncSetup(SyncthingApi(fake), "/data/files/Neo Calendar", retryDelayMs = 0)

    private fun phone(name: String) {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        fake.answer("GET /rest/config/devices", """[{"deviceID":"$me","name":"$name"}]""")
        fake.answer("PATCH /rest/config/devices/$me", "")
        fake.answer("PUT /rest/config/devices/$pc", "")
    }

    @Test fun `le telephone se presente avec le code puis ajoute le PC, sans rien partager`() {
        phone("Pixel 8")
        val original = setup.pairWithPc(payload)
        assertEquals("Pixel 8", original)
        assertEquals("""{"name":"Pixel 8 [NC:K7Q2M9XPAB]"}""", fake.sent("PATCH", "/rest/config/devices/$me"))
        assertTrue(fake.sent("PUT", "/rest/config/devices/$pc")!!.contains("\"name\":\"PC\""))
        // C'est le PC qui accepte puis partage : aucun dossier n'est créé ni posé ici.
        assertNull(fake.calls.firstOrNull { it.path.startsWith("/rest/config/folders") })
        // L'ordre compte : le nom est posé AVANT l'ajout du PC (le nom part dans le message de bienvenue de la première connexion).
        val order = fake.calls.map { "${it.method} ${it.path}" }
        assertTrue(order.indexOf("PATCH /rest/config/devices/$me") < order.indexOf("PUT /rest/config/devices/$pc"))
    }

    @Test fun `l'identifiant de ce telephone est refuse avant toute modification`() {
        phone("Pixel 8")
        try { setup.pairWithPc(PairingPayload(me, "K7Q2M9XPAB")); fail() } catch (e: IllegalArgumentException) { assertTrue(e.message!!.contains("cet appareil")) }
        assertNull(fake.sent("PATCH", "/rest/config/devices/$me"))
        assertNull(fake.sent("PUT", "/rest/config/devices/$me"))
    }

    @Test fun `si l'ajout du PC echoue, le nom d'origine est rendu`() {
        phone("Pixel 8")
        fake.answer("PUT /rest/config/devices/$pc", "refus", code = 500)
        try { setup.pairWithPc(payload); fail() } catch (_: SyncthingApiException) {}
        val renames = fake.calls.filter { it.method == "PATCH" && it.path == "/rest/config/devices/$me" }.map { it.body }
        assertEquals(listOf("""{"name":"Pixel 8 [NC:K7Q2M9XPAB]"}""", """{"name":"Pixel 8"}"""), renames)
    }

    @Test fun `un appairage rejoue ne cumule pas deux codes`() {
        phone("Pixel 8 [NC:ZZZZZZZZZZ]")
        assertEquals("Pixel 8", setup.pairWithPc(payload))
        assertEquals("""{"name":"Pixel 8 [NC:K7Q2M9XPAB]"}""", fake.sent("PATCH", "/rest/config/devices/$me"))
    }

    @Test fun `rendre le vrai nom retire le code, et ne fait rien si le nom est propre`() {
        phone("Pixel 8 [NC:K7Q2M9XPAB]")
        setup.clearPairingName()
        assertEquals("""{"name":"Pixel 8"}""", fake.sent("PATCH", "/rest/config/devices/$me"))

        val clean = FakeTransport()
        clean.answer("GET /rest/system/status", """{"myID":"$me"}""")
        clean.answer("GET /rest/config/devices", """[{"deviceID":"$me","name":"Pixel 8"}]""")
        SyncSetup(SyncthingApi(clean), "/x").clearPairingName()
        assertNull(clean.calls.firstOrNull { it.method == "PATCH" })
    }
}
```

Run (`C:\dev\neo-calendar\apps\android\native`) : `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"; .\gradlew.bat --no-daemon :core:test --tests 'com.ahmed.neocalendar.core.sync.PairingTest' --tests 'com.ahmed.neocalendar.core.sync.SyncSetupPairingTest'`
Expected : `FAILED`, `Unresolved reference 'PairingPayload'` (compilation des tests).

- [ ] **Step 2 : `Pairing.kt` et `SyncSetup`**

Créer `Pairing.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

/**
 * Ce que contient le QR code affiché par le PC (« Ajouter le téléphone ») : l'identifiant de l'appareil PC et un
 * code d'appairage à usage unique, valable 5 minutes. Le format est un contrat avec le PC (`sync/pairing.rs`,
 * `qr_payload`) : le même vecteur d'essai figure des deux côtés.
 */
data class PairingPayload(val deviceId: String, val code: String) {
    companion object {
        private const val PREFIX = "neo-calendar://pair?"
        private val CODE = Regex("[A-HJ-NP-Z2-9]{10}")

        /** Le contenu d'un QR code scanné, ou null s'il n'est pas un appairage Neo Calendar valide (identifiant à somme de contrôle juste, code de 10 caractères). */
        fun parse(text: String): PairingPayload? {
            val trimmed = text.trim()
            if (!trimmed.startsWith(PREFIX)) return null
            val params = trimmed.removePrefix(PREFIX).split('&').mapNotNull { part ->
                part.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] }
            }.toMap()
            val id = DeviceIds.normalize(params["device"] ?: return null) ?: return null
            val code = params["code"] ?: return null
            return if (CODE.matches(code)) PairingPayload(id, code) else null
        }
    }
}

/**
 * Le code voyage dans le nom d'appareil que ce téléphone présente au PC (`Pixel 8 [NC:K7Q2M9XPAB]`) : l'API REST de
 * Syncthing v2.1.5 n'expose, pour un appareil encore inconnu, que son identifiant, son adresse et ce nom
 * (`/rest/cluster/pending/devices`, vérifié sur deux vrais moteurs).
 */
object PairingName {
    private val MARKER = Regex("\\s*\\[NC:[A-HJ-NP-Z2-9]{10}]\\s*$")

    fun hasCode(name: String): Boolean = MARKER.containsMatchIn(name)

    /** Le nom sans son éventuel code. */
    fun strip(name: String): String = name.replace(MARKER, "").trim()

    fun withCode(base: String, code: String): String = "${strip(base).ifEmpty { "Android" }} [NC:$code]"
}

/** Ce que ce téléphone fait après le scan, décidé par des fonctions pures. */
object PairingFollowUp {
    const val WINDOW_MS = 5 * 60 * 1000L

    /**
     * Le nom porte encore le code : il est rendu quand le PC est connecté (il a accepté), quand la fenêtre de 5 minutes
     * est passée, ou quand l'app a redémarré entre-temps (plus de session en mémoire). Le code ne doit pas rester
     * dans ce que les autres appareils voient.
     */
    fun shouldClearName(nameHasCode: Boolean, startedAtMs: Long?, nowMs: Long, pcConnected: Boolean): Boolean =
        nameHasCode && (startedAtMs == null || pcConnected || nowMs - startedAtMs > WINDOW_MS)

    /**
     * Le dossier que le PC propose est adopté sans question seulement si ce téléphone n'a ni note ni réglage locaux ;
     * sinon la carte de confirmation habituelle s'affiche (rien n'est fusionné sans que l'utilisateur le sache).
     */
    fun shouldAutoAdopt(offeredByPairedPc: Boolean, localNotes: Int, hasLocalPreferences: Boolean): Boolean =
        offeredByPairedPc && localNotes == 0 && !hasLocalPreferences
}
```

`SyncSetup.kt` :

```diff
--- a/apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/SyncSetup.kt
+++ b/apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/SyncSetup.kt
@@ -59,4 +59,34 @@
         api.putDevice(id, name.trim().ifEmpty { id.take(7) })
         shareFolderWith(me, id)
+    }
+
+    /**
+     * Appairage par QR code (le téléphone scanne le QR code du PC) : CET appareil se présente sous le nom
+     * `Nom [NC:code]` (le PC lit ce nom dans sa demande entrante), puis ajoute le PC. Rien n'est partagé d'ici : le PC
+     * accepte la demande qui porte le bon code (fenêtre de 5 minutes), puis partage son dossier, que ce téléphone adopte
+     * ensuite. Le nom est posé AVANT l'ajout du PC (il part dans le message de bienvenue de la première connexion) ;
+     * si l'ajout échoue, le nom d'origine est rendu. Rend le nom d'origine.
+     */
+    fun pairWithPc(payload: PairingPayload, pcName: String = "PC"): String {
+        val me = api.myId()
+        if (payload.deviceId == me) {
+            throw IllegalArgumentException("C'est l'identifiant de cet appareil : scannez le QR code affiché sur le PC.")
+        }
+        val original = PairingName.strip(api.devices().firstOrNull { it.id == me }?.name.orEmpty())
+        api.renameDevice(me, PairingName.withCode(original, payload.code))
+        try {
+            api.putDevice(payload.deviceId, pcName)
+        } catch (e: Exception) {
+            runCatching { api.renameDevice(me, original) }
+            throw e
+        }
+        return original
+    }
+
+    /** Rend à cet appareil son vrai nom : le code d'appairage ne doit pas rester dans ce que les autres appareils voient. Sans effet si le nom n'en porte pas. */
+    fun clearPairingName() {
+        val me = api.myId()
+        val name = api.devices().firstOrNull { it.id == me }?.name ?: return
+        if (PairingName.hasCode(name)) api.renameDevice(me, PairingName.strip(name))
     }
 
```

- [ ] **Step 3 : Voir le succès**

Run : la même commande qu'au Step 1. Expected : `BUILD SUCCESSFUL` (6 tests de `PairingTest`, 5 de `SyncSetupPairingTest`).
Run : `.\gradlew.bat --no-daemon :core:test` ; Expected : `BUILD SUCCESSFUL` (le noyau entier, dont le test à deux moteurs s'il y a `SYNCTHING_BINARY`).

- [ ] **Step 4 : Commit**

```bash
git add apps/android/native/core/src
git commit -m "Android : noyau de l'appairage par QR code (contenu du QR, code dans le nom d'appareil, SyncSetup.pairWithPc)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 11 : Android : « Scanner le QR code du PC » sur la page Synchronisation

**Files:**
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/SyncPageModel.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SyncPage.kt`

**Interfaces:**
- Consumes: Task 10 ; zxing (`com.journeyapps:zxing-android-embedded:4.3.0`, déjà dans `app/build.gradle.kts`, `ScanContract` déjà importé par `SyncPage.kt`) ; `CAMERA` déjà déclarée dans le manifeste.
- Produces: `SyncPageModel.pairWithPc(scanned: String): String?` (message d'erreur ou `null`) ; le suivi `followUpPairing` (nom rendu, adoption sans question sur un téléphone vierge) dans `refresh()` ; la ligne « Scanner le QR code du PC ».

Rien n'est modifié sur le chemin du lancement : ni `CachedWorkspaceStorage`, ni `NativeActivity`, ni `SyncController.onAppStarted`. La session d'appairage reste en mémoire (jamais écrite) ; l'app tuée entre le scan et l'acceptation : au redémarrage `shouldClearName(true, null, …)` rend le vrai nom.

- [ ] **Step 1 : Le modèle**

```diff
--- a/apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/SyncPageModel.kt
+++ b/apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/SyncPageModel.kt
@@ -4,4 +4,7 @@
 import com.ahmed.neocalendar.core.sync.ConfiguredFolder
 import com.ahmed.neocalendar.core.sync.FolderLostException
+import com.ahmed.neocalendar.core.sync.PairingFollowUp
+import com.ahmed.neocalendar.core.sync.PairingName
+import com.ahmed.neocalendar.core.sync.PairingPayload
 import com.ahmed.neocalendar.core.sync.PendingDevice
 import com.ahmed.neocalendar.core.sync.PendingFolder
@@ -47,4 +50,9 @@
 
     @Volatile private var folderLost: PendingFolder? = null
+
+    /** Un appairage par QR code est en cours : le PC scanné et l'instant du scan (en mémoire seulement, jamais écrit). */
+    private class PairingSession(val pcId: String, val startedAtMs: Long)
+
+    @Volatile private var pairing: PairingSession? = null
 
     private fun api(): SyncthingApi = controller.engine.api
@@ -86,7 +94,42 @@
                 folderLost = folderLost,
             )
+            followUpPairing(_ui.value)
         } catch (e: Exception) {
             _ui.value = _ui.value.copy(conflicts = conflicts, folderLost = folderLost)
         }
+    }
+
+    /**
+     * Après le scan du QR code du PC : rend son vrai nom au téléphone (le code ne doit pas rester dans ce que les autres
+     * appareils voient), puis adopte le dossier que le PC propose sans question quand il n'y a rien à fusionner. Avec des
+     * notes ou des réglages locaux, la carte de confirmation habituelle s'affiche : rien n'est fusionné à l'insu de l'utilisateur.
+     */
+    private suspend fun followUpPairing(ui: SyncUi) {
+        val session = pairing
+        val pcConnected = session != null && ui.devices.any { it.id == session.pcId && it.connected }
+        if (PairingFollowUp.shouldClearName(PairingName.hasCode(ui.myName), session?.startedAtMs, System.currentTimeMillis(), pcConnected)) {
+            runCatching { setup().clearPairingName() }
+        }
+        if (session == null) return
+        val offered = ui.proposals.firstOrNull { it.proposal.offeredBy == session.pcId && it.proposal != ui.folderLost }
+        if (offered != null && PairingFollowUp.shouldAutoAdopt(true, localNoteCount(), hasLocalPreferences())) {
+            pairing = null
+            adopt(offered.proposal)
+        } else if (offered != null || System.currentTimeMillis() - session.startedAtMs > PairingFollowUp.WINDOW_MS) {
+            pairing = null
+        }
+    }
+
+    /** Appairage par QR code : `scanned` est le contenu du QR code. Rend le message d'erreur, ou null. */
+    suspend fun pairWithPc(scanned: String): String? = withContext(Dispatchers.IO) {
+        val payload = PairingPayload.parse(scanned)
+            ?: return@withContext "Ce QR code n'est pas celui d'un PC Neo Calendar. Sur le PC : Réglages, Synchronisation, « Ajouter le téléphone »."
+        try {
+            setup().pairWithPc(payload)
+            pairing = PairingSession(payload.deviceId, System.currentTimeMillis())
+            null
+        } catch (e: Exception) {
+            e.message ?: e.toString()
+        }.also { refresh(); controller.refreshNow() }
     }
 
```

- [ ] **Step 2 : La page**

```diff
--- a/apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SyncPage.kt
+++ b/apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SyncPage.kt
@@ -123,4 +123,14 @@
     fun report(error: String?) { if (error != null) Notices.show(error) }
 
+    // Appairage par QR code : le scan vaut consentement côté téléphone ; le PC accepte tout seul le bon code (fenêtre de 5 minutes).
+    val scanPc = androidx.activity.compose.rememberLauncherForActivityResult(ScanContract()) { result ->
+        result.contents?.let { scanned ->
+            scope.launch {
+                val error = model.pairWithPc(scanned)
+                if (error != null) Notices.show(error) else Notices.show("Appairage lancé : le PC va accepter ce téléphone dans un instant.")
+            }
+        }
+    }
+
     Group("Mode de stockage", note = "Vos notes sont dans le stockage privé de Neo Calendar, synchronisé par le moteur intégré.\nCe mode et un dossier synchronisé par une autre app s'excluent : jamais les deux sur les mêmes notes.") {
         row(NeoIcons.Check, "Synchronisation intégrée", "Recommandé", chevron = false, onClick = null)
@@ -158,4 +168,16 @@
                 context.startActivity(Intent.createChooser(send, null))
             }
+        }
+    }
+
+    Group(
+        "Appairer avec un PC",
+        note = "Sur le PC : Réglages, Synchronisation, « Ajouter le téléphone ». Scannez le QR code affiché : le PC accepte ce téléphone tout seul, sans identifiant à saisir.",
+    ) {
+        row(NeoIcons.QrCode, "Scanner le QR code du PC", null, chevron = false) {
+            scanPc.launch(
+                ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(false)
+                    .setPrompt("Scannez le QR code affiché sur le PC"),
+            )
         }
     }
```

- [ ] **Step 3 : Compiler**

Run : `.\gradlew.bat --no-daemon :core:test :app:compileDebugKotlin` ; Expected : `BUILD SUCCESSFUL` (seuls des avertissements préexistants, jamais un nouveau).

- [ ] **Step 4 : Voir la page sur l'émulateur** (`-s emulator-5554` sur CHAQUE commande ; sauvegarder d'abord `shared_prefs/neo_android.xml` comme le fait `.superpowers/syncthing/adb-outils.ps1`)

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
.\gradlew.bat --no-daemon assembleDebug
& $adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk   # jamais uninstall
& $adb -s emulator-5554 shell am start -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity
```

Ouvrir Réglages, Synchronisation (stockage privé) : le groupe « Appairer avec un PC » est au-dessus de « Appareils ». Toucher « Scanner le QR code du PC » : la caméra demande son autorisation puis le scanner s'ouvre avec « Scannez le QR code affiché sur le PC ». Capturer (`& $adb -s emulator-5554 exec-out screencap -p > scan.png`) et lire la capture. Le scan réel d'un QR code est vérifié à la Task 12 (l'émulateur n'a pas de PC à portée de caméra) ; le contenu du QR code est couvert par `PairingTest`.

- [ ] **Step 5 : Lancement non ralenti (Android)**

`git diff --stat HEAD~1 -- apps/android/native/app` ne doit lister que `SyncPage.kt` et `SyncPageModel.kt`. Refaire la mesure `am start -W` après `force-stop` du protocole de `.superpowers/syncthing/lancement.md` (émulateur) et la comparer à celle de la partie 1 : pas de régression.

- [ ] **Step 6 : Commit**

```bash
git add apps/android/native/app/src
git commit -m "Android : scanner le QR code du PC (appairage), nom rendu après l'appairage, adoption sans question sur un téléphone vierge" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 12 : Vérification réelle et livraison

**Files:** aucun code (sauf correctifs dictés par la vérification). Noter dans `docs/PROCHAINE_VERSION.md` (non versionné) les points restants.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la preuve que la livraison tient sur le PC et le téléphone d'Ahmed, et la commande `git ship` à lui donner.

Situation réelle (2026-10-02) : Ahmed a retiré lui-même le partage « Neo Calendar » de son Syncthing installé (il n'a plus besoin du Laptop) ; `C:\Neo Calendar` contient probablement encore un `.stfolder` orphelin. Le chemin réel est donc : l'app prend le dossier directement, puis appairage du téléphone par QR code. La reprise depuis un Syncthing qui PARTAGE encore le dossier est vérifiée sur la configuration de test (Task 7). Ahmed est présent pour ces étapes.

- [ ] **Step 1 : Tout le vert**

Run : `npm test` (racine) ; `cd apps\windows\src-tauri; cargo test --lib` avec `SYNCTHING_BINARY` ; `cd apps\android\native; .\gradlew.bat --no-daemon :core:test :app:compileDebugKotlin` ; `node scripts/fetch-syncthing-windows.mjs`.
Expected : tout vert. Relire `git diff main...android-parite --stat` : aucun fichier de démarrage Android, aucun fichier de Syncthing d'Ahmed.

- [ ] **Step 2 : Livraison**

Donner à Ahmed la commande à copier-coller (il la lance lui-même) :

```
git ship minor "PC : synchronisation intégrée (Syncthing embarqué, QR code d'appairage avec le téléphone)"
```

La release construit l'installateur Windows (le job vérifie le moteur par `gpg` et SHA-256) et l'APK ; elle annonce son heure de fin (8 à 10 minutes). Attendre qu'elle soit publiée, installer l'installateur sur le PC et l'APK sur le téléphone (`adb -s SGPZQ84XNFDQBE8L install -r <apk de la release>`, seule commande visant ce téléphone, avec la version livrée).

- [ ] **Step 3 : Avant de toucher à quoi que ce soit : l'état du vrai Syncthing d'Ahmed (lecture seule)**

Avec Ahmed : relever `GET /rest/config/folders` de son Syncthing (ids, chemins, appareils) dans un fichier `avant.json` (son interface : la clé d'API est dans son `config.xml` et c'est lui qui la donne ou lance la commande), et copier son `config.xml` en `config.xml.avant-neo-calendar-<horodatage>` à côté. Rien d'autre.

- [ ] **Step 4 : Lancement non ralenti (PC)**

Avec la fonction `Measure-Launch` de la Task 2, mesurer la version livrée (`%LOCALAPPDATA%\Programs\Neo Calendar\neo-calendar.exe`) avec la synchro DÉSACTIVÉE puis ACTIVÉE (le moteur démarre après le premier écran). Expected : médiane de la version livrée au plus 100 ms au-dessus de la référence de la Task 2 dans les deux cas. Sinon, la livraison est bloquée : chercher quel travail se glisse sur le chemin du premier écran (le contrôleur ne lit qu'un petit fichier ; `startSyncSoon` attend 1,5 s).

- [ ] **Step 5 : L'app prend le dossier (chemin réel)**

Dans l'app : Paramètres, Synchronisation. Attendre « La synchronisation intégrée est désactivée » ; vérifier que la page ne propose PAS de reprise (aucun Syncthing ne partage `C:\Neo Calendar` : `.stfolder` orphelin ignoré). Activer. Expected : état « Démarrage… » puis « Aucun appareil : ajoutez votre téléphone » ; « Lancer au démarrage de Windows » devient actif ; dans `%LOCALAPPDATA%\com.ahmed.neocalendar\syncthing\` : `moteur\`, `bin\syncthing-2.1.5.exe`, `settings.json`, `journal\engine.log`. `GET /rest/config/folders` de SON Syncthing (port 8384) : identique à `avant.json` (coffres Obsidian intacts).

- [ ] **Step 6 : Appairage par QR code avec le vrai téléphone**

PC : « Ajouter le téléphone » (QR code et décompte de 5 minutes). Téléphone : Réglages, Synchronisation, « Scanner le QR code du PC ». Expected : sans rien saisir ni accepter, le téléphone apparaît dans « Appareils » du PC (nom propre, sans code) en quelques secondes, la fenêtre se ferme, le dossier est partagé, le téléphone adopte le dossier (sans question s'il est vierge, avec la carte de confirmation s'il a des notes) et son nom ne contient plus `[NC:`. Essais négatifs : rescanner le même QR code après usage (rien), un QR code expiré (rien), « Ajouter le téléphone » puis annuler (la fenêtre se ferme, le même code ne passe plus).

- [ ] **Step 7 : Synchro dans les deux sens, et ce qui doit rester intact**

Créer une note dans le calendrier `Essai Compose` sur le PC : elle apparaît sur le téléphone ; en créer une sur le téléphone : elle apparaît sur le PC. `GET /rest/config/folders` de son Syncthing : toujours identique à `avant.json`. `Get-CimInstance Win32_Process -Filter "Name='syncthing.exe'"` : le Syncthing d'Ahmed tourne toujours, le moteur de l'app a le chemin `...\com.ahmed.neocalendar\syncthing\bin\syncthing-2.1.5.exe`.

- [ ] **Step 8 : Cycle de vie**

Fermer la fenêtre (croix) : elle se masque, `engine.pid` existe, le moteur tourne. Menu de l'icône, « Ouvrir » : la fenêtre revient. « Quitter » : au bout de quelques secondes le PID du moteur de l'app a disparu (`Get-Process -Id <pid de engine.pid>` échoue) et `engine.pid` est supprimé ; le Syncthing d'Ahmed tourne toujours. Redémarrer la session Windows (ou `Start-Process neo-calendar.exe --hidden`) : l'app démarre sans fenêtre, le moteur démarre. Tuer l'app par son PID (jamais par son nom), la relancer : le moteur resté est nettoyé (journal : « Moteur resté d'un lancement précédent terminé »), un seul moteur tourne.

- [ ] **Step 9 : Reprise depuis un Syncthing qui partage encore le dossier (configuration de test)**

Déjà couverte par `control::tests::the_folder_is_taken_over_from_a_test_syncthing_then_given_back` (Task 7, CI comprise). Ne PAS la refaire sur le Syncthing d'Ahmed.

- [ ] **Step 10 : Noter ce qui reste et clore**

Dans `docs/PROCHAINE_VERSION.md` : (a) l'appairage passe par la découverte globale et les relais (la découverte locale est désactivée des deux côtés) : sur un réseau sans internet il échouerait, une adresse LAN dans le QR code serait la suite ; (b) la fusion automatique des copies `*.sync-conflict-*` (partie 4) : le PC charge toujours ces copies comme des évènements ; (c) tout écart constaté pendant ces vérifications. Cocher ce qui est fait. Vérifier `git status` propre sur `android-parite`.
