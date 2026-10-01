# Android : Syncthing embarqué et notes en stockage privé, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une installation Android de Neo Calendar range ses notes dans son stockage privé et les synchronise avec les autres appareils par un Syncthing embarqué, sans installer Syncthing nulle part ; les installations existantes ne changent pas.

**Architecture:** Le noyau `:core` (Kotlin/JVM pur, testé en JUnit) porte tout ce qui se teste sans Android : stockage par vrai chemin (écriture atomique), filtre des fichiers de synchro, copie vérifiée de bascule, identifiant d'appareil, configuration du moteur, client REST derrière une interface `HttpTransport` (TCP dans le test d'intégration, socket Unix dans l'app), politique de relance, conditions de fonctionnement, ligne d'état. `:app` ne contient que le branchement Android : choix du mode de stockage, processus Syncthing et son superviseur (`SyncEngine`), chef d'orchestre (`SyncController`), service au premier plan, page Réglages. Syncthing (v2.1.5) est compilé en CI depuis son tarball source signé, un `.so` par ABI (`arm64-v8a`, `x86_64`), lancé depuis `nativeLibraryDir`.

**Tech Stack:** Kotlin 2.4.20, AGP 9.3.1, compileSdk 37, minSdk 26, Compose BOM 2026.09.00 (déjà là) ; OkHttp 4.12.0 (client de l'interface REST) ; zxing-android-embedded 4.3.0 (QR codes) ; Syncthing v2.1.5, Go 1.26.8, NDK r30 (30.0.16248370) ; JUnit 4.13.2.

**Spec:** `docs/superpowers/specs/2026-10-01-android-syncthing-embarque-design.md` (fait foi) ; résultats des essais : `.superpowers/syncthing/essais.md` (décisions qui en découlent, reprises ci-dessous).

## Global Constraints

Règles d'Ahmed (s'imposent à toutes les tâches) :

- **Fiabilité et sécurité d'abord.** Une simplification n'est retenue que si elle ne retire rien à l'une ni à l'autre.
- **L'app se lance le plus vite possible.** Le moteur ne démarre JAMAIS avant que la grille soit affichée : lancé en arrière-plan une fois le premier écran rempli, rien de l'affichage n'attend sa réponse. Aucun travail de synchro (configuration, ports, vérification du binaire) sur le chemin du lancement. Temps de lancement à froid MESURÉ avant (Task 6, Step 1) et après (Task 12), même protocole que la mesure du 2026-10-01 (`am start -W` après `force-stop`, émulateur) ; une régression BLOQUE la livraison.
- **Tout code Android nouveau est en Kotlin ; aucun fichier Java créé.** (`WallpaperStore.java` est remplacé par un `WallpaperStore.kt` : le code qui doit changer est réécrit en Kotlin, pas patché en Java.)
- **D'autres personnes ont l'app** : aucune migration forcée ; une mise à jour ne change rien (un dossier SAF déjà choisi reste le stockage, rien n'est copié ni demandé).
- **Synchro intégrée et dossier externe sont exclusifs** : jamais les deux sur une même copie des notes.
- **Jamais toucher au vrai Syncthing du PC d'Ahmed** (ports 8384 / 22000 / 21027) **ni à ses données** pendant les essais : second Syncthing de test dans un dossier temporaire, ports tirés au hasard. Notes d'essai écrites uniquement dans le calendrier `Essai Compose`.
- **Commits** en français, avec les deux trailers : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex`.

Valeurs de la spec et décisions des essais (copiées telles quelles) :

- Dossier de notes privé : `filesDir/Neo Calendar`, marqueur `.neo-calendar.json` ou sous-dossier `.neo-calendar/`. État du moteur : `filesDir/syncthing/` (clé, certificat, `config.xml`, index, socket, journal), jamais synchronisé.
- Fichiers ignorés au chargement, dans les deux modes : `.stfolder`, `.stversions/`, `.stignore`, `.syncthing.*.tmp`, `.neo-tmp-*`, `*.sync-conflict-*`. `.stignore` du dossier : `.neo-tmp-*` et rien d'autre.
- Écriture atomique : fichier temporaire `.neo-tmp-*` du même dossier, `fsync`, renommage sur la cible.
- Moteur : `options.autoUpgradeIntervalH = 0`, `urAccepted = -1`, `crashReportingEnabled = false`, découverte globale et relais activés, **`localAnnounceEnabled = false`** (UDP 21027 non partageable avec Syncthing-Fork), un seul dossier `type = sendreceive`, surveillance des fichiers, versionnage `trashcan` 30 jours. Port d'écoute TCP/QUIC choisi libre à la première mise en route, gardé, revérifié à chaque lancement.
- Interface REST : **socket Unix** `filesDir/syncthing/gui.sock` (dossier parent en 700), clé d'API quand même (`X-API-Key`, tirée au hasard à chaque lancement, jamais écrite sur disque). Client : OkHttp avec une `SocketFactory` sur `android.net.LocalSocket` (`Namespace.FILESYSTEM`), `Dns` qui rend 127.0.0.1, URL `http://localhost/...` ; les trois pièges relevés (setSoTimeout mémorisé avant `connect` ; drapeaux de fermeture maison car `isInputShutdown`/`isOutputShutdown` lèvent ; `setTcpNoDelay`/`setKeepAlive` ignorés, `getRemoteSocketAddress` fourni) ; `/rest/events` est une longue requête (délai de lecture adapté).
- Variables d'environnement du processus : `STNORESTART=1` (le superviseur Kotlin est seul à relancer), `STNOUPGRADE=1`. **`STNODEFAULTFOLDER` n'existe pas dans Syncthing v2.1.5** (cherché dans `cmd/` et `lib/` du tarball : aucune occurrence, la v2 ne crée plus de « Default Folder ») : elle n'est pas posée, et un test d'intégration vérifie qu'un moteur neuf n'a aucun dossier.
- Binaire : Syncthing **v2.1.5** (2026-09-08), Go 1.26.8, NDK r30, compilé depuis `syncthing-source-v2.1.5.tar.gz` : SHA-256 `11f129cff64fb4ba7cda33f9dae3a39eab8738a60bbbe8813cadecfdc94bd13d` épinglé dans le dépôt, `gpg --verify` du `.asc` avec la clé d'empreinte épinglée `FBA2 E162 F2F4 4657 B38F 0309 E566 5F9B D597 0C47`, compilation `-mod=vendor` SANS réseau (vérifiée : 52 s à froid pour x86_64, Go 1.26.8, cache vide), `-s -w`, `-trimpath`, build reproductible (deux compilations dans deux dossiers différents donnent le même SHA-256, vérifié). `build.go` IGNORE `SOURCE_DATE_EPOCH=0` (il exige `> 0`) et, faute de dépôt git dans un tarball, mettrait l'heure courante dans le binaire : l'époque épinglée est celle du commit de la release (`1788850675`). ABI `arm64-v8a` et `x86_64` ; `packaging.jniLibs.useLegacyPackaging = true` ; le binaire se lance depuis `nativeLibraryDir` uniquement.
- API REST de la v2 : chaque chemin utilisé a été relu dans `lib/api/api.go` et `lib/api/confighandler.go` du tarball (liste dans la Task 3). Rien n'est supposé de la v1 ; la config se règle par `/rest/config/...`.
- Cohabitation : Syncthing-Fork (référence de comportement dans `C:\dev\syncthing-android`) tourne en même temps sur le téléphone d'Ahmed. Service `specialUse` avec `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`, conditions réduites (Wi-Fi oui, Wi-Fi limité non, données mobiles non, source d'alimentation « secteur et batterie », économiseur respecté), démarrage automatique désactivé par défaut : défauts de Syncthing-Fork.

Conventions de travail :

- Copie de travail : `C:\dev\neo-calendar`, branche `android-parite`. Commandes PowerShell dans `C:\dev\neo-calendar\apps\android\native`, avec `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`. Build : `.\gradlew.bat :core:test assembleDebug`. `adb` = `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`.
- **Piège Windows** : `--tests '*mot*'` est transformé en nom de fichier par le lanceur Java (un dossier `syncthing` du répertoire courant remplace `*sync*`). Toujours des noms de classe ou de paquet complets : `--tests 'com.ahmed.neocalendar.core.sync.EngineConfigTest'`, `--tests 'com.ahmed.neocalendar.core.sync.*'`.
- **Fins de ligne** : les sources du dépôt sont en CRLF (`core.autocrlf=true`), les workflows `.github/workflows/*.yml` en LF (`.gitattributes`). Les blocs de ce plan sont en LF : créer les fichiers avec l'outil Write, modifier les existants avec l'outil Edit (qui garde les fins de ligne du fichier) ; un bloc `diff` se reporte hunk par hunk. Ne jamais réécrire un workflow avec un script qui convertit en CRLF (le test `scripts/release-workflow.test.mjs` coupe le fichier sur `\n    tests:\n`).
- Les modifications de fichiers existants sont données en `diff` (contexte de 2 lignes) : à appliquer à la main avec l'outil Edit, hunk par hunk, ou, après avoir collé le patch dans un fichier temporaire, par `git apply --ignore-whitespace`.
- Émulateur : ne JAMAIS désinstaller l'app d'un émulateur sans demander (`adb install -r` seulement ; en cas d'échec de signature, s'arrêter et demander). Sauvegarder `shared_prefs/neo_android.xml` avant tout essai de bascule (`adb shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_android.xml`).
- Pas de revue d'agent pour les tâches à faible risque (libellés, UI, diff mécanique) ; une revue (sonnet) seulement pour les tâches 1, 2 (écriture de données), 7 et 11 (IPC et bascule de données) ; jamais de re-revue après un correctif. Tout agent délégué : modèle `sonnet` écrit explicitement (omis = opus) ; lire `quota` (ou `~/.claude/quota-last.txt`) avant chaque dispatch, s'arrêter à 90 % sur 5 h sauf reset dans 20 min ou moins.

## Review Focus

Entrées et conditions que la spec implique, qu'aucune tâche ne teste d'elle-même, par ordre de probabilité de gêner une vraie personne. Chaque ligne a son test dans la tâche qui possède le code.

1. **Une note reçue ou écrite pendant qu'un scan Syncthing passe** : jamais lue à moitié écrite, jamais en double. Attendu : écriture atomique (l'ancien contenu reste si l'écriture est interrompue), temporaires `.neo-tmp-*` et copies `*.sync-conflict-*` jamais chargés comme évènements (Task 1 : `FileWorkspaceStorageTest`, `IgnoredFilesTest`) ; MAIS le nettoyage des liens ICS doit continuer de voir les copies de conflit de ses propres notes pour les supprimer (Task 1 : `loadWorkspace(keepConflictCopies = true)`, `IcsSyncTest` inchangé et vert).
2. **Bascule SAF vers privé avec une source qui bouge** (Syncthing écrit pendant la copie), un fichier illisible, une destination non vide, un stockage privé qui contient déjà des notes d'un passage précédent : rien ne bascule, la source n'est pas touchée, le message nomme le fichier et le motif (Task 2 : `VerifiedCopyTest` ; Task 11 : refus si le stockage privé a déjà des notes, action explicite « Vider le stockage privé »).
3. **Mise à jour d'une installation existante** : un dossier SAF déjà choisi reste le stockage, aucun mode écrit, rien de copié ni demandé, `NeedsFolder` n'apparaît pas (Task 6 : `StorageModeTest`, vérification sur l'émulateur Task 12).
4. **Appareil ou dossier jamais acceptés tout seuls** : identifiant invalide refusé avant toute requête, identifiant de cet appareil refusé, demande entrante affichée avec l'identifiant complet, deuxième dossier proposé refusé avec explication quand le dossier est déjà partagé avec un autre appareil (Task 2 : `DeviceIdsTest` ; Task 3 : `SyncSetupTest`).
5. **Moteur qui plante en boucle, port pris par Syncthing-Fork, téléphone hors ligne ou en économiseur** : relances 2 s, 4 s, 8 s, 16 s puis abandon au cinquième échec, port d'écoute revérifié à chaque lancement, condition non remplie = pause lisible, jamais de crash de l'app (Task 7 : `SupervisionTest` ; Task 8 : `RunConditionsTest`, `StatusLineTest`).

## Structure des fichiers

Noyau (`apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/`) :

| Fichier | Responsabilité |
|---|---|
| `workspace/WorkspaceStorage.kt` (modifié) | `BinaryWorkspaceStorage` : octets en plus du texte ; `Entry.lastModified` |
| `workspace/IgnoredFiles.kt` | `isSyncArtifact`, `isConflictCopy`, `conflictFiles` |
| `workspace/FileWorkspaceStorage.kt` | Le dossier de notes sur un vrai chemin, écriture atomique |
| `workspace/WorkspaceMarker.kt` | Marqueur de dossier Neo Calendar, `.stignore`, dossier neuf |
| `workspace/Workspace.kt` (modifié) | `loadWorkspace` filtre les artefacts de synchro |
| `workspace/VerifiedCopy.kt` | Copie vérifiée (liste, tailles, SHA-256) entre deux stockages |
| `workspace/StorageMode.kt` | `StorageMode`, `resolveStorageMode` (règle de mise à jour sans migration) |
| `sync/DeviceIds.kt` | Validation Luhn d'un identifiant d'appareil |
| `sync/FreePort.kt` | Port d'écoute libre en TCP et UDP |
| `sync/EngineConfig.kt` | Les corps JSON envoyés à l'API (pur) |
| `sync/SyncthingApi.kt` | Client REST derrière `HttpTransport` |
| `sync/SyncSetup.kt` | Gestes appareils et dossier, décision d'adoption d'un dossier proposé |
| `sync/Supervision.kt`, `sync/RotatingLog.kt` | `EngineState`, `RestartPolicy`, journal tournant 1 Mo |
| `sync/RunConditions.kt`, `sync/SyncSettings.kt`, `sync/StatusLine.kt` | Conditions de fonctionnement, réglages, ligne d'état |
| `sync/SyncEvents.kt`, `sync/LastSeen.kt` | Évènements qui valent relecture, « dernière connexion » |

Application (`apps/android/native/app/src/main/java/com/ahmed/neocalendar/`) : `nativeapp/WorkspaceLocation.kt`, `WallpaperStore.kt`, `nativeapp/sync/` (`UnixSocketFactory`, `OkHttpTransport`, `SyncEngine`, `SyncSettingsStore`, `RunConditionMonitor`, `SyncController`, `SyncService`, `SyncBootReceiver`, `RemoteRefresh`, `SyncPageModel`, `StorageSwitch`), `nativeapp/ui/` (`QrCode`, `SyncPage`, `StorageSwitchHost`). Build : `apps/android/native/syncthing/` (`version.env`, `release-key.asc`, `build-syncthing.sh`, `fetch-test-binary.sh`).

## Ordre des tâches

12 tâches. Le test d'intégration à deux moteurs (spec section 9) est placé en Task 5, juste après le build, et non en fin de plan comme on pourrait le croire : il ne dépend que des Tasks 1 à 4 et il valide sur de vrais moteurs tout ce que l'app utilisera (appairage, adoption, conflits), avant d'écrire une ligne d'Android.

---

### Task 1 : Noyau, stockage par vrai chemin, fichiers ignorés, marqueur

Produit `FileWorkspaceStorage` (écriture atomique), le filtre des artefacts de synchro au chargement, le marqueur de dossier. Testable seule : `:core:test`.

**Files:**
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceStorage.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/Workspace.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/IcsSync.kt` (ligne 63-64, `readRecords`)
- Create: `core/.../workspace/IgnoredFiles.kt`, `core/.../workspace/FileWorkspaceStorage.kt`, `core/.../workspace/WorkspaceMarker.kt`
- Test: `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/IgnoredFilesTest.kt`, `FileWorkspaceStorageTest.kt`, `WorkspaceMarkerTest.kt` (le `MemoryTree` du même dossier de tests sert aux deux premiers)

**Interfaces:**
- Consumes: `WorkspaceStorage`, `WritableWorkspaceStorage`, `loadWorkspace` existants (`core/workspace/`).
- Produces (utilisés par toutes les tâches suivantes) :
  - `interface BinaryWorkspaceStorage : WritableWorkspaceStorage { fun openInput(relativePath: String): java.io.InputStream?; fun writeStream(relativePath: String, input: java.io.InputStream) }`
  - `data class WorkspaceStorage.Entry(val name: String, val isDirectory: Boolean, val lastModified: Long = 0L)`
  - `class FileWorkspaceStorage(root: java.io.File) : BinaryWorkspaceStorage`
  - `fun isSyncArtifact(name: String): Boolean`, `fun isConflictCopy(name: String): Boolean`, `fun conflictFiles(storage: WorkspaceStorage): List<String>`
  - `fun loadWorkspace(storage: WorkspaceStorage, keepConflictCopies: Boolean = false): LoadedWorkspace`
  - `const val STIGNORE_TEXT`, `fun isNeoCalendarFolder(storage: WorkspaceStorage): Boolean`, `fun workspaceHasNotes(storage: WorkspaceStorage): Boolean`, `fun initNewWorkspace(storage: WritableWorkspaceStorage)`, `fun writeStignore(storage: WritableWorkspaceStorage)`

- [ ] **Step 1 : écrire les tests qui échouent**

`IgnoredFilesTest.kt` (dont le test qui garde le comportement existant du nettoyage ICS) :

```kotlin
package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IgnoredFilesTest {
    @Test fun `les artefacts de Syncthing et de l'app sont reconnus`() {
        for (name in listOf(
            ".stfolder", ".stversions", ".stignore", ".syncthing.rdv.md.tmp", ".neo-tmp-1b2c",
            "rdv.sync-conflict-20260101-120000-ABCDEFG.md", "x.sync-conflict-20260101-120000-ABCDEFG",
        )) assertTrue(name, isSyncArtifact(name))
    }

    @Test fun `une note ordinaire n'est pas un artefact`() {
        for (name in listOf("rdv.md", ".neo-calendar", ".neo-calendar.json", "syncthing.md", "conflict.md", "a.tmp")) {
            assertFalse(name, isSyncArtifact(name))
        }
    }

    @Test fun `le chargement ignore les copies de conflit et les temporaires dans les deux niveaux`() {
        val tree = MemoryTree()
            .file("Travail/rdv.md", "ok")
            .file("Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md", "double")
            .file("Travail/.neo-tmp-9f.md", "a moitie ecrit")
            .file("Travail/sous/n.sync-conflict-20260102-010101-QWERTYU.md", "double")
            .file("Travail/sous/n.md", "ok")
            .file(".stignore", ".neo-tmp-*")
        val loaded = loadWorkspace(tree)
        assertEquals(listOf("Travail/rdv.md", "Travail/sous/n.md"), loaded.eventFiles.map { it.relativePath })
    }

    @Test fun `les notes a la racine (calendrier par defaut) filtrent aussi les conflits`() {
        val tree = MemoryTree().file("a.md", "1").file("a.sync-conflict-20260101-120000-ABCDEFG.md", "2")
        assertEquals(listOf("a.md"), loadWorkspace(tree).eventFiles.map { it.relativePath })
    }

    @Test fun `le nettoyage des liens ICS peut garder les copies de conflit, mais jamais les autres artefacts`() {
        val tree = MemoryTree()
            .file("Etudes/cours.md", "1")
            .file("Etudes/cours.sync-conflict-20260101-120000-ABCDEFG.md", "2")
            .file("Etudes/.neo-tmp-9f.md", "3")
        assertEquals(
            listOf("Etudes/cours.md", "Etudes/cours.sync-conflict-20260101-120000-ABCDEFG.md"),
            loadWorkspace(tree, keepConflictCopies = true).eventFiles.map { it.relativePath },
        )
    }

    @Test fun `les conflits sont comptes partout sauf dans les versions`() {
        val tree = MemoryTree()
            .file("Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md")
            .file(".neo-calendar/.neo-calendar.sync-conflict-20260101-120000-ABCDEFG.json")
            .file(".stversions/Travail/vieux.sync-conflict-20260101-120000-ABCDEFG.md")
            .file("Travail/ok.md")
        assertEquals(
            listOf(".neo-calendar/.neo-calendar.sync-conflict-20260101-120000-ABCDEFG.json", "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md"),
            conflictFiles(tree).sorted(),
        )
    }
}
```


`FileWorkspaceStorageTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileWorkspaceStorageTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun storage() = FileWorkspaceStorage(tmp.root)

    private fun leftovers(): List<String> =
        tmp.root.walkTopDown().filter { it.name.startsWith(".neo-tmp-") }.map { it.name }.toList()

    @Test fun `lecture d'un fichier absent rend null et la liste d'un dossier absent est vide`() {
        assertNull(storage().readText("rien.md"))
        assertTrue(storage().list("nulle part").isEmpty())
    }

    @Test fun `creer puis ecrire puis lire, accents compris`() {
        val s = storage()
        val dir = s.createDirectory("", "Travail")
        val path = s.createFile(dir, "rdv.md", "text/markdown")
        s.writeText(path, "Réunion à 14 h\n")
        assertEquals("Travail/rdv.md", path)
        assertEquals("Réunion à 14 h\n", s.readText(path))
        assertEquals(listOf("rdv.md"), s.list("Travail").map { it.name })
    }

    @Test fun `la liste est triee comme le SAF, en minuscules`() {
        val s = storage()
        for (n in listOf("b", "A", "c")) s.createDirectory("", n)
        assertEquals(listOf("A", "b", "c"), s.list("").map { it.name })
    }

    @Test fun `ecrire remplace tout le contenu et ne laisse aucun temporaire`() {
        val s = storage()
        s.createFile("", "n.md", "text/markdown")
        s.writeText("n.md", "un texte assez long")
        s.writeText("n.md", "court")
        assertEquals("court", s.readText("n.md"))
        assertEquals(emptyList<String>(), leftovers())
    }

    @Test fun `une ecriture interrompue laisse l'ancien contenu et aucun temporaire`() {
        val s = storage()
        s.createFile("", "n.md", "text/markdown")
        s.writeText("n.md", "ancien")
        val broken = object : InputStream() {
            var served = 0
            override fun read(): Int = throw IOException("coupure")
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (served++ == 0) { b[off] = 'x'.code.toByte(); return 1 }
                throw IOException("coupure")
            }
        }
        try { s.writeStream("n.md", broken); fail("aurait dû échouer") } catch (_: IOException) {}
        assertEquals("ancien", s.readText("n.md"))
        assertEquals(emptyList<String>(), leftovers())
    }

    @Test fun `ecrire dans un fichier absent echoue sans rien creer`() {
        try { storage().writeText("absent.md", "x"); fail() } catch (_: IOException) {}
        assertEquals(0, tmp.root.listFiles()!!.size)
    }

    @Test fun `un nom deja pris est refuse`() {
        val s = storage()
        s.createFile("", "a.md", "text/markdown")
        try { s.createFile("", "a.md", "text/markdown"); fail() } catch (_: IOException) {}
        try { s.createDirectory("", "a.md"); fail() } catch (_: IOException) {}
    }

    @Test fun `renommer garde le contenu et refuse un nom pris`() {
        val s = storage()
        s.createFile("", "a.md", "text/markdown"); s.writeText("a.md", "A")
        s.createFile("", "b.md", "text/markdown")
        assertEquals("c.md", s.rename("a.md", "c.md"))
        assertEquals("A", s.readText("c.md"))
        assertNull(s.readText("a.md"))
        try { s.rename("c.md", "b.md"); fail() } catch (_: IOException) {}
    }

    @Test fun `supprimer un fichier ou un dossier`() {
        val s = storage()
        s.createDirectory("", "d"); s.createFile("d", "x.md", "text/markdown")
        s.delete("d/x.md"); assertTrue(s.list("d").isEmpty())
        s.delete("d"); assertFalse(File(tmp.root, "d").exists())
        s.delete("deja-absent")
    }

    @Test fun `un chemin qui remonte est refuse`() {
        try { storage().readText("../secret"); fail() } catch (_: IllegalArgumentException) {}
        try { storage().list("a/../.."); fail() } catch (_: IllegalArgumentException) {}
    }

    @Test fun `les octets font l'aller-retour`() {
        val s = storage()
        s.createFile("", "p.bin", "application/octet-stream")
        val bytes = ByteArray(300_000) { (it * 31).toByte() }
        s.writeStream("p.bin", ByteArrayInputStream(bytes))
        assertTrue(bytes.contentEquals(s.openInput("p.bin")!!.use { it.readBytes() }))
        assertNull(s.openInput("absent"))
    }
}
```


`WorkspaceMarkerTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WorkspaceMarkerTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `un dossier est reconnu par le fichier ou par le sous-dossier`() {
        assertFalse(isNeoCalendarFolder(MemoryTree().file("a.md")))
        assertTrue(isNeoCalendarFolder(MemoryTree().file(".neo-calendar.json", "{}")))
        assertTrue(isNeoCalendarFolder(MemoryTree().dir(".neo-calendar")))
        // Un FICHIER nommé comme le sous-dossier ne compte pas.
        assertFalse(isNeoCalendarFolder(MemoryTree().file(".neo-calendar", "x")))
    }

    @Test fun `un dossier neuf recoit le marqueur et le stignore, sans fichier de reglages`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        assertTrue(isNeoCalendarFolder(s))
        assertEquals(STIGNORE_TEXT, s.readText(".stignore"))
        assertEquals(".neo-tmp-*\n", s.readText(".stignore"))
        assertTrue(s.list(".neo-calendar").isEmpty())
    }

    @Test fun `deux appels de suite ne changent rien`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        initNewWorkspace(s)
        assertEquals(listOf(".neo-calendar", ".stignore"), s.list("").map { it.name })
    }

    @Test fun `un dossier neuf n'a pas de notes, un calendrier ou une note les annoncent`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        assertFalse(workspaceHasNotes(s))
        s.createDirectory("", "Essai Compose")
        assertTrue(workspaceHasNotes(s))
    }

    @Test fun `une note a la racine compte`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        s.createFile("", "a.md", "text/markdown")
        assertTrue(workspaceHasNotes(s))
    }

    @Test fun `les copies de conflit et les dossiers caches ne comptent pas`() {
        val s = FileWorkspaceStorage(tmp.root)
        initNewWorkspace(s)
        s.createFile("", "a.sync-conflict-20260101-120000-ABCDEFG.md", "text/markdown")
        s.createDirectory("", ".stversions")
        assertFalse(workspaceHasNotes(s))
    }

    @Test fun `un stignore different est remis a la regle de l'app`() {
        val s = FileWorkspaceStorage(tmp.root)
        s.createFile("", ".stignore", "text/plain"); s.writeText(".stignore", "*.md\n")
        writeStignore(s)
        assertEquals(STIGNORE_TEXT, s.readText(".stignore"))
    }
}
```


- [ ] **Step 2 : constater l'échec**

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.IgnoredFilesTest' --tests 'com.ahmed.neocalendar.core.workspace.FileWorkspaceStorageTest' --tests 'com.ahmed.neocalendar.core.workspace.WorkspaceMarkerTest'
```

Attendu : `FAILED`, erreurs de compilation `Unresolved reference 'isSyncArtifact'`, `'FileWorkspaceStorage'`, `'isNeoCalendarFolder'`, `'keepConflictCopies'`.

- [ ] **Step 3 : implémenter**

Modifier `WorkspaceStorage.kt` (interface binaire, date de modification) :

```diff
--- a/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceStorage.kt
+++ b/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceStorage.kt
@@ -9,5 +9,6 @@
     fun readText(relativePath: String): String?
 
-    data class Entry(val name: String, val isDirectory: Boolean)
+    /** `lastModified` en ms depuis 1970 quand le stockage le sait (0 sinon). */
+    data class Entry(val name: String, val isDirectory: Boolean, val lastModified: Long = 0L)
 }
 
@@ -34,2 +35,14 @@
 }
 
+/**
+ * Un stockage qui sait aussi lire et écrire des octets : pièces jointes, fonds d'écran, copie de bascule.
+ * Les deux stockages réels (SAF et vrai chemin) l'implémentent.
+ */
+interface BinaryWorkspaceStorage : WritableWorkspaceStorage {
+    /** Le contenu d'un fichier, ou null s'il n'existe pas. L'appelant ferme le flux. */
+    fun openInput(relativePath: String): java.io.InputStream?
+
+    /** Remplace le contenu d'un fichier déjà créé par celui du flux. */
+    fun writeStream(relativePath: String, input: java.io.InputStream)
+}
+
```


Créer `IgnoredFiles.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

private const val CONFLICT_MARK = ".sync-conflict-"

/**
 * Ce que Syncthing (ou l'app, pour ses écritures atomiques) pose dans le dossier de notes et qui
 * n'est jamais une note ni un réglage : marqueur de dossier, versions, fichier d'exclusions,
 * temporaires de réception, temporaires d'écriture, copies de conflit.
 * Même règle que Syncthing pour les conflits : le nom contient `.sync-conflict-`.
 */
fun isSyncArtifact(name: String): Boolean =
    name == ".stfolder" || name == ".stversions" || name == ".stignore" ||
        (name.startsWith(".syncthing.") && name.endsWith(".tmp")) ||
        name.startsWith(".neo-tmp-") ||
        isConflictCopy(name)

/** Une copie de conflit de Syncthing (`note.sync-conflict-20260101-120000-ABCDEFG.md`). */
fun isConflictCopy(name: String): Boolean = name.contains(CONFLICT_MARK)

/** Les fichiers de conflit présents (chemins relatifs), partout dans le dossier sauf `.stversions` et `.stfolder`. */
fun conflictFiles(storage: WorkspaceStorage): List<String> {
    val found = ArrayList<String>()
    fun walk(dir: String) {
        for (entry in storage.list(dir)) {
            if (entry.name == ".stversions" || entry.name == ".stfolder") continue
            val path = if (dir.isEmpty()) entry.name else "$dir/${entry.name}"
            if (entry.isDirectory) walk(path)
            else if (isConflictCopy(entry.name)) found += path
        }
    }
    walk("")
    return found
}
```


Créer `FileWorkspaceStorage.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.util.Locale
import java.util.UUID

/**
 * Le dossier de notes sur un vrai chemin (stockage privé de l'app). Toute écriture est atomique :
 * un fichier temporaire `.neo-tmp-*` du même dossier (que `.stignore` fait ignorer à Syncthing),
 * `fsync`, puis renommage sur la cible. Syncthing ne voit jamais une note à moitié écrite, et un
 * arrêt en plein milieu laisse l'ancien contenu intact.
 */
class FileWorkspaceStorage(private val root: File) : BinaryWorkspaceStorage {
    private fun resolve(relative: String): File {
        var file = root
        for (part in relative.replace('\\', '/').split('/')) {
            if (part.isEmpty() || part == ".") continue
            if (part == "..") throw IllegalArgumentException("Chemin invalide")
            file = File(file, part)
        }
        return file
    }

    private fun child(dir: String, name: String) = if (dir.isEmpty()) name else "$dir/$name"

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> =
        (resolve(relativeDir).listFiles() ?: emptyArray())
            .map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified()) }
            .sortedBy { it.name.lowercase(Locale.ROOT) }

    override fun readText(relativePath: String): String? {
        val file = resolve(relativePath)
        return if (file.isFile) String(file.readBytes(), Charsets.UTF_8) else null
    }

    override fun openInput(relativePath: String): InputStream? {
        val file = resolve(relativePath)
        return if (file.isFile) file.inputStream() else null
    }

    override fun writeText(relativePath: String, text: String) {
        val file = resolve(relativePath)
        if (!file.isFile) throw IOException("Écriture impossible: $relativePath")
        atomicWrite(file) { it.write(text.toByteArray(Charsets.UTF_8)) }
    }

    override fun writeStream(relativePath: String, input: InputStream) {
        val file = resolve(relativePath)
        if (!file.isFile) throw IOException("Écriture impossible: $relativePath")
        atomicWrite(file) { input.copyTo(it) }
    }

    override fun createFile(relativeDir: String, name: String, mimeType: String): String {
        val dir = resolve(relativeDir)
        if (!dir.isDirectory) throw IOException("Dossier introuvable : $relativeDir")
        try {
            Files.createFile(File(dir, name).toPath())
        } catch (e: java.nio.file.FileAlreadyExistsException) {
            throw IOException("Le nom est déjà pris : $name", e)
        }
        return child(relativeDir, name)
    }

    override fun createDirectory(relativeDir: String, name: String): String {
        val dir = resolve(relativeDir)
        if (!dir.isDirectory) throw IOException("Dossier introuvable : $relativeDir")
        if (!File(dir, name).mkdir()) throw IOException("Création du dossier impossible : $name")
        return child(relativeDir, name)
    }

    override fun rename(relativePath: String, newName: String): String {
        val source = resolve(relativePath)
        if (!source.exists()) throw IOException("Renommage impossible : $relativePath")
        val target = File(source.parentFile, newName)
        if (target.exists()) throw IOException("Le nom est déjà pris : $newName")
        Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
        return child(relativePath.substringBeforeLast('/', ""), newName)
    }

    override fun delete(relativePath: String) {
        val file = resolve(relativePath)
        if (!file.exists()) return
        if (!file.deleteRecursively()) throw IOException("Suppression impossible : $relativePath")
    }

    private fun atomicWrite(target: File, write: (OutputStream) -> Unit) {
        val temporary = File(target.parentFile, ".neo-tmp-" + UUID.randomUUID())
        try {
            FileOutputStream(temporary).use { out ->
                write(out)
                out.flush()
                out.fd.sync()
            }
            Files.move(
                temporary.toPath(), target.toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
            )
        } catch (e: Throwable) {
            temporary.delete()
            throw e
        }
        // Le renommage lui-même doit survivre à une coupure : fsync du dossier, quand le système le permet.
        runCatching { FileChannel.open(target.parentFile.toPath(), StandardOpenOption.READ).use { it.force(true) } }
    }
}
```


Créer `WorkspaceMarker.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

/** Ce que l'app écrit dans `.stignore` : ses temporaires d'écriture, et rien d'autre. */
const val STIGNORE_TEXT = ".neo-tmp-*\n"

private const val MARKER_FILE = ".neo-calendar.json"
private const val MARKER_DIR = ".neo-calendar"

/** Un dossier est un dossier Neo Calendar s'il contient `.neo-calendar.json` ou le sous-dossier `.neo-calendar/`. */
fun isNeoCalendarFolder(storage: WorkspaceStorage): Boolean =
    storage.list("").any { (it.name == MARKER_FILE && !it.isDirectory) || (it.name == MARKER_DIR && it.isDirectory) }

/** Le dossier contient-il de vraies notes (un calendrier ou une note à la racine), et pas seulement le marqueur et `.stignore` ? */
fun workspaceHasNotes(storage: WorkspaceStorage): Boolean {
    val loaded = loadWorkspace(storage)
    return loaded.eventFiles.isNotEmpty() || storage.list("").any { it.isDirectory && !it.name.startsWith(".") }
}

/**
 * Prépare un dossier de notes neuf (première ouverture d'une nouvelle installation) : le marqueur
 * (le sous-dossier `.neo-calendar/`, sans fichier de réglages : le PC a les siens, deux fichiers
 * créés chacun de leur côté produiraient un conflit à la première synchro) et le `.stignore`.
 * Sans effet sur ce qui existe déjà.
 */
fun initNewWorkspace(storage: WritableWorkspaceStorage) {
    if (storage.list("").none { it.name == MARKER_DIR }) storage.createDirectory("", MARKER_DIR)
    writeStignore(storage)
}

/** `.stignore` du dossier : `.neo-tmp-*` et rien d'autre ; réécrit seulement s'il diffère. */
fun writeStignore(storage: WritableWorkspaceStorage) {
    val existing = storage.list("").any { it.name == ".stignore" && !it.isDirectory }
    if (!existing) storage.createFile("", ".stignore", "text/plain")
    if (storage.readText(".stignore") != STIGNORE_TEXT) storage.writeText(".stignore", STIGNORE_TEXT)
}
```


Modifier `Workspace.kt` (le chargement filtre les artefacts ; le paramètre existe pour le nettoyage des liens ICS) :

```diff
--- a/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/Workspace.kt
+++ b/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/Workspace.kt
@@ -25,7 +25,12 @@
 private const val METADATA_DIR = ".neo-calendar"
 
-/** Port de `loadWorkspace` (MainActivity.java), sans SAF. */
-fun loadWorkspace(storage: WorkspaceStorage): LoadedWorkspace {
-    val children = storage.list("")
+/**
+ * Port de `loadWorkspace` (MainActivity.java), sans SAF. Les artefacts de synchro (`.stfolder`, `.stversions/`, `.stignore`,
+ * temporaires, copies de conflit) ne sont jamais des notes : ignorés, dans les deux modes de stockage. Seul le nettoyage des
+ * liens ICS (`keepConflictCopies = true`) garde les copies de conflit, pour supprimer celles de ses propres notes.
+ */
+fun loadWorkspace(storage: WorkspaceStorage, keepConflictCopies: Boolean = false): LoadedWorkspace {
+    val ignored = { name: String -> isSyncArtifact(name) && !(keepConflictCopies && isConflictCopy(name)) }
+    val children = storage.list("").filterNot { ignored(it.name) }
     val calendars = ArrayList<WorkspaceCalendar>()
     val events = ArrayList<WorkspaceEventFile>()
@@ -33,5 +38,5 @@
         if (!d.isDirectory || d.name.startsWith(".")) continue
         calendars += WorkspaceCalendar(d.name, d.name)
-        collectEvents(storage, d.name, d.name, events)
+        collectEvents(storage, d.name, d.name, events, ignored)
     }
     if (calendars.isEmpty()) {
@@ -57,10 +62,11 @@
     directory: String,
     out: MutableList<WorkspaceEventFile>,
+    ignored: (String) -> Boolean,
 ) {
-    for (f in storage.list(directory)) {
+    for (f in storage.list(directory).filterNot { ignored(it.name) }) {
         val path = "$directory/${f.name}"
         if (f.isDirectory) {
             if (f.name.startsWith(".")) continue
-            collectEvents(storage, calendarPath, path, out)
+            collectEvents(storage, calendarPath, path, out, ignored)
             continue
         }
```


Modifier `IcsSync.kt` (`readRecords` garde les copies de conflit, sinon `deleteDuplicateIcsNotes` ne les verrait plus et deux tests existants, `aSyncConflictCopyOfAnOwnedNoteIsDeleted` et `theDuplicateThatThePlanRewritesIsTheOneKept`, échoueraient : cas trouvé en écrivant ce plan) :

```diff
--- a/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/IcsSync.kt
+++ b/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/IcsSync.kt
@@ -62,5 +62,6 @@
  */
 private fun readRecords(storage: WorkspaceStorage): List<StoredEvent> {
-    val workspace = loadWorkspace(storage)
+    // Les copies de conflit de nos propres notes doivent rester visibles : `deleteDuplicateIcsNotes` les supprime.
+    val workspace = loadWorkspace(storage, keepConflictCopies = true)
     val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
     return workspace.eventFiles.mapNotNull {
```


- [ ] **Step 4 : constater le succès, y compris les tests existants**

```powershell
.\gradlew.bat :core:test
```

Attendu : `BUILD SUCCESSFUL`. Dont `IgnoredFilesTest` 6 tests, `FileWorkspaceStorageTest` 11, `WorkspaceMarkerTest` 7, et `IcsSyncTest` (15) et `WorkspaceTest` (12) toujours verts.

- [ ] **Step 5 : revue sonnet (écriture de données)**

Revue sonnet limitée à `FileWorkspaceStorage.kt` (atomicité, nettoyage du temporaire, refus de `..`) et au diff de `Workspace.kt` / `IcsSync.kt`. Corriger ce qu'elle trouve, sans seconde revue.

- [ ] **Step 6 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native/core
git commit -m @'
Noyau : stockage par vrai chemin (écriture atomique), fichiers de synchro ignorés au chargement

FileWorkspaceStorage écrit par fichier temporaire .neo-tmp-*, fsync puis renommage : Syncthing ne voit jamais une note à moitié écrite. loadWorkspace ignore .stfolder, .stversions, .stignore, les temporaires et les copies de conflit ; le nettoyage des liens ICS garde les copies de conflit de ses propres notes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 2 : Noyau, copie vérifiée, identifiant d'appareil, port libre

Testable seule : `:core:test`.

**Files:**
- Create: `core/.../workspace/VerifiedCopy.kt`, `core/.../sync/DeviceIds.kt`, `core/.../sync/FreePort.kt`
- Test: `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/VerifiedCopyTest.kt`, `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/DeviceIdsTest.kt`, `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/FreePortTest.kt`

**Interfaces:**
- Consumes: `BinaryWorkspaceStorage`, `FileWorkspaceStorage`, `isSyncArtifact` (Task 1).
- Produces :
  - `fun copyWorkspaceVerified(source: BinaryWorkspaceStorage, destination: BinaryWorkspaceStorage): CopyReport` ; `class CopyReport(val files: Int, val bytes: Long)` ; `class CopyFailure(val path: String, reason: String) : IOException` (le message contient le chemin du fichier en cause)
  - `object DeviceIds { fun checkChar(block: String): Char?; fun normalize(raw: String): String?; fun isValid(raw: String): Boolean }`
  - `fun pickFreePort(isFree: (Int) -> Boolean = ::bindsTcpAndUdp, candidate: () -> Int = ..., tries: Int = 50): Int` ; `fun bindsTcpAndUdp(port: Int): Boolean`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class VerifiedCopyTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun put(root: File, path: String, text: String) {
        val f = File(root, path)
        f.parentFile.mkdirs()
        f.writeBytes(text.toByteArray(Charsets.UTF_8))
    }

    /** Un dossier source réaliste : notes, réglages, pièce jointe binaire, dossier vide, et des artefacts de synchro. */
    private fun sourceTree(): File {
        val root = tmp.newFolder("source")
        put(root, "Travail/rdv.md", "---\ntitle: Réunion\n---\n")
        put(root, "Travail/.attachments/photo.bin", String(ByteArray(5000) { (it % 251).toByte() }, Charsets.ISO_8859_1))
        put(root, ".neo-calendar/.neo-calendar.json", "{\"firstDay\":1}\n")
        File(root, "Perso/vide").mkdirs()
        put(root, ".stfolder/x", "")
        put(root, ".stversions/Travail/ancien.md", "vieux")
        put(root, ".stignore", "*.tmp")
        put(root, "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md", "double")
        put(root, "Travail/.syncthing.rdv.md.tmp", "partiel")
        return root
    }

    private fun relativeFiles(root: File): List<String> =
        root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path.replace('\\', '/') }.sorted().toList()

    @Test fun `la copie reussit, sans les artefacts, et la source reste intacte`() {
        val source = sourceTree()
        val before = relativeFiles(source)
        val dest = tmp.newFolder("dest")
        val report = copyWorkspaceVerified(FileWorkspaceStorage(source), FileWorkspaceStorage(dest))
        assertEquals(
            listOf(".neo-calendar/.neo-calendar.json", "Travail/.attachments/photo.bin", "Travail/rdv.md"),
            relativeFiles(dest),
        )
        assertTrue(File(dest, "Perso/vide").isDirectory)
        assertEquals(3, report.files)
        assertEquals(before, relativeFiles(source))
        assertEquals("---\ntitle: Réunion\n---\n", File(dest, "Travail/rdv.md").readText())
        assertTrue(File(source, "Travail/photo.bin").exists().not())
    }

    /** Enveloppe qui altère ce que `openInput` rend pour un chemin, à partir de la n-ième ouverture. */
    private class Tampered(
        private val inner: BinaryWorkspaceStorage,
        private val path: String,
        private val fromOpen: Int,
        private val alter: (ByteArray) -> ByteArray,
    ) : BinaryWorkspaceStorage by inner {
        private var opens = 0
        override fun openInput(relativePath: String): InputStream? {
            val real = inner.openInput(relativePath) ?: return null
            if (relativePath != path) return real
            opens++
            return if (opens >= fromOpen) ByteArrayInputStream(alter(real.use { it.readBytes() })) else real
        }
    }

    private fun failure(block: () -> Unit): CopyFailure {
        try { block() } catch (e: CopyFailure) { return e }
        fail("la copie aurait dû échouer"); throw IllegalStateException()
    }

    @Test fun `un fichier qui change dans la source pendant la copie fait echouer et vide la destination`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val flaky = Tampered(FileWorkspaceStorage(source), "Travail/rdv.md", fromOpen = 2) { it + 1 }
        val e = failure { copyWorkspaceVerified(flaky, FileWorkspaceStorage(dest)) }
        assertEquals("Travail/rdv.md", e.path)
        assertEquals(0, dest.listFiles()!!.size)
        assertTrue(File(source, "Travail/rdv.md").exists())
    }

    @Test fun `une copie dont le contenu differe est refusee, le fichier est nomme`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val badDestination = Tampered(FileWorkspaceStorage(dest), "Travail/.attachments/photo.bin", fromOpen = 1) { it.also { b -> b[0] = (b[0] + 1).toByte() } }
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), badDestination) }
        assertEquals("Travail/.attachments/photo.bin", e.path)
        assertTrue(e.message!!.contains("contenu différent"))
        assertEquals(0, dest.listFiles()!!.size)
    }

    @Test fun `une taille differente est refusee`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val truncated = Tampered(FileWorkspaceStorage(dest), "Travail/rdv.md", fromOpen = 1) { it.copyOf(it.size - 1) }
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), truncated) }
        assertEquals("Travail/rdv.md", e.path)
        assertTrue(e.message!!.contains("taille différente"))
    }

    @Test fun `un fichier illisible dans la source est refuse`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val unreadable = object : BinaryWorkspaceStorage by FileWorkspaceStorage(source) {
            override fun openInput(relativePath: String): InputStream? = if (relativePath == "Travail/rdv.md") null else FileWorkspaceStorage(source).openInput(relativePath)
        }
        val e = failure { copyWorkspaceVerified(unreadable, FileWorkspaceStorage(dest)) }
        assertEquals("Travail/rdv.md", e.path)
        assertEquals(0, dest.listFiles()!!.size)
    }

    @Test fun `un fichier qui apparait ou disparait pendant la copie est refuse`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        val fs = FileWorkspaceStorage(source)
        var lists = 0
        val growing = object : BinaryWorkspaceStorage by fs {
            override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
                val real = fs.list(relativeDir)
                // Au deuxième inventaire de la racine, un nouveau fichier est « arrivé ».
                return if (relativeDir == "" && ++lists == 2) real + WorkspaceStorage.Entry("nouveau.md", false) else real
            }
        }
        val e = failure { copyWorkspaceVerified(growing, FileWorkspaceStorage(dest)) }
        assertEquals("nouveau.md", e.path)
    }

    @Test fun `une destination non vide est refusee sans y toucher`() {
        val source = sourceTree(); val dest = tmp.newFolder("dest")
        put(dest, "deja.md", "la")
        val e = failure { copyWorkspaceVerified(FileWorkspaceStorage(source), FileWorkspaceStorage(dest)) }
        assertEquals("", e.path)
        assertEquals("la", File(dest, "deja.md").readText())
    }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceIdsTest {
    // L'identifiant d'exemple des tests de Syncthing (lib/protocol/deviceid_test.go).
    private val good = "P56IOI7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"

    @Test fun `un identifiant valide est accepte tel quel`() {
        assertEquals(good, DeviceIds.normalize(good))
    }

    @Test fun `minuscules, espaces et tirets absents sont normalises`() {
        assertEquals(good, DeviceIds.normalize(good.lowercase()))
        assertEquals(good, DeviceIds.normalize(good.replace("-", " ")))
        assertEquals(good, DeviceIds.normalize(good.replace("-", "")))
        assertEquals(good, DeviceIds.normalize("  $good\n"))
    }

    @Test fun `les fautes de frappe 0 1 8 sont lues O I B`() {
        assertEquals(good, DeviceIds.normalize("P561017-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-T88Z4TJ-XZWICQ2"))
    }

    @Test fun `un caractere change fait echouer la somme de controle`() {
        val altered = good.replaceFirst("MZJNU2Y", "MZJNU2Z")
        assertNull(DeviceIds.normalize(altered))
        // Chacun des quatre blocs est contrôlé.
        for (i in listOf(0, 20, 36, 50)) {
            val chars = good.toCharArray()
            chars[i] = if (chars[i] == 'A') 'B' else 'A'
            assertFalse("position $i", DeviceIds.isValid(String(chars)))
        }
    }

    @Test fun `la mauvaise longueur, le vide et l'ancien format sans controle sont refuses`() {
        assertNull(DeviceIds.normalize(""))
        assertNull(DeviceIds.normalize("P56IOI7"))
        assertNull(DeviceIds.normalize("P56IOI7MZJNU2IQGDREYDM2MGTMGL3BXNPQ6W5BTBBZ4TJXZWICQ")) // 52 caractères
        assertNull(DeviceIds.normalize("$good-AAAAAAA"))
    }

    @Test fun `un caractere hors alphabet est refuse`() {
        assertNull(DeviceIds.normalize(good.replace('P', '9')))
        assertNull(DeviceIds.normalize(good.replace('P', '!')))
    }

    @Test fun `le caractere de controle d'un bloc connu`() {
        assertEquals('Y', DeviceIds.checkChar("P56IOI7MZJNU2"))
        assertTrue(DeviceIds.checkChar("1") == null)
    }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.DatagramSocket
import java.net.ServerSocket
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FreePortTest {
    @Test fun `un port rendu est utilisable en TCP et en UDP`() {
        val port = pickFreePort()
        assertTrue(port in 1024..65535)
        ServerSocket(port).use { DatagramSocket(port).use { } }
    }

    @Test fun `un port deja pris en TCP est vu comme occupe`() {
        ServerSocket(0).use { held -> assertFalse(bindsTcpAndUdp(held.localPort)) }
    }

    @Test fun `un port deja pris en UDP est vu comme occupe`() {
        DatagramSocket(0).use { held -> assertFalse(bindsTcpAndUdp(held.localPort)) }
    }

    @Test fun `les ports occupes ou hors plage sont sautes`() {
        val offered = ArrayDeque(listOf(80, 40000, 40001, 40002))
        val busy = setOf(40000, 40001)
        assertEquals(40002, pickFreePort(isFree = { it !in busy }, candidate = { offered.removeFirst() }))
    }

    @Test fun `sans port libre apres les essais, une erreur claire`() {
        try { pickFreePort(isFree = { false }, candidate = { 40000 }, tries = 3); fail() } catch (e: IOException) {
            assertTrue(e.message!!.contains("Aucun port libre"))
        }
    }
}
```


- [ ] **Step 2 : constater l'échec**

```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.VerifiedCopyTest' --tests 'com.ahmed.neocalendar.core.sync.DeviceIdsTest' --tests 'com.ahmed.neocalendar.core.sync.FreePortTest'
```

Attendu : `FAILED`, `Unresolved reference 'copyWorkspaceVerified'`, `'DeviceIds'`, `'pickFreePort'`.

- [ ] **Step 3 : implémenter**

`VerifiedCopy.kt` (la source est relue une seconde fois : un fichier que Syncthing modifie pendant la copie fait échouer la copie ; l'échec vide la destination, jamais la source) :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest

/** Ce que la copie a rapporté : nombre de fichiers et octets copiés. */
class CopyReport(val files: Int, val bytes: Long)

/** Une copie qui n'a pas pu être garantie ; `path` est le fichier en cause ("" pour la copie entière). */
class CopyFailure(val path: String, reason: String) : IOException(if (path.isEmpty()) reason else "$path : $reason")

private class Node(val path: String, val isDirectory: Boolean)

private class Fingerprint(val size: Long, val sha256: String)

/**
 * Copie tout le dossier `source` dans `destination` (qui doit être vide), sans les artefacts de
 * synchro ([isSyncArtifact]), puis vérifie : même liste, mêmes tailles, même SHA-256, source relue
 * une seconde fois (un fichier que Syncthing aurait modifié pendant la copie fait échouer la copie,
 * jamais une copie bancale). La source n'est JAMAIS modifiée. En cas d'échec, tout ce qui a été
 * écrit dans `destination` est supprimé et une [CopyFailure] nomme le fichier en cause.
 */
fun copyWorkspaceVerified(source: BinaryWorkspaceStorage, destination: BinaryWorkspaceStorage): CopyReport {
    if (destination.list("").isNotEmpty()) throw CopyFailure("", "Le dossier de destination n'est pas vide.")
    try {
        return copyThenVerify(source, destination)
    } catch (e: Throwable) {
        for (entry in destination.list("")) runCatching { destination.delete(entry.name) }
        throw e
    }
}

private fun copyThenVerify(source: BinaryWorkspaceStorage, destination: BinaryWorkspaceStorage): CopyReport {
    val nodes = inventory(source)
    val destinationOf = HashMap<String, String>()
    val copied = HashMap<String, Fingerprint>()
    var bytes = 0L
    for (node in nodes) {
        val parent = node.path.substringBeforeLast('/', "")
        val name = node.path.substringAfterLast('/')
        val destParent = if (parent.isEmpty()) "" else destinationOf.getValue(parent)
        if (node.isDirectory) {
            destinationOf[node.path] = destination.createDirectory(destParent, name)
            continue
        }
        val created = destination.createFile(destParent, name, "application/octet-stream")
        destinationOf[node.path] = created
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        val input = source.openInput(node.path) ?: throw CopyFailure(node.path, "lecture impossible")
        try {
            DigestInputStream(input, digest).use { read ->
                destination.writeStream(created, object : InputStream() {
                    override fun read(): Int = read.read().also { if (it >= 0) size++ }
                    override fun read(b: ByteArray, off: Int, len: Int): Int =
                        read.read(b, off, len).also { if (it > 0) size += it }
                })
            }
        } catch (e: IOException) {
            throw CopyFailure(node.path, "copie impossible (${e.message})")
        }
        copied[node.path] = Fingerprint(size, hex(digest.digest()))
        bytes += size
    }
    verify(source, destination, nodes, destinationOf, copied)
    return CopyReport(copied.size, bytes)
}

private fun verify(
    source: BinaryWorkspaceStorage,
    destination: BinaryWorkspaceStorage,
    nodes: List<Node>,
    destinationOf: Map<String, String>,
    copied: Map<String, Fingerprint>,
) {
    val expected = nodes.map { it.path to it.isDirectory }.toSet()
    val againSource = inventory(source).map { it.path to it.isDirectory }.toSet()
    (expected - againSource).firstOrNull()?.let { throw CopyFailure(it.first, "a disparu de la source pendant la copie") }
    (againSource - expected).firstOrNull()?.let { throw CopyFailure(it.first, "est apparu dans la source pendant la copie") }
    val inDestination = inventory(destination, filterArtifacts = false).map { it.path to it.isDirectory }.toSet()
    val mapped = nodes.map { destinationOf.getValue(it.path) to it.isDirectory }.toSet()
    (mapped - inDestination).firstOrNull()?.let { throw CopyFailure(it.first, "absent de la copie") }
    (inDestination - mapped).firstOrNull()?.let { throw CopyFailure(it.first, "inattendu dans la copie") }
    for (node in nodes) {
        if (node.isDirectory) continue
        val wanted = copied.getValue(node.path)
        val again = fingerprint(source, node.path) ?: throw CopyFailure(node.path, "a disparu de la source pendant la copie")
        if (again.size != wanted.size || again.sha256 != wanted.sha256) throw CopyFailure(node.path, "a changé dans la source pendant la copie")
        val copy = fingerprint(destination, destinationOf.getValue(node.path)) ?: throw CopyFailure(node.path, "absent de la copie")
        if (copy.size != wanted.size) throw CopyFailure(node.path, "taille différente (${wanted.size} octets à la source, ${copy.size} dans la copie)")
        if (copy.sha256 != wanted.sha256) throw CopyFailure(node.path, "contenu différent")
    }
}

private fun fingerprint(storage: BinaryWorkspaceStorage, path: String): Fingerprint? {
    val input = storage.openInput(path) ?: return null
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    input.use {
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = it.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
            size += n
        }
    }
    return Fingerprint(size, hex(digest.digest()))
}

/** Tous les dossiers et fichiers, un dossier toujours avant son contenu, sans les artefacts de synchro. */
private fun inventory(storage: WorkspaceStorage, filterArtifacts: Boolean = true): List<Node> {
    val out = ArrayList<Node>()
    fun walk(dir: String) {
        for (entry in storage.list(dir)) {
            if (filterArtifacts && isSyncArtifact(entry.name)) continue
            val path = if (dir.isEmpty()) entry.name else "$dir/${entry.name}"
            out += Node(path, entry.isDirectory)
            if (entry.isDirectory) walk(path)
        }
    }
    walk("")
    return out
}

private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
```


`DeviceIds.kt` (algorithme de `lib/protocol/luhn.go` et `deviceid.go` de Syncthing v2.1.5, identifiant d'exemple tiré de leurs propres tests) :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.util.Locale

/**
 * Identifiants d'appareil Syncthing : 52 caractères base32 découpés en 4 blocs de 13, chacun suivi
 * d'un caractère de contrôle (somme de contrôle « Luhn mod 32 » de Syncthing, `lib/protocol/luhn.go`),
 * soit 56 caractères, affichés en 8 groupes de 7 séparés par des tirets.
 */
object DeviceIds {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    /** Le caractère de contrôle d'un bloc, ou null si le bloc sort de l'alphabet. */
    fun checkChar(block: String): Char? {
        var factor = 1
        var sum = 0
        for (c in block) {
            val code = ALPHABET.indexOf(c)
            if (code < 0) return null
            val addend = factor * code
            factor = if (factor == 2) 1 else 2
            sum += addend / 32 + addend % 32
        }
        return ALPHABET[(32 - sum % 32) % 32]
    }

    /**
     * L'identifiant mis au format affiché, ou null s'il est invalide. Comme Syncthing : majuscules,
     * tirets et espaces ignorés, 0 / 1 / 8 lus O / I / B (fautes de frappe). Seule la forme à 56
     * caractères est acceptée : sans caractères de contrôle, une faute de frappe passerait.
     */
    fun normalize(raw: String): String? {
        val compact = raw.trim().uppercase(Locale.ROOT)
            .replace("-", "").replace(" ", "")
            .replace('0', 'O').replace('1', 'I').replace('8', 'B')
        if (compact.length != 56) return null
        for (i in 0 until 4) {
            val block = compact.substring(i * 14, i * 14 + 13)
            if (checkChar(block) != compact[i * 14 + 13]) return null
        }
        return compact.chunked(7).joinToString("-")
    }

    fun isValid(raw: String): Boolean = normalize(raw) != null
}
```


`FreePort.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.DatagramSocket
import java.net.ServerSocket

/** Le port est libre en TCP ET en UDP (Syncthing écoute en TCP et en QUIC sur le même numéro). */
fun bindsTcpAndUdp(port: Int): Boolean = try {
    ServerSocket(port).use { }
    DatagramSocket(port).use { }
    true
} catch (_: IOException) {
    false
}

private fun ephemeralPort(): Int = ServerSocket(0).use { it.localPort }

/**
 * Un port d'écoute libre pour le moteur. Syncthing-Fork peut tenir 22000 sur le même téléphone : on
 * demande un port éphémère au système et on vérifie qu'il est libre en TCP et en UDP.
 * `isFree` et `candidate` sont là pour les tests.
 */
fun pickFreePort(
    isFree: (Int) -> Boolean = ::bindsTcpAndUdp,
    candidate: () -> Int = ::ephemeralPort,
    tries: Int = 50,
): Int {
    repeat(tries) {
        val port = candidate()
        if (port in 1024..65535 && isFree(port)) return port
    }
    throw IOException("Aucun port libre trouvé pour la synchronisation.")
}
```


- [ ] **Step 4 : constater le succès**

```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.VerifiedCopyTest' --tests 'com.ahmed.neocalendar.core.sync.DeviceIdsTest' --tests 'com.ahmed.neocalendar.core.sync.FreePortTest'
```

Attendu : `BUILD SUCCESSFUL` ; `VerifiedCopyTest` 7 tests, `DeviceIdsTest` 7, `FreePortTest` 5.

- [ ] **Step 5 : revue sonnet (écriture de données)**

Revue sonnet limitée à `VerifiedCopy.kt` (la source n'est jamais modifiée, la destination est vidée en cas d'échec, le fichier en cause est nommé) et à `DeviceIds.kt` (somme de contrôle). Corriger sans seconde revue.

- [ ] **Step 6 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native/core
git commit -m @'
Noyau : copie vérifiée de bascule, validation d'un identifiant d'appareil, choix d'un port libre

La copie compare liste, tailles et SHA-256 après une seconde lecture de la source, n'efface jamais la source et vide la destination en cas d'échec. L'identifiant d'appareil est validé par la somme de contrôle de Syncthing avant toute requête.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 3 : Noyau, configuration du moteur et client REST

La configuration envoyée à l'API (fonctions pures) et le client REST derrière une interface de transport : le test d'intégration (Task 5) l'utilise en TCP, l'app (Task 7) en socket Unix. Testable seule : `:core:test`.

Endpoints utilisés, tous relus dans `lib/api/api.go` et `lib/api/confighandler.go` du tarball v2.1.5 : `GET /rest/noauth/health`, `GET /rest/system/status` (`myID`), `GET /rest/system/connections` (`connections.<id>.connected`), `POST /rest/system/shutdown`, `POST /rest/system/pause|resume?device=`, `GET|PATCH /rest/config/options`, `GET /rest/config/devices`, `PUT|PATCH|DELETE /rest/config/devices/{id}`, `GET /rest/config/folders`, `PUT|PATCH|DELETE /rest/config/folders/{id}`, `GET /rest/cluster/pending/devices`, `GET /rest/cluster/pending/folders?device=` (le paramètre `device` est OBLIGATOIRE), `DELETE /rest/cluster/pending/devices?device=`, `DELETE /rest/cluster/pending/folders?folder=&device=`, `GET /rest/stats/device` (`lastSeen`), `GET /rest/db/status?folder=`, `GET /rest/db/completion?folder=&device=`, `POST /rest/db/scan?folder=`, `GET /rest/events?since=&timeout=&events=&limit=`. Détail utile : `PUT /rest/config/folders/{id}` remplace le dossier par `defaults + corps` (le corps doit donc porter tous les réglages voulus), `PATCH` fusionne ; la liste `devices` d'un dossier est remplacée en bloc.

**Files:**
- Create: `core/.../sync/EngineConfig.kt`, `core/.../sync/SyncthingApi.kt`, `core/.../sync/SyncSetup.kt`
- Test: `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/EngineConfigTest.kt`, `FakeTransport.kt`, `SyncthingApiTest.kt`, `SyncSetupTest.kt`

**Interfaces:**
- Consumes: `DeviceIds` (Task 2).
- Produces :
  - `object EngineConfig { const val RELAY_POOL; fun listenAddresses(port: Int): List<String>; fun options(port: Int): JsonObject; fun device(deviceId: String, name: String): JsonObject; fun folder(id: String, label: String, path: String, deviceIds: List<String>): JsonObject; fun folderDevices(deviceIds: List<String>): JsonArray; fun newFolderId(random: SecureRandom = SecureRandom()): String }`
  - `interface HttpTransport { fun request(method: String, path: String, body: String? = null, readTimeoutMs: Int = 15_000): HttpResult }` ; `class HttpResult(val code: Int, val body: String)` ; `class SyncthingApiException(val code: Int, message: String) : IOException` (code 0 = le moteur ne répond pas)
  - `class SyncthingApi(transport: HttpTransport)` : `isHealthy()`, `myId()`, `patchOptions(JsonObject)`, `devices(): List<ConfiguredDevice>`, `putDevice(id, name)`, `renameDevice(id, name)`, `removeDevice(id)`, `folders(): List<ConfiguredFolder>`, `putFolder(JsonObject)`, `setFolderDevices(folderId, deviceIds)`, `removeFolder(id)`, `pendingDevices(): List<PendingDevice>`, `pendingFolders(deviceId): List<PendingFolder>`, `dismissPendingDevice(id)`, `dismissPendingFolder(folderId, deviceId)`, `connections(): Map<String, Boolean>`, `lastSeen(): Map<String, String?>`, `folderState(folderId): FolderState`, `completion(folderId, deviceId): Double`, `scan(folderId)`, `pauseDevice(id)`, `resumeDevice(id)`, `shutdown()`, `events(since, timeoutSeconds, types): List<SyncEvent>`
  - `class SyncSetup(api: SyncthingApi, folderPath: String, random: SecureRandom = SecureRandom())` : `applyOptions(port)`, `addDevice(rawId, name)`, `acceptDevice(pending: PendingDevice)`, `rejectDevice(id)`, `removeDevice(id)`, `decide(proposal: PendingFolder): ProposalDecision`, `adopt(proposal: PendingFolder): ProposalDecision`, `refuseFolder(proposal)`
  - `sealed interface ProposalDecision { Adopt; Replace(oldId); ShareExisting; Refuse(reason) }`, `fun decideProposal(local: ConfiguredFolder?, selfId: String, proposerId: String, proposedId: String): ProposalDecision`, `const val REFUSE_SECOND_FOLDER`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.sync

import java.security.SecureRandom
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineConfigTest {
    private val self = "P56IOI7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"

    @Test fun `les options coupent mises a jour, statistiques et rapports, et gardent decouverte globale et relais`() {
        val o = EngineConfig.options(41234)
        assertEquals(0, o.getValue("autoUpgradeIntervalH").jsonPrimitive.int)
        assertEquals(-1, o.getValue("urAccepted").jsonPrimitive.int)
        assertFalse(o.getValue("crashReportingEnabled").jsonPrimitive.boolean)
        assertFalse(o.getValue("startBrowser").jsonPrimitive.boolean)
        assertTrue(o.getValue("globalAnnounceEnabled").jsonPrimitive.boolean)
        assertTrue(o.getValue("relaysEnabled").jsonPrimitive.boolean)
    }

    @Test fun `la decouverte locale est coupee (UDP 21027 reste a Syncthing-Fork)`() {
        assertFalse(EngineConfig.options(41234).getValue("localAnnounceEnabled").jsonPrimitive.boolean)
    }

    @Test fun `le port choisi sert en TCP et en QUIC et le relais est conserve`() {
        val addresses = EngineConfig.options(41234).getValue("listenAddresses").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(listOf("tcp://0.0.0.0:41234", "quic://0.0.0.0:41234", EngineConfig.RELAY_POOL), addresses)
    }

    @Test fun `le dossier est en envoi et reception avec corbeille de 30 jours`() {
        val f = EngineConfig.folder("neo-aaaaa-bbbbb", "Neo Calendar", "/data/user/0/x/files/Neo Calendar", listOf(self, "AUTRE"))
        assertEquals("sendreceive", f.getValue("type").jsonPrimitive.content)
        assertTrue(f.getValue("fsWatcherEnabled").jsonPrimitive.boolean)
        assertTrue(f.getValue("ignorePerms").jsonPrimitive.boolean)
        val versioning = f.getValue("versioning").jsonObject
        assertEquals("trashcan", versioning.getValue("type").jsonPrimitive.content)
        assertEquals("30", versioning.getValue("params").jsonObject.getValue("cleanoutDays").jsonPrimitive.content)
        assertEquals("/data/user/0/x/files/Neo Calendar", f.getValue("path").jsonPrimitive.content)
    }

    @Test fun `les appareils d'un dossier sont sans doublon`() {
        val f = EngineConfig.folder("id", "L", "/p", listOf(self, "B", self, "B"))
        assertEquals(listOf(self, "B"), f.getValue("devices").jsonArray.map { it.jsonObject.getValue("deviceID").jsonPrimitive.content })
    }

    @Test fun `un appareil distant n'accepte jamais de dossier tout seul`() {
        val d = EngineConfig.device(self, "PC d'Ahmed")
        assertFalse(d.getValue("autoAcceptFolders").jsonPrimitive.boolean)
        assertFalse(d.getValue("introducer").jsonPrimitive.boolean)
        assertEquals(JsonArray(listOf(kotlinx.serialization.json.JsonPrimitive("dynamic"))), d.getValue("addresses"))
    }

    @Test fun `un identifiant de dossier a la forme neo-xxxxx-xxxxx et change a chaque appel`() {
        val random = SecureRandom()
        val a = EngineConfig.newFolderId(random)
        assertTrue(a, Regex("neo-[a-z0-9]{5}-[a-z0-9]{5}").matches(a))
        assertNotEquals(a, EngineConfig.newFolderId(random))
    }

    @Test fun `le type de retour est bien un objet JSON serialisable`() {
        val o: JsonObject = EngineConfig.options(1234)
        assertTrue(o.toString().startsWith("{"))
    }
}
```


Le faux transport (réponses fixées d'avance, une clé qui finit par `*` répond à tout chemin qui commence par elle, utile pour l'identifiant de dossier tiré au hasard) :

```kotlin
package com.ahmed.neocalendar.core.sync

/** Un transport pour les tests : rend des réponses fixées d'avance et garde la liste des requêtes reçues. */
class FakeTransport : HttpTransport {
    class Call(val method: String, val path: String, val body: String?)

    val calls = mutableListOf<Call>()
    private val answers = LinkedHashMap<String, HttpResult>()

    /** `key` = « MÉTHODE chemin » exact, query comprise ; une clé qui finit par `*` répond à tout chemin qui commence par elle. */
    fun answer(key: String, body: String, code: Int = 200) { answers[key] = HttpResult(code, body) }

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        calls += Call(method, path, body)
        val key = "$method $path"
        return answers[key]
            ?: answers.entries.firstOrNull { it.key.endsWith("*") && key.startsWith(it.key.dropLast(1)) }?.value
            ?: HttpResult(404, "pas de réponse prévue pour $key")
    }

    fun sent(method: String, path: String): String? = calls.lastOrNull { it.method == method && it.path == path }?.body
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SyncthingApiTest {
    private val pc = "P56IOI7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"
    private val fake = FakeTransport()
    private val api = SyncthingApi(fake)

    @Test fun `le moteur en bonne sante`() {
        fake.answer("GET /rest/noauth/health", """{"status":"OK"}""")
        assertTrue(api.isHealthy())
    }

    @Test fun `un moteur qui ne repond pas n'est pas en bonne sante et ne leve rien`() {
        val broken = object : HttpTransport {
            override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult = throw IOException("connexion refusée")
        }
        assertFalse(SyncthingApi(broken).isHealthy())
    }

    @Test fun `un code d'erreur devient une exception qui garde le code`() {
        fake.answer("GET /rest/system/status", "boom", 403)
        try { api.myId(); fail() } catch (e: SyncthingApiException) { assertEquals(403, e.code) }
    }

    @Test fun `une panne reseau devient une exception de code 0`() {
        val broken = object : HttpTransport {
            override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult = throw IOException("reset")
        }
        try { SyncthingApi(broken).myId(); fail() } catch (e: SyncthingApiException) { assertEquals(0, e.code) }
    }

    @Test fun `identifiant de cet appareil`() {
        fake.answer("GET /rest/system/status", """{"myID":"$pc","goroutines":5}""")
        assertEquals(pc, api.myId())
    }

    @Test fun `appareils et dossiers configures`() {
        fake.answer("GET /rest/config/devices", """[{"deviceID":"$pc","name":"PC","addresses":["dynamic"]}]""")
        fake.answer("GET /rest/config/folders", """[{"id":"neo-1","label":"Neo","path":"/p","devices":[{"deviceID":"$pc"}]}]""")
        assertEquals(listOf(ConfiguredDevice(pc, "PC")), api.devices())
        assertEquals(listOf(ConfiguredFolder("neo-1", "Neo", "/p", listOf(pc))), api.folders())
    }

    @Test fun `demandes entrantes d'appareils`() {
        fake.answer("GET /rest/cluster/pending/devices", """{"$pc":{"time":"2026-10-01T10:00:00Z","name":"DESKTOP","address":"192.168.1.5:22000"}}""")
        assertEquals(listOf(PendingDevice(pc, "DESKTOP", "192.168.1.5:22000")), api.pendingDevices())
        fake.answer("GET /rest/cluster/pending/devices", "{}")
        assertTrue(api.pendingDevices().isEmpty())
    }

    @Test fun `dossiers proposes par un appareil`() {
        fake.answer(
            "GET /rest/cluster/pending/folders?device=$pc",
            """{"abcd-efgh":{"offeredBy":{"$pc":{"time":"2026-10-01T10:00:00Z","label":"Neo Calendar","receiveEncrypted":false}}}}""",
        )
        assertEquals(listOf(PendingFolder("abcd-efgh", "Neo Calendar", pc)), api.pendingFolders(pc))
    }

    @Test fun `connexions et derniere connexion`() {
        fake.answer("GET /rest/system/connections", """{"connections":{"$pc":{"connected":true,"paused":false}},"total":{}}""")
        fake.answer("GET /rest/stats/device", """{"$pc":{"lastSeen":"2026-10-01T09:00:00Z"},"AUTRE":{"lastSeen":"1970-01-01T00:00:00Z"}}""")
        assertEquals(mapOf(pc to true), api.connections())
        assertEquals("2026-10-01T09:00:00Z", api.lastSeen()[pc])
        assertNull(api.lastSeen()["AUTRE"])
    }

    @Test fun `etat du dossier`() {
        fake.answer("GET /rest/db/status?folder=neo-1", """{"state":"syncing","needFiles":3,"needBytes":1200,"error":""}""")
        assertEquals(FolderState("syncing", 3, 1200, ""), api.folderState("neo-1"))
    }

    @Test fun `les evenements sont lus avec leur numero`() {
        fake.answer(
            "GET /rest/events?since=5&timeout=30&events=ItemFinished%2CStateChanged",
            """[{"id":6,"type":"ItemFinished","time":"x","data":{"folder":"neo-1","item":"a.md","error":null,"type":"file","action":"update"}}]""",
        )
        val events = api.events(5, 30, listOf("ItemFinished", "StateChanged"))
        assertEquals(1, events.size)
        assertEquals(6, events[0].id)
        assertEquals("ItemFinished", events[0].type)
    }

    @Test fun `les ecritures partent avec la bonne methode et le bon chemin`() {
        for (key in listOf(
            "PATCH /rest/config/options", "PUT /rest/config/devices/$pc", "DELETE /rest/config/devices/$pc",
            "PUT /rest/config/folders/neo-1", "PATCH /rest/config/folders/neo-1", "DELETE /rest/config/folders/neo-1",
            "DELETE /rest/cluster/pending/devices?device=$pc", "DELETE /rest/cluster/pending/folders?folder=neo-1&device=$pc",
        )) fake.answer(key, "")
        api.patchOptions(EngineConfig.options(40000))
        api.putDevice(pc, "PC")
        api.removeDevice(pc)
        api.putFolder(EngineConfig.folder("neo-1", "Neo", "/p", listOf(pc)))
        api.setFolderDevices("neo-1", listOf(pc))
        api.removeFolder("neo-1")
        api.dismissPendingDevice(pc)
        api.dismissPendingFolder("neo-1", pc)
        assertEquals(8, fake.calls.size)
        assertTrue(fake.sent("PUT", "/rest/config/devices/$pc")!!.contains("\"deviceID\":\"$pc\""))
    }

    @Test fun `l'arret propre ne leve pas quand le moteur coupe la connexion`() {
        val cut = object : HttpTransport {
            override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult = throw IOException("EOF")
        }
        SyncthingApi(cut).shutdown()
    }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Un identifiant d'appareil valide (caractères de contrôle calculés), différent pour chaque `seed`. */
private fun validId(seed: Int): String {
    val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    val blocks = (0 until 4).map { b -> String(CharArray(13) { alphabet[(seed * 5 + b * 7 + it * 3) % 32] }) }
    return blocks.joinToString("") { it + DeviceIds.checkChar(it) }.chunked(7).joinToString("-")
}

class SyncSetupTest {
    private val me = "MEMEME7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"
    private val pc = "P56IOI7-MZJNU2Y-IQGDREY-DM2MGTI-MGL3BXN-PQ6W5BM-TBBZ4TJ-XZWICQ2"
    private val tablet = validId(7)
    private val fake = FakeTransport()
    private val setup = SyncSetup(SyncthingApi(fake), "/data/files/Neo Calendar")

    private fun noFolders() = fake.answer("GET /rest/config/folders", "[]")
    private fun folder(id: String, vararg devices: String) =
        fake.answer("GET /rest/config/folders", """[{"id":"$id","label":"Neo","path":"/p","devices":[${devices.joinToString(",") { """{"deviceID":"$it"}""" }}]}]""")

    @Test fun `un identifiant invalide est refuse avant toute requete`() {
        try { setup.addDevice("pas-un-identifiant", "x"); fail() } catch (_: IllegalArgumentException) {}
        assertEquals(0, fake.calls.size)
    }

    @Test fun `l'identifiant de cet appareil est refuse`() {
        fake.answer("GET /rest/system/status", """{"myID":"$pc"}""")
        try { setup.addDevice(pc, "moi"); fail() } catch (e: IllegalArgumentException) { assertTrue(e.message!!.contains("cet appareil")) }
        assertNull(fake.sent("PUT", "/rest/config/devices/$pc"))
    }

    @Test fun `le premier appareil ajoute cree le dossier de notes partage avec lui`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        noFolders()
        fake.answer("PUT /rest/config/devices/$pc", "")
        fake.answer("PUT /rest/config/folders/neo-*", "")
        setup.addDevice(pc.lowercase(), " PC d'Ahmed ")
        val putFolder = fake.calls.last { it.method == "PUT" && it.path.startsWith("/rest/config/folders/neo-") }
        assertTrue(putFolder.body!!.contains("\"path\":\"/data/files/Neo Calendar\""))
        assertTrue(putFolder.body!!.contains(pc))
        assertTrue(putFolder.body!!.contains(me))
        assertTrue(fake.sent("PUT", "/rest/config/devices/$pc")!!.contains("\"name\":\"PC d'Ahmed\""))
    }

    @Test fun `un appareil de plus rejoint le dossier existant sans le recreer`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        folder("neo-1", me, pc)
        fake.answer("PUT /rest/config/devices/$tablet", "")
        fake.answer("PATCH /rest/config/folders/neo-1", "")
        setup.addDevice(tablet, "")
        assertTrue(fake.calls.none { it.method == "PUT" && it.path.startsWith("/rest/config/folders/") })
        val body = fake.sent("PATCH", "/rest/config/folders/neo-1")!!
        assertTrue(body.contains(me) && body.contains(pc) && body.contains(tablet))
        // Sans nom, l'appareil porte le début de son identifiant.
        assertTrue(fake.sent("PUT", "/rest/config/devices/$tablet")!!.contains("\"name\":\"${tablet.take(7)}\""))
    }

    @Test fun `accepter une demande ne cree pas de dossier quand l'appareil en propose un`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        fake.answer("PUT /rest/config/devices/$pc", "")
        fake.answer("GET /rest/cluster/pending/folders?device=$pc", """{"f1":{"offeredBy":{"$pc":{"label":"Neo Calendar"}}}}""")
        fake.answer("DELETE /rest/cluster/pending/devices?device=$pc", "")
        setup.acceptDevice(PendingDevice(pc, "DESKTOP", "x"))
        assertTrue(fake.calls.none { it.path.startsWith("/rest/config/folders") })
    }

    @Test fun `accepter une demande sans proposition de dossier partage le dossier`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        fake.answer("PUT /rest/config/devices/$pc", "")
        fake.answer("GET /rest/cluster/pending/folders?device=$pc", "{}")
        noFolders()
        fake.answer("PUT /rest/config/folders/neo-*", "")
        fake.answer("DELETE /rest/cluster/pending/devices?device=$pc", "")
        setup.acceptDevice(PendingDevice(pc, "DESKTOP", "x"))
        assertTrue(fake.calls.any { it.method == "PUT" && it.path.startsWith("/rest/config/folders/neo-") })
    }

    @Test fun `retirer un appareil le sort du dossier puis du moteur`() {
        folder("neo-1", me, pc)
        fake.answer("PATCH /rest/config/folders/neo-1", "")
        fake.answer("DELETE /rest/config/devices/$pc", "")
        setup.removeDevice(pc)
        val order = fake.calls.filter { it.method != "GET" }.map { "${it.method} ${it.path}" }
        assertEquals(listOf("PATCH /rest/config/folders/neo-1", "DELETE /rest/config/devices/$pc"), order)
        assertTrue(!fake.sent("PATCH", "/rest/config/folders/neo-1")!!.contains(pc))
    }

    // --- la décision d'adopter un dossier proposé -----------------------------------------------

    private fun local(id: String, vararg devices: String) = ConfiguredFolder(id, "Neo", "/p", devices.toList())

    @Test fun `sans dossier local, on adopte`() {
        assertEquals(ProposalDecision.Adopt, decideProposal(null, me, pc, "f1"))
    }

    @Test fun `la meme identite, on partage seulement`() {
        assertEquals(ProposalDecision.ShareExisting, decideProposal(local("f1", me), me, pc, "f1"))
    }

    @Test fun `un dossier local lie au seul proposeur est remplace`() {
        assertEquals(ProposalDecision.Replace("neo-1"), decideProposal(local("neo-1", me, pc), me, pc, "f1"))
        assertEquals(ProposalDecision.Replace("neo-1"), decideProposal(local("neo-1", me), me, pc, "f1"))
    }

    @Test fun `un dossier local deja partage avec un autre appareil refuse la deuxieme proposition`() {
        val d = decideProposal(local("neo-1", me, tablet), me, pc, "f1")
        assertEquals(ProposalDecision.Refuse(REFUSE_SECOND_FOLDER), d)
    }

    @Test fun `adopter remplace le dossier local, garde le chemin prive et nettoie la demande`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        folder("neo-1", me, pc)
        fake.answer("DELETE /rest/config/folders/neo-1", "")
        fake.answer("PUT /rest/config/folders/f1", "")
        fake.answer("DELETE /rest/cluster/pending/folders?folder=f1&device=$pc", "")
        val decision = setup.adopt(PendingFolder("f1", "Neo Calendar", pc))
        assertEquals(ProposalDecision.Replace("neo-1"), decision)
        val put = fake.sent("PUT", "/rest/config/folders/f1")!!
        assertTrue(put.contains("\"path\":\"/data/files/Neo Calendar\""))
        assertTrue(put.contains(me) && put.contains(pc))
        val order = fake.calls.filter { it.method != "GET" }.map { it.method }
        assertEquals(listOf("DELETE", "PUT", "DELETE"), order)
    }

    @Test fun `adopter une deuxieme proposition refusee n'ecrit rien`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        folder("neo-1", me, tablet)
        val decision = setup.adopt(PendingFolder("f1", "Neo Calendar", pc))
        assertTrue(decision is ProposalDecision.Refuse)
        assertTrue(fake.calls.all { it.method == "GET" })
    }
}
```


- [ ] **Step 2 : constater l'échec**

```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.EngineConfigTest' --tests 'com.ahmed.neocalendar.core.sync.SyncthingApiTest' --tests 'com.ahmed.neocalendar.core.sync.SyncSetupTest'
```

Attendu : `FAILED`, `Unresolved reference 'EngineConfig'`, `'SyncthingApi'`, `'SyncSetup'`, `'HttpTransport'`.

- [ ] **Step 3 : implémenter**

`EngineConfig.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.security.SecureRandom
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Ce que l'app envoie à l'API REST de Syncthing v2 (`/rest/config/...`), sans rien d'autre : fonctions
 * pures, testées sans moteur. Les noms de champs sont ceux du dossier `lib/config/` de la v2.1.5.
 */
object EngineConfig {
    /** Le serveur de relais public : sans lui la synchro hors du même Wi-Fi tombe quand aucune connexion directe n'est possible. */
    const val RELAY_POOL = "dynamic+https://relays.syncthing.net/endpoint"

    const val TRASHCAN_DAYS = "30"

    fun listenAddresses(port: Int): List<String> = listOf("tcp://0.0.0.0:$port", "quic://0.0.0.0:$port", RELAY_POOL)

    /**
     * Les options du moteur, en PATCH sur `/rest/config/options` : pas de mise à jour automatique (l'app fixe la
     * version), pas de statistiques d'usage (`urAccepted = -1`), pas de rapport de plantage, découverte globale et
     * relais activés, découverte locale désactivée (le port UDP 21027 n'est pas partageable avec Syncthing-Fork
     * installé sur le même téléphone), un port d'écoute choisi par l'app.
     */
    fun options(port: Int): JsonObject = buildJsonObject {
        put("autoUpgradeIntervalH", 0)
        put("urAccepted", -1)
        put("crashReportingEnabled", false)
        put("startBrowser", false)
        put("globalAnnounceEnabled", true)
        put("localAnnounceEnabled", false)
        put("relaysEnabled", true)
        put("listenAddresses", JsonArray(listenAddresses(port).map { JsonPrimitive(it) }))
    }

    /** Un appareil distant, en PUT sur `/rest/config/devices/{id}`. Adresse « dynamic » : découverte globale. */
    fun device(deviceId: String, name: String): JsonObject = buildJsonObject {
        put("deviceID", deviceId)
        put("name", name)
        put("addresses", JsonArray(listOf(JsonPrimitive("dynamic"))))
        put("compression", "metadata")
        put("introducer", false)
        put("autoAcceptFolders", false)
        put("paused", false)
    }

    /**
     * Le dossier de notes, en PUT sur `/rest/config/folders/{id}` : envoi et réception, surveillance des
     * fichiers, `ignorePerms` (les droits d'un PC Windows n'ont pas de sens ici), corbeille de 30 jours
     * (une note écrasée ou supprimée par une synchro reste dans `.stversions`). `deviceIds` contient
     * l'identifiant de CET appareil.
     */
    fun folder(id: String, label: String, path: String, deviceIds: List<String>): JsonObject = buildJsonObject {
        put("id", id)
        put("label", label)
        put("path", path)
        put("type", "sendreceive")
        put("fsWatcherEnabled", true)
        put("ignorePerms", true)
        put("rescanIntervalS", 3600)
        put("devices", folderDevices(deviceIds))
        put("versioning", buildJsonObject {
            put("type", "trashcan")
            put("params", buildJsonObject { put("cleanoutDays", TRASHCAN_DAYS) })
        })
    }

    /** La liste `devices` d'un dossier (PATCH `/rest/config/folders/{id}` pour ajouter ou retirer un appareil). */
    fun folderDevices(deviceIds: List<String>): JsonArray =
        JsonArray(deviceIds.distinct().map { buildJsonObject { put("deviceID", it) } })

    private const val ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

    /** Un identifiant de dossier du genre `neo-k3x9a-2fq7z` : assez long pour ne jamais tomber sur celui d'un autre. */
    fun newFolderId(random: SecureRandom = SecureRandom()): String {
        fun chunk() = String(CharArray(5) { ID_ALPHABET[random.nextInt(ID_ALPHABET.length)] })
        return "neo-${chunk()}-${chunk()}"
    }
}
```


`SyncthingApi.kt` (la version de cette tâche ne lit pas encore l'option `limit` des évènements ; la Task 9 l'ajoute) :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Le transport HTTP, bloquant : OkHttp sur socket Unix dans l'app, `java.net.http` en TCP dans le test d'intégration. */
interface HttpTransport {
    /** `path` commence par `/rest/`. La clé d'API est ajoutée par le transport. Rend le code et le corps, quel que soit le code. */
    fun request(method: String, path: String, body: String? = null, readTimeoutMs: Int = 15_000): HttpResult
}

class HttpResult(val code: Int, val body: String)

/** Le moteur a répondu autrement que par un succès (ou n'a pas répondu : `code` = 0). */
class SyncthingApiException(val code: Int, message: String) : IOException(message)

data class ConfiguredDevice(val id: String, val name: String)
data class ConfiguredFolder(val id: String, val label: String, val path: String, val deviceIds: List<String>)
data class PendingDevice(val id: String, val name: String, val address: String)
data class PendingFolder(val id: String, val label: String, val offeredBy: String)
data class FolderState(val state: String, val needFiles: Int, val needBytes: Long, val error: String)
data class SyncEvent(val id: Int, val type: String, val data: JsonObject)

/** Les appels de l'API REST de Syncthing v2 dont l'app a besoin (chaque chemin vérifié dans `lib/api/api.go` de la v2.1.5). */
class SyncthingApi(private val transport: HttpTransport) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun call(method: String, path: String, body: JsonElement? = null, readTimeoutMs: Int = 15_000): String {
        val result = try {
            transport.request(method, path, body?.toString(), readTimeoutMs)
        } catch (e: SyncthingApiException) {
            throw e
        } catch (e: IOException) {
            throw SyncthingApiException(0, "Le moteur ne répond pas : ${e.message}")
        }
        if (result.code !in 200..299) throw SyncthingApiException(result.code, "Syncthing a refusé $method $path (${result.code}) : ${result.body.take(200)}")
        return result.body
    }

    private fun get(path: String): JsonElement = json.parseToJsonElement(call("GET", path))

    private fun q(value: String) = URLEncoder.encode(value, "UTF-8")

    /** Vrai quand le moteur répond (`/rest/noauth/health`). Ne lève jamais. */
    fun isHealthy(): Boolean = try {
        transport.request("GET", "/rest/noauth/health", null, 3_000).code == 200
    } catch (_: IOException) {
        false
    }

    /** L'identifiant de CET appareil. */
    fun myId(): String = get("/rest/system/status").jsonObject.getValue("myID").jsonPrimitive.content

    fun patchOptions(options: JsonObject) { call("PATCH", "/rest/config/options", options) }

    fun devices(): List<ConfiguredDevice> = get("/rest/config/devices").jsonArray.map {
        val o = it.jsonObject
        ConfiguredDevice(o.getValue("deviceID").jsonPrimitive.content, o["name"]?.jsonPrimitive?.contentOrNull.orEmpty())
    }

    fun putDevice(id: String, name: String) { call("PUT", "/rest/config/devices/${q(id)}", EngineConfig.device(id, name)) }

    fun renameDevice(id: String, name: String) {
        call("PATCH", "/rest/config/devices/${q(id)}", JsonObject(mapOf("name" to JsonPrimitive(name))))
    }

    fun removeDevice(id: String) { call("DELETE", "/rest/config/devices/${q(id)}") }

    fun folders(): List<ConfiguredFolder> = get("/rest/config/folders").jsonArray.map {
        val o = it.jsonObject
        ConfiguredFolder(
            o.getValue("id").jsonPrimitive.content,
            o["label"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            o["path"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            (o["devices"] as? JsonArray).orEmpty().map { d -> d.jsonObject.getValue("deviceID").jsonPrimitive.content },
        )
    }

    fun putFolder(folder: JsonObject) {
        call("PUT", "/rest/config/folders/${q(folder.getValue("id").jsonPrimitive.content)}", folder)
    }

    fun setFolderDevices(folderId: String, deviceIds: List<String>) {
        call("PATCH", "/rest/config/folders/${q(folderId)}", JsonObject(mapOf("devices" to EngineConfig.folderDevices(deviceIds))))
    }

    fun removeFolder(id: String) { call("DELETE", "/rest/config/folders/${q(id)}") }

    /** Les appareils inconnus qui ont tenté de se connecter (`/rest/cluster/pending/devices`). */
    fun pendingDevices(): List<PendingDevice> = get("/rest/cluster/pending/devices").jsonObject.map { (id, value) ->
        val o = value.jsonObject
        PendingDevice(id, o["name"]?.jsonPrimitive?.contentOrNull.orEmpty(), o["address"]?.jsonPrimitive?.contentOrNull.orEmpty())
    }

    /** Les dossiers que cet appareil nous propose (`/rest/cluster/pending/folders?device=`). */
    fun pendingFolders(deviceId: String): List<PendingFolder> =
        get("/rest/cluster/pending/folders?device=${q(deviceId)}").jsonObject.flatMap { (folderId, value) ->
            val offered = value.jsonObject["offeredBy"]?.jsonObject ?: JsonObject(emptyMap())
            offered.map { (device, info) ->
                PendingFolder(folderId, info.jsonObject["label"]?.jsonPrimitive?.contentOrNull.orEmpty(), device)
            }
        }

    fun dismissPendingDevice(id: String) { call("DELETE", "/rest/cluster/pending/devices?device=${q(id)}") }

    fun dismissPendingFolder(folderId: String, deviceId: String) {
        call("DELETE", "/rest/cluster/pending/folders?folder=${q(folderId)}&device=${q(deviceId)}")
    }

    /** Pour chaque appareil configuré : connecté ou non (`/rest/system/connections`). */
    fun connections(): Map<String, Boolean> =
        get("/rest/system/connections").jsonObject.getValue("connections").jsonObject
            .mapValues { it.value.jsonObject["connected"]?.jsonPrimitive?.booleanOrNull ?: false }

    /** Dernière connexion de chaque appareil, en texte ISO ; null s'il ne s'est jamais connecté (`/rest/stats/device`). */
    fun lastSeen(): Map<String, String?> = get("/rest/stats/device").jsonObject.mapValues {
        it.value.jsonObject["lastSeen"]?.jsonPrimitive?.contentOrNull?.takeUnless { text -> text.startsWith("1970-") || text.startsWith("0001-") }
    }

    fun folderState(folderId: String): FolderState {
        val o = get("/rest/db/status?folder=${q(folderId)}").jsonObject
        return FolderState(
            o["state"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            o["needFiles"]?.jsonPrimitive?.intOrNull ?: 0,
            o["needBytes"]?.jsonPrimitive?.longOrNull ?: 0L,
            o["error"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    /** Pourcentage (0 à 100) de ce que l'appareil distant a reçu de notre dossier (`/rest/db/completion`). */
    fun completion(folderId: String, deviceId: String): Double =
        get("/rest/db/completion?folder=${q(folderId)}&device=${q(deviceId)}").jsonObject["completion"]?.jsonPrimitive?.doubleOrNull ?: 0.0

    fun scan(folderId: String) { call("POST", "/rest/db/scan?folder=${q(folderId)}") }

    fun pauseDevice(id: String) { call("POST", "/rest/system/pause?device=${q(id)}") }

    fun resumeDevice(id: String) { call("POST", "/rest/system/resume?device=${q(id)}") }

    /** Arrêt propre. Le moteur peut couper la connexion avant de répondre : ce n'est pas une erreur. */
    fun shutdown() {
        try {
            call("POST", "/rest/system/shutdown")
        } catch (e: SyncthingApiException) {
            if (e.code != 0) throw e
        }
    }

    /**
     * Longue requête (`/rest/events`) : rend les évènements de numéro supérieur à `since`, ou une liste vide
     * au bout de `timeoutSeconds`. Le transport doit accepter un délai de lecture plus long que `timeoutSeconds`.
     */
    fun events(since: Int, timeoutSeconds: Int, types: List<String>): List<SyncEvent> {
        val path = "/rest/events?since=$since&timeout=$timeoutSeconds&events=${q(types.joinToString(","))}"
        val body = call("GET", path, null, (timeoutSeconds + 15) * 1000)
        return json.parseToJsonElement(body).jsonArray.map {
            val o = it.jsonObject
            SyncEvent(
                o.getValue("id").jsonPrimitive.content.toInt(),
                o.getValue("type").jsonPrimitive.content,
                o["data"] as? JsonObject ?: JsonObject(emptyMap()),
            )
        }
    }
}

/** Les évènements dont l'app a besoin : un fichier reçu, l'état d'un dossier, des demandes, des connexions. */
val ENGINE_EVENT_TYPES = listOf(
    "ItemFinished", "StateChanged", "PendingDevicesChanged", "PendingFoldersChanged",
    "DeviceConnected", "DeviceDisconnected", "ConfigSaved",
)
```


`SyncSetup.kt` :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.security.SecureRandom

/** Ce que l'app fait d'un dossier que le PC (ou un autre appareil accepté) propose. */
sealed interface ProposalDecision {
    /** Aucun dossier ici : le dossier de notes prend l'identifiant proposé. */
    data object Adopt : ProposalDecision

    /** Notre dossier a un autre identifiant, mais personne d'autre que le proposeur n'y est lié : il prend l'identifiant proposé. */
    data class Replace(val oldId: String) : ProposalDecision

    /** C'est déjà notre dossier : il suffit d'y ajouter le proposeur. */
    data object ShareExisting : ProposalDecision

    data class Refuse(val reason: String) : ProposalDecision
}

const val REFUSE_SECOND_FOLDER =
    "Un seul dossier est synchronisé, et le dossier de notes de ce téléphone l'est déjà avec d'autres appareils. " +
        "Retirez ces appareils avant d'en adopter un autre, ou refusez cette proposition."

/** Un seul dossier est synchronisé. `local` = le dossier de notes configuré dans le moteur, s'il y en a un. */
fun decideProposal(local: ConfiguredFolder?, selfId: String, proposerId: String, proposedId: String): ProposalDecision = when {
    local == null -> ProposalDecision.Adopt
    local.id == proposedId -> ProposalDecision.ShareExisting
    (local.deviceIds.toSet() - selfId - proposerId).isEmpty() -> ProposalDecision.Replace(local.id)
    else -> ProposalDecision.Refuse(REFUSE_SECOND_FOLDER)
}

/** Les gestes de l'utilisateur sur les appareils et le dossier, traduits en appels à l'API. `folderPath` : le dossier de notes privé. */
class SyncSetup(
    private val api: SyncthingApi,
    private val folderPath: String,
    private val random: SecureRandom = SecureRandom(),
) {
    companion object {
        const val FOLDER_LABEL = "Neo Calendar"
    }

    /** Premier démarrage : options du moteur (port d'écoute, découvertes, pas de statistiques). */
    fun applyOptions(port: Int) = api.patchOptions(EngineConfig.options(port))

    /** « Ajouter un appareil » : l'identifiant est validé (somme de contrôle) AVANT toute requête. */
    fun addDevice(rawId: String, name: String) {
        val id = DeviceIds.normalize(rawId) ?: throw IllegalArgumentException("Cet identifiant d'appareil n'est pas valide.")
        val me = api.myId()
        if (id == me) throw IllegalArgumentException("C'est l'identifiant de cet appareil.")
        api.putDevice(id, name.trim().ifEmpty { id.take(7) })
        shareFolderWith(me, id)
    }

    /** Accepte une demande entrante : jamais appelé sans geste de l'utilisateur. */
    fun acceptDevice(pending: PendingDevice) {
        val me = api.myId()
        api.putDevice(pending.id, pending.name.trim().ifEmpty { pending.id.take(7) })
        // Si cet appareil propose déjà un dossier, l'utilisateur doit choisir : on ne crée pas un deuxième dossier derrière son dos.
        if (api.pendingFolders(pending.id).isEmpty()) shareFolderWith(me, pending.id)
        runCatching { api.dismissPendingDevice(pending.id) }
    }

    fun rejectDevice(id: String) = api.dismissPendingDevice(id)

    /** Retire l'appareil, d'abord du dossier puis du moteur. Les notes locales ne sont pas touchées. */
    fun removeDevice(id: String) {
        api.folders().firstOrNull { id in it.deviceIds }?.let { api.setFolderDevices(it.id, it.deviceIds - id) }
        api.removeDevice(id)
    }

    /** Ce qui arrivera si l'utilisateur adopte la proposition (pour le dialogue de confirmation). */
    fun decide(proposal: PendingFolder): ProposalDecision =
        decideProposal(api.folders().firstOrNull(), api.myId(), proposal.offeredBy, proposal.id)

    /** Adopte le dossier proposé, après confirmation. Rend la décision appliquée. */
    fun adopt(proposal: PendingFolder): ProposalDecision {
        val me = api.myId()
        val local = api.folders().firstOrNull()
        val decision = decideProposal(local, me, proposal.offeredBy, proposal.id)
        when (decision) {
            is ProposalDecision.Refuse -> return decision
            ProposalDecision.ShareExisting -> api.setFolderDevices(proposal.id, (local!!.deviceIds + proposal.offeredBy))
            ProposalDecision.Adopt, is ProposalDecision.Replace -> {
                val devices = (local?.deviceIds.orEmpty() + me + proposal.offeredBy).distinct()
                if (decision is ProposalDecision.Replace) api.removeFolder(decision.oldId)
                api.putFolder(EngineConfig.folder(proposal.id, proposal.label.ifBlank { FOLDER_LABEL }, folderPath, devices))
            }
        }
        runCatching { api.dismissPendingFolder(proposal.id, proposal.offeredBy) }
        return decision
    }

    fun refuseFolder(proposal: PendingFolder) = api.dismissPendingFolder(proposal.id, proposal.offeredBy)

    private fun shareFolderWith(me: String, deviceId: String) {
        val folder = api.folders().firstOrNull()
        if (folder == null) {
            api.putFolder(EngineConfig.folder(EngineConfig.newFolderId(random), FOLDER_LABEL, folderPath, listOf(me, deviceId)))
        } else if (deviceId !in folder.deviceIds) {
            api.setFolderDevices(folder.id, folder.deviceIds + deviceId)
        }
    }
}
```


- [ ] **Step 4 : constater le succès**

```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.EngineConfigTest' --tests 'com.ahmed.neocalendar.core.sync.SyncthingApiTest' --tests 'com.ahmed.neocalendar.core.sync.SyncSetupTest'
```

Attendu : `BUILD SUCCESSFUL` ; `EngineConfigTest` 8 tests, `SyncthingApiTest` 13, `SyncSetupTest` 13.

- [ ] **Step 5 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native/core
git commit -m @'
Noyau : configuration du moteur Syncthing et client REST derrière une interface de transport

Les corps envoyés à l'API v2 sont construits par des fonctions pures (découverte locale coupée, pas de statistiques, corbeille de 30 jours). SyncSetup traduit les gestes (ajouter, accepter, retirer un appareil, adopter un dossier proposé) et ne crée jamais rien sans geste de l'utilisateur.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 4 : Build, Syncthing compilé depuis son tarball signé, Gradle, CI

Produit les deux `libsyncthingnative.so` (`arm64-v8a`, `x86_64`), leur intégration à l'APK, et la chaîne CI (release + validation des PR) avec cache des `.so`. Testable seule : le script compile et vérifie, un test Node garde les épinglages et les workflows, Gradle refuse une release sans moteur.

**Files:**
- Create: `apps/android/native/syncthing/version.env`, `release-key.asc`, `build-syncthing.sh`
- Create: `scripts/syncthing-pins.test.mjs`
- Modify: `apps/android/native/app/build.gradle.kts`, `.gitignore`, `.github/workflows/release.yml`, `.github/workflows/pr-validation.yml`

**Interfaces:**
- Consumes: rien.
- Produces :
  - `apps/android/native/syncthing/build-syncthing.sh [arm64-v8a] [x86_64]` : écrit `apps/android/native/app/src/main/jniLibs/<abi>/libsyncthingnative.so` (variables facultatives : `SYNCTHING_WORK`, `SYNCTHING_OUT`, `GOCACHE`)
  - `apps/android/native/syncthing/version.env` : `SYNCTHING_VERSION`, `SYNCTHING_SOURCE_SHA256`, `SYNCTHING_KEY_FINGERPRINT`, `SOURCE_DATE_EPOCH`, `GO_VERSION`, `GO_LINUX_AMD64_SHA256`, `NDK_VERSION`, `ANDROID_API` (lisible par `source` en bash et par le test Node)
  - tâche Gradle `:app:checkSyncthingLibs`, branchée sur `preReleaseBuild`

- [ ] **Step 1 : écrire le test Node qui échoue**

`scripts/syncthing-pins.test.mjs` (lancé par `npm test` : `node --test scripts/*.test.mjs`) :

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const pins = Object.fromEntries(
    (await read("apps/android/native/syncthing/version.env"))
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => [
            line.slice(0, line.indexOf("=")),
            line.slice(line.indexOf("=") + 1).trim(),
        ])
);
const build = await read("apps/android/native/syncthing/build-syncthing.sh");
const release = await read(".github/workflows/release.yml");
const validation = await read(".github/workflows/pr-validation.yml");

test("les épinglages de Syncthing ont la bonne forme", () => {
    assert.match(pins.SYNCTHING_VERSION, /^v\d+\.\d+\.\d+$/);
    assert.match(pins.SYNCTHING_SOURCE_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.SYNCTHING_KEY_FINGERPRINT, /^[0-9A-F]{40}$/);
    assert.match(pins.SOURCE_DATE_EPOCH, /^[1-9][0-9]+$/);
    assert.match(pins.GO_VERSION, /^\d+\.\d+\.\d+$/);
    assert.match(pins.GO_LINUX_AMD64_SHA256, /^[0-9a-f]{64}$/);
    assert.match(pins.NDK_VERSION, /^\d+\.\d+\.\d+$/);
});

test("l'API Android du moteur est le minSdk de l'app", async () => {
    const gradle = await read("apps/android/native/app/build.gradle.kts");
    assert.equal(pins.ANDROID_API, /minSdk = (\d+)/.exec(gradle)[1]);
});

test("la clé de release est en armure ASCII", async () => {
    const key = await read("apps/android/native/syncthing/release-key.asc");
    assert.ok(key.startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----"));
});

test("la compilation est vérifiée, hors réseau et reproductible", () => {
    for (const needle of [
        "sha256sum -c",
        "gpg --batch --status-fd 1 --verify",
        "VALIDSIG",
        "BADSIG",
        "-mod=vendor",
        "GOPROXY=off",
        "-trimpath",
        "SOURCE_DATE_EPOCH",
        "-checklinkname=0 -s -w",
        "CGO_ENABLED=1",
        "libsyncthingnative.so",
    ]) {
        assert.ok(
            build.includes(needle),
            `build-syncthing.sh doit contenir « ${needle} »`
        );
    }
});

test("la release compile le moteur ou le prend du cache, indexé par les épinglages", () => {
    assert.ok(release.includes("build-syncthing.sh"));
    assert.ok(
        release.includes(
            "hashFiles('apps/android/native/syncthing/version.env', 'apps/android/native/syncthing/build-syncthing.sh', 'apps/android/native/syncthing/release-key.asc')"
        )
    );
    assert.ok(release.includes("cache-hit != 'true'"));
    assert.ok(release.includes("libsyncthingnative.so"));
});

test("la validation des PR recompile Syncthing seulement si les épinglages ou le script changent", () => {
    assert.ok(validation.includes("syncthing-build:"));
    assert.ok(validation.includes("^apps/android/native/syncthing/"));
});

test("les binaires compilés ne sont jamais commités", async () => {
    const ignore = await read(".gitignore");
    assert.ok(ignore.includes("apps/android/native/app/src/main/jniLibs/"));
    assert.ok(ignore.includes("apps/android/native/syncthing/.work/"));
});
```


- [ ] **Step 2 : constater l'échec**

```powershell
cd C:\dev\neo-calendar
node --test scripts/syncthing-pins.test.mjs
```

Attendu : échec, `ENOENT ... apps/android/native/syncthing/version.env`.

- [ ] **Step 3 : créer les épinglages, la clé et le script**

`apps/android/native/syncthing/version.env` :

```bash
# Les versions épinglées du moteur de synchronisation embarqué. Monter de version Syncthing = changer
# ces lignes (et release-key.asc seulement si Syncthing change de clé de release).
#
# Le tarball source est signé par Syncthing (le tag git, lui, ne l'est pas). Le SHA-256 vient du fichier
# sha256sum.txt.asc de la release, lui-même signé ; l'empreinte est celle de syncthing.net/release-key.txt.
SYNCTHING_VERSION=v2.1.5
SYNCTHING_SOURCE_SHA256=11f129cff64fb4ba7cda33f9dae3a39eab8738a60bbbe8813cadecfdc94bd13d
SYNCTHING_KEY_FINGERPRINT=FBA2E162F2F44657B38F0309E5665F9BD5970C47
# Date du commit de la release (2026-09-08 06:57:55 UTC). build.go ignore SOURCE_DATE_EPOCH=0 et, sans dépôt git (c'est
# un tarball), mettrait l'heure courante dans le binaire : deux compilations différeraient d'un octet.
SOURCE_DATE_EPOCH=1788850675

# Go : celui de go.dev (sha256 de la page de téléchargement). go.mod de Syncthing exige 1.26.2 au moins.
GO_VERSION=1.26.8
GO_LINUX_AMD64_SHA256=d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b

# Le NDK de Syncthing-Fork (clang pour cgo) et l'API minimale de l'app.
NDK_VERSION=30.0.16248370
ANDROID_API=26
```


`release-key.asc` : la clé de release de Syncthing, copiée depuis le fichier déjà téléchargé et vérifié pendant les essais. Contrôler l'empreinte avant de continuer :

```powershell
Copy-Item C:\dev\syncthing-essais\verif\release-key.txt C:\dev\neo-calendar\apps\android\native\syncthing\release-key.asc
$gpgHome = Join-Path $env:TEMP "neo-gpg-check"; New-Item -ItemType Directory -Force $gpgHome | Out-Null
gpg --homedir $gpgHome --batch --import C:\dev\neo-calendar\apps\android\native\syncthing\release-key.asc
gpg --homedir $gpgHome --with-colons --fingerprint release@syncthing.net | Select-String '^fpr'
Remove-Item -Recurse -Force $gpgHome
```

Attendu : une ligne `fpr:::::::::FBA2E162F2F44657B38F0309E5665F9BD5970C47:`. Cette empreinte a été confirmée par `https://syncthing.net/release-key.txt` et par `keys.openpgp.org` (essais du 2026-10-01) ; si elle diffère, s'arrêter.

`build-syncthing.sh` : télécharge le tarball et sa signature, vérifie SHA-256 ET signature (le code de sortie de `gpg --verify` est trompeur quand la signature en porte une seconde d'une clé inconnue : on lit le statut machine `VALIDSIG` et on exige que la clé PRIMAIRE soit l'épinglée), compile sans réseau, dépouillé, reproductible :

```bash
#!/usr/bin/env bash
# Compile Syncthing pour Android (libsyncthingnative.so) depuis le tarball source SIGNÉ de la release.
#
#   build-syncthing.sh [arm64-v8a] [x86_64]      (sans argument : les deux)
#
# Chaîne de confiance : SHA-256 du tarball épinglé (version.env) ET signature GPG vérifiée avec la clé de
# release épinglée (release-key.asc, empreinte dans version.env). Compilation sans réseau (`-mod=vendor` : le
# tarball contient ses dépendances), reproductible (SOURCE_DATE_EPOCH épinglé, -trimpath), binaire dépouillé (-s -w).
# Pourquoi cgo + clang du NDK : le binaire Linux publié résout les noms par /etc/resolv.conf, absent d'Android.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version.env
source "$here/version.env"
work="${SYNCTHING_WORK:-$here/.work}"
out="${SYNCTHING_OUT:-$here/../app/src/main/jniLibs}"
abis=("$@")
[ ${#abis[@]} -gt 0 ] || abis=(arm64-v8a x86_64)

die() { echo "ERREUR : $*" >&2; exit 1; }

case "$(uname -s)" in
  Linux*) host=linux-x86_64; cc_ext="" ;;
  Darwin*) host=darwin-x86_64; cc_ext="" ;;
  MINGW*|MSYS*|CYGWIN*) host=windows-x86_64; cc_ext=".cmd" ;;
  *) die "système non pris en charge : $(uname -s)" ;;
esac

mkdir -p "$work/dl"

# --- 1. Go -----------------------------------------------------------------------------------------
if command -v go >/dev/null 2>&1 && [ "$(go env GOVERSION)" = "go$GO_VERSION" ]; then
  GO_BIN="$(command -v go)"
elif [ "$host" = linux-x86_64 ]; then
  tgz="$work/dl/go$GO_VERSION.linux-amd64.tar.gz"
  [ -f "$tgz" ] || curl -fsSL "https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz" -o "$tgz"
  echo "$GO_LINUX_AMD64_SHA256  $tgz" | sha256sum -c - >/dev/null || die "SHA-256 de Go incorrect"
  rm -rf "$work/go" && tar -xzf "$tgz" -C "$work"
  GO_BIN="$work/go/bin/go"
else
  die "Go $GO_VERSION introuvable : l'installer (go.dev/dl) et le mettre dans le PATH"
fi
echo "Go : $("$GO_BIN" version)"

# --- 2. NDK ----------------------------------------------------------------------------------------
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$sdk" ] && [ -n "${LOCALAPPDATA:-}" ]; then sdk="$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"; fi
ndk="${ANDROID_NDK_HOME:-$sdk/ndk/$NDK_VERSION}"
[ -d "$ndk/toolchains/llvm/prebuilt/$host/bin" ] || die "NDK $NDK_VERSION introuvable ($ndk) : sdkmanager \"ndk;$NDK_VERSION\""

# --- 3. Tarball : SHA-256 + signature -------------------------------------------------------------
src_tgz="$work/dl/syncthing-source-$SYNCTHING_VERSION.tar.gz"
base="https://github.com/syncthing/syncthing/releases/download/$SYNCTHING_VERSION"
[ -f "$src_tgz" ] || curl -fsSL "$base/syncthing-source-$SYNCTHING_VERSION.tar.gz" -o "$src_tgz"
[ -f "$src_tgz.asc" ] || curl -fsSL "$base/syncthing-source-$SYNCTHING_VERSION.tar.gz.asc" -o "$src_tgz.asc"
echo "$SYNCTHING_SOURCE_SHA256  $src_tgz" | sha256sum -c - >/dev/null || die "SHA-256 du tarball incorrect (fichier supprimé, refaire)"

gnupg="$(mktemp -d)"; chmod 700 "$gnupg"
trap 'rm -rf "$gnupg"' EXIT
export GNUPGHOME="$gnupg"
gpg --batch --quiet --import "$here/release-key.asc" 2>/dev/null
imported="$(gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr" {print $10}')"
echo "$imported" | grep -qx "$SYNCTHING_KEY_FINGERPRINT" || die "la clé de release.asc n'a pas l'empreinte épinglée ($SYNCTHING_KEY_FINGERPRINT)"
# Le code de sortie de gpg est trompeur quand la signature en porte une seconde d'une clé inconnue (l'ancienne
# clé de release) : on lit le statut machine, et on exige une signature VALIDE dont la clé PRIMAIRE est la nôtre.
status="$(gpg --batch --status-fd 1 --verify "$src_tgz.asc" "$src_tgz" 2>/dev/null || true)"
echo "$status" | grep -q '^\[GNUPG:\] BADSIG' && die "signature GPG du tarball INVALIDE"
echo "$status" | awk '$2=="VALIDSIG" {print $NF}' | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "aucune signature valide de la clé de release épinglée"
echo "Tarball : SHA-256 et signature GPG vérifiés ($SYNCTHING_VERSION)"

# --- 4. Compilation, une fois par ABI --------------------------------------------------------------
rm -rf "$work/src" && mkdir -p "$work/src" && tar -xzf "$src_tgz" -C "$work/src"
cd "$work/src/syncthing"

export CGO_ENABLED=1 GO111MODULE=on GOTOOLCHAIN=local GOPROXY=off
export GOFLAGS="-buildvcs=false -mod=vendor -trimpath"
export EXTRA_LDFLAGS="-checklinkname=0 -s -w"
export SOURCE_DATE_EPOCH BUILD_USER=reproducible-build BUILD_HOST=neo-calendar
export GOCACHE="${GOCACHE:-$work/gocache}"
PATH="$(dirname "$GO_BIN"):$PATH"

for abi in "${abis[@]}"; do
  case "$abi" in
    arm64-v8a) goarch=arm64; triple=aarch64-linux-android ;;
    x86_64) goarch=amd64; triple=x86_64-linux-android ;;
    *) die "ABI inconnue : $abi (arm64-v8a ou x86_64)" ;;
  esac
  cc="$ndk/toolchains/llvm/prebuilt/$host/bin/${triple}${ANDROID_API}-clang${cc_ext}"
  [ -f "$cc" ] || die "compilateur introuvable : $cc"
  echo "== $abi (GOARCH=$goarch)"
  rm -f syncthing
  "$GO_BIN" run build.go -goos android -goarch "$goarch" -cc "$cc" -version "$SYNCTHING_VERSION" -no-upgrade build
  mkdir -p "$out/$abi"
  cp syncthing "$out/$abi/libsyncthingnative.so"
  echo "   $(wc -c < "$out/$abi/libsyncthingnative.so") octets, sha256 $(sha256sum "$out/$abi/libsyncthingnative.so" | cut -d' ' -f1)"
done
echo "Terminé : $out"
```


- [ ] **Step 4 : constater que les tests Node passent en partie**

Les tests sur les workflows et `.gitignore` échouent encore (Step 6 à 8) ; ceux qui portent sur `version.env`, la clé et le script passent :

```powershell
node --test scripts/syncthing-pins.test.mjs
```

Attendu : 4 tests passent (`épinglages`, `minSdk`, `clé`, `compilation`), 3 échouent (`release`, `validation des PR`, `binaires jamais commités`), jusqu'aux Steps 7 et 8.

- [ ] **Step 5 : compiler pour de vrai, vérifier la reproductibilité**

Go 1.26.8 portable de `C:\dev\outils\go-1.26.8\go` et NDK r30 (`%LOCALAPPDATA%\Android\Sdk\ndk\30.0.16248370`) sont déjà installés (essais). S'ils manquent : Go depuis go.dev (zip Windows, SHA-256 `b92c3b2adae85a11ba71fe7216daf0d84e82af4c8ab6c5625807f28622043a59`), NDK par `sdkmanager "ndk;30.0.16248370"`. Sous Git Bash :

```bash
cd /c/dev/neo-calendar
export PATH="/c/dev/outils/go-1.26.8/go/bin:$PATH"
bash apps/android/native/syncthing/build-syncthing.sh x86_64
```

Attendu (premier lancement : téléchargement de 43 Mo, puis environ une minute de compilation) :

```
Go : go version go1.26.8 windows/amd64
Tarball : SHA-256 et signature GPG vérifiés (v2.1.5)
== x86_64 (GOARCH=amd64)
   29272216 octets, sha256 55120397316df687e24761ee5dfd7e2e03833740fdf5bdbb27e36ec3371134ad
Terminé : .../apps/android/native/syncthing/../app/src/main/jniLibs
```

La taille (29 272 216 octets) et ce SHA-256 ont été relevés deux fois, dans deux dossiers de travail et deux caches Go différents, sur la machine de développement (hôte Windows). Un hôte Linux (la CI) peut produire un SHA-256 différent : ne PAS l'épingler, seule la reproductibilité sur une même machine compte. Refaire avec un autre dossier de travail pour le constater :

```bash
SYNCTHING_WORK=/c/dev/syncthing-essais/verif-repro SYNCTHING_OUT=/c/dev/syncthing-essais/out-repro \
  bash apps/android/native/syncthing/build-syncthing.sh x86_64
sha256sum /c/dev/syncthing-essais/out-repro/x86_64/libsyncthingnative.so apps/android/native/app/src/main/jniLibs/x86_64/libsyncthingnative.so
```

Attendu : le même SHA-256 deux fois. Puis la seconde ABI (non essayée en préparant ce plan : à relever) :

```bash
bash apps/android/native/syncthing/build-syncthing.sh arm64-v8a
ls -l apps/android/native/app/src/main/jniLibs/*/libsyncthingnative.so
```

Attendu : deux fichiers de 26 à 30 Mo (les essais avaient mesuré 26,2 Mo dépouillé pour arm64). Noter les deux tailles dans le message de commit.

- [ ] **Step 6 : Gradle, packaging et garde-fou de release**

Modifier `app/build.gradle.kts` (`abiFilters`, extraction à l'installation, tâche qui refuse une release sans moteur ; les dépendances OkHttp et zxing viennent aux Tasks 7 et 10) :

```diff
--- a/app/build.gradle.kts
+++ b/app/build.gradle.kts
@@ -35,5 +35,10 @@
 
   versionName = "1.85.0"
+  // Le moteur de synchronisation (libsyncthingnative.so) n'existe que pour ces deux ABI.
+  ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
  }
+
+ // Le binaire Syncthing se lance depuis nativeLibraryDir : il doit être EXTRAIT à l'installation, pas lu dans l'APK.
+ packaging { jniLibs { useLegacyPackaging = true } }
 
  signingConfigs {
@@ -73,2 +78,17 @@
 }
 
+// Une release sans le moteur ne doit pas partir : les .so se compilent avec syncthing/build-syncthing.sh (cache en CI).
+val checkSyncthingLibs = tasks.register("checkSyncthingLibs") {
+    val libs = listOf("arm64-v8a", "x86_64").map { layout.projectDirectory.file("src/main/jniLibs/$it/libsyncthingnative.so") }
+    doLast {
+        val missing = libs.filter { !it.asFile.isFile }
+        if (missing.isNotEmpty()) {
+            throw GradleException(
+                "Moteur Syncthing absent : " + missing.joinToString { it.asFile.path } +
+                    ". Lancer apps/android/native/syncthing/build-syncthing.sh.",
+            )
+        }
+    }
+}
+tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkSyncthingLibs) }
+
```


Vérifier le garde-fou, puis le packaging (la tâche `checkSyncthingLibs` se place avant `preReleaseBuild` : vérifié par `--dry-run`) :

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
Remove-Item -Force app\src\main\jniLibs\arm64-v8a\libsyncthingnative.so -ErrorAction SilentlyContinue
.\gradlew.bat :app:checkSyncthingLibs
```

Attendu : `FAILED`, message `Moteur Syncthing absent : ...\arm64-v8a\libsyncthingnative.so. Lancer apps/android/native/syncthing/build-syncthing.sh.` Puis recompiler l'arm64 (Step 5) et :

```powershell
.\gradlew.bat :app:checkSyncthingLibs assembleDebug
$env:ANDROID_KEYSTORE_PATH = "x"; $env:ANDROID_KEYSTORE_PASSWORD = "x"; $env:ANDROID_KEY_ALIAS = "x"; $env:ANDROID_KEY_PASSWORD = "x"
.\gradlew.bat :app:assembleRelease --dry-run | Select-String "checkSyncthingLibs|preReleaseBuild"
Remove-Item Env:ANDROID_KEYSTORE_PATH, Env:ANDROID_KEYSTORE_PASSWORD, Env:ANDROID_KEY_ALIAS, Env:ANDROID_KEY_PASSWORD
```

Attendu : `BUILD SUCCESSFUL` ; la simulation de release liste `:app:checkSyncthingLibs SKIPPED` AVANT `:app:preReleaseBuild SKIPPED`. Contrôler le contenu de l'APK et l'extraction à l'installation :

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead("$PWD\app\build\outputs\apk\debug\app-debug.apk")
$zip.Entries | Where-Object { $_.FullName -like '*libsyncthing*' } | ForEach-Object { "$($_.FullName) $($_.Length) $($_.CompressedLength)" }
$zip.Dispose()
Select-String 'extractNativeLibs' app\build\intermediates\merged_manifests\debug\processDebugManifest\AndroidManifest.xml
```

Attendu : `lib/arm64-v8a/libsyncthingnative.so` et `lib/x86_64/libsyncthingnative.so` (environ 11 à 13 Mo compressés chacun), `android:extractNativeLibs="true"`. Noter la taille de l'APK debug (environ 31 Mo avec UNE ABI du moteur en préparant ce plan).

- [ ] **Step 7 : `.gitignore`**

```powershell
cd C:\dev\neo-calendar
Add-Content .gitignore ""
Add-Content .gitignore "# Le moteur de synchronisation : les .so se compilent (apps/android/native/syncthing/build-syncthing.sh) et se mettent en cache en CI."
Add-Content .gitignore "apps/android/native/app/src/main/jniLibs/"
Add-Content .gitignore "apps/android/native/syncthing/.work/"
git status --short
```

Attendu : `git status` ne montre ni `jniLibs/` ni `.work/`.

- [ ] **Step 8 : CI, release (cache et compilation) et validation des PR (compilation si les épinglages changent)**

Dans `.github/workflows/release.yml`, job `android`, insérer ces étapes juste AVANT l'étape `- name: Restaurer la clé de signature Android` (le job `tests` et le nom du job `android:` ne bougent pas : le test `release-workflow.test.mjs` les repère par texte) :

```yaml
            # Le moteur de synchronisation embarqué : Syncthing compilé depuis son tarball source SIGNÉ (SHA-256 et empreinte
            # GPG épinglés dans apps/android/native/syncthing/), un .so par ABI. La compilation est reproductible : le cache
            # est indexé par les épinglages et le script, et ne recompile qu'à une montée de version de Syncthing.
            - name: Restaurer le moteur Syncthing (cache)
              id: syncthing-libs
              uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
              with:
                  path: apps/android/native/app/src/main/jniLibs
                  key: syncthing-libs-${{ hashFiles('apps/android/native/syncthing/version.env', 'apps/android/native/syncthing/build-syncthing.sh', 'apps/android/native/syncthing/release-key.asc') }}

            - name: Compiler le moteur Syncthing (arm64-v8a, x86_64)
              if: steps.syncthing-libs.outputs.cache-hit != 'true'
              run: |
                  source apps/android/native/syncthing/version.env
                  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "ndk;$NDK_VERSION"
                  bash apps/android/native/syncthing/build-syncthing.sh

            - name: Vérifier que les deux moteurs sont là
              run: |
                  test -s apps/android/native/app/src/main/jniLibs/arm64-v8a/libsyncthingnative.so
                  test -s apps/android/native/app/src/main/jniLibs/x86_64/libsyncthingnative.so
```


À la fin de `.github/workflows/pr-validation.yml`, ajouter le job (une PR qui ne touche pas `apps/android/native/syncthing/` ne recompile rien ; une release, elle, compile ou prend le cache) :

```yaml

    # La compilation de Syncthing ne se rejoue que si les épinglages ou le script changent : pas à chaque PR.
    syncthing-build:
        name: Compilation de Syncthing
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
              with:
                  fetch-depth: 0

            - name: Les épinglages ou le script ont-ils changé ?
              id: changed
              run: |
                  if [ "${{ github.event_name }}" = "pull_request" ] &&
                     ! git diff --name-only "${{ github.event.pull_request.base.sha }}" "${{ github.event.pull_request.head.sha }}" |
                       grep -q '^apps/android/native/syncthing/'; then
                    echo "build=false" >> "$GITHUB_OUTPUT"
                  else
                    echo "build=true" >> "$GITHUB_OUTPUT"
                  fi

            - name: Restaurer le moteur Syncthing (cache)
              if: steps.changed.outputs.build == 'true'
              id: syncthing-libs
              uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
              with:
                  path: apps/android/native/app/src/main/jniLibs
                  key: syncthing-libs-${{ hashFiles('apps/android/native/syncthing/version.env', 'apps/android/native/syncthing/build-syncthing.sh', 'apps/android/native/syncthing/release-key.asc') }}

            - name: Compiler Syncthing (arm64-v8a, x86_64)
              if: steps.changed.outputs.build == 'true' && steps.syncthing-libs.outputs.cache-hit != 'true'
              run: |
                  source apps/android/native/syncthing/version.env
                  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "ndk;$NDK_VERSION"
                  bash apps/android/native/syncthing/build-syncthing.sh
```


Les `uses:` reprennent les SHA déjà épinglés du dépôt (`actions/checkout`, `actions/cache`) : aucune action nouvelle. Les workflows restent en LF. Estimation NON mesurée pour la CI (4 vCPU, hors cache) : 8 à 12 minutes pour les deux ABI, 3 à 4 minutes avec les modules vendorés ; le tarball n'a pas de cache de modules à gérer (`-mod=vendor`). Relever la durée réelle au premier run et la noter dans le rapport de la Task 12.

- [ ] **Step 9 : tous les tests Node**

```powershell
node --test scripts/*.test.mjs
```

Attendu : tout passe, dont les 7 tests de `syncthing-pins.test.mjs` et `release-workflow.test.mjs`.

- [ ] **Step 10 : commit**

```powershell
git add apps/android/native/syncthing/version.env apps/android/native/syncthing/release-key.asc apps/android/native/syncthing/build-syncthing.sh apps/android/native/app/build.gradle.kts scripts/syncthing-pins.test.mjs .gitignore .github/workflows/release.yml .github/workflows/pr-validation.yml
git commit -m @'
Build : Syncthing v2.1.5 compilé depuis son tarball signé (arm64-v8a, x86_64), cache CI

SHA-256 du tarball et empreinte de la clé de release épinglés, signature GPG vérifiée, compilation sans réseau (-mod=vendor), dépouillée, reproductible (époque de build épinglée : build.go ignore SOURCE_DATE_EPOCH=0). Le binaire est extrait à l'installation (useLegacyPackaging) ; une release sans moteur est refusée par Gradle.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 5 : Test d'intégration à deux moteurs (JVM, local et CI)

Deux vrais Syncthing v2.1.5 configurés par le MÊME code que l'app (`SyncSetup`, `EngineConfig`, `SyncthingApi` des Tasks 1 à 3) : appairage avec demande entrante, adoption du dossier proposé, une note qui fait l'aller-retour, une modification simultanée qui produit un `sync-conflict` ignoré au chargement, et la preuve qu'un moteur neuf n'a aucun dossier. Il valide l'usage de l'API REST sur de vrais moteurs AVANT d'écrire de l'Android. Testable seul : local (binaire Windows ou Linux vérifié) et CI.

Il a été écrit et exécuté en préparant ce plan avec le binaire Windows officiel v2.1.5 vérifié par signature : 2 tests, 0 échec, environ 20 secondes. Tout tourne dans un dossier temporaire, sur 127.0.0.1, sans découverte, sans relais, sans UPnP : aucun Syncthing existant n'est approché (ports tirés au hasard).

**Files:**
- Create: `apps/android/native/syncthing/fetch-test-binary.sh`
- Create: `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/LoopbackTransport.kt`, `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/TwoEnginesTest.kt`
- Modify: `apps/android/native/core/build.gradle.kts`, `.github/workflows/pr-validation.yml`, `scripts/syncthing-pins.test.mjs`

**Interfaces:**
- Consumes: tout le noyau des Tasks 1 à 3 ; `version.env` et `release-key.asc` (Task 4).
- Produces : variable d'environnement `SYNCTHING_BINARY` (chemin d'un binaire Syncthing v2 de la machine ; absente ou vide : le test est ignoré, pas en échec) ; `fetch-test-binary.sh [dossier]` qui affiche le chemin du binaire vérifié sur sa dernière ligne.

- [ ] **Step 1 : écrire le test (il est ignoré tant que `SYNCTHING_BINARY` manque)**

Le transport de test : `java.net.http` en TCP (JDK 17 ; `HttpURLConnection` ne sait pas faire `PATCH`) :

```kotlin
package com.ahmed.neocalendar.core.sync

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Le transport du test d'intégration : HTTP en TCP sur 127.0.0.1 (l'app, elle, parle en socket Unix). */
class LoopbackTransport(private val port: Int, private val apiKey: String) : HttpTransport {
    private val client = HttpClient.newHttpClient()

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofString(body)
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
            .timeout(Duration.ofMillis(readTimeoutMs.toLong()))
            .header("X-API-Key", apiKey)
            .header("Content-Type", "application/json")
            .method(method, publisher)
            .build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        return HttpResult(response.statusCode(), response.body())
    }
}
```


Le test (lire ses commentaires : l'ordre des gestes est celui de la vraie utilisation, A ajoute B, B voit la demande, l'accepte, adopte le dossier de A) :

```kotlin
package com.ahmed.neocalendar.core.sync

import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.conflictFiles
import com.ahmed.neocalendar.core.workspace.initNewWorkspace
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import java.io.File
import java.security.SecureRandom
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Deux vrais Syncthing, configurés par le même code que l'app (`SyncSetup`, `EngineConfig`, `SyncthingApi`).
 * Lancé seulement quand `-Dsyncthing.binary=<chemin>` (variable `SYNCTHING_BINARY`) désigne un binaire
 * Syncthing v2 de cette machine ; sinon ignoré. Tout vit dans un dossier temporaire et sur 127.0.0.1 :
 * aucune découverte, aucun relais, aucun Syncthing existant n'est approché.
 */
class TwoEnginesTest {
    @get:Rule val tmp = TemporaryFolder()

    private class Engine(val name: String, val binary: File, val root: File) {
        val guiPort = pickFreePort()
        val listenPort = pickFreePort()
        val apiKey = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val notes = File(root, "Neo Calendar").also { it.mkdirs() }
        val transport = LoopbackTransport(guiPort, apiKey)
        val api = SyncthingApi(transport)
        val setup = SyncSetup(api, notes.absolutePath)
        private var process: Process? = null

        fun start() {
            initNewWorkspace(FileWorkspaceStorage(notes))
            val builder = ProcessBuilder(binary.absolutePath, "serve", "--home=${File(root, "home").absolutePath}", "--no-browser", "--no-upgrade")
            builder.environment().apply {
                put("STGUIADDRESS", "127.0.0.1:$guiPort")
                put("STGUIAPIKEY", apiKey)
                put("STNORESTART", "1")
                put("STNOUPGRADE", "1")
            }
            builder.redirectErrorStream(true).redirectOutput(File(root, "engine.log"))
            process = builder.start()
            waitFor("le moteur $name répond", 60) { api.isHealthy() }
            // Le code de l'app, puis seulement ce qui isole le test d'Internet : ni découverte, ni relais, ni UPnP.
            setup.applyOptions(listenPort)
            transport.request(
                "PATCH", "/rest/config/options",
                """{"listenAddresses":["tcp://127.0.0.1:$listenPort"],"globalAnnounceEnabled":false,"relaysEnabled":false,"natEnabled":false,"localAnnounceEnabled":false}""",
            )
        }

        fun pointAt(other: Engine, otherId: String) {
            transport.request("PATCH", "/rest/config/devices/$otherId", """{"addresses":["tcp://127.0.0.1:${other.listenPort}"]}""")
        }

        fun stop() {
            runCatching { api.shutdown() }
            process?.let { if (!it.waitFor(10, java.util.concurrent.TimeUnit.SECONDS)) it.destroyForcibly() }
        }
    }

    private var a: Engine? = null
    private var b: Engine? = null

    @Before fun setUp() {
        val path = System.getProperty("syncthing.binary").orEmpty()
        assumeTrue("syncthing.binary non défini : test d'intégration ignoré", path.isNotEmpty() && File(path).isFile)
        a = Engine("A", File(path), tmp.newFolder("a")).also { it.start() }
        b = Engine("B", File(path), tmp.newFolder("b")).also { it.start() }
    }

    @After fun tearDown() {
        a?.stop(); b?.stop()
    }

    /** A ajoute B ; B voit la demande, l'accepte, adopte le dossier de A ; les deux sont connectés. Rend l'identifiant du dossier. */
    private fun pair(a: Engine, b: Engine): String {
        val idA = a.api.myId(); val idB = b.api.myId()
        // Un moteur neuf n'a AUCUN dossier : pas de « Default Folder ».
        assertEquals(emptyList<ConfiguredFolder>(), a.api.folders())
        assertEquals(emptyList<ConfiguredFolder>(), b.api.folders())
        a.setup.addDevice(idB.lowercase(), "B")
        a.pointAt(b, idB)
        waitFor("B voit la demande de A", 60) { b.api.pendingDevices().any { it.id == idA } }
        val pending = b.api.pendingDevices().single { it.id == idA }
        b.pointAt(a, idA)
        b.setup.acceptDevice(pending)
        val folderId = a.api.folders().single().id
        waitFor("B voit le dossier proposé par A", 90) { b.api.pendingFolders(idA).any { it.id == folderId } }
        val proposal = b.api.pendingFolders(idA).single { it.id == folderId }
        val decision = b.setup.decide(proposal)
        assertTrue(decision.toString(), decision is ProposalDecision.Replace || decision == ProposalDecision.Adopt)
        b.setup.adopt(proposal)
        assertEquals(folderId, b.api.folders().single().id)
        waitFor("A et B connectés", 90) { a.api.connections()[idB] == true && b.api.connections()[idA] == true }
        return folderId
    }

    private fun write(engine: Engine, path: String, text: String, modified: Long? = null) {
        val storage = FileWorkspaceStorage(engine.notes)
        val dir = path.substringBeforeLast('/', "")
        if (dir.isNotEmpty() && storage.list("").none { it.name == dir }) storage.createDirectory("", dir)
        if (storage.readText(path) == null) storage.createFile(dir, path.substringAfterLast('/'), "text/markdown")
        storage.writeText(path, text)
        modified?.let { File(engine.notes, path).setLastModified(it) }
    }

    @Test fun `appairage, partage et une note fait l'aller-retour, sans fichier parasite`() {
        val a = a!!; val b = b!!
        val folderId = pair(a, b)

        write(a, "Travail/rdv.md", "---\ntitle: Réunion\n---\nde A\n")
        a.api.scan(folderId)
        waitFor("la note de A arrive chez B", 120) { FileWorkspaceStorage(b.notes).readText("Travail/rdv.md") != null }
        assertEquals("---\ntitle: Réunion\n---\nde A\n", FileWorkspaceStorage(b.notes).readText("Travail/rdv.md"))

        write(b, "Travail/rdv.md", "---\ntitle: Réunion\n---\nde B\n")
        b.api.scan(folderId)
        waitFor("la réponse de B arrive chez A", 120) { FileWorkspaceStorage(a.notes).readText("Travail/rdv.md")?.endsWith("de B\n") == true }

        for (engine in listOf(a, b)) {
            val loaded = loadWorkspace(FileWorkspaceStorage(engine.notes))
            assertEquals(listOf("Travail/rdv.md"), loaded.eventFiles.map { it.relativePath })
            assertEquals(emptyList<String>(), conflictFiles(FileWorkspaceStorage(engine.notes)))
        }
    }

    @Test fun `une modification simultanee produit un conflit ignore au chargement`() {
        val a = a!!; val b = b!!
        val folderId = pair(a, b)
        val idA = a.api.myId(); val idB = b.api.myId()
        write(a, "Travail/rdv.md", "de depart\n")
        a.api.scan(folderId)
        waitFor("la note de départ arrive chez B", 120) { FileWorkspaceStorage(b.notes).readText("Travail/rdv.md") != null }

        // Les deux appareils se coupent l'un de l'autre, modifient la même note, puis se retrouvent.
        a.api.pauseDevice(idB); b.api.pauseDevice(idA)
        waitFor("coupés", 60) { a.api.connections()[idB] == false && b.api.connections()[idA] == false }
        val now = System.currentTimeMillis()
        write(a, "Travail/rdv.md", "version de A\n", now - 5_000)
        write(b, "Travail/rdv.md", "version de B\n", now)
        a.api.scan(folderId); b.api.scan(folderId)
        Thread.sleep(3_000)
        a.api.resumeDevice(idB); b.api.resumeDevice(idA)

        waitFor("un fichier de conflit apparaît", 180) {
            conflictFiles(FileWorkspaceStorage(a.notes)).isNotEmpty() || conflictFiles(FileWorkspaceStorage(b.notes)).isNotEmpty()
        }
        for (engine in listOf(a, b)) {
            val storage = FileWorkspaceStorage(engine.notes)
            val loaded = loadWorkspace(storage)
            // La note n'apparaît qu'une fois : la copie de conflit n'est jamais chargée.
            assertEquals(engine.name, listOf("Travail/rdv.md"), loaded.eventFiles.map { it.relativePath })
        }
        val total = conflictFiles(FileWorkspaceStorage(a.notes)).size + conflictFiles(FileWorkspaceStorage(b.notes)).size
        assertTrue("au moins un conflit compté", total >= 1)
    }
}

private fun waitFor(what: String, seconds: Int, check: () -> Boolean) {
    val end = System.nanoTime() + seconds * 1_000_000_000L
    var last: Throwable? = null
    while (System.nanoTime() < end) {
        try { if (check()) return } catch (e: Exception) { last = e }
        Thread.sleep(500)
    }
    throw AssertionError("Délai dépassé : $what" + (last?.let { " (dernière erreur : ${it.message})" } ?: ""))
}
```


Transmettre la variable d'environnement à la JVM de test :

```diff
--- a/core/build.gradle.kts
+++ b/core/build.gradle.kts
@@ -21,4 +21,6 @@
     systemProperty("conformance.dir", rootProject.file("../../../conformance").absolutePath)
     jvmArgs("-Duser.timezone=Europe/Paris")
+    // Le test d'intégration à deux moteurs ne tourne que si SYNCTHING_BINARY désigne un binaire Syncthing v2 de cette machine.
+    systemProperty("syncthing.binary", System.getenv("SYNCTHING_BINARY") ?: "")
     testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
 }
```


- [ ] **Step 2 : constater que, sans binaire, le test est ignoré et non rouge**

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
Remove-Item Env:SYNCTHING_BINARY -ErrorAction SilentlyContinue
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.TwoEnginesTest'
```

Attendu : `BUILD SUCCESSFUL` ; dans `core/build/test-results/test/TEST-com.ahmed.neocalendar.core.sync.TwoEnginesTest.xml` : `tests="2" skipped="2"`.

- [ ] **Step 3 : récupérer un binaire vérifié pour cette machine**

`fetch-test-binary.sh` télécharge Syncthing v2.1.5 (Linux amd64, ou Windows amd64 sous Git Bash), lit `sha256sum.txt.asc` (signé par la clé de release épinglée, statut machine `VALIDSIG` exigé) et compare le SHA-256 de l'archive :

```bash
#!/usr/bin/env bash
# Télécharge le Syncthing de la version épinglée pour CETTE machine (Linux amd64, ou Windows amd64 sous Git Bash) et le
# vérifie. Sert au test d'intégration à deux moteurs ; ce n'est PAS le binaire de l'APK (celui-là se compile :
# build-syncthing.sh).
#
#   fetch-test-binary.sh [dossier]      affiche le chemin du binaire sur la dernière ligne
#
# Vérification : sha256sum.txt.asc (signé par la clé de release épinglée) donne le SHA-256 de l'archive ; l'archive doit y
# correspondre. Même règle que build-syncthing.sh pour le code de sortie de gpg : on lit le statut machine.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version.env
source "$here/version.env"
die() { echo "ERREUR : $*" >&2; exit 1; }

case "$(uname -s)" in
  Linux*) platform=linux; ext=tar.gz; exe=syncthing ;;
  MINGW*|MSYS*|CYGWIN*) platform=windows; ext=zip; exe=syncthing.exe ;;
  *) die "système non pris en charge : $(uname -s)" ;;
esac
dest="${1:-$here/.work/$platform}"
mkdir -p "$dest"
cd "$dest"
base="https://github.com/syncthing/syncthing/releases/download/$SYNCTHING_VERSION"
name="syncthing-$platform-amd64-$SYNCTHING_VERSION"
archive="$name.$ext"
curl -fsSL -o "$archive" "$base/$archive"
curl -fsSL -o sha256sum.txt.asc "$base/sha256sum.txt.asc"

gnupg="$(mktemp -d)"; chmod 700 "$gnupg"
trap 'rm -rf "$gnupg"' EXIT
export GNUPGHOME="$gnupg"
gpg --batch --quiet --import "$here/release-key.asc" 2>/dev/null
gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr" {print $10}' | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "la clé de release.asc n'a pas l'empreinte épinglée"
gpg --batch --status-fd 3 --output sha256sum.txt --decrypt sha256sum.txt.asc 3>status.txt 2>/dev/null || true
if grep -q '^\[GNUPG:\] BADSIG' status.txt; then die "signature de sha256sum.txt INVALIDE"; fi
awk '$2=="VALIDSIG" {print $NF}' status.txt | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "aucune signature valide de la clé de release épinglée"
grep "  $archive\$" sha256sum.txt | sha256sum -c - >/dev/null || die "SHA-256 de $archive incorrect"

if [ "$ext" = zip ]; then
  unzip -o -j -q "$archive" "$name/$exe"
else
  tar -xzf "$archive" --strip-components=1 "$name/$exe"
fi
chmod +x "$exe"
echo "$dest/$exe"
```


```bash
cd /c/dev/neo-calendar
bash apps/android/native/syncthing/fetch-test-binary.sh
```

Attendu : une seule ligne affichée, le chemin `.../apps/android/native/syncthing/.work/windows/syncthing.exe` (dossier ignoré par git). Si `ERREUR : aucune signature valide...` : s'arrêter.

- [ ] **Step 4 : lancer le test d'intégration**

```powershell
$env:SYNCTHING_BINARY = "C:\dev\neo-calendar\apps\android\native\syncthing\.work\windows\syncthing.exe"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.TwoEnginesTest'
```

Attendu : `BUILD SUCCESSFUL` ; `tests="2" skipped="0" failures="0"`, `time` de l'ordre de 20 s. Pour voir le test échouer : remplacer temporairement, dans `SyncSetup.decide`/`adopt`, la décision `Replace` par `Refuse`, relancer (échec sur `assertTrue(decision.toString(), ...)`), puis `git checkout -- apps/android/native/core/src/main`.

- [ ] **Step 5 : CI, binaire de test Linux vérifié et noyau complet à chaque PR**

À la fin de `.github/workflows/pr-validation.yml`, ajouter le job (la validation des PR ne lançait aucun test Kotlin jusqu'ici) :

```yaml

    # Le noyau Kotlin et le test d'intégration à deux vrais Syncthing, configurés par le code de l'app.
    android-core:
        name: Noyau Android et synchronisation
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

            - uses: actions/setup-java@cf277c60eb25467037889841efdb72551f06f6c3 # v4.9.1
              with:
                  distribution: temurin
                  java-version: "17"

            - name: Réutiliser le cache Gradle
              uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
              with:
                  path: |
                      ~/.gradle/caches
                      ~/.gradle/wrapper
                  key: gradle-${{ runner.os }}-${{ github.run_id }}
                  restore-keys: gradle-${{ runner.os }}-

            # Le binaire Syncthing Linux de la version épinglée, vérifié par la signature de sha256sum.txt.asc.
            - name: Syncthing de test (Linux)
              id: syncthing
              run: echo "binary=$(bash apps/android/native/syncthing/fetch-test-binary.sh "$RUNNER_TEMP/syncthing")" >> "$GITHUB_OUTPUT"

            - name: Tester le noyau Kotlin (dont les deux moteurs)
              working-directory: apps/android/native
              env:
                  SYNCTHING_BINARY: ${{ steps.syncthing.outputs.binary }}
              run: ./gradlew --no-daemon :core:test
```


Ajouter deux tests à `scripts/syncthing-pins.test.mjs` (à la fin du fichier) :

```javascript

const fetchTest = await read(
    "apps/android/native/syncthing/fetch-test-binary.sh"
);

test("le binaire de test est vérifié comme le tarball", () => {
    assert.ok(fetchTest.includes("sha256sum -c"));
    assert.ok(fetchTest.includes("VALIDSIG"));
    assert.ok(fetchTest.includes("SYNCTHING_KEY_FINGERPRINT"));
});

test("la validation des PR lance le noyau Kotlin avec le test à deux moteurs", () => {
    assert.ok(validation.includes("android-core:"));
    assert.ok(validation.includes("fetch-test-binary.sh"));
    assert.ok(validation.includes("SYNCTHING_BINARY"));
    assert.ok(validation.includes(":core:test"));
});
```


```powershell
cd C:\dev\neo-calendar
node --test scripts/*.test.mjs
```

Attendu : tout passe, `syncthing-pins.test.mjs` à 9 tests. Les archives Linux (`syncthing-linux-amd64-v2.1.5.tar.gz`) et le contenu de `sha256sum.txt.asc` ont été vérifiés en préparant ce plan (ligne `3d222b609f7ab2944e02748cb10488b4160d446b49e0eafc107ef2a525ab3486` pour l'archive Linux, signature `VALIDSIG` de l'empreinte épinglée, chemin interne `syncthing-linux-amd64-v2.1.5/syncthing`) ; la CI elle-même n'a pas été exécutée.

- [ ] **Step 6 : suite complète du noyau**

```powershell
cd C:\dev\neo-calendar\apps\android\native
.\gradlew.bat :core:test
```

Attendu : `BUILD SUCCESSFUL` (avec `SYNCTHING_BINARY` posé, `TwoEnginesTest` tourne ; sans, il est ignoré).

- [ ] **Step 7 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native/core apps/android/native/syncthing/fetch-test-binary.sh scripts/syncthing-pins.test.mjs .github/workflows/pr-validation.yml
git commit -m @'
Test d'intégration : deux vrais Syncthing configurés par le code de l'app

Appairage avec demande entrante, adoption du dossier proposé, note qui fait l'aller-retour, modification simultanée : la copie de conflit n'est jamais chargée comme évènement. Ignoré sans SYNCTHING_BINARY ; en CI, binaire Linux vérifié par signature (validation des PR).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 6 : App, modes de stockage, première ouverture, lecture par vrai chemin

Une nouvelle installation s'ouvre directement sur la grille, dans le stockage privé (aucune question, aucune permission) ; une installation existante ne change pas ; le reste de l'app (écriture des notes, liens ICS, pièces jointes, fonds d'écran) fonctionne sur les deux stockages. Aucune synchro ici : le moteur arrive aux Tasks 7 à 9. C'est aussi ici que se prend la mesure « avant » du temps de lancement.

**Files:**
- Create: `core/.../workspace/StorageMode.kt`, test `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/StorageModeTest.kt`
- Create: `app/src/main/java/com/ahmed/neocalendar/nativeapp/WorkspaceLocation.kt`, `app/src/main/java/com/ahmed/neocalendar/WallpaperStore.kt`
- Delete: `app/src/main/java/com/ahmed/neocalendar/WallpaperStore.java` (remplacé par la version Kotlin, qui lit et écrit par le stockage du mode courant)
- Modify: `nativeapp/SafWorkspaceStorage.kt`, `nativeapp/NativeViewModel.kt`, `nativeapp/IcsSync.kt`, `nativeapp/ExternalOpen.kt`, `nativeapp/ui/EventSheet.kt`, `nativeapp/ui/SettingsScreen.kt`, `nativeapp/ui/NativeScreen.kt`, `app/src/main/res/xml/file_paths.xml`
- Créer (local, `.superpowers/` est ignoré par git, ne pas le commiter) : `.superpowers/syncthing/lancement.md` (mesures), captures `t6-*.png`

**Interfaces:**
- Consumes: `BinaryWorkspaceStorage`, `FileWorkspaceStorage`, `initNewWorkspace` (Task 1).
- Produces :
  - `enum class StorageMode { Integrated, External }`, `fun resolveStorageMode(storedMode: String?, treeUri: String?): StorageMode?` (noyau)
  - `object WorkspaceLocation` : `privateRoot(context): File`, `mode(context): StorageMode?`, `setMode(context, mode)`, `isNewInstall(context): Boolean`, `prepareNewInstall(context)` (hors fil principal, idempotent), `externalTreeUri(context, write): Uri`, `rememberTree(context, uri)`, `open(context, write): BinaryWorkspaceStorage`, `displayName(context): String`, `attachmentUri(context, relativePath): Uri?`
  - `NativeViewModel.attachmentUri(relativePath): Uri?` (remplace `attachmentStorage()`), `internal fun readWorkspaceData(storage: WorkspaceStorage): WorkspaceData` (lecture sans ViewModel, réutilisée Task 9)
  - `SafWorkspaceStorage : BinaryWorkspaceStorage` (`openInput`, `writeStream`, `Entry.lastModified`)

- [ ] **Step 1 : mesurer le temps de lancement AVANT (état 1.85, dossier SAF)**

Le dossier de travail contient déjà les Tasks 1 à 5 (noyau, build, test d'intégration) mais aucun changement de comportement de l'app. Pour une mesure propre, compiler le dernier commit d'avant ce plan (`4ca7dc3`) dans une copie jetable :

```powershell
cd C:\dev\neo-calendar
git worktree add C:\dev\neo-calendar-avant 4ca7dc3
Copy-Item apps\android\native\local.properties C:\dev\neo-calendar-avant\apps\android\native\local.properties
cd C:\dev\neo-calendar-avant\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat assembleDebug
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Attendu : `Success`. Si `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (autre clé de signature) : S'ARRÊTER et demander, ne pas désinstaller. L'émulateur est `Pixel_8` (celui d'Ahmed, avec son dossier SAF déjà choisi : ne pas y changer de dossier). Lancer l'app une fois à la main (la grille doit s'afficher), puis 6 démarrages à froid (le premier, à jeter, chauffe le disque) :

```powershell
1..6 | ForEach-Object {
  & $adb shell am force-stop com.ahmedmili.neocalendar
  Start-Sleep -Seconds 3
  & $adb shell am start -W -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity | Select-String "TotalTime|WaitTime"
}
& $adb logcat -d -s ActivityTaskManager:I | Select-String "Displayed com.ahmedmili.neocalendar"
```

Noter dans `.superpowers/syncthing/lancement.md` : les 5 derniers `TotalTime` et leur moyenne, les `Displayed`, la date, le commit, « dossier SAF, 1.85 ». Référence du 2026-10-01 : moyenne 2,16 s (TotalTime 2159, 2206, 2126, 2155 ms). Puis `cd C:\dev\neo-calendar; git worktree remove --force C:\dev\neo-calendar-avant`.

- [ ] **Step 1 bis : outils d'essai locaux pour piloter l'émulateur (non commités)**

Les tâches suivantes vérifient l'écran sans intervention d'Ahmed (captures lues avec l'outil Read, appuis par l'arbre d'accessibilité). Créer `C:\dev\neo-calendar\.superpowers\syncthing\adb-outils.ps1` (dossier ignoré par git) :

```powershell
# . C:\dev\neo-calendar\.superpowers\syncthing\adb-outils.ps1
$script:adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$script:pkg = "com.ahmedmili.neocalendar"

function Shot($name) { & $adb exec-out screencap -p > "C:\dev\neo-calendar\.superpowers\syncthing\$name.png" }

function Find-Node($text) {
    & $adb shell uiautomator dump /sdcard/ui.xml | Out-Null
    $xml = [xml]((& $adb exec-out cat /sdcard/ui.xml) -join "`n")
    $xml.SelectNodes("//node") | Where-Object { $_.text -eq $text -or $_.'content-desc' -eq $text } | Select-Object -First 1
}

function Tap-Text($text) {
    $n = Find-Node $text
    if (-not $n) { throw "introuvable à l'écran : $text" }
    $c = ($n.bounds -replace '\]\[', ',' -replace '[\[\]]', '') -split ','
    & $adb shell input tap ([int](([int]$c[0] + [int]$c[2]) / 2)) ([int](([int]$c[1] + [int]$c[3]) / 2))
    Start-Sleep -Milliseconds 700
}
```

Écrit en préparant ce plan sans émulateur sous la main : à ajuster si l'arbre d'accessibilité de Compose n'expose pas le texte voulu (lire alors `uiautomator dump` à la main, ou viser des coordonnées lues sur la capture).

- [ ] **Step 2 : écrire le test de la règle de mise à jour sans migration**

```kotlin
package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StorageModeTest {
    private val tree = "content://com.android.externalstorage.documents/tree/primary%3ANotes"

    @Test fun `une nouvelle installation n'a aucun mode`() {
        assertNull(resolveStorageMode(null, null))
        assertNull(resolveStorageMode(null, ""))
    }

    @Test fun `une installation d'avant, avec son dossier SAF, reste en dossier externe sans rien demander`() {
        assertEquals(StorageMode.External, resolveStorageMode(null, tree))
    }

    @Test fun `le mode ecrit l'emporte, dossier SAF memorise ou non`() {
        assertEquals(StorageMode.Integrated, resolveStorageMode("Integrated", tree))
        assertEquals(StorageMode.Integrated, resolveStorageMode("Integrated", null))
        assertEquals(StorageMode.External, resolveStorageMode("External", null))
    }

    @Test fun `un mode illisible retombe sur la regle du dossier SAF`() {
        assertEquals(StorageMode.External, resolveStorageMode("n'importe quoi", tree))
        assertNull(resolveStorageMode("n'importe quoi", null))
    }
}
```


```powershell
cd C:\dev\neo-calendar\apps\android\native
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.StorageModeTest'
```

Attendu : `FAILED`, `Unresolved reference 'resolveStorageMode'`.

- [ ] **Step 3 : implémenter la règle dans le noyau**

```kotlin
package com.ahmed.neocalendar.core.workspace

/** Où vivent les notes. Les deux modes sont exclusifs : jamais les deux à la fois sur une même copie. */
enum class StorageMode {
    /** Stockage privé de l'app (`filesDir/Neo Calendar`), synchronisé par le moteur embarqué. */
    Integrated,

    /** Dossier choisi par l'utilisateur (SAF), synchronisé par un autre outil. Le moteur ne démarre jamais. */
    External,
}

/**
 * Le mode courant d'après ce que l'app a mémorisé : le mode écrit s'il est reconnu ; sinon, un dossier SAF déjà choisi
 * (une installation d'avant ce mode) est `External` : rien n'est copié, déplacé ni demandé à la mise à jour ; sinon `null`,
 * c'est une nouvelle installation.
 */
fun resolveStorageMode(storedMode: String?, treeUri: String?): StorageMode? =
    StorageMode.entries.firstOrNull { it.name == storedMode }
        ?: if (!treeUri.isNullOrEmpty()) StorageMode.External else null
```


```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.StorageModeTest'
```

Attendu : `BUILD SUCCESSFUL`, 4 tests.

- [ ] **Step 4 : le dossier de notes courant dans l'app**

`WorkspaceLocation.kt` : tout ce que l'app sait du mode, du dossier privé, de l'ouverture du stockage (SAF ou vrai chemin), des pièces jointes (URI de `FileProvider` pour le stockage privé) :

```kotlin
package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.core.workspace.initNewWorkspace
import com.ahmed.neocalendar.core.workspace.resolveStorageMode
import java.io.File

/**
 * Le dossier de notes courant. Une installation d'avant ce mode (un dossier SAF déjà choisi, pas de mode
 * écrit) est `External` : rien n'est copié, déplacé ni demandé à la mise à jour (`resolveStorageMode`).
 */
object WorkspaceLocation {
    private const val PREFS = "neo_android"
    private const val KEY_TREE = "tree_uri"
    private const val KEY_MODE = "storage_mode"

    fun privateRoot(context: Context): File = File(context.filesDir, "Neo Calendar")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** `null` : rien de choisi, c'est une nouvelle installation. Ne touche pas au disque (appelable sur le fil principal). */
    fun mode(context: Context): StorageMode? {
        val p = prefs(context)
        return resolveStorageMode(p.getString(KEY_MODE, null), p.getString(KEY_TREE, null))
    }

    fun setMode(context: Context, mode: StorageMode) {
        prefs(context).edit().putString(KEY_MODE, mode.name).commit()
    }

    fun isNewInstall(context: Context): Boolean = mode(context) == null

    /**
     * Première ouverture d'une nouvelle installation : le dossier privé `Neo Calendar`, son marqueur et son
     * `.stignore`, puis le mode. Le mode est écrit EN DERNIER : une coupure au milieu recommence proprement.
     * Hors du fil principal. Sans effet quand un mode est déjà écrit (appelable à chaque lecture).
     */
    @Synchronized
    fun prepareNewInstall(context: Context) {
        if (!isNewInstall(context)) return
        val root = privateRoot(context)
        root.mkdirs()
        initNewWorkspace(FileWorkspaceStorage(root))
        setMode(context, StorageMode.Integrated)
    }

    /** Le dossier SAF choisi, avec les contrôles habituels (permission durable) ; `write` exige aussi l'autorisation d'écrire. */
    fun externalTreeUri(context: Context, write: Boolean): Uri {
        val raw = prefs(context).getString(KEY_TREE, "").orEmpty()
        if (raw.isEmpty()) throw Exception("Sélectionnez d'abord un dossier de notes.")
        val uri = Uri.parse(raw)
        val grants = context.contentResolver.persistedUriPermissions.filter { it.uri == uri }
        if (grants.none { it.isReadPermission }) throw Exception("L'autorisation du dossier a été révoquée. Sélectionnez-le à nouveau.")
        if (write && grants.none { it.isWritePermission }) {
            throw Exception("L'autorisation d'écrire dans le dossier a été révoquée. Sélectionnez-le à nouveau.")
        }
        return uri
    }

    fun rememberTree(context: Context, uri: Uri) {
        prefs(context).edit().putString(KEY_TREE, uri.toString()).commit()
    }

    /** Le stockage du dossier de notes, selon le mode. Lève une exception au message lisible si le dossier n'est pas utilisable. */
    fun open(context: Context, write: Boolean): BinaryWorkspaceStorage = when (mode(context)) {
        StorageMode.Integrated -> FileWorkspaceStorage(privateRoot(context))
        StorageMode.External -> SafWorkspaceStorage(context, externalTreeUri(context, write))
        null -> throw Exception("Sélectionnez d'abord un dossier de notes.")
    }

    /** Le nom du dossier pour les Réglages. */
    fun displayName(context: Context): String = when (mode(context)) {
        StorageMode.Integrated -> "Stockage privé de l'application"
        StorageMode.External -> {
            val raw = prefs(context).getString(KEY_TREE, "").orEmpty()
            runCatching {
                android.provider.DocumentsContract.getTreeDocumentId(Uri.parse(raw)).substringAfterLast(':').substringAfterLast('/')
            }.getOrDefault(raw)
        }
        null -> "Aucun"
    }

    /** Une pièce jointe à ouvrir dans une autre appli : un URI SAF, ou un URI de FileProvider pour le stockage privé. Null si elle n'existe pas. */
    fun attachmentUri(context: Context, relativePath: String): Uri? = when (mode(context)) {
        StorageMode.Integrated -> {
            val file = File(privateRoot(context), relativePath)
            val inside = file.canonicalPath.startsWith(privateRoot(context).canonicalPath + File.separator)
            if (inside && file.isFile) FileProvider.getUriForFile(context, "${context.packageName}.updates", file) else null
        }
        StorageMode.External -> (open(context, write = false) as SafWorkspaceStorage).uriOf(relativePath)
        null -> null
    }
}
```


`SafWorkspaceStorage` devient un `BinaryWorkspaceStorage` (lecture d'un flux, date de modification dans les listes) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/SafWorkspaceStorage.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/SafWorkspaceStorage.kt
@@ -4,6 +4,6 @@
 import android.net.Uri
 import android.provider.DocumentsContract
+import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
 import com.ahmed.neocalendar.core.workspace.WorkspaceStorage
-import com.ahmed.neocalendar.core.workspace.WritableWorkspaceStorage
 import java.io.IOException
 import java.util.Locale
@@ -15,13 +15,13 @@
  * fois, et toute écriture oublie ce qui avait été listé.
  */
-class SafWorkspaceStorage(private val context: Context, treeUri: Uri) : WritableWorkspaceStorage {
+class SafWorkspaceStorage(private val context: Context, treeUri: Uri) : BinaryWorkspaceStorage {
     private val root: Uri =
         DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
 
-    private class Doc(val uri: Uri, val name: String, val isDirectory: Boolean)
+    private class Doc(val uri: Uri, val name: String, val isDirectory: Boolean, val lastModified: Long)
 
     override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
         val dir = findPath(relativeDir) ?: return emptyList()
-        return children(dir).map { WorkspaceStorage.Entry(it.name, it.isDirectory) }
+        return children(dir).map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified) }
     }
 
@@ -32,4 +32,9 @@
             return String(input.readBytes(), Charsets.UTF_8)
         }
+    }
+
+    override fun openInput(relativePath: String): java.io.InputStream? {
+        val uri = findPath(relativePath) ?: return null
+        return context.contentResolver.openInputStream(uri) ?: throw IOException("Lecture impossible")
     }
 
@@ -47,5 +52,5 @@
 
     /** Écrit le contenu d'un flux dans un fichier déjà créé (une pièce jointe : des octets, pas du texte). */
-    fun writeStream(relativePath: String, input: java.io.InputStream) {
+    override fun writeStream(relativePath: String, input: java.io.InputStream) {
         val uri = findPath(relativePath) ?: throw IOException("Écriture impossible: $relativePath")
         context.contentResolver.openOutputStream(uri, "wt").use { out ->
@@ -107,4 +112,5 @@
             DocumentsContract.Document.COLUMN_DISPLAY_NAME,
             DocumentsContract.Document.COLUMN_MIME_TYPE,
+            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
         )
         context.contentResolver.query(uri, columns, null, null, null)?.use { c ->
@@ -114,4 +120,5 @@
                     c.getString(1),
                     c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR,
+                    if (c.isNull(3)) 0L else c.getLong(3),
                 )
             }
```


Le `FileProvider` existant (`${applicationId}.updates`) sert aussi les pièces jointes du stockage privé :

```diff
--- a/app/src/main/res/xml/file_paths.xml
+++ b/app/src/main/res/xml/file_paths.xml
@@ -2,3 +2,5 @@
 <paths xmlns:android="http://schemas.android.com/apk/res/android">
     <cache-path name="updates" path="updates/" />
+    <!-- Les pièces jointes du stockage privé, ouvertes dans une autre appli par un URI temporaire. -->
+    <files-path name="notes" path="Neo Calendar/" />
 </paths>
```


`NativeViewModel` : tout passe par `openStorage` (privé ou SAF), la première ouverture d'une nouvelle installation crée le dossier privé dans la lecture (hors du fil principal), la lecture du dossier devient une fonction sans ViewModel (`readWorkspaceData`, réutilisée Task 9) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
@@ -49,5 +49,8 @@
 import com.ahmed.neocalendar.core.holidays.holidaySourcesOf
 import com.ahmed.neocalendar.core.preferences.withSetting
+import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
+import com.ahmed.neocalendar.core.workspace.StorageMode
 import com.ahmed.neocalendar.core.workspace.EventWriter
+import com.ahmed.neocalendar.core.workspace.WorkspaceStorage
 import com.ahmed.neocalendar.core.workspace.createFolder
 import com.ahmed.neocalendar.core.workspace.deleteFolder
@@ -84,6 +87,4 @@
 const val WRITE_IGNORED = "\u0000write-ignored"
 
-private const val TREE_PREFS = "neo_android"
-private const val TREE_KEY = "tree_uri"
 private const val DEVICE_PREFS = "neo_native"
 private const val KEY_DAY_COUNT = "dayCount"
@@ -360,5 +361,5 @@
         withContext(Dispatchers.IO) {
             try {
-                updatePreferences(SafWorkspaceStorage(getApplication(), treeUri(write = true)), change)
+                updatePreferences(openStorage(write = true), change)
                 null
             } catch (e: kotlinx.coroutines.CancellationException) {
@@ -384,5 +385,5 @@
         app,
         viewModelScope,
-        { SafWorkspaceStorage(getApplication(), treeUri(write = true)) },
+        { openStorage(write = true) },
         ::writePreferences,
         { reload(force = true) },
@@ -423,8 +424,4 @@
     fun reload(force: Boolean = false) {
         if (importing) return
-        if (!hasTree()) {
-            _screen.value = ScreenState.NeedsFolder
-            return
-        }
         // Jamais pendant une écriture : l'écriture relit le dossier elle-même quand elle finit.
         if (!force && writeGate.isBusy) return
@@ -436,5 +433,9 @@
         loading = viewModelScope.launch {
             try {
-                val data = withContext(Dispatchers.IO) { read() }
+                // Nouvelle installation : le dossier privé est créé ici (hors du fil principal), puis lu comme les autres.
+                val data = withContext(Dispatchers.IO) {
+                    WorkspaceLocation.prepareNewInstall(getApplication())
+                    read()
+                }
                 // Les calendriers masqués sont ceux du fichier (le PC a pu en changer).
                 _hidden.value = data.hiddenCalendarIds
@@ -577,17 +578,6 @@
     }
 
-    /** Le dossier choisi, avec les contrôles habituels (permission durable) ; `write` exige aussi l'autorisation d'écrire. */
-    private fun treeUri(write: Boolean): Uri {
-        val context = getApplication<Application>()
-        val raw = context.getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty()
-        if (raw.isEmpty()) throw Exception("Sélectionnez d'abord un dossier de notes.")
-        val uri = Uri.parse(raw)
-        val grants = context.contentResolver.persistedUriPermissions.filter { it.uri == uri }
-        if (grants.none { it.isReadPermission }) throw Exception("L'autorisation du dossier a été révoquée. Sélectionnez-le à nouveau.")
-        if (write && grants.none { it.isWritePermission }) {
-            throw Exception("L'autorisation d'écrire dans le dossier a été révoquée. Sélectionnez-le à nouveau.")
-        }
-        return uri
-    }
+    /** Le stockage du dossier de notes selon le mode : privé (vrai chemin) ou SAF. Lève une exception au message lisible si inutilisable. */
+    private fun openStorage(write: Boolean): BinaryWorkspaceStorage = WorkspaceLocation.open(getApplication(), write)
 
     /**
@@ -603,5 +593,5 @@
 
     /** Rend le message de l'erreur, null quand l'écriture a réussi, [WRITE_IGNORED] quand une autre était en cours. */
-    private suspend fun write(block: (EventWriter, SafWorkspaceStorage) -> Unit): String? {
+    private suspend fun write(block: (EventWriter, BinaryWorkspaceStorage) -> Unit): String? {
         if (!writeGate.tryEnter()) return WRITE_IGNORED
         _writing.value = true
@@ -609,5 +599,5 @@
             val error = withContext(Dispatchers.IO) {
                 try {
-                    val storage = SafWorkspaceStorage(getApplication(), treeUri(write = true))
+                    val storage = openStorage(write = true)
                     block(EventWriter(storage), storage)
                     null
@@ -635,5 +625,5 @@
     class NoteWrite(val error: String?, val note: StoredEvent?)
 
-    private suspend fun writeNote(block: (EventWriter, SafWorkspaceStorage) -> com.ahmed.neocalendar.core.workspace.WrittenEvent): NoteWrite {
+    private suspend fun writeNote(block: (EventWriter, BinaryWorkspaceStorage) -> com.ahmed.neocalendar.core.workspace.WrittenEvent): NoteWrite {
         var written: com.ahmed.neocalendar.core.workspace.WrittenEvent? = null
         val error = write { writer, storage -> written = block(writer, storage) }
@@ -746,5 +736,6 @@
             return
         }
-        app.getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).edit().putString(TREE_KEY, uri.toString()).apply()
+        WorkspaceLocation.rememberTree(app, uri)
+        WorkspaceLocation.setMode(app, StorageMode.External)
         // L'export de l'ancienne app (s'il y en a un) est réappliqué avant la première lecture.
         importing = true
@@ -769,7 +760,4 @@
     @Volatile private var importing = false
 
-    private fun hasTree(): Boolean =
-        getApplication<Application>().getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty().isNotEmpty()
-
     // --- l'ancienne app ---------------------------------------------------------------------------
 
@@ -784,12 +772,6 @@
     }
 
-    /** Le nom du dossier de notes choisi, pour la ligne des Réglages. */
-    fun treeName(): String {
-        val raw = getApplication<Application>().getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty()
-        if (raw.isEmpty()) return "Aucun"
-        return runCatching {
-            android.provider.DocumentsContract.getTreeDocumentId(Uri.parse(raw)).substringAfterLast(':').substringAfterLast('/')
-        }.getOrDefault(raw)
-    }
+    /** Le nom du dossier de notes, pour la ligne des Réglages. */
+    fun treeName(): String = WorkspaceLocation.displayName(getApplication())
 
     /** Un fichier choisi, ce que `copyAttachment` de l'ancienne en fait : copié dans le dossier des pièces jointes à côté de la note. */
@@ -798,5 +780,5 @@
     suspend fun copyAttachment(eventRelativePath: String, source: Uri): CopiedAttachment = withContext(Dispatchers.IO) {
         val context = getApplication<Application>()
-        val storage = SafWorkspaceStorage(context, treeUri(write = true))
+        val storage = openStorage(write = true)
         val resolver = context.contentResolver
         val base = if ('/' in eventRelativePath) eventRelativePath.substringBeforeLast('/') else ""
@@ -812,56 +794,62 @@
     }
 
-    /** Pour ouvrir une pièce jointe : le dossier en lecture, sans rien écrire. */
-    fun attachmentStorage(): SafWorkspaceStorage? = runCatching { SafWorkspaceStorage(getApplication(), treeUri(write = false)) }.getOrNull()
-
-    /** Lit le dossier : permission durable contrôlée, puis le noyau fait le reste. */
-    private fun read(): WorkspaceData {
-        val context = getApplication<Application>()
-        val workspace = loadWorkspace(SafWorkspaceStorage(context, treeUri(write = false)))
-        // La lecture tolérante du noyau : un fichier étrange ne plante pas, il retombe sur les valeurs lues une à une.
-        val preferences = parseWorkspacePreferences(workspace.preferences)
-        val holidaySources = holidaySourcesOf(preferences)
-        val calendars = buildCalendarModels(workspace.calendars, preferences, AppLocale.current, holidaySources)
-        val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
-        val events = workspace.eventFiles.mapNotNull {
-            parseStoredEvent(EventFile(it.relativePath, it.calendarPath, it.fileName, it.contents), known)
-        }
-        val hiddenPaths = (preferences["hiddenCalendarPaths"] as? JsonArray).orEmpty()
-            .mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
-        fun flag(key: String, fallback: Boolean) =
-            (preferences[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: fallback
-        return WorkspaceData(
-            calendars = calendars,
-            events = events,
-            firstDay = (preferences["firstDay"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 1,
-            freeScroll = flag("freeScroll", false),
-            timeFormat24h = flag("timeFormat24h", true),
-            // Un calendrier de jours fériés se désigne par sa clé `auto::<id>`, qui est aussi son identifiant ; un dossier, par `local::<chemin>`.
-            hiddenCalendarIds = hiddenPaths.map { if (it.startsWith("auto::")) it else calendarIdFromPath(it) }.toSet(),
-            // Comme `CalendarApp.tsx` : le défaut choisi s'il est modifiable, sinon le premier calendrier modifiable (« Par défaut » est toujours quelque part).
-            defaultCalendarPath = (preferences["defaultCalendarPath"] as? JsonPrimitive)?.takeIf { it.isString }?.content
-                ?.takeIf { chosen -> calendars.any { it.editable && it.relativePath == chosen } }
-                ?: calendars.firstOrNull { it.editable }?.relativePath,
-            defaultEventsAsTasks = flag("defaultEventsAsTasks", false),
-            mapsApp = (preferences["mapsApp"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "ask",
-            mapsTravelMode = (preferences["mapsTravelMode"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "auto",
-            reminderMinutes = (preferences["reminderMinutes"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() },
-            calendarReminderMinutes = (preferences["calendarReminderMinutes"] as? JsonObject).orEmpty().mapValues { (_, list) ->
-                (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() }
-            },
-            icsLinks = icsLinksOf(preferences["icsFeeds"]),
-            icsDefaultMinutes = (preferences["icsDefaultRefreshMinutes"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 60,
-            holidays = holidaySources.flatMap { holidayDisplayEvents(it, LocalDate.now().year, zone) },
-            initialDesktop = ((preferences["initialView"] as? JsonObject)?.get("desktop") as? JsonPrimitive)?.content ?: "week",
-            initialMobile = ((preferences["initialView"] as? JsonObject)?.get("mobile") as? JsonPrimitive)?.content ?: "3days",
-            clickToCreateFromMonth = flag("clickToCreateEventFromMonthView", true),
-            secondaryTimezones = (preferences["secondaryTimezones"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content },
-            prayerMosques = (preferences["prayerMosques"] as? JsonObject).orEmpty().mapNotNull { (path, id) -> (id as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
-            prayerColors = (preferences["prayerColors"] as? JsonObject).orEmpty().mapNotNull { (path, hex) -> (hex as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
-            prayerJumua = (preferences["prayerJumua"] as? JsonObject).orEmpty().mapValues { (_, list) ->
-                (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
-            }.filterValues { it.isNotEmpty() },
-        )
-    }
+    /** Pour ouvrir une pièce jointe dans une autre appli : son URI (SAF, ou FileProvider pour le stockage privé), sans rien écrire. */
+    fun attachmentUri(relativePath: String): Uri? = runCatching { WorkspaceLocation.attachmentUri(getApplication(), relativePath) }.getOrNull()
+
+    /** Lit le dossier selon le mode (permission durable contrôlée pour le SAF), puis le noyau fait le reste. */
+    private fun read(): WorkspaceData = readWorkspaceData(openStorage(write = false))
 }
 
+/**
+ * Le dossier lu et prêt pour l'écran : les calendriers, les notes, les réglages. Sans ViewModel, pour que le
+ * rafraîchissement des rappels et du widget après une synchro reçue (app fermée) lise exactement la même chose.
+ */
+internal fun readWorkspaceData(storage: WorkspaceStorage): WorkspaceData {
+    val zone = ZoneId.systemDefault()
+    val workspace = loadWorkspace(storage)
+    // La lecture tolérante du noyau : un fichier étrange ne plante pas, il retombe sur les valeurs lues une à une.
+    val preferences = parseWorkspacePreferences(workspace.preferences)
+    val holidaySources = holidaySourcesOf(preferences)
+    val calendars = buildCalendarModels(workspace.calendars, preferences, AppLocale.current, holidaySources)
+    val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
+    val events = workspace.eventFiles.mapNotNull {
+        parseStoredEvent(EventFile(it.relativePath, it.calendarPath, it.fileName, it.contents), known)
+    }
+    val hiddenPaths = (preferences["hiddenCalendarPaths"] as? JsonArray).orEmpty()
+        .mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
+    fun flag(key: String, fallback: Boolean) =
+        (preferences[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: fallback
+    return WorkspaceData(
+        calendars = calendars,
+        events = events,
+        firstDay = (preferences["firstDay"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 1,
+        freeScroll = flag("freeScroll", false),
+        timeFormat24h = flag("timeFormat24h", true),
+        // Un calendrier de jours fériés se désigne par sa clé `auto::<id>`, qui est aussi son identifiant ; un dossier, par `local::<chemin>`.
+        hiddenCalendarIds = hiddenPaths.map { if (it.startsWith("auto::")) it else calendarIdFromPath(it) }.toSet(),
+        // Comme `CalendarApp.tsx` : le défaut choisi s'il est modifiable, sinon le premier calendrier modifiable (« Par défaut » est toujours quelque part).
+        defaultCalendarPath = (preferences["defaultCalendarPath"] as? JsonPrimitive)?.takeIf { it.isString }?.content
+            ?.takeIf { chosen -> calendars.any { it.editable && it.relativePath == chosen } }
+            ?: calendars.firstOrNull { it.editable }?.relativePath,
+        defaultEventsAsTasks = flag("defaultEventsAsTasks", false),
+        mapsApp = (preferences["mapsApp"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "ask",
+        mapsTravelMode = (preferences["mapsTravelMode"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "auto",
+        reminderMinutes = (preferences["reminderMinutes"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() },
+        calendarReminderMinutes = (preferences["calendarReminderMinutes"] as? JsonObject).orEmpty().mapValues { (_, list) ->
+            (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() }
+        },
+        icsLinks = icsLinksOf(preferences["icsFeeds"]),
+        icsDefaultMinutes = (preferences["icsDefaultRefreshMinutes"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 60,
+        holidays = holidaySources.flatMap { holidayDisplayEvents(it, LocalDate.now().year, zone) },
+        initialDesktop = ((preferences["initialView"] as? JsonObject)?.get("desktop") as? JsonPrimitive)?.content ?: "week",
+        initialMobile = ((preferences["initialView"] as? JsonObject)?.get("mobile") as? JsonPrimitive)?.content ?: "3days",
+        clickToCreateFromMonth = flag("clickToCreateEventFromMonthView", true),
+        secondaryTimezones = (preferences["secondaryTimezones"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content },
+        prayerMosques = (preferences["prayerMosques"] as? JsonObject).orEmpty().mapNotNull { (path, id) -> (id as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
+        prayerColors = (preferences["prayerColors"] as? JsonObject).orEmpty().mapNotNull { (path, hex) -> (hex as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
+        prayerJumua = (preferences["prayerJumua"] as? JsonObject).orEmpty().mapValues { (_, list) ->
+            (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
+        }.filterValues { it.isNotEmpty() },
+    )
+}
+
```


`IcsSync`, `ExternalOpen`, `EventSheet` (les pièces jointes s'ouvrent par un URI) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/IcsSync.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/IcsSync.kt
@@ -100,5 +100,5 @@
     private val scope: CoroutineScope,
     /** Le dossier de notes, avec l'autorisation d'écrire (lève si elle est révoquée). */
-    private val storage: () -> SafWorkspaceStorage,
+    private val storage: () -> com.ahmed.neocalendar.core.workspace.WritableWorkspaceStorage,
     /** L'écriture sûre des préférences ; rend le message d'erreur, ou null. */
     private val updatePreferences: suspend ((JsonObject) -> JsonObject) -> String?,
```


```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ExternalOpen.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ExternalOpen.kt
@@ -87,9 +87,9 @@
 
     /** Une pièce jointe : son chemin depuis le dossier de notes (`attachmentPathFor`), ouverte par l'application qui sait la lire. */
-    suspend fun openAttachment(context: Context, storage: SafWorkspaceStorage?, eventRelativePath: String, target: String) {
+    suspend fun openAttachment(context: Context, uriOf: (String) -> Uri?, eventRelativePath: String, target: String) {
         val written = runCatching { Uri.decode(target) }.getOrDefault(target)
         val path = attachmentPathFor(eventRelativePath, written)
         // Retrouver le fichier interroge le dossier : hors du fil principal.
-        val uri = withContext(Dispatchers.IO) { runCatching { storage?.uriOf(path) }.getOrNull() }
+        val uri = withContext(Dispatchers.IO) { runCatching { uriOf(path) }.getOrNull() }
             ?: return toast(context, "Fichier introuvable : $path")
         val extension = MimeTypeMap.getFileExtensionFromUrl(path.replace(" ", "_")).lowercase(Locale.ROOT)
```


```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/EventSheet.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/EventSheet.kt
@@ -508,5 +508,5 @@
                     } else {
                         scope.launch {
-                            ExternalOpen.openAttachment(context, viewModel.attachmentStorage(), stored?.relativePath.orEmpty(), targetPath)
+                            ExternalOpen.openAttachment(context, viewModel::attachmentUri, stored?.relativePath.orEmpty(), targetPath)
                         }
                     }
```


Réglages : le dossier privé n'a pas de « Changer de dossier » (les gestes de bascule arrivent Task 11) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SettingsScreen.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SettingsScreen.kt
@@ -128,4 +128,6 @@
     val onPickFolder: () -> Unit,
     val folderName: String,
+    /** Les notes sont dans le stockage privé (synchronisation intégrée) : pas de « Changer de dossier ». */
+    val integratedStorage: Boolean = false,
     val oldAppInstalled: Boolean = false,
     val onUninstallOldApp: () -> Unit = {},
@@ -491,4 +493,10 @@
 @Composable
 private fun FolderPage(actions: SettingsActions) {
+    if (actions.integratedStorage) {
+        Group(null, note = "Vos notes sont dans le stockage privé de Neo Calendar, que les autres applications ne peuvent pas lire.\nElles se synchronisent avec la synchronisation intégrée (Réglages, Synchronisation).") {
+            text(actions.folderName)
+        }
+        return
+    }
     Group(null, note = "Neo Calendar range ses fichiers de calendrier dans ce dossier. Chaque sous-dossier direct est un calendrier.") {
         text(actions.folderName)
```


```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt
@@ -84,4 +84,6 @@
 import com.ahmed.neocalendar.nativeapp.NativeViewModel
 import com.ahmed.neocalendar.nativeapp.ScreenState
+import com.ahmed.neocalendar.core.workspace.StorageMode
+import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
 import com.ahmed.neocalendar.nativeapp.uninstallOldApp
 import com.ahmed.neocalendar.nativeapp.WRITE_IGNORED
@@ -717,4 +719,5 @@
                         onPickFolder = { pickTree.launch(Unit) },
                         folderName = viewModel.treeName(),
+                        integratedStorage = WorkspaceLocation.mode(context) == StorageMode.Integrated,
                         oldAppInstalled = oldAppInstalled,
                         onUninstallOldApp = { uninstallOldApp(context) },
```


- [ ] **Step 5 : les fonds d'écran sur les deux stockages (Java vers Kotlin)**

`WallpaperStore.java` lisait et écrivait par `DocumentsContract` seulement : avec le stockage privé, plus aucun fond n'aurait été trouvé ni téléchargé. Même API publique (`open`, `installed`, `installedWithDates`, `download`), mêmes messages d'erreur, en Kotlin sur `BinaryWorkspaceStorage` :

```kotlin
package com.ahmed.neocalendar

import android.content.Context
import android.util.Log
import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

/**
 * Les fonds d'écran, dans `.neo-calendar/wallpapers/` du dossier de notes plutôt que dans l'APK (dix mégaoctets
 * de photos représentaient 72 % de chaque mise à jour). Ce dossier appartient à l'utilisateur : il survit à la
 * désinstallation (dossier externe) et voyage avec la synchro. Fonctionne sur les deux stockages (privé ou SAF).
 *
 * Un fond est téléchargé quand il est CHOISI, jamais en lot. Son empreinte est vérifiée avant qu'il ne soit
 * publié sous son vrai nom : un octet de travers et rien n'est écrit.
 */
class WallpaperStore(private val context: Context) {
    private companion object {
        const val TAG = "NeoCalendarWallpaper"
        const val FOLDER = ".neo-calendar"
        const val SUBFOLDER = "wallpapers"
        const val DIR = "$FOLDER/$SUBFOLDER"
        const val MIME = "image/jpeg"
        const val MAX_BYTES = 40L * 1024L * 1024L
    }

    private fun readable(): BinaryWorkspaceStorage? = try {
        WorkspaceLocation.open(context, write = false)
    } catch (e: Exception) {
        Log.w(TAG, "Dossier de notes inutilisable", e)
        null
    }

    /** Le flux d'un fond déjà téléchargé, ou null. */
    fun open(name: String): InputStream? = try {
        readable()?.openInput("$DIR/$name")
    } catch (e: Exception) {
        Log.w(TAG, "Ouverture de $name impossible", e)
        null
    }

    /** Les noms déjà présents, pour que le sélecteur sache quoi marquer. */
    fun installed(): List<String> = try {
        readable()?.list(DIR)?.filter { !it.isDirectory }?.map { it.name }.orEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Listage impossible", e)
        emptyList()
    }

    /** Les fonds déjà présents avec leur date de modification (ms) : {nom, date, nom, date...}. Sert à reprendre le dernier téléchargé. */
    fun installedWithDates(): List<Any> = try {
        readable()?.list(DIR)?.filter { !it.isDirectory }?.flatMap { listOf<Any>(it.name, it.lastModified) }.orEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Listage impossible", e)
        emptyList()
    }

    /** Télécharge UN fond et l'écrit dans le dossier. Lève [IOException] dont le message dit quoi : no-folder, name, checksum, create, http-NNN, too-large. */
    @Throws(IOException::class)
    fun download(name: String, url: String, sha256: String?) {
        if (name.isEmpty() || name.contains('/') || name.contains('\\') || name == "..") throw IOException("name")
        val storage = try {
            WorkspaceLocation.open(context, write = true)
        } catch (e: Exception) {
            throw IOException("no-folder")
        }
        val body = fetch(url)
        val actual = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
        if (!sha256.isNullOrEmpty() && !actual.equals(sha256, ignoreCase = true)) throw IOException("checksum")
        if (storage.list("").none { it.name == FOLDER }) storage.createDirectory("", FOLDER)
        if (storage.list(FOLDER).none { it.name == SUBFOLDER }) storage.createDirectory(FOLDER, SUBFOLDER)
        // Un fichier du même nom est remplacé : re-télécharger doit réparer, pas empiler des « image (1).jpg ».
        if (storage.list(DIR).any { it.name == name }) runCatching { storage.delete("$DIR/$name") }
        val created = try {
            storage.createFile(DIR, name, MIME)
        } catch (e: IOException) {
            throw IOException("create")
        }
        storage.writeStream(created, ByteArrayInputStream(body))
    }

    private fun fetch(url: String): ByteArray {
        val connection = URL(url).openConnection() as HttpsURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 45_000
        connection.instanceFollowRedirects = true
        try {
            val status = connection.responseCode
            if (status != HttpURLConnection.HTTP_OK) throw IOException("http-$status")
            connection.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(32 * 1024)
                var total = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count == -1) break
                    total += count
                    if (total > MAX_BYTES) throw IOException("too-large")
                    out.write(buffer, 0, count)
                }
                return out.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }
}
```


```powershell
git rm apps/android/native/app/src/main/java/com/ahmed/neocalendar/WallpaperStore.java
```

- [ ] **Step 6 : tout compiler et tester**

```powershell
cd C:\dev\neo-calendar\apps\android\native
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`. En cas d'erreur de compilation sur `StorageMode` : l'import à ajouter est `com.ahmed.neocalendar.core.workspace.StorageMode` (le diff de `NativeViewModel` et de `NativeScreen` l'ajoute ; `NativeActivity` en a besoin à la Task 8).

- [ ] **Step 7 : vérifier sur l'émulateur, mise à jour d'une installation existante (Pixel_8)**

Sauvegarder l'état, installer par-dessus (`-r`), lancer :

```powershell
& $adb shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_android.xml > C:\dev\neo-calendar\.superpowers\syncthing\neo_android.avant.xml
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 4
& $adb exec-out screencap -p > C:\dev\neo-calendar\.superpowers\syncthing\t6-maj.png
& $adb shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_android.xml
```

Lire la capture (outil Read) : attendu, la grille avec les notes habituelles, AUCUN écran « choisir un dossier ». `neo_android.xml` : la clé `tree_uri` d'avant, AUCUNE clé `storage_mode`. Réglages, Dossier de données : « Changer de dossier » est toujours là avec le nom du dossier SAF. Les fonds d'écran sont toujours là (le fond de la grille). Noter dans le rapport : « mise à jour : rien ne change ».

- [ ] **Step 8 : vérifier sur un émulateur neuf, première installation**

Ne pas toucher à `Pixel_8`. Créer un second AVD d'essai à partir de la même image système (l'identifiant se lit avec `sdkmanager --list_installed` ; essais du 2026-10-01 : Android 17, SDK 37.1, x86_64, page de 16 Ko) :

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
"no" | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n Pixel_8_Sync -k "system-images;android-37.1;google_apis_playstore_ps16k;x86_64" -d pixel_8
powershell -File C:\dev\neo-calendar\scripts\launch-android-emulator.ps1 -Avd Pixel_8_Sync
& $adb devices
& $adb install app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 5
& $adb exec-out screencap -p > C:\dev\neo-calendar\.superpowers\syncthing\t6-neuve.png
& $adb shell run-as com.ahmedmili.neocalendar ls -a "files/Neo Calendar"
& $adb shell run-as com.ahmedmili.neocalendar cat "files/Neo Calendar/.stignore"
& $adb shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_android.xml
```

Attendu : la grille vide (premier lancement) s'affiche sans question et sans demande de permission autre que les notifications ; `ls` montre `.neo-calendar` et `.stignore` ; `.stignore` contient `.neo-tmp-*` ; `neo_android.xml` contient `storage_mode` = `Integrated`. Créer une note par l'écran (calendrier `Essai Compose`, à créer par « Ajouter un calendrier » : jamais dans un autre), puis :

```powershell
& $adb shell run-as com.ahmedmili.neocalendar find "files/Neo Calendar" -type f
```

Attendu : la note existe sous `Essai Compose/`, aucun fichier `.neo-tmp-*` ne traîne. Relancer l'app : la note est relue. Ouvrir Réglages, Dossier de données : texte « stockage privé », pas de « Changer de dossier ». Ouvrir une pièce jointe (ajouter un fichier à une note puis l'ouvrir) : l'autre application s'ouvre (URI `FileProvider`). Télécharger un fond d'écran (Réglages, Apparence) : il apparaît dans `files/Neo Calendar/.neo-calendar/wallpapers/`.

- [ ] **Step 9 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
App : stockage privé pour les nouvelles installations, lecture par vrai chemin, rien ne change pour les autres

Une nouvelle installation crée le dossier privé Neo Calendar (marqueur et .stignore) et s'ouvre directement sur la grille ; un dossier SAF déjà choisi reste le stockage, sans migration. Écriture des notes, liens ICS, pièces jointes (FileProvider) et fonds d'écran (WallpaperStore passé en Kotlin) fonctionnent sur les deux stockages.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 7 : App, `SyncEngine` (processus, socket Unix, supervision, journal)

Le moteur comme un objet Kotlin : il lance le processus Syncthing depuis `nativeLibraryDir`, parle à son interface REST par socket Unix, le relance avec un délai croissant, l'arrête proprement, garde sa sortie dans un journal tournant de 1 Mo. Rien ne l'appelle encore (le chef d'orchestre arrive Task 8) : cette tâche se vérifie par les tests du noyau et la compilation ; sa preuve sur appareil est faite à la Task 8. Tâche à risque (IPC) : une revue sonnet, centrée sur : dossier d'état en 700, clé d'API tirée au hasard et seulement en mémoire, `STNORESTART=1`, aucun secret dans le journal.

**Files:**
- Create: `core/.../sync/Supervision.kt`, `core/.../sync/RotatingLog.kt`
- Test: `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/SupervisionTest.kt`
- Create: `app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/UnixSocketFactory.kt`, `OkHttpTransport.kt`, `SyncEngine.kt`
- Modify: `apps/android/native/app/build.gradle.kts` (OkHttp)

**Interfaces:**
- Consumes: `SyncthingApi`, `HttpTransport`, `HttpResult` (Task 3).
- Produces :
  - `sealed interface EngineState { Stopped; Missing; Starting; Running; Backoff(attempt: Int, retryInMs: Long, error: String); Failed(error: String) }`
  - `class RestartPolicy(maxFailures = 5, baseMs = 2_000, capMs = 300_000, stableAfterMs = 60_000)` : `onExit(ranMs: Long): Decision` (`RetryIn(delayMs, attempt)` ou `GiveUp`), `reset()`
  - `class RotatingLog(dir: File, maxBytes: Long = 1_048_576)` : `write(bytes, length)`, `close()`, `readAll(): String` (synchronisés)
  - `class UnixSocketFactory(path: String) : SocketFactory`, `class OkHttpTransport(socketPath: String, apiKey: String) : HttpTransport`
  - `class SyncEngine(context: Context, scope: CoroutineScope)` : `val state: StateFlow<EngineState>`, `val api: SyncthingApi?` (null tant que le moteur ne répond pas), `var onReady: (suspend (SyncthingApi) -> Unit)?`, `var beforeLaunch: (() -> Unit)?`, `fun start()`, `suspend fun stop()`, `fun logText(): String`, `fun note(line: String)`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.sync

import com.ahmed.neocalendar.core.sync.RestartPolicy.Decision
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SupervisionTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `les relances doublent de 2 s a 16 s puis on abandonne au cinquieme echec`() {
        val p = RestartPolicy()
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(500))
        assertEquals(Decision.RetryIn(4_000, 2), p.onExit(500))
        assertEquals(Decision.RetryIn(8_000, 3), p.onExit(500))
        assertEquals(Decision.RetryIn(16_000, 4), p.onExit(500))
        assertEquals(Decision.GiveUp, p.onExit(500))
    }

    @Test fun `le delai est plafonne a 5 minutes`() {
        val p = RestartPolicy(maxFailures = 50)
        var last = 0L
        repeat(20) { last = (p.onExit(100) as Decision.RetryIn).delayMs }
        assertEquals(300_000, last)
    }

    @Test fun `une execution stable d'une minute remet le compteur a zero`() {
        val p = RestartPolicy()
        p.onExit(100); p.onExit(100); p.onExit(100)
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(61_000))
    }

    @Test fun `reset apres une action de l'utilisateur`() {
        val p = RestartPolicy()
        repeat(4) { p.onExit(100) }
        p.reset()
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(100))
    }

    @Test fun `le journal garde tout ce qui est ecrit tant qu'il est petit`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write("une\n".toByteArray()); log.write("deux\n".toByteArray())
        assertEquals("une\ndeux\n", log.readAll())
    }

    @Test fun `le journal ne depasse jamais sa taille et garde le plus recent`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        repeat(100) { log.write("ligne %03d ........\n".format(it).toByteArray()) }
        log.close()
        val total = File(tmp.root, "engine.log").length() + File(tmp.root, "engine.log.1").length()
        assertTrue("total $total", total <= 1000)
        assertTrue(log.readAll().endsWith("ligne 099 ........\n"))
        assertTrue(!log.readAll().contains("ligne 000"))
    }

    @Test fun `un morceau plus gros que la moitie du plafond est tronque a sa fin`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write(ByteArray(3000) { 'a'.code.toByte() } + "FIN".toByteArray())
        assertTrue(File(tmp.root, "engine.log").length() <= 500)
        assertTrue(log.readAll().endsWith("FIN"))
    }

    @Test fun `un journal existant est repris et non ecrase`() {
        File(tmp.root, "engine.log").writeText("avant\n")
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write("apres\n".toByteArray())
        assertEquals("avant\napres\n", log.readAll())
    }
}
```


```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.SupervisionTest'
```

Attendu : `FAILED`, `Unresolved reference 'RestartPolicy'`, `'RotatingLog'`.

- [ ] **Step 2 : implémenter la politique de relance et le journal**

```kotlin
package com.ahmed.neocalendar.core.sync

/** Où en est le processus Syncthing. */
sealed interface EngineState {
    /** Pas lancé (ou arrêté proprement). */
    data object Stopped : EngineState

    /** Le binaire n'est pas dans l'APK (compilation locale sans `jniLibs`). */
    data object Missing : EngineState

    data object Starting : EngineState
    data object Running : EngineState

    /** S'est arrêté de lui-même : une relance est programmée. */
    data class Backoff(val attempt: Int, val retryInMs: Long, val error: String) : EngineState

    /** Trop d'échecs de suite : plus de relance automatique jusqu'à une action de l'utilisateur. */
    data class Failed(val error: String) : EngineState
}

/**
 * Quand relancer le moteur qui s'est arrêté seul : 2 s, 4 s, 8 s… plafonné à 5 min, et après
 * `maxFailures` échecs de suite (5) plus de relance. Une exécution d'au moins `stableAfterMs` (1 min)
 * remet le compteur à zéro. Un arrêt demandé par l'app n'est pas un échec : il ne passe pas ici.
 */
class RestartPolicy(
    private val maxFailures: Int = 5,
    private val baseMs: Long = 2_000,
    private val capMs: Long = 300_000,
    private val stableAfterMs: Long = 60_000,
) {
    sealed interface Decision {
        data class RetryIn(val delayMs: Long, val attempt: Int) : Decision
        data object GiveUp : Decision
    }

    private var failures = 0

    fun onExit(ranMs: Long): Decision {
        if (ranMs >= stableAfterMs) failures = 0
        failures++
        if (failures >= maxFailures) return Decision.GiveUp
        val delay = minOf(capMs, baseMs shl (failures - 1))
        return Decision.RetryIn(delay, failures)
    }

    /** Action de l'utilisateur (« Réessayer », mise en route manuelle) : on repart de zéro. */
    fun reset() { failures = 0 }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Le journal du moteur (sa sortie standard) : deux fichiers, `engine.log` et `engine.log.1`, qui ne
 * dépassent jamais `maxBytes` à eux deux (1 Mo). Quand le fichier courant atteint la moitié, il devient
 * `engine.log.1` (l'ancien `.1` disparaît). Les méthodes publiques sont synchronisées : le fil qui lit la sortie du
 * processus et celui qui note les erreurs de l'app écrivent sans se marcher dessus.
 */
class RotatingLog(private val dir: File, private val maxBytes: Long = 1_048_576) {
    private val current = File(dir, "engine.log")
    private val previous = File(dir, "engine.log.1")
    private var out: OutputStream? = null
    private var size = 0L

    private fun open() {
        dir.mkdirs()
        size = if (current.exists()) current.length() else 0L
        out = FileOutputStream(current, true)
    }

    @Synchronized
    fun write(bytes: ByteArray, length: Int = bytes.size) {
        if (out == null) open()
        // Un seul morceau plus gros que la moitié du plafond : on n'en garde que la fin.
        val half = (maxBytes / 2).toInt()
        val keep = minOf(length, half)
        if (size + keep > half) rotate()
        out!!.write(bytes, length - keep, keep)
        out!!.flush()
        size += keep
    }

    private fun rotate() {
        out?.close()
        out = null
        previous.delete()
        current.renameTo(previous)
        open()
    }

    @Synchronized
    fun close() {
        out?.close()
        out = null
    }

    /** Tout le journal, le plus ancien d'abord (pour l'afficher ou le partager). */
    @Synchronized
    fun readAll(): String {
        val old = if (previous.exists()) previous.readText(Charsets.UTF_8) else ""
        val now = if (current.exists()) current.readText(Charsets.UTF_8) else ""
        return old + now
    }
}
```


```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.SupervisionTest'
```

Attendu : `BUILD SUCCESSFUL`, 8 tests (relances 2 s, 4 s, 8 s, 16 s puis abandon au cinquième échec ; plafond de 5 minutes ; remise à zéro après une minute de marche ; journal qui ne dépasse jamais sa taille).

- [ ] **Step 3 : le client de l'interface REST par socket Unix**

OkHttp 4.12.0 (essai du 2026-10-01 : `[OkHttp] http/1.1 200`, connexion réutilisée) :

```diff
--- a/app/build.gradle.kts
+++ b/app/build.gradle.kts
@@ -76,4 +76,6 @@
  implementation("androidx.activity:activity-compose:1.13.0")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
+ // Client HTTP de l'interface REST du moteur (socket Unix, voir sync/UnixSocketFactory.kt).
+ implementation("com.squareup.okhttp3:okhttp:4.12.0")
 }
 
```


`UnixSocketFactory.kt` (les trois pièges de l'essai sont traités et commentés dans le code) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.net.LocalSocket
import android.net.LocalSocketAddress
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketAddress
import java.net.SocketException
import javax.net.SocketFactory

/**
 * Pour qu'OkHttp parle à l'interface REST de Syncthing par socket Unix (`filesDir/syncthing/gui.sock`,
 * inaccessible aux autres apps : le dossier parent est en 700). Adresse HTTP `http://localhost/...`,
 * résolveur qui rend 127.0.0.1, et cette fabrique qui ignore l'hôte et le port.
 */
class UnixSocketFactory(private val path: String) : SocketFactory() {
    override fun createSocket(): Socket = UnixSocket(path)
    override fun createSocket(host: String?, port: Int): Socket = UnixSocket(path)
    override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket = UnixSocket(path)
    override fun createSocket(host: InetAddress?, port: Int): Socket = UnixSocket(path)
    override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket = UnixSocket(path)
}

/**
 * Un `java.net.Socket` posé sur un `LocalSocket`. Les trois pièges relevés à l'essai (2026-10-01) :
 * OkHttp règle `setSoTimeout` AVANT `connect` (LocalSocket lève « socket not created » : la valeur est mémorisée puis
 * appliquée après la connexion) ; `isInputShutdown` / `isOutputShutdown` lèvent sur LocalSocket (drapeaux maison) ;
 * `setTcpNoDelay` et `setKeepAlive` n'ont pas de sens (ignorés), `getRemoteSocketAddress` doit répondre.
 */
private class UnixSocket(private val path: String) : Socket() {
    private var local: LocalSocket? = null
    private var timeoutMs = 0
    private var connected = false
    private var closed = false
    private var inputShutdown = false
    private var outputShutdown = false

    override fun connect(endpoint: SocketAddress?, timeout: Int) {
        val socket = LocalSocket()
        try {
            socket.connect(LocalSocketAddress(path, LocalSocketAddress.Namespace.FILESYSTEM))
            socket.soTimeout = timeoutMs
        } catch (e: IOException) {
            socket.close()
            throw e
        }
        local = socket
        connected = true
    }

    override fun connect(endpoint: SocketAddress?) = connect(endpoint, 0)

    override fun getInputStream(): InputStream = local?.inputStream ?: throw SocketException("Socket is not connected")

    override fun getOutputStream(): OutputStream = local?.outputStream ?: throw SocketException("Socket is not connected")

    override fun setSoTimeout(timeout: Int) {
        timeoutMs = timeout
        local?.soTimeout = timeout
    }

    override fun getSoTimeout(): Int = timeoutMs

    override fun isConnected(): Boolean = connected
    override fun isBound(): Boolean = connected
    override fun isClosed(): Boolean = closed
    override fun isInputShutdown(): Boolean = inputShutdown
    override fun isOutputShutdown(): Boolean = outputShutdown

    override fun shutdownInput() {
        inputShutdown = true
        local?.shutdownInput()
    }

    override fun shutdownOutput() {
        outputShutdown = true
        local?.shutdownOutput()
    }

    override fun close() {
        closed = true
        local?.close()
    }

    override fun setTcpNoDelay(on: Boolean) = Unit
    override fun getTcpNoDelay(): Boolean = false
    override fun setKeepAlive(on: Boolean) = Unit
    override fun getKeepAlive(): Boolean = false
    override fun getInetAddress(): InetAddress = InetAddress.getLoopbackAddress()
    override fun getPort(): Int = 80
    override fun getRemoteSocketAddress(): SocketAddress = InetSocketAddress(InetAddress.getLoopbackAddress(), 80)
}
```


`OkHttpTransport.kt` (URL `http://localhost`, `Dns` vers 127.0.0.1, clé `X-API-Key`, délai de lecture par requête pour la longue requête `/rest/events`) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import com.ahmed.neocalendar.core.sync.HttpResult
import com.ahmed.neocalendar.core.sync.HttpTransport
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** L'interface REST du moteur par OkHttp sur socket Unix ; la clé d'API (`X-API-Key`) est exigée par Syncthing hors `/rest/noauth/`. */
class OkHttpTransport(socketPath: String, private val apiKey: String) : HttpTransport {
    private val client = OkHttpClient.Builder()
        .socketFactory(UnixSocketFactory(socketPath))
        .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> = listOf(InetAddress.getByAddress("localhost", byteArrayOf(127, 0, 0, 1)))
        })
        .connectTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        val needsBody = method == "POST" || method == "PUT" || method == "PATCH"
        val requestBody = when {
            body != null -> body.toRequestBody(JSON)
            needsBody -> ByteArray(0).toRequestBody(null)
            else -> null
        }
        val request = Request.Builder().url("http://localhost$path").header("X-API-Key", apiKey).method(method, requestBody).build()
        // Un délai de lecture par requête : `/rest/events` est une longue requête (30 s côté moteur).
        val call = client.newBuilder().readTimeout(readTimeoutMs.toLong(), TimeUnit.MILLISECONDS).build().newCall(request)
        call.execute().use { response -> return HttpResult(response.code, response.body?.string().orEmpty()) }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
```


- [ ] **Step 4 : le moteur et son superviseur**

Points à relire dans `SyncEngine.kt` : le chemin du socket est contrôlé (limite de 108 octets de `sun_path`) ; `STGUIADDRESS` et `STGUIAPIKEY` passent par l'environnement du processus, pas par sa ligne de commande ; `STNORESTART=1` laisse ce code seul à relancer ; l'arrêt demande `/rest/system/shutdown` puis détruit le processus après 10 s ; `beforeLaunch` est appelé avant CHAQUE lancement (relances comprises) ; une configuration (`onReady`) qui échoue est notée au journal sans tuer le moteur.

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.RestartPolicy
import com.ahmed.neocalendar.core.sync.RotatingLog
import com.ahmed.neocalendar.core.sync.SyncthingApi
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext

private const val TAG = "NeoSyncEngine"

/**
 * Le processus Syncthing et son superviseur. Seul ce code relance le moteur (`STNORESTART=1` coupe le moniteur
 * interne de Syncthing) : 2 s, 4 s, 8 s… plafonné à 5 min, plus de relance après 5 échecs de suite.
 *
 * Tout ce que le moteur écrit vit dans `filesDir/syncthing/` (clé, certificat, `config.xml`, index, socket) ; ce
 * dossier est en 700. L'interface REST n'écoute que sur `gui.sock` dans ce dossier : aucune autre app ne peut la joindre.
 * La clé d'API est tirée au hasard à chaque lancement et ne quitte pas la mémoire de l'app.
 * Le binaire se lance depuis `nativeLibraryDir` uniquement (le SELinux d'Android 10+ refuse un exécutable copié ailleurs).
 */
class SyncEngine(private val context: Context, private val scope: CoroutineScope) {
    private val home = File(context.filesDir, "syncthing")
    private val socket = File(home, "gui.sock")
    private val log = RotatingLog(File(home, "logs"))
    private val policy = RestartPolicy()
    private val lock = Any()

    private val _state = MutableStateFlow<EngineState>(EngineState.Stopped)
    val state: StateFlow<EngineState> = _state.asStateFlow()

    /** L'API du moteur tant qu'il répond, sinon null. */
    @Volatile var api: SyncthingApi? = null
        private set

    /** Appelé (hors fil principal) quand le moteur répond, avant que l'état passe à Running : l'appelant le configure. */
    @Volatile var onReady: (suspend (SyncthingApi) -> Unit)? = null

    /** Appelé avant chaque lancement du processus (premier ou relance) : l'appelant vérifie, par exemple, que le port d'écoute est libre. */
    @Volatile var beforeLaunch: (() -> Unit)? = null

    private var job: Job? = null

    @Volatile private var process: Process? = null

    @Volatile private var stopRequested = false

    /** Le journal du moteur, le plus ancien d'abord. */
    fun logText(): String = log.readAll()

    /** Note une ligne dans le journal (erreur de configuration, relance). */
    fun note(line: String) = log.write("[Neo Calendar] $line\n".toByteArray(Charsets.UTF_8))

    /** Lance le moteur s'il ne tourne pas ; remet à zéro le compteur d'échecs (geste de l'utilisateur ou ouverture de l'app). */
    fun start() = synchronized(lock) {
        if (job?.isActive == true) return@synchronized
        stopRequested = false
        policy.reset()
        job = scope.launch(Dispatchers.IO) { supervise() }
    }

    /** Arrêt propre (`/rest/system/shutdown`), puis destruction du processus au bout de 10 s. */
    suspend fun stop() {
        val running = synchronized(lock) {
            stopRequested = true
            job
        }
        withContext(Dispatchers.IO) {
            api?.let { runCatching { it.shutdown() } }
            process?.let { p -> if (!p.waitFor(10, TimeUnit.SECONDS)) p.destroyForcibly() }
        }
        running?.cancelAndJoin()
        api = null
        process = null
        _state.value = EngineState.Stopped
    }

    private suspend fun supervise() {
        val binary = File(context.applicationInfo.nativeLibraryDir, "libsyncthingnative.so")
        if (!binary.canExecute()) {
            _state.value = EngineState.Missing
            return
        }
        while (scope.isActive && !stopRequested) {
            _state.value = EngineState.Starting
            val startedAt = SystemClock.elapsedRealtime()
            val message = try {
                runOnce(binary)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "lancement impossible", e)
                "Lancement impossible : ${e.message}"
            }
            if (stopRequested) return
            when (val decision = policy.onExit(SystemClock.elapsedRealtime() - startedAt)) {
                is RestartPolicy.Decision.RetryIn -> {
                    note("$message ; nouvel essai dans ${decision.delayMs / 1000} s (échec ${decision.attempt})")
                    _state.value = EngineState.Backoff(decision.attempt, decision.delayMs, message)
                    delay(decision.delayMs)
                }
                RestartPolicy.Decision.GiveUp -> {
                    note("$message ; plus de relance automatique")
                    _state.value = EngineState.Failed(message)
                    return
                }
            }
        }
    }

    /** Un lancement, de bout en bout. Rend le message de sa fin. */
    private suspend fun runOnce(binary: File): String {
        beforeLaunch?.invoke()
        home.mkdirs()
        lockDown(home)
        File(home, "tmp").mkdirs()
        if (socket.absolutePath.toByteArray().size > 100) throw IllegalStateException("chemin du socket trop long (${socket.absolutePath.length} caractères)")
        val key = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val builder = ProcessBuilder(binary.absolutePath, "serve", "--home=${home.absolutePath}", "--no-browser", "--no-upgrade")
        builder.environment().apply {
            put("STGUIADDRESS", "unix://${socket.absolutePath}")
            put("STGUIAPIKEY", key)
            put("STNORESTART", "1")
            put("STNOUPGRADE", "1")
            put("HOME", home.absolutePath)
            put("TMPDIR", File(home, "tmp").absolutePath)
        }
        builder.redirectErrorStream(true)
        val p = builder.start()
        process = p
        val reader = Thread({
            val buffer = ByteArray(8192)
            try {
                p.inputStream.use { input ->
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        log.write(buffer, n)
                    }
                }
            } catch (_: Exception) {
                // Le processus est mort : plus rien à lire.
            }
        }, "syncthing-log").apply { isDaemon = true; start() }

        val engineApi = SyncthingApi(OkHttpTransport(socket.absolutePath, key))
        val deadline = SystemClock.elapsedRealtime() + 60_000
        var healthy = false
        while (p.isAlive && SystemClock.elapsedRealtime() < deadline) {
            if (withContext(Dispatchers.IO) { engineApi.isHealthy() }) { healthy = true; break }
            delay(300)
        }
        if (healthy) {
            api = engineApi
            try {
                onReady?.invoke(engineApi)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                // Le moteur tourne mais n'a pas été configuré : on le dit dans le journal, la page montrera l'erreur.
                note("Configuration impossible : ${e.message}")
            }
            if (p.isAlive) _state.value = EngineState.Running
        } else if (p.isAlive) {
            note("Le moteur ne répond pas après 60 s : arrêt")
            p.destroyForcibly()
        }
        val code = try {
            runInterruptible(Dispatchers.IO) { p.waitFor() }
        } finally {
            api = null
            process = null
            if (p.isAlive) p.destroyForcibly()
            reader.join(2_000)
        }
        val last = log.readAll().trimEnd().lines().lastOrNull().orEmpty().take(200)
        return "Le moteur s'est arrêté (code $code)" + if (last.isNotEmpty()) " : $last" else ""
    }

    /** Dossier d'état en 700 : ni lisible ni traversable par une autre app. */
    private fun lockDown(dir: File) {
        dir.setReadable(false, false); dir.setWritable(false, false); dir.setExecutable(false, false)
        dir.setReadable(true, true); dir.setWritable(true, true); dir.setExecutable(true, true)
    }
}
```


- [ ] **Step 5 : compiler**

```powershell
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`.

- [ ] **Step 6 : revue sonnet (IPC), puis commit**

Lancer une revue sonnet limitée aux fichiers `sync/UnixSocketFactory.kt`, `sync/OkHttpTransport.kt`, `sync/SyncEngine.kt`, avec les points de la tête de tâche. Corriger ce qu'elle trouve, sans seconde revue.

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
App : SyncEngine, processus Syncthing supervisé, interface REST par socket Unix

Lancé depuis nativeLibraryDir, dossier d'état en 700, clé d'API aléatoire seulement en mémoire, STNORESTART=1 : seul ce code relaie (2 s, 4 s, 8 s, 16 s, abandon au cinquième échec). Sortie gardée dans un journal tournant de 1 Mo. OkHttp parle au moteur par une SocketFactory sur LocalSocket.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 8 : App, chef d'orchestre, service au premier plan, conditions, démarrage automatique

Le moteur démarre APRÈS la grille, selon les deux modes (« Comme Syncthing-Fork » : service `specialUse` et notification permanente ; « Seulement quand l'app est ouverte » : pas de service, arrêt après 60 s au plus quand l'app passe en arrière-plan), sous les conditions réduites de Syncthing-Fork (Wi-Fi, Wi-Fi limité, données mobiles, source d'alimentation, économiseur de batterie), avec démarrage automatique à l'allumage (désactivé par défaut). Tant qu'aucun appareil n'est appairé, rien ne tourne et aucune notification n'apparaît.

**Files:**
- Create: `core/.../sync/RunConditions.kt`, `core/.../sync/SyncSettings.kt`, `core/.../sync/StatusLine.kt`
- Test: `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/RunConditionsTest.kt`, `StatusLineTest.kt`
- Create: `app/.../nativeapp/sync/SyncSettingsStore.kt`, `RunConditionMonitor.kt`, `SyncController.kt`, `SyncService.kt`, `SyncBootReceiver.kt`
- Modify: `app/src/main/AndroidManifest.xml`, `app/.../nativeapp/NativeActivity.kt`

**Interfaces:**
- Consumes: `SyncEngine`, `EngineState` (Task 7), `WorkspaceLocation`, `StorageMode` (Task 6), `SyncSetup`, `bindsTcpAndUdp`, `pickFreePort` (Tasks 2 et 3).
- Produces :
  - `enum class RunMode { LikeFork, OnlyWhenOpen }`, `enum class PowerSource { Always, ChargingOnly, BatteryOnly }`, `data class RunConditions(onWifi = true, onMeteredWifi = false, onMobileData = false, power = Always, respectBatterySaver = true)`, `data class DeviceSnapshot(network: NetworkKind, metered: Boolean, charging: Boolean, powerSave: Boolean)`, `enum class PauseReason(label)`, `sealed interface RunDecision { Run; Pause(reason) }`, `fun decideRun(conditions, snapshot): RunDecision`
  - `data class SyncSettings(runMode, autoStart, conditions, listenPort, configured, quit)`
  - `sealed interface StatusLine` (`text(): String`), `fun summarize(hasDevices, engine, decision, folder: FolderState?, anyDeviceConnected): StatusLine`
  - `class SyncController` : `SyncController.get(context)`, `SyncController.peek()`, `val settings: SyncSettingsStore`, `val engine: SyncEngine`, `val decision: StateFlow<RunDecision>`, `val status: StateFlow<StatusLine>`, `fun onAppStarted()`, `onAppVisible()`, `onAppHidden()`, `setPageOpen(Boolean)`, `quit()`, `retry()`, `reconcile()`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class RunConditionsTest {
    private val defaults = RunConditions()
    private fun snap(
        network: NetworkKind = NetworkKind.Wifi, metered: Boolean = false, charging: Boolean = false, powerSave: Boolean = false,
    ) = DeviceSnapshot(network, metered, charging, powerSave)

    private fun pause(reason: PauseReason) = RunDecision.Pause(reason)

    @Test fun `les defauts sont ceux de Syncthing-Fork`() {
        assertEquals(RunConditions(onWifi = true, onMeteredWifi = false, onMobileData = false, power = PowerSource.Always, respectBatterySaver = true), defaults)
    }

    @Test fun `Wi-Fi ordinaire, on tourne sur secteur ou sur batterie`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap()))
        assertEquals(RunDecision.Run, decideRun(defaults, snap(charging = true)))
    }

    @Test fun `Wi-Fi limite refuse par defaut, accepte si autorise`() {
        assertEquals(pause(PauseReason.MeteredWifiNotAllowed), decideRun(defaults, snap(metered = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(onMeteredWifi = true), snap(metered = true)))
    }

    @Test fun `donnees mobiles refusees par defaut, acceptees si autorisees`() {
        assertEquals(pause(PauseReason.MobileDataNotAllowed), decideRun(defaults, snap(network = NetworkKind.Mobile, metered = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(onMobileData = true), snap(network = NetworkKind.Mobile, metered = true)))
    }

    @Test fun `Wi-Fi coupe dans les conditions`() {
        assertEquals(pause(PauseReason.WifiNotAllowed), decideRun(defaults.copy(onWifi = false), snap()))
    }

    @Test fun `sans reseau, hors ligne`() {
        assertEquals(pause(PauseReason.NoNetwork), decideRun(defaults, snap(network = NetworkKind.None)))
        assertEquals(pause(PauseReason.NoNetwork), decideRun(defaults, snap(network = NetworkKind.Other)))
    }

    @Test fun `source d'alimentation`() {
        val chargingOnly = defaults.copy(power = PowerSource.ChargingOnly)
        val batteryOnly = defaults.copy(power = PowerSource.BatteryOnly)
        assertEquals(pause(PauseReason.NeedsCharging), decideRun(chargingOnly, snap(charging = false)))
        assertEquals(RunDecision.Run, decideRun(chargingOnly, snap(charging = true)))
        assertEquals(pause(PauseReason.NeedsBattery), decideRun(batteryOnly, snap(charging = true)))
        assertEquals(RunDecision.Run, decideRun(batteryOnly, snap(charging = false)))
    }

    @Test fun `economiseur de batterie respecte par defaut, ignore si decoche`() {
        assertEquals(pause(PauseReason.BatterySaver), decideRun(defaults, snap(powerSave = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(respectBatterySaver = false), snap(powerSave = true)))
    }

    @Test fun `l'economiseur passe avant le reste`() {
        assertEquals(pause(PauseReason.BatterySaver), decideRun(defaults, snap(network = NetworkKind.None, powerSave = true)))
    }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusLineTest {
    private val idle = FolderState("idle", 0, 0, "")

    private fun line(
        hasDevices: Boolean = true,
        engine: EngineState = EngineState.Running,
        decision: RunDecision = RunDecision.Run,
        folder: FolderState? = idle,
        connected: Boolean = true,
    ) = summarize(hasDevices, engine, decision, folder, connected)

    @Test fun `a jour`() { assertEquals(StatusLine.UpToDate, line()); assertEquals("À jour", line().text()) }

    @Test fun `sans appareil rien ne tourne`() {
        assertEquals(StatusLine.NotConfigured, line(hasDevices = false, engine = EngineState.Stopped))
    }

    @Test fun `synchro en cours avec le nombre de fichiers`() {
        assertEquals("Synchronisation en cours (3 fichiers)", line(folder = FolderState("syncing", 3, 100, "")).text())
        assertEquals("Synchronisation en cours (1 fichier)", line(folder = FolderState("syncing", 1, 100, "")).text())
    }

    @Test fun `en pause avec la condition qui manque`() {
        assertEquals("En pause : Wi-Fi limité non autorisé", line(decision = RunDecision.Pause(PauseReason.MeteredWifiNotAllowed), engine = EngineState.Stopped).text())
    }

    @Test fun `hors ligne quand aucun appareil n'est connecte`() {
        assertEquals(StatusLine.Offline, line(connected = false))
    }

    @Test fun `erreur du moteur avant tout, relance annoncee`() {
        assertEquals("Erreur : boom", line(engine = EngineState.Failed("boom")).text())
        assertEquals("Erreur : boom (nouvel essai dans 4 s)", line(engine = EngineState.Backoff(2, 4_000, "boom")).text())
    }

    @Test fun `erreur du dossier, par exemple disque plein`() {
        assertEquals("Erreur : disque plein", line(folder = FolderState("error", 0, 0, "disque plein")).text())
    }

    @Test fun `demarrage tant que le moteur ne repond pas`() {
        assertEquals(StatusLine.Starting, line(engine = EngineState.Starting, folder = null))
        assertEquals(StatusLine.Starting, line(folder = null))
    }

    @Test fun `binaire absent`() {
        assertEquals(StatusLine.Error("moteur de synchronisation absent de cette version"), line(engine = EngineState.Missing, folder = null))
    }
}
```


```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.RunConditionsTest' --tests 'com.ahmed.neocalendar.core.sync.StatusLineTest'
```

Attendu : `FAILED`, `Unresolved reference 'RunConditions'`, `'summarize'`.

- [ ] **Step 2 : implémenter les règles pures**

Les défauts sont ceux de Syncthing-Fork (`PREF_RUN_ON_WIFI` oui, `PREF_RUN_ON_METERED_WIFI` non, `PREF_RUN_ON_MOBILE_DATA` non, source `ac_and_battery_power`, `PREF_RESPECT_BATTERY_SAVING` oui, relevés dans `RunConditionMonitor.java` et `Constants.java` de `C:\dev\syncthing-android`). Ethernet compte comme Wi-Fi (comme Syncthing-Fork). Hors réseau : pause « hors ligne ».

```kotlin
package com.ahmed.neocalendar.core.sync

enum class RunMode { LikeFork, OnlyWhenOpen }

enum class PowerSource { Always, ChargingOnly, BatteryOnly }

/** Les conditions de fonctionnement (version réduite de Syncthing-Fork, mêmes défauts). */
data class RunConditions(
    val onWifi: Boolean = true,
    val onMeteredWifi: Boolean = false,
    val onMobileData: Boolean = false,
    val power: PowerSource = PowerSource.Always,
    val respectBatterySaver: Boolean = true,
)

enum class NetworkKind { None, Wifi, Mobile, Other }

/** Ce que le téléphone dit à l'instant. Ethernet compte comme Wifi (comme Syncthing-Fork). */
data class DeviceSnapshot(val network: NetworkKind, val metered: Boolean, val charging: Boolean, val powerSave: Boolean)

enum class PauseReason(val label: String) {
    BatterySaver("économiseur de batterie actif"),
    NeedsCharging("seulement sur secteur"),
    NeedsBattery("seulement sur batterie"),
    NoNetwork("hors ligne"),
    WifiNotAllowed("Wi-Fi non autorisé"),
    MeteredWifiNotAllowed("Wi-Fi limité non autorisé"),
    MobileDataNotAllowed("données mobiles non autorisées"),
}

sealed interface RunDecision {
    data object Run : RunDecision
    data class Pause(val reason: PauseReason) : RunDecision
}

/** Le moteur doit-il tourner maintenant ? Dans l'ordre de Syncthing-Fork : économiseur, source d'alimentation, réseau. */
fun decideRun(conditions: RunConditions, snapshot: DeviceSnapshot): RunDecision {
    if (conditions.respectBatterySaver && snapshot.powerSave) return RunDecision.Pause(PauseReason.BatterySaver)
    when (conditions.power) {
        PowerSource.ChargingOnly -> if (!snapshot.charging) return RunDecision.Pause(PauseReason.NeedsCharging)
        PowerSource.BatteryOnly -> if (snapshot.charging) return RunDecision.Pause(PauseReason.NeedsBattery)
        PowerSource.Always -> Unit
    }
    return when (snapshot.network) {
        NetworkKind.None, NetworkKind.Other -> RunDecision.Pause(PauseReason.NoNetwork)
        NetworkKind.Wifi -> when {
            !conditions.onWifi -> RunDecision.Pause(PauseReason.WifiNotAllowed)
            snapshot.metered && !conditions.onMeteredWifi -> RunDecision.Pause(PauseReason.MeteredWifiNotAllowed)
            else -> RunDecision.Run
        }
        NetworkKind.Mobile -> if (conditions.onMobileData) RunDecision.Run else RunDecision.Pause(PauseReason.MobileDataNotAllowed)
    }
}
```


```kotlin
package com.ahmed.neocalendar.core.sync

/** Les réglages de la synchronisation intégrée, sur cet appareil seulement (jamais dans le dossier de notes). */
data class SyncSettings(
    val runMode: RunMode = RunMode.LikeFork,
    /** Démarrer aussi à l'allumage du téléphone (mode LikeFork). Désactivé par défaut, comme Syncthing-Fork. */
    val autoStart: Boolean = false,
    val conditions: RunConditions = RunConditions(),
    /** Le port d'écoute (TCP et QUIC), choisi à la première mise en route et gardé ; 0 = pas encore choisi. */
    val listenPort: Int = 0,
    /** Au moins un appareil est appairé : seulement alors le moteur tourne en dehors de la page Synchronisation. */
    val configured: Boolean = false,
    /** « Quitter » appuyé : le moteur reste arrêté jusqu'au prochain lancement de l'app. */
    val quit: Boolean = false,
)
```


```kotlin
package com.ahmed.neocalendar.core.sync

/** La ligne d'état de la page Synchronisation (une seule, la plus importante). */
sealed interface StatusLine {
    data object NotConfigured : StatusLine
    data object Starting : StatusLine
    data object UpToDate : StatusLine
    data class Syncing(val files: Int) : StatusLine
    data class Paused(val reason: PauseReason) : StatusLine
    data object Offline : StatusLine
    data class Error(val message: String) : StatusLine

    fun text(): String = when (this) {
        NotConfigured -> "Aucun appareil : la synchronisation est arrêtée"
        Starting -> "Démarrage…"
        UpToDate -> "À jour"
        is Syncing -> if (files == 1) "Synchronisation en cours (1 fichier)" else "Synchronisation en cours ($files fichiers)"
        is Paused -> "En pause : ${reason.label}"
        Offline -> "Hors ligne : aucun appareil connecté"
        is Error -> "Erreur : $message"
    }
}

/**
 * Priorité : pas d'appareil, erreur du moteur, pause (condition non remplie), démarrage, erreur du dossier,
 * synchro en cours, hors ligne (aucun appareil connecté), à jour.
 */
fun summarize(
    hasDevices: Boolean,
    engine: EngineState,
    decision: RunDecision,
    folder: FolderState?,
    anyDeviceConnected: Boolean,
): StatusLine = when {
    !hasDevices -> StatusLine.NotConfigured
    engine is EngineState.Missing -> StatusLine.Error("moteur de synchronisation absent de cette version")
    engine is EngineState.Failed -> StatusLine.Error(engine.error)
    engine is EngineState.Backoff -> StatusLine.Error("${engine.error} (nouvel essai dans ${engine.retryInMs / 1000} s)")
    decision is RunDecision.Pause -> StatusLine.Paused(decision.reason)
    engine !is EngineState.Running || folder == null -> StatusLine.Starting
    folder.error.isNotEmpty() -> StatusLine.Error(folder.error)
    folder.needFiles > 0 || folder.state == "syncing" || folder.state == "scanning" -> StatusLine.Syncing(folder.needFiles)
    !anyDeviceConnected -> StatusLine.Offline
    else -> StatusLine.UpToDate
}
```


```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.RunConditionsTest' --tests 'com.ahmed.neocalendar.core.sync.StatusLineTest'
```

Attendu : `BUILD SUCCESSFUL`, 9 tests chacun.

- [ ] **Step 3 : les réglages et le moniteur du téléphone**

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import com.ahmed.neocalendar.core.sync.PowerSource
import com.ahmed.neocalendar.core.sync.RunConditions
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.SyncSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Les réglages de synchro dans `SharedPreferences` (`neo_sync`), lus une fois et suivis par un flux. */
class SyncSettingsStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("neo_sync", Context.MODE_PRIVATE)
    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<SyncSettings> = _settings.asStateFlow()

    val value: SyncSettings get() = _settings.value

    private fun read(): SyncSettings {
        val d = SyncSettings()
        val c = d.conditions
        return SyncSettings(
            runMode = RunMode.entries.firstOrNull { it.name == prefs.getString("runMode", null) } ?: d.runMode,
            autoStart = prefs.getBoolean("autoStart", d.autoStart),
            conditions = RunConditions(
                onWifi = prefs.getBoolean("onWifi", c.onWifi),
                onMeteredWifi = prefs.getBoolean("onMeteredWifi", c.onMeteredWifi),
                onMobileData = prefs.getBoolean("onMobileData", c.onMobileData),
                power = PowerSource.entries.firstOrNull { it.name == prefs.getString("power", null) } ?: c.power,
                respectBatterySaver = prefs.getBoolean("respectBatterySaver", c.respectBatterySaver),
            ),
            listenPort = prefs.getInt("listenPort", d.listenPort),
            configured = prefs.getBoolean("configured", d.configured),
            quit = prefs.getBoolean("quit", d.quit),
        )
    }

    @Synchronized
    fun update(change: (SyncSettings) -> SyncSettings) {
        val next = change(_settings.value)
        if (next == _settings.value) return
        prefs.edit()
            .putString("runMode", next.runMode.name)
            .putBoolean("autoStart", next.autoStart)
            .putBoolean("onWifi", next.conditions.onWifi)
            .putBoolean("onMeteredWifi", next.conditions.onMeteredWifi)
            .putBoolean("onMobileData", next.conditions.onMobileData)
            .putString("power", next.conditions.power.name)
            .putBoolean("respectBatterySaver", next.conditions.respectBatterySaver)
            .putInt("listenPort", next.listenPort)
            .putBoolean("configured", next.configured)
            .putBoolean("quit", next.quit)
            .commit()
        _settings.value = next
    }
}
```


`RunConditionMonitor` (réseau actif et son caractère limité, branché ou non, économiseur : `registerDefaultNetworkCallback` et les diffusions d'alimentation, les mêmes sources que `RunConditionMonitor.java` de Syncthing-Fork) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.ahmed.neocalendar.core.sync.DeviceSnapshot
import com.ahmed.neocalendar.core.sync.NetworkKind

/**
 * Ce que le téléphone dit du réseau, de l'alimentation et de l'économiseur de batterie, et le moment où cela change.
 * Les mêmes sources que `RunConditionMonitor.java` de Syncthing-Fork (réseau actif et son caractère limité, branché ou non,
 * économiseur), par les rappels modernes : `registerDefaultNetworkCallback` et les diffusions d'alimentation.
 */
class RunConditionMonitor(context: Context, private val onChange: () -> Unit) {
    private val app = context.applicationContext
    private val connectivity = app.getSystemService(ConnectivityManager::class.java)
    private val power = app.getSystemService(PowerManager::class.java)
    private var started = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = onChange()
        override fun onLost(network: Network) = onChange()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = onChange()
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = onChange()
    }

    @Synchronized
    fun start() {
        if (started) return
        started = true
        connectivity.registerDefaultNetworkCallback(networkCallback)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        ContextCompat.registerReceiver(app, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    @Synchronized
    fun stop() {
        if (!started) return
        started = false
        runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
        runCatching { app.unregisterReceiver(receiver) }
    }

    fun snapshot(): DeviceSnapshot {
        val caps = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
        val kind = when {
            caps == null -> NetworkKind.None
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkKind.Wifi
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkKind.Mobile
            else -> NetworkKind.Other
        }
        val metered = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false
        val battery = app.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val charging = (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        return DeviceSnapshot(kind, metered, charging, power.isPowerSaveMode)
    }
}
```


- [ ] **Step 4 : le chef d'orchestre**

`SyncController` décide à chaque changement (réglages, réseau, alimentation, visibilité de l'app, page ouverte) si le moteur doit tourner. Le moteur tourne si : stockage privé ET conditions remplies ET (page Synchronisation ouverte OU (au moins un appareil appairé ET pas de « Quitter » ET (mode Comme Syncthing-Fork, OU app visible, OU moins de 60 s depuis qu'elle est passée en arrière-plan))). En mode « Seulement quand l'app est ouverte », il attend avant l'arrêt (60 s au plus) que les modifications locales soient parties : scan immédiat, puis dossier au repos et chaque appareil connecté à 100 %, deux constats de suite. Le port d'écoute reste celui d'avant tant qu'il est libre en TCP et en UDP, sinon un nouveau port libre est choisi et gardé, AVANT chaque lancement (relances comprises). Cette version n'écoute pas encore les évènements du moteur (Task 9) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.FolderState
import com.ahmed.neocalendar.core.sync.RunDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.StatusLine
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncSettings
import com.ahmed.neocalendar.core.sync.bindsTcpAndUdp
import com.ahmed.neocalendar.core.sync.decideRun
import com.ahmed.neocalendar.core.sync.pickFreePort
import com.ahmed.neocalendar.core.sync.summarize
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Le chef d'orchestre de la synchronisation intégrée : décide, à chaque changement, si le moteur doit tourner, et le lance
 * ou l'arrête. Une seule instance par processus (`SyncController.get(context)`).
 *
 * Le moteur tourne quand : le stockage est privé (mode `Integrated`), les conditions de fonctionnement sont remplies, et
 *  - la page Synchronisation est ouverte (appairage), ou
 *  - au moins un appareil est appairé et que l'utilisateur n'a pas appuyé sur « Quitter », en mode « Comme Syncthing-Fork »
 *    (service au premier plan, jusqu'à « Quitter ») ou « Seulement quand l'app est ouverte » (app visible).
 *
 * RIEN de ce code ne s'exécute avant que la grille soit affichée : `get` n'est appelé qu'ensuite (NativeActivity).
 */
class SyncController private constructor(context: Context) {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()

    val settings = SyncSettingsStore(app)
    val engine = SyncEngine(app, scope)
    private val monitor = RunConditionMonitor(app) { reconcile() }

    private val _decision = MutableStateFlow<RunDecision>(RunDecision.Run)

    /** Les conditions de fonctionnement disent-elles « tourne » ou « pause (pourquoi) » ? */
    val decision: StateFlow<RunDecision> = _decision.asStateFlow()

    private val _status = MutableStateFlow<StatusLine>(StatusLine.NotConfigured)

    /** La ligne d'état (page Synchronisation, notification). */
    val status: StateFlow<StatusLine> = _status.asStateFlow()

    @Volatile private var appVisible = false
    @Volatile private var graceUntil = 0L
    private var graceJob: Job? = null
    @Volatile private var pageOpen = false

    @Volatile var lastFolderState: FolderState? = null
        private set
    @Volatile var anyDeviceConnected: Boolean = false
        private set

    init {
        engine.beforeLaunch = { ensureListenPort() }
        engine.onReady = { api -> SyncSetup(api, WorkspaceLocation.privateRoot(app).absolutePath).applyOptions(settings.value.listenPort) }
        monitor.start()
        scope.launch { settings.settings.collect { reconcile() } }
        scope.launch { engine.state.collect { publishStatus() } }
        reconcile()
    }

    /** Le port d'écoute reste celui d'avant tant qu'il est libre ; sinon un nouveau port libre est choisi et gardé. */
    private fun ensureListenPort() {
        val current = settings.value.listenPort
        if (current == 0 || !bindsTcpAndUdp(current)) settings.update { it.copy(listenPort = pickFreePort()) }
    }

    /** L'app est lancée (grille affichée) : « Quitter » n'a plus cours, le moteur peut démarrer. */
    fun onAppStarted() {
        appVisible = true
        if (settings.value.quit) settings.update { it.copy(quit = false) }
        reconcile()
    }

    fun onAppVisible() {
        graceJob?.cancel()
        graceUntil = 0
        appVisible = true
        reconcile()
    }

    /**
     * L'app passe en arrière-plan. En mode « Seulement quand l'app est ouverte », le moteur attend (60 s au plus) que les
     * modifications locales soient parties avant de s'arrêter.
     */
    fun onAppHidden() {
        appVisible = false
        if (settings.value.runMode == RunMode.OnlyWhenOpen && engine.state.value is EngineState.Running) {
            graceUntil = SystemClock.elapsedRealtime() + GRACE_MS
            graceJob?.cancel()
            graceJob = scope.launch {
                waitUntilSent()
                graceUntil = 0
                reconcile()
            }
        }
        reconcile()
    }

    /** Scan immédiat, puis attend que le dossier soit au repos et que chaque appareil connecté ait tout reçu (deux constats de suite). */
    private suspend fun waitUntilSent() {
        val api = engine.api ?: return
        val deadline = SystemClock.elapsedRealtime() + GRACE_MS
        var good = 0
        try {
            val folder = api.folders().firstOrNull() ?: return
            api.scan(folder.id)
            delay(3_000)
            while (SystemClock.elapsedRealtime() < deadline) {
                val idle = api.folderState(folder.id).let { it.state == "idle" && it.needFiles == 0 }
                val connected = api.connections()
                val sent = folder.deviceIds.filter { connected[it] == true }.all { api.completion(folder.id, it) >= 100.0 }
                good = if (idle && sent) good + 1 else 0
                if (good >= 2) return
                delay(2_000)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Le moteur ne répond plus : rien à attendre.
        }
    }

    /** La page Synchronisation est ouverte : le moteur tourne (appairage) même sans appareil. */
    fun setPageOpen(open: Boolean) { pageOpen = open; reconcile() }

    /** « Quitter » (mode Comme Syncthing-Fork, sans démarrage automatique) : moteur et service s'arrêtent jusqu'au prochain lancement de l'app. */
    fun quit() = settings.update { it.copy(quit = true) }

    /** « Réessayer » après l'abandon des relances. */
    fun retry() {
        engine.start()
    }

    fun reconcile() {
        scope.launch { mutex.withLock { reconcileLocked() } }
    }

    private suspend fun reconcileLocked() {
        val s = settings.value
        val integrated = WorkspaceLocation.mode(app) == StorageMode.Integrated
        val decision = decideRun(s.conditions, monitor.snapshot())
        _decision.value = decision
        val running = decision is RunDecision.Run
        val open = appVisible || SystemClock.elapsedRealtime() < graceUntil
        val background = s.configured && !s.quit && (s.runMode == RunMode.LikeFork || open)
        val wanted = integrated && running && (pageOpen || background)
        val state = engine.state.value
        if (wanted && state is EngineState.Stopped) engine.start()
        if (!wanted && state !is EngineState.Stopped) engine.stop()
        val wantService = integrated && s.configured && !s.quit && s.runMode == RunMode.LikeFork
        if (wantService) SyncService.start(app) else SyncService.stop(app)
        publishStatus()
    }

    internal fun publishStatus() {
        val s = settings.value
        _status.value = summarize(s.configured, engine.state.value, _decision.value, lastFolderState, anyDeviceConnected)
    }

    companion object {
        private const val GRACE_MS = 60_000L

        @Volatile private var instance: SyncController? = null

        fun get(context: Context): SyncController =
            instance ?: synchronized(this) { instance ?: SyncController(context).also { instance = it } }

        /** Sans le créer : les appelants qui n'ont rien à faire quand la synchro n'a jamais été utilisée (arrêt, visibilité). */
        fun peek(): SyncController? = instance
    }
}
```


- [ ] **Step 5 : le service au premier plan, l'allumage, le manifeste**

`SyncService` (type `specialUse`, notification permanente de faible importance avec l'état et, sans démarrage automatique, l'action « Quitter » ; ne redémarre pas depuis l'arrière-plan, Android 12+ le refuse) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.graphics.drawable.Icon
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.ahmed.neocalendar.R
import com.ahmed.neocalendar.nativeapp.NativeActivity
import com.ahmed.neocalendar.nativeapp.ui.tr
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Le service au premier plan de type `specialUse` (comme Syncthing-Fork : il échappe à la limite de 6 h par 24 h
 * qu'Android 15 impose au type `dataSync`) : il garde le processus en vie tant que le moteur doit tourner, avec une
 * notification permanente. Il ne fait rien d'autre : le moteur est piloté par [SyncController].
 */
class SyncService : Service() {
    private var scope: CoroutineScope? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val controller = SyncController.get(this)
        if (intent?.action == ACTION_QUIT) {
            controller.quit()
            stopSelf()
            return START_NOT_STICKY
        }
        createChannel()
        val notification = notification(controller)
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, notification)
        if (scope == null) {
            val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            scope = s
            val manager = getSystemService(NotificationManager::class.java)
            s.launch { controller.status.collect { manager.notify(NOTIFICATION_ID, notification(controller)) } }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        scope?.cancel()
        scope = null
        super.onDestroy()
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, tr("Synchronisation"), NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun notification(controller: SyncController): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, NativeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(tr("Neo Calendar"))
            .setContentText(tr(controller.status.value.text()))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
        // Avec le démarrage automatique, « Quitter » n'a pas de sens : le moteur redémarrerait à l'allumage (comme Syncthing-Fork).
        if (!controller.settings.value.autoStart) {
            val quit = PendingIntent.getService(
                this, 1, Intent(this, SyncService::class.java).setAction(ACTION_QUIT),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            builder.addAction(Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_notification), tr("Quitter"), quit).build())
        }
        return builder.build()
    }

    companion object {
        private const val CHANNEL_ID = "neo_sync"
        private const val NOTIFICATION_ID = 4242
        private const val ACTION_QUIT = "com.ahmed.neocalendar.sync.QUIT"

        /** Vrai tant que le service existe : on ne le redémarre pas depuis l'arrière-plan (Android 12+ le refuse). */
        @Volatile private var running = false

        fun start(context: Context) {
            if (running) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java))
            } catch (e: Exception) {
                // Démarrage au premier plan refusé (app en arrière-plan sans exemption) : le moteur tourne quand même, sans service.
                Log.w("NeoSyncService", "service non démarré", e)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SyncService::class.java))
        }
    }
}
```


`SyncBootReceiver` (à l'allumage ou après une mise à jour de l'app, seulement si « Démarrage automatique » est activé, en mode Comme Syncthing-Fork, stockage privé, au moins un appareil) :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation

/**
 * À l'allumage du téléphone (ou après une mise à jour de l'app), relance la synchronisation, mais seulement si l'utilisateur
 * a activé « Démarrage automatique » (désactivé par défaut, comme dans Syncthing-Fork), en mode « Comme Syncthing-Fork »,
 * avec le stockage privé et au moins un appareil appairé. Sinon : rien, et le processus n'est même pas réveillé plus que ça.
 */
class SyncBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (WorkspaceLocation.mode(context) != StorageMode.Integrated) return
        val controller = SyncController.get(context)
        val s = controller.settings.value
        if (s.configured && s.autoStart && s.runMode == RunMode.LikeFork && !s.quit) controller.reconcile()
    }
}
```


Manifeste (permissions `FOREGROUND_SERVICE` et `FOREGROUND_SERVICE_SPECIAL_USE`, service avec `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` comme Syncthing-Fork, récepteur d'allumage) :

```diff
--- a/app/src/main/AndroidManifest.xml
+++ b/app/src/main/AndroidManifest.xml
@@ -10,4 +10,7 @@
     <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
     <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
+    <!-- Le moteur de synchronisation tourne dans un service au premier plan de type specialUse (comme Syncthing-Fork). -->
+    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
+    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
     <!-- Desinstaller l'ANCIENNE app (com.ahmed.neocalendar) : ACTION_DELETE sur un autre paquet l'exige (doc Android : REQUEST_DELETE_PACKAGES). -->
     <uses-permission android:name="android.permission.REQUEST_DELETE_PACKAGES" />
@@ -106,4 +109,23 @@
         </receiver>
 
+        <!-- La synchronisation intégrée : un service au premier plan tant que le moteur doit tourner, relancé à l'allumage si l'utilisateur l'a demandé. -->
+        <service
+            android:name=".nativeapp.sync.SyncService"
+            android:exported="false"
+            android:foregroundServiceType="specialUse">
+            <property
+                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
+                android:value="Neo Calendar embeds Syncthing, a continuous file synchronization engine. When the user enables it, it runs in the background to send and receive calendar notes between the user's own devices as they change." />
+        </service>
+
+        <receiver
+            android:name=".nativeapp.sync.SyncBootReceiver"
+            android:exported="false">
+            <intent-filter>
+                <action android:name="android.intent.action.BOOT_COMPLETED" />
+                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
+            </intent-filter>
+        </receiver>
+
         <!-- Binding this service is a privileged operation: only the launcher,
              which holds BIND_REMOTEVIEWS, may drive the widget's list. -->
```


`NativeActivity` : le chef d'orchestre n'est créé qu'APRÈS la grille affichée, hors du fil principal, et seulement en stockage privé ; l'état visible / caché suit `onStart` / `onStop` :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeActivity.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeActivity.kt
@@ -12,8 +12,12 @@
 import androidx.activity.viewModels
 import com.ahmed.neocalendar.NeoCalendarWidget
+import com.ahmed.neocalendar.core.workspace.StorageMode
 import androidx.lifecycle.Lifecycle
 import androidx.lifecycle.lifecycleScope
 import androidx.lifecycle.repeatOnLifecycle
+import kotlinx.coroutines.Dispatchers
 import kotlinx.coroutines.delay
+import kotlinx.coroutines.withContext
+import com.ahmed.neocalendar.nativeapp.sync.SyncController
 import kotlinx.coroutines.flow.first
 import kotlinx.coroutines.launch
@@ -46,4 +50,8 @@
             viewModel.screen.first { it !is ScreenState.Loading }
             updates.checkOnLaunch()
+            // Le moteur de synchronisation démarre APRÈS la grille, hors du fil principal ; jamais avec un dossier externe.
+            if (WorkspaceLocation.mode(applicationContext) == StorageMode.Integrated) {
+                withContext(Dispatchers.Default) { SyncController.get(applicationContext).onAppStarted() }
+            }
         }
         // Une notification ou le widget peut avoir lancé l'app à froid : la route attend que le dossier soit lu. Une recréation (rotation) ne la rejoue pas.
@@ -118,4 +126,14 @@
     }
 
+    override fun onStart() {
+        super.onStart()
+        SyncController.peek()?.onAppVisible()
+    }
+
+    override fun onStop() {
+        SyncController.peek()?.onAppHidden()
+        super.onStop()
+    }
+
     /** Le dossier est relu à l'ouverture et à chaque retour dans l'app (400 ms au plus rapproché). */
     override fun onResume() {
```


- [ ] **Step 6 : compiler**

```powershell
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`.

- [ ] **Step 7 : preuve sur appareil (émulateur neuf `Pixel_8_Sync`, APK debug)**

Aucun appareil n'est appairé : on simule l'état « appairé » en posant les réglages à la main (le build est debuggable, `run-as` fonctionne). Installer, lancer une fois (crée le dossier privé), arrêter, poser `neo_sync.xml`, relancer :

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
cd C:\dev\neo-calendar\apps\android\native
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
& $adb shell am start -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 4
& $adb shell am force-stop com.ahmedmili.neocalendar
@'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="configured" value="true" />
</map>
'@ | Set-Content -Encoding ascii C:\dev\neo-calendar\.superpowers\syncthing\neo_sync.xml
& $adb push C:\dev\neo-calendar\.superpowers\syncthing\neo_sync.xml /data/local/tmp/neo_sync.xml
& $adb shell chmod 644 /data/local/tmp/neo_sync.xml
& $adb shell run-as com.ahmedmili.neocalendar sh -c "mkdir -p shared_prefs && cp /data/local/tmp/neo_sync.xml shared_prefs/neo_sync.xml"
& $adb shell am start -n com.ahmedmili.neocalendar/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 12
& $adb shell "ps -A | grep -i syncthing"
& $adb shell run-as com.ahmedmili.neocalendar ls -la files/syncthing
& $adb shell dumpsys activity services com.ahmedmili.neocalendar | Select-String "SyncService"
```

Attendu : un processus `libsyncthingnative.so` en cours ; `files/syncthing` en `drwx------` avec `gui.sock`, `config.xml`, `cert.pem`, `key.pem`, `logs/` ; le service `SyncService` listé. Vérifier l'interface REST depuis le contexte de l'app (script LF poussé, pas de guillemets à imbriquer) :

```powershell
[IO.File]::WriteAllText("C:\dev\neo-calendar\.superpowers\syncthing\health.sh", "cd /data/data/com.ahmedmili.neocalendar`nprintf 'GET /rest/noauth/health HTTP/1.0\r\n\r\n' | nc -U files/syncthing/gui.sock`n")
& $adb push C:\dev\neo-calendar\.superpowers\syncthing\health.sh /data/local/tmp/health.sh
& $adb shell run-as com.ahmedmili.neocalendar sh /data/local/tmp/health.sh
& $adb shell run-as com.ahmedmili.neocalendar cat files/syncthing/config.xml | Select-String "listenAddress|localAnnounceEnabled|urAccepted|autoUpgradeIntervalH|crashReporting|<folder "
& $adb shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_sync.xml
```

Attendu : réponse `HTTP/1.0 200 OK` et `{"status": "OK"}` ; dans `config.xml` : `localAnnounceEnabled` à `false`, `urAccepted` à `-1`, `autoUpgradeIntervalH` à `0`, `crashReportingEnabled` à `false`, une adresse `tcp://0.0.0.0:<port>` où `<port>` est celui de `neo_sync.xml` (clé `listenPort`), et AUCUNE ligne `<folder ` (pas de dossier tant qu'aucun appareil n'est ajouté). Notification : abaisser le volet (`& $adb shell cmd statusbar expand-notifications`, capture, lire) : « Neo Calendar » avec l'état et l'action « Quitter ».

Relance après arrêt forcé du processus (`run-as` tue le processus de l'app seulement ; trouver le PID avec `ps`) :

```powershell
$enginePid = (& $adb shell "ps -A | grep libsyncthingnative" | ForEach-Object { ($_ -split '\s+')[1] } | Select-Object -First 1)
& $adb shell run-as com.ahmedmili.neocalendar kill $enginePid
Start-Sleep -Seconds 6
& $adb shell "ps -A | grep -i syncthing"
& $adb shell run-as com.ahmedmili.neocalendar tail -n 5 files/syncthing/logs/engine.log
```

Attendu : un NOUVEAU processus (autre PID) quelques secondes après ; le journal montre une ligne `[Neo Calendar] Le moteur s'est arrêté (code ...) ; nouvel essai dans 2 s (échec 1)`. Puis « Quitter » depuis la notification : processus et service disparaissent, et ne reviennent pas tant que l'app n'est pas relancée ; relancer l'app : le moteur revient (« Quitter » est levé à l'ouverture). Mode « seulement quand l'app est ouverte » : remplacer dans `neo_sync.xml` par `<string name="runMode">OnlyWhenOpen</string>` (et `<boolean name="configured" value="true" />`), relancer l'app, constater le moteur et AUCUN service (`dumpsys` sans `SyncService`), appuyer sur Accueil : le moteur s'arrête quelques secondes plus tard (aucun appareil connecté : rien à attendre ; avec un appareil connecté, jusqu'à 60 s). Condition : `& $adb shell svc wifi disable` puis `& $adb shell svc data disable` : le moteur s'arrête (pause « hors ligne »), `svc wifi enable` / `svc data enable` : il revient. Consigner les résultats dans `.superpowers/syncthing/rapport-t8.md` (local).

- [ ] **Step 8 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
App : chef d'orchestre de la synchro, service specialUse, conditions de fonctionnement, démarrage automatique

Le moteur démarre après la grille, hors du fil principal, seulement en stockage privé. Deux modes (comme Syncthing-Fork avec notification permanente, ou seulement app ouverte avec attente de 60 s), conditions réduites de Syncthing-Fork (mêmes défauts), « Quitter », démarrage automatique désactivé par défaut. Rien ne tourne tant qu'aucun appareil n'est appairé.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 9 : App, changements reçus (relecture, rappels, widget)

Quand un autre appareil met à jour un fichier du dossier, l'app relit le dossier comme après une écriture, reprogramme les rappels et met à jour le widget, écran ouvert ou non. Les évènements du moteur sont regroupés sur 1 s (une rafale de fichiers = une relecture). La ligne d'état et le drapeau « appairé » se mettent aussi à jour.

Décision : le déclencheur est `ItemFinished` (fichier mis à jour ou supprimé par un autre appareil, sans erreur) et le retour au repos d'une synchro (`StateChanged` de `syncing` à `idle`, filet), PAS `RemoteIndexUpdated` que la spec cite : cet évènement annonce un index reçu, pas un fichier déjà écrit sur le disque, une relecture à ce moment-là lirait l'ancien contenu.

**Files:**
- Create: `core/.../sync/SyncEvents.kt`, test `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/SyncEventsTest.kt`
- Modify: `core/.../sync/SyncthingApi.kt` (paramètre `limit` de `events`)
- Create: `app/.../nativeapp/sync/RemoteRefresh.kt`
- Modify: `app/.../nativeapp/sync/SyncController.kt`, `app/.../nativeapp/NativeViewModel.kt`

**Interfaces:**
- Consumes: `SyncthingApi.events`, `SyncController` (Task 8), `readWorkspaceData` (Task 6), `upcomingOccurrences`, `writeReminders`, `writeWidget`, `refreshWidgets` (existants, `internal`).
- Produces :
  - `val ENGINE_EVENT_TYPES: List<String>`, `fun isRemoteChange(event: SyncEvent, folderId: String?): Boolean`, `SyncthingApi.events(since, timeoutSeconds, types, limit = 0)`
  - `object RemoteRefresh { var liveReload: (() -> Unit)?; fun run(context) }`
  - `SyncController.refreshNow()`, `SyncController.lastFolderState`, `SyncController.anyDeviceConnected`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.sync

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncEventsTest {
    private fun event(type: String, data: String) = SyncEvent(1, type, Json.parseToJsonElement(data).jsonObject)

    @Test fun `un fichier recu ou supprime est un changement`() {
        assertTrue(isRemoteChange(event("ItemFinished", """{"folder":"f","item":"a.md","error":null,"type":"file","action":"update"}"""), "f"))
        assertTrue(isRemoteChange(event("ItemFinished", """{"folder":"f","item":"a.md","error":null,"type":"file","action":"delete"}"""), "f"))
    }

    @Test fun `une erreur, un dossier, des metadonnees ou un autre dossier ne comptent pas`() {
        assertFalse(isRemoteChange(event("ItemFinished", """{"folder":"f","item":"a.md","error":"disque plein","type":"file","action":"update"}"""), "f"))
        assertFalse(isRemoteChange(event("ItemFinished", """{"folder":"f","item":"d","error":null,"type":"dir","action":"update"}"""), "f"))
        assertFalse(isRemoteChange(event("ItemFinished", """{"folder":"f","item":"a.md","error":null,"type":"file","action":"metadata"}"""), "f"))
        assertFalse(isRemoteChange(event("ItemFinished", """{"folder":"autre","item":"a.md","error":null,"type":"file","action":"update"}"""), "f"))
    }

    @Test fun `le retour au repos d'une synchro est un changement, pas un debut de synchro`() {
        assertTrue(isRemoteChange(event("StateChanged", """{"folder":"f","from":"syncing","to":"idle"}"""), "f"))
        assertFalse(isRemoteChange(event("StateChanged", """{"folder":"f","from":"idle","to":"syncing"}"""), "f"))
        assertFalse(isRemoteChange(event("StateChanged", """{"folder":"f","from":"scanning","to":"idle"}"""), "f"))
    }

    @Test fun `un index recu n'est pas encore un fichier sur le disque`() {
        assertFalse(isRemoteChange(event("RemoteIndexUpdated", """{"folder":"f","device":"X","items":3}"""), "f"))
    }

    @Test fun `sans identifiant de dossier connu, tout dossier compte`() {
        assertTrue(isRemoteChange(event("ItemFinished", """{"folder":"x","error":null,"type":"file","action":"update"}"""), null))
    }

    @Test fun `la limite est ajoutee a la requete des evenements`() {
        val fake = FakeTransport()
        fake.answer("GET /rest/events?since=0&timeout=0&events=ItemFinished&limit=1", """[{"id":42,"type":"ItemFinished","data":{}}]""")
        assertEquals(42, SyncthingApi(fake).events(0, 0, listOf("ItemFinished"), limit = 1).single().id)
    }
}
```


```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.SyncEventsTest'
```

Attendu : `FAILED`, `Unresolved reference 'isRemoteChange'`, paramètre `limit`.

- [ ] **Step 2 : implémenter**

```kotlin
package com.ahmed.neocalendar.core.sync

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull

private fun JsonObject.text(key: String): String? = (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull

/**
 * Cet évènement dit-il qu'un fichier du dossier vient d'être mis à jour (ou supprimé) par un autre appareil, donc que
 * l'app doit relire le dossier ? `ItemFinished` d'un fichier, sans erreur ; et le retour au repos d'une synchro
 * (`StateChanged` de `syncing` à `idle`), filet pour ce qu'un `ItemFinished` n'aurait pas dit.
 * `RemoteIndexUpdated` ne compte pas : il annonce un index reçu, pas un fichier déjà sur le disque.
 */
fun isRemoteChange(event: SyncEvent, folderId: String?): Boolean {
    val d = event.data
    if (folderId != null && d.text("folder") != folderId) return false
    return when (event.type) {
        "ItemFinished" -> d["error"].let { it == null || it is JsonNull } && d.text("type") == "file" && d.text("action") in setOf("update", "delete")
        "StateChanged" -> d.text("from") == "syncing" && d.text("to") == "idle"
        else -> false
    }
}
```


`SyncthingApi.events` accepte `limit` (la boucle d'évènements part de l'évènement le plus récent, l'historique d'avant le lancement est déjà dans le dossier) :

```diff
--- a/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/SyncthingApi.kt
+++ b/core/src/main/kotlin/com/ahmed/neocalendar/core/sync/SyncthingApi.kt
@@ -162,8 +162,8 @@
     /**
      * Longue requête (`/rest/events`) : rend les évènements de numéro supérieur à `since`, ou une liste vide
-     * au bout de `timeoutSeconds`. Le transport doit accepter un délai de lecture plus long que `timeoutSeconds`.
+     * au bout de `timeoutSeconds` (`limit` > 0 : seulement les plus récents). Le transport doit accepter un délai de lecture plus long que `timeoutSeconds`.
      */
-    fun events(since: Int, timeoutSeconds: Int, types: List<String>): List<SyncEvent> {
-        val path = "/rest/events?since=$since&timeout=$timeoutSeconds&events=${q(types.joinToString(","))}"
+    fun events(since: Int, timeoutSeconds: Int, types: List<String>, limit: Int = 0): List<SyncEvent> {
+        val path = "/rest/events?since=$since&timeout=$timeoutSeconds&events=${q(types.joinToString(","))}" + if (limit > 0) "&limit=$limit" else ""
         val body = call("GET", path, null, (timeoutSeconds + 15) * 1000)
         return json.parseToJsonElement(body).jsonArray.map {
```


```powershell
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.SyncEventsTest' --tests 'com.ahmed.neocalendar.core.sync.SyncthingApiTest'
```

Attendu : `BUILD SUCCESSFUL`, `SyncEventsTest` 6 tests, `SyncthingApiTest` 13.

- [ ] **Step 3 : le rafraîchissement, avec ou sans écran**

`RemoteRefresh` : écran présent, l'écran se relit lui-même (`NativeViewModel.reload`, qui pousse aussi rappels et widget) ; app en arrière-plan sans écran, lecture directe du dossier par la MÊME fonction `readWorkspaceData`, puis rappels et widget :

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import com.ahmed.neocalendar.nativeapp.readWorkspaceData
import com.ahmed.neocalendar.nativeapp.refreshWidgets
import com.ahmed.neocalendar.nativeapp.upcomingOccurrences
import com.ahmed.neocalendar.nativeapp.writeReminders
import com.ahmed.neocalendar.nativeapp.writeWidget
import java.time.Instant

/**
 * Ce que l'app fait quand une synchro a apporté des notes : relire le dossier « comme après une écriture », reprogrammer
 * les rappels et mettre le widget à jour.
 *  - écran ouvert : l'écran se relit lui-même (`NativeViewModel.reload`), ce qui pousse aussi rappels et widget ;
 *  - app en arrière-plan, sans écran : lecture directe du dossier, puis rappels et widget, avec exactement la même lecture.
 */
object RemoteRefresh {
    private const val TAG = "NeoRemoteRefresh"

    /** Posé par le ViewModel tant qu'il existe ; appelé sur le fil principal. */
    @Volatile var liveReload: (() -> Unit)? = null

    fun run(context: Context) {
        val main = Handler(Looper.getMainLooper())
        val live = liveReload
        if (live != null) {
            main.post { live() }
            return
        }
        try {
            val now = Instant.now()
            val data = readWorkspaceData(WorkspaceLocation.open(context, write = false))
            val events = upcomingOccurrences(data, now)
            writeReminders(context, data, events, now)
            writeWidget(context, data, events, now)
            main.post { refreshWidgets(context) }
        } catch (e: Exception) {
            // Une lecture ratée ne touche ni aux rappels ni au widget : les derniers valent mieux que des listes vides.
            Log.w(TAG, "rappels et widget non mis à jour après une synchro", e)
        }
    }
}
```


Le ViewModel se déclare auprès de `RemoteRefresh` tant qu'il existe :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
@@ -164,4 +164,14 @@
     private val devicePrefs = app.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)
 
+    init {
+        // Une synchro qui apporte des notes : l'écran se relit comme après une écriture (rappels et widget suivent).
+        com.ahmed.neocalendar.nativeapp.sync.RemoteRefresh.liveReload = { reload(force = true) }
+    }
+
+    override fun onCleared() {
+        com.ahmed.neocalendar.nativeapp.sync.RemoteRefresh.liveReload = null
+        super.onCleared()
+    }
+
     private val _screen = MutableStateFlow<ScreenState>(ScreenState.Loading)
     val screen: StateFlow<ScreenState> = _screen.asStateFlow()
```


Le contrôleur écoute le moteur (longue requête `/rest/events`, 30 s, délai de lecture de 45 s), regroupe sur 1 s, met à jour la ligne d'état et le drapeau « appairé » (au moins un appareil dans le moteur) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/SyncController.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/sync/SyncController.kt
@@ -3,4 +3,5 @@
 import android.content.Context
 import android.os.SystemClock
+import com.ahmed.neocalendar.core.sync.ENGINE_EVENT_TYPES
 import com.ahmed.neocalendar.core.sync.EngineState
 import com.ahmed.neocalendar.core.sync.FolderState
@@ -8,8 +9,11 @@
 import com.ahmed.neocalendar.core.sync.RunMode
 import com.ahmed.neocalendar.core.sync.StatusLine
+import com.ahmed.neocalendar.core.sync.SyncthingApi
+import com.ahmed.neocalendar.core.sync.SyncthingApiException
 import com.ahmed.neocalendar.core.sync.SyncSetup
 import com.ahmed.neocalendar.core.sync.SyncSettings
 import com.ahmed.neocalendar.core.sync.bindsTcpAndUdp
 import com.ahmed.neocalendar.core.sync.decideRun
+import com.ahmed.neocalendar.core.sync.isRemoteChange
 import com.ahmed.neocalendar.core.sync.pickFreePort
 import com.ahmed.neocalendar.core.sync.summarize
@@ -17,4 +21,9 @@
 import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
 import kotlinx.coroutines.CoroutineScope
+import kotlinx.coroutines.FlowPreview
+import kotlinx.coroutines.channels.BufferOverflow
+import kotlinx.coroutines.flow.MutableSharedFlow
+import kotlinx.coroutines.flow.debounce
+import kotlinx.coroutines.isActive
 import kotlinx.coroutines.Dispatchers
 import kotlinx.coroutines.Job
@@ -68,4 +77,11 @@
         private set
 
+    /** Un fichier est arrivé d'un autre appareil : regroupé sur 1 s avant de relire le dossier (une rafale de fichiers = une relecture). */
+    private val remoteChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
+    private var eventJob: Job? = null
+
+    @OptIn(FlowPreview::class)
+    private val changeDebounce = scope.launch { remoteChanges.debounce(1_000).collect { RemoteRefresh.run(app) } }
+
     init {
         engine.beforeLaunch = { ensureListenPort() }
@@ -73,5 +89,10 @@
         monitor.start()
         scope.launch { settings.settings.collect { reconcile() } }
-        scope.launch { engine.state.collect { publishStatus() } }
+        scope.launch {
+            engine.state.collect { state ->
+                if (state is EngineState.Running) startEventLoop() else eventJob?.cancel()
+                publishStatus()
+            }
+        }
         reconcile()
     }
@@ -171,4 +192,61 @@
     }
 
+    private fun startEventLoop() {
+        eventJob?.cancel()
+        val api = engine.api ?: return
+        eventJob = scope.launch(Dispatchers.IO) {
+            var since = 0
+            try {
+                // On part de l'évènement le plus récent : l'historique d'avant ce lancement est déjà dans le dossier.
+                since = api.events(0, 0, ENGINE_EVENT_TYPES, limit = 1).lastOrNull()?.id ?: 0
+            } catch (e: SyncthingApiException) {
+                // Le moteur n'est pas prêt : la boucle réessaie plus bas.
+            }
+            refreshFromEngine(api)
+            while (isActive && engine.api === api) {
+                try {
+                    val events = api.events(since, 30, ENGINE_EVENT_TYPES)
+                    val folderId = lastFolderId
+                    for (event in events) {
+                        since = maxOf(since, event.id)
+                        if (isRemoteChange(event, folderId)) remoteChanges.tryEmit(Unit)
+                    }
+                    refreshFromEngine(api)
+                } catch (e: kotlinx.coroutines.CancellationException) {
+                    throw e
+                } catch (e: Exception) {
+                    if (engine.api !== api) break
+                    delay(2_000)
+                }
+            }
+        }
+    }
+
+    @Volatile private var lastFolderId: String? = null
+
+    /** Lit l'état du moteur (dossier, connexions, appareils) pour la ligne d'état, la notification et le drapeau « appairé ». */
+    private fun refreshFromEngine(api: SyncthingApi) {
+        try {
+            val me = api.myId()
+            val devices = api.devices().filter { it.id != me }
+            val folder = api.folders().firstOrNull()
+            lastFolderId = folder?.id
+            lastFolderState = folder?.let { api.folderState(it.id) }
+            anyDeviceConnected = api.connections().filterKeys { it != me }.any { it.value }
+            if (devices.isNotEmpty() != settings.value.configured) settings.update { it.copy(configured = devices.isNotEmpty()) }
+        } catch (e: kotlinx.coroutines.CancellationException) {
+            throw e
+        } catch (e: Exception) {
+            // Une lecture ratée garde l'état précédent.
+        }
+        publishStatus()
+    }
+
+    /** Relit l'état maintenant (la page Synchronisation après un geste de l'utilisateur). */
+    fun refreshNow() {
+        val api = engine.api ?: return
+        scope.launch(Dispatchers.IO) { refreshFromEngine(api) }
+    }
+
     internal fun publishStatus() {
         val s = settings.value
```


- [ ] **Step 4 : compiler et lancer toute la suite**

```powershell
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`.

- [ ] **Step 5 : commit**

La preuve sur appareil (note reçue du second Syncthing de test, rappel reprogrammé) demande un moteur appairé : elle est faite à la Task 12.

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
App : une note reçue relit le dossier, reprogramme les rappels et met le widget à jour

ItemFinished (fichier mis à jour ou supprimé par un autre appareil) et retour au repos d'une synchro, regroupés sur 1 s. Écran ouvert : il se relit lui-même ; app en arrière-plan : lecture directe par la même fonction, puis rappels et widget. RemoteIndexUpdated n'est pas un déclencheur : il annonce un index, pas un fichier sur le disque.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 10 : UI, la page Synchronisation

Elle remplace le dialogue d'information (Réglages, Synchronisation) : mode de stockage, état, cet appareil (nom, identifiant en texte, QR code, partage), appareils (connecté ou non, dernière connexion, ajout par QR ou saisie validée par la somme de contrôle, retrait avec confirmation), demandes entrantes avec l'identifiant COMPLET à comparer (rien n'est jamais accepté automatiquement), dossier de notes (proposition d'un appareil accepté : confirmation qui dit ce qui va se passer, deuxième proposition refusée avec explication), fonctionnement (mode, conditions, démarrage automatique, « Quitter »), conflits (compteur, lecture seule), journal du moteur (afficher, partager). Tant que la page est ouverte le moteur tourne (c'est ce qui permet d'afficher l'identifiant et d'appairer sans appareil) ; elle se ferme, il s'arrête s'il n'y a toujours aucun appareil. Les gestes de bascule de stockage (dossier existant, retour à un dossier externe, passage à la synchro intégrée) sont branchés à la Task 11 : leurs lignes sont déjà là, sans effet jusque-là.

Les libellés suivent le dictionnaire de l'app (`res/raw/i18n_fr_en.tsv`) : les textes fixes et les modèles simples sont traduits ; les messages composés de plusieurs valeurs (confirmation d'adoption, messages d'erreur du moteur) restent en français : écart assumé.

**Files:**
- Create: `core/.../sync/LastSeen.kt`, test `core/src/test/kotlin/com/ahmed/neocalendar/core/sync/LastSeenTest.kt`
- Modify (test): `core/src/test/kotlin/com/ahmed/neocalendar/core/i18n/FrenchToEnglishTest.kt`
- Create: `app/.../nativeapp/sync/SyncPageModel.kt`, `app/.../nativeapp/ui/QrCode.kt`, `app/.../nativeapp/ui/SyncPage.kt`
- Modify: `app/.../nativeapp/ui/SettingsScreen.kt`, `app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/res/raw/i18n_fr_en.tsv`

**Interfaces:**
- Consumes: `SyncController`, `SyncSetup`, `SyncthingApi` (Tasks 3, 8, 9), `DeviceIds` (Task 2), `StatusLine` (Task 8), `conflictFiles`, `loadWorkspace` (Task 1), existants : `Group`, `GroupBuilder`, `ChoiceDialog`, `ConfirmPanel`, `BottomPanel`, `SheetFooter`, `TextInput`, `NeoDialog`, `Notices`.
- Produces :
  - `fun lastSeenLabel(connected: Boolean, lastSeenIso: String?, now: Instant, zone: ZoneId = ...): String`
  - `class SyncPageModel(context)` : `ui: StateFlow<SyncUi>`, `suspend fun refresh()`, `addDevice`, `accept`, `reject`, `remove`, `adopt`, `refuseFolder`, `rename`, `localNoteCount()` (chaque geste rend le message d'erreur ou null)
  - `class SyncSwitchActions(onSwitchToIntegrated, onOpenExistingFolder, onBackToExternal)` (no-op par défaut ; branchés Task 11), `SettingsActions.sync`
  - `@Composable internal fun QrCode(text: String, size: Dp = 200.dp, description: String)`

- [ ] **Step 1 : écrire les tests qui échouent**

```kotlin
package com.ahmed.neocalendar.core.sync

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class LastSeenTest {
    private val now = Instant.parse("2026-10-01T12:00:00Z")
    private val utc = ZoneId.of("UTC")

    @Test fun `connecte`() { assertEquals("Connecté", lastSeenLabel(true, null, now, utc)) }

    @Test fun `jamais connecte quand la date manque ou est illisible`() {
        assertEquals("Jamais connecté", lastSeenLabel(false, null, now, utc))
        assertEquals("Jamais connecté", lastSeenLabel(false, "pas une date", now, utc))
    }

    @Test fun `il y a quelques minutes, heures, jours`() {
        assertEquals("Vu à l'instant", lastSeenLabel(false, "2026-10-01T11:59:40Z", now, utc))
        assertEquals("Vu il y a 5 min", lastSeenLabel(false, "2026-10-01T11:55:00Z", now, utc))
        assertEquals("Vu il y a 3 h", lastSeenLabel(false, "2026-10-01T09:00:00Z", now, utc))
        assertEquals("Vu il y a 2 j", lastSeenLabel(false, "2026-09-29T12:00:00Z", now, utc))
    }

    @Test fun `au dela d'une semaine, la date`() {
        assertEquals("Vu le 1 août 2026", lastSeenLabel(false, "2026-08-01T10:00:00Z", now, utc))
    }

    @Test fun `une date dans le futur n'est pas negative`() {
        assertEquals("Vu à l'instant", lastSeenLabel(false, "2026-10-01T12:05:00Z", now, utc))
    }
}
```


Dans `FrenchToEnglishTest.kt`, ajouter ce test avant l'accolade finale de la classe (il lit le vrai dictionnaire) :

```kotlin
    @Test fun `le vrai dictionnaire donne les textes de la synchronisation`() {
        val tsv = File("../app/src/main/res/raw/i18n_fr_en.tsv").takeIf { it.exists() }?.readText() ?: error("res/raw/i18n_fr_en.tsv introuvable")
        val dictionary = FrenchToEnglish(tsv)
        assertEquals("Storage mode", dictionary.translate("Mode de stockage"))
        assertEquals("Built-in sync", dictionary.translate("Synchronisation intégrée"))
        assertEquals("Seen 5 min ago", dictionary.translate("Vu il y a 5 min"))
        assertEquals("3 device(s)", dictionary.translate("3 appareil(s)"))
        assertEquals("Syncing (3 files)", dictionary.translate("Synchronisation en cours (3 fichiers)"))
        assertEquals("Error: boom", dictionary.translate("Erreur : boom"))
        assertEquals("DESKTOP wants to connect", dictionary.translate("DESKTOP veut se connecter"))
        assertEquals("Paused: Wi-Fi non autorisé", dictionary.translate("En pause : Wi-Fi non autorisé"))
    }
```

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.LastSeenTest' --tests 'com.ahmed.neocalendar.core.i18n.FrenchToEnglishTest'
```

Attendu : `FAILED` (`Unresolved reference 'lastSeenLabel'` ; l'assertion `Storage mode` échoue).

- [ ] **Step 2 : implémenter `lastSeenLabel` et le dictionnaire**

```kotlin
package com.ahmed.neocalendar.core.sync

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** « Connecté », « Jamais connecté » ou la dernière connexion d'un appareil (`lastSeen` en texte ISO de Syncthing). */
fun lastSeenLabel(connected: Boolean, lastSeenIso: String?, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String {
    if (connected) return "Connecté"
    val seen = lastSeenIso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "Jamais connecté"
    val ago = Duration.between(seen, now)
    return when {
        ago.isNegative || ago.toMinutes() < 1 -> "Vu à l'instant"
        ago.toMinutes() < 60 -> "Vu il y a ${ago.toMinutes()} min"
        ago.toHours() < 24 -> "Vu il y a ${ago.toHours()} h"
        ago.toDays() < 7 -> "Vu il y a ${ago.toDays()} j"
        else -> "Vu le " + DateTimeFormatter.ofPattern("d MMM yyyy", Locale.FRENCH).withZone(zone).format(seen)
    }
}
```


Dictionnaire : enregistrer ce script dans un fichier temporaire hors du dépôt (`$env:TEMP\i18n-sync.py`) et le lancer ; il ajoute les entrées absentes (clé française unique) en gardant les fins de ligne du fichier :

```python
import sys

# Usage : python3 i18n-sync.py <chemin de res/raw/i18n_fr_en.tsv>
# Ajoute (sans doublon de clé française) les textes de la synchronisation intégrée. Garde les fins de ligne du fichier.
PAIRS = [
    ("Mode de stockage", "Storage mode"),
    ("Vos notes sont dans un dossier que vous avez choisi, synchronisé par un autre outil (Syncthing, stockage en ligne, transfert manuel).",
     "Your notes are in a folder you chose, synchronized by another tool (Syncthing, online storage, manual transfer)."),
    ("La synchronisation intégrée de Neo Calendar est inactive : les deux ne tournent jamais ensemble sur les mêmes notes.",
     "Neo Calendar's built-in sync is inactive: the two never run together on the same notes."),
    ("Dossier synchronisé par une autre app", "Folder synchronized by another app"),
    ("Passer à la synchronisation intégrée", "Switch to built-in sync"),
    ("Recommandé", "Recommended"),
    ("Vider le stockage privé", "Clear private storage"),
    ("Notes d'un passage précédent", "Notes from a previous switch"),
    ("Vos notes sont dans le stockage privé de Neo Calendar, synchronisé par le moteur intégré.",
     "Your notes are in Neo Calendar's private storage, synchronized by the built-in engine."),
    ("Ce mode et un dossier synchronisé par une autre app s'excluent : jamais les deux sur les mêmes notes.",
     "This mode and a folder synchronized by another app exclude each other: never both on the same notes."),
    ("Synchronisation intégrée", "Built-in sync"),
    ("Ouvrir un dossier existant", "Open an existing folder"),
    ("Revenir à un dossier externe", "Go back to an external folder"),
    ("État", "Status"),
    ("Cet appareil", "This device"),
    ("Pour appairer un autre appareil, scannez ce QR code depuis lui, ou saisissez l'identifiant.",
     "To pair another device, scan this QR code from it, or enter the ID."),
    ("Nom", "Name"),
    ("Sans nom", "Unnamed"),
    ("Identifiant", "ID"),
    ("Démarrage du moteur…", "Starting the engine…"),
    ("QR code de l'identifiant de cet appareil", "QR code of this device's ID"),
    ("Afficher le QR code", "Show the QR code"),
    ("Masquer le QR code", "Hide the QR code"),
    ("Copier l'identifiant", "Copy the ID"),
    ("Identifiant copié", "ID copied"),
    ("Partager", "Share"),
    ("Appareils", "Devices"),
    ("Ajouter un appareil", "Add a device"),
    ("Connecté", "Connected"),
    ("Jamais connecté", "Never connected"),
    ("Vu à l'instant", "Seen just now"),
    ("Vu il y a {n} min", "Seen {n} min ago"),
    ("Vu il y a {n} h", "Seen {n} h ago"),
    ("Vu il y a {n} j", "Seen {n} d ago"),
    ("Vu le {}", "Seen on {}"),
    ("Demandes de connexion", "Connection requests"),
    ("Comparez l'identifiant à celui que l'autre appareil affiche avant d'accepter. Rien n'est jamais accepté automatiquement.",
     "Compare the ID with the one the other device shows before accepting. Nothing is ever accepted automatically."),
    ("{} veut se connecter", "{} wants to connect"),
    ("Un appareil", "A device"),
    ("Refuser", "Decline"),
    ("Accepter", "Accept"),
    ("Dossier de notes", "Notes folder"),
    ("Un seul dossier est synchronisé : celui de ce téléphone, partagé automatiquement avec chaque appareil accepté.",
     "A single folder is synchronized: this phone's, shared automatically with each accepted device."),
    ("Dossier partagé", "Shared folder"),
    ("{n} appareil(s)", "{n} device(s)"),
    ("{} propose un dossier", "{} offers a folder"),
    ("Ignorer", "Ignore"),
    ("Synchroniser…", "Sync…"),
    ("Fonctionnement", "Operation"),
    ("Mode", "Mode"),
    ("Comme Syncthing-Fork", "Like Syncthing-Fork"),
    ("Seulement quand l'app est ouverte", "Only when the app is open"),
    ("Démarrage automatique", "Start automatically"),
    ("Sur Wi-Fi", "On Wi-Fi"),
    ("Sur Wi-Fi limité", "On metered Wi-Fi"),
    ("Sur données mobiles", "On mobile data"),
    ("Source d'alimentation", "Power source"),
    ("Secteur et batterie", "Mains and battery"),
    ("Secteur seulement", "Mains only"),
    ("Batterie seulement", "Battery only"),
    ("Respecter l'économiseur de batterie", "Respect battery saver"),
    ("Quitter", "Quit"),
    ("Arrête la synchronisation jusqu'au prochain lancement", "Stops syncing until the next launch"),
    ("Conflits", "Conflicts"),
    ("Quand deux appareils modifient la même note en même temps, Syncthing garde une copie. Elle n'est pas affichée comme évènement ; la fusion arrivera plus tard.",
     "When two devices edit the same note at the same time, Syncthing keeps a copy. It is not shown as an event; merging will come later."),
    ("Fichiers de conflit", "Conflict files"),
    ("Journal du moteur", "Engine log"),
    ("Afficher", "Show"),
    ("Le journal est vide.", "The log is empty."),
    ("Retirer l'appareil", "Remove the device"),
    ("Retirer", "Remove"),
    ("Synchroniser ce dossier", "Sync this folder"),
    ("Synchroniser", "Sync"),
    ("Sur l'autre appareil, ouvrez Syncthing et affichez son identifiant (QR code ou texte), ou celui de Neo Calendar.",
     "On the other device, open Syncthing and show its ID (QR code or text), or Neo Calendar's."),
    ("Scanner un QR code", "Scan a QR code"),
    ("Scannez l'identifiant de l'appareil", "Scan the device ID"),
    ("Identifiant de l'appareil", "Device ID"),
    ("Cet identifiant n'est pas valide (la somme de contrôle ne correspond pas).", "This ID is not valid (the checksum does not match)."),
    ("Nom de l'appareil (facultatif)", "Device name (optional)"),
    ("Nom de cet appareil", "This device's name"),
    ("Aucun appareil : la synchronisation est arrêtée", "No device: sync is stopped"),
    ("Démarrage…", "Starting…"),
    ("À jour", "Up to date"),
    ("Synchronisation en cours ({n} fichiers)", "Syncing ({n} files)"),
    ("Synchronisation en cours (1 fichier)", "Syncing (1 file)"),
    ("En pause : {}", "Paused: {}"),
    ("Hors ligne : aucun appareil connecté", "Offline: no device connected"),
    ("Erreur : {}", "Error: {}"),
    ("Passer à la synchronisation intégrée", "Switch to built-in sync"),
    ("Copier et passer", "Copy and switch"),
    ("Copie et vérification des notes…", "Copying and verifying notes…"),
    ("Ouverture du dossier…", "Opening the folder…"),
    ("Passage terminé", "Switch complete"),
    ("Notes copiées et vérifiées : la synchronisation intégrée est prête.", "Notes copied and verified: built-in sync is ready."),
    ("Dossier ouvert : la synchronisation intégrée est arrêtée.", "Folder opened: built-in sync is stopped."),
    ("Notes copiées dans le dossier choisi. Le stockage privé est conservé.", "Notes copied to the chosen folder. Private storage is kept."),
    ("Stockage privé vidé.", "Private storage cleared."),
    ("Vider", "Clear"),
    ("Patienter", "Please wait"),
    ("Stockage privé de l'application", "App private storage"),
    ("Synchronisation", "Sync"),
]

path = sys.argv[1]
raw = open(path, 'rb').read().decode('utf-8')
eol = '\r\n' if '\r\n' in raw else '\n'
existing = {line.split('\t', 1)[0] for line in raw.splitlines() if '\t' in line and not line.startswith('#')}
added = []
for fr, en in PAIRS:
    if fr in existing:
        continue
    existing.add(fr)
    added.append(f"{fr}\t{en}")
if added:
    if not raw.endswith('\n'):
        raw += eol
    raw += eol.join(added) + eol
    open(path, 'wb').write(raw.encode('utf-8'))
print(f"{len(added)} entrées ajoutées, {len(PAIRS) - len(added)} déjà présentes")
```


```powershell
python $env:TEMP\i18n-sync.py C:\dev\neo-calendar\apps\android\native\app\src\main\res\raw\i18n_fr_en.tsv
```

Attendu : `93 entrées ajoutées, 8 déjà présentes` (chiffres relevés en préparant ce plan ; un écart de quelques unités selon l'état du fichier est normal, relancer le script une seconde fois doit répondre `0 entrées ajoutées`).

```powershell
cd C:\dev\neo-calendar\apps\android\native
.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.sync.LastSeenTest' --tests 'com.ahmed.neocalendar.core.i18n.FrenchToEnglishTest'
```

Attendu : `BUILD SUCCESSFUL`, `LastSeenTest` 5 tests, `FrenchToEnglishTest` 6.

- [ ] **Step 3 : dépendance QR, permission caméra**

zxing-android-embedded 4.3.0 (scanner `ScanContract` et `QRCodeWriter` de zxing core, tiré par transitivité ; Syncthing-Fork utilise la même bibliothèque en 4.3.0 avec zxing core 3.3.0 pour Android 6, inutile ici : `minSdk` 26) :

```diff
--- a/app/build.gradle.kts
+++ b/app/build.gradle.kts
@@ -78,4 +78,6 @@
  // Client HTTP de l'interface REST du moteur (socket Unix, voir sync/UnixSocketFactory.kt).
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
+ // QR code de l'identifiant d'appareil : lecture (caméra) et dessin.
+ implementation("com.journeyapps:zxing-android-embedded:4.3.0")
 }
 
```


Caméra (le scan est facultatif : `uses-feature` non requis ; la bibliothèque demande l'autorisation à l'exécution et déclare son `CaptureActivity`) :

```diff
--- a/app/src/main/AndroidManifest.xml
+++ b/app/src/main/AndroidManifest.xml
@@ -5,4 +5,7 @@
     <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
     <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
+    <!-- Scanner le QR code de l'identifiant d'un autre appareil (page Synchronisation). La caméra n'est pas indispensable. -->
+    <uses-permission android:name="android.permission.CAMERA" />
+    <uses-feature android:name="android.hardware.camera" android:required="false" />
     <!-- A calendar is one of the few kinds of app allowed to ask for exact
          alarms outright: a reminder that drifts by twenty minutes is not a
```


- [ ] **Step 4 : le modèle de la page et le QR code**

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import com.ahmed.neocalendar.core.sync.ConfiguredFolder
import com.ahmed.neocalendar.core.sync.PendingDevice
import com.ahmed.neocalendar.core.sync.PendingFolder
import com.ahmed.neocalendar.core.sync.ProposalDecision
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncthingApi
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.conflictFiles
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

data class DeviceRow(val id: String, val name: String, val connected: Boolean, val lastSeen: String?)

/** Un dossier proposé par un appareil accepté, avec ce que l'app en ferait. */
data class ProposalRow(val proposal: PendingFolder, val proposerName: String, val decision: ProposalDecision)

/** Tout ce que la page Synchronisation lit du moteur, d'un seul coup. */
data class SyncUi(
    val myId: String? = null,
    val myName: String = "",
    val devices: List<DeviceRow> = emptyList(),
    val pendingDevices: List<PendingDevice> = emptyList(),
    val proposals: List<ProposalRow> = emptyList(),
    val folder: ConfiguredFolder? = null,
    val conflicts: Int = 0,
)

/** Les lectures et les gestes de la page Synchronisation, tous hors du fil principal. */
class SyncPageModel(context: Context) {
    private val app = context.applicationContext
    private val controller = SyncController.get(app)

    private val _ui = MutableStateFlow(SyncUi())
    val ui: StateFlow<SyncUi> = _ui.asStateFlow()

    private fun api(): SyncthingApi = controller.engine.api
        ?: throw IllegalStateException("Le moteur de synchronisation démarre : réessayez dans un instant.")

    private fun setup() = SyncSetup(api(), WorkspaceLocation.privateRoot(app).absolutePath)

    /** Relit tout. Sans moteur qui répond, la page garde ce qu'elle montrait. */
    suspend fun refresh() = withContext(Dispatchers.IO) {
        val conflicts = runCatching { conflictFiles(FileWorkspaceStorage(WorkspaceLocation.privateRoot(app))).size }.getOrDefault(0)
        val api = controller.engine.api
        if (api == null) {
            _ui.value = _ui.value.copy(conflicts = conflicts)
            return@withContext
        }
        try {
            val me = api.myId()
            val configured = api.devices()
            val connections = api.connections()
            val seen = api.lastSeen()
            val folder = api.folders().firstOrNull()
            val devices = configured.filter { it.id != me }.map {
                DeviceRow(it.id, it.name.ifBlank { it.id.take(7) }, connections[it.id] == true, seen[it.id])
            }
            val names = devices.associate { it.id to it.name }
            val proposals = devices.flatMap { api.pendingFolders(it.id) }.map {
                ProposalRow(it, names[it.offeredBy].orEmpty(), com.ahmed.neocalendar.core.sync.decideProposal(folder, me, it.offeredBy, it.id))
            }
            _ui.value = SyncUi(
                myId = me,
                myName = configured.firstOrNull { it.id == me }?.name.orEmpty(),
                devices = devices,
                pendingDevices = api.pendingDevices(),
                proposals = proposals,
                folder = folder,
                conflicts = conflicts,
            )
        } catch (e: Exception) {
            _ui.value = _ui.value.copy(conflicts = conflicts)
        }
    }

    /** Nombre de notes du dossier privé : pour dire à l'utilisateur ce qui sera fusionné avant d'adopter un dossier. */
    suspend fun localNoteCount(): Int = withContext(Dispatchers.IO) {
        runCatching { loadWorkspace(FileWorkspaceStorage(WorkspaceLocation.privateRoot(app))).eventFiles.size }.getOrDefault(0)
    }

    /** Rend le message d'erreur, ou null. Les gestes ne lèvent jamais : la page affiche le message. */
    private suspend fun guarded(block: SyncSetup.() -> Unit): String? = withContext(Dispatchers.IO) {
        try {
            setup().block()
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }.also { refresh(); controller.refreshNow() }
    }

    suspend fun addDevice(rawId: String, name: String): String? = guarded { addDevice(rawId, name) }

    suspend fun accept(pending: PendingDevice): String? = guarded { acceptDevice(pending) }

    suspend fun reject(id: String): String? = guarded { rejectDevice(id) }

    suspend fun remove(id: String): String? = guarded { removeDevice(id) }

    suspend fun adopt(proposal: PendingFolder): String? {
        var refused: String? = null
        val error = guarded {
            val decision = adopt(proposal)
            if (decision is ProposalDecision.Refuse) refused = decision.reason
        }
        return error ?: refused
    }

    suspend fun refuseFolder(proposal: PendingFolder): String? = guarded { refuseFolder(proposal) }

    suspend fun rename(name: String): String? = withContext(Dispatchers.IO) {
        try {
            val api = api()
            api.renameDevice(api.myId(), name.trim())
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }.also { refresh() }
    }
}
```


```kotlin
package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** Le QR code d'un texte (l'identifiant d'appareil), noir sur blanc quel que soit le thème : un lecteur ne lit pas un QR sombre. */
@Composable
internal fun QrCode(text: String, size: Dp = 200.dp, description: String = "QR code") {
    val matrix = remember(text) {
        QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 0))
    }
    Box(
        Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).padding(12.dp).semantics { contentDescription = description },
    ) {
        Canvas(Modifier.size(size)) {
            val cell = this.size.width / matrix.width
            for (y in 0 until matrix.height) for (x in 0 until matrix.width) {
                if (matrix.get(x, y)) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
            }
        }
    }
}
```


- [ ] **Step 5 : la page**

```kotlin
package com.ahmed.neocalendar.nativeapp.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.ahmed.neocalendar.core.sync.DeviceIds
import com.ahmed.neocalendar.core.sync.PendingDevice
import com.ahmed.neocalendar.core.sync.PowerSource
import com.ahmed.neocalendar.core.sync.ProposalDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.lastSeenLabel
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import com.ahmed.neocalendar.nativeapp.sync.DeviceRow
import com.ahmed.neocalendar.nativeapp.sync.ProposalRow
import com.ahmed.neocalendar.nativeapp.sync.SyncController
import com.ahmed.neocalendar.nativeapp.sync.SyncPageModel
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.io.File
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Ce que la page Synchronisation demande à l'écran qui l'héberge pour changer de mode de stockage (voir la bascule). */
class SyncSwitchActions(
    val onSwitchToIntegrated: () -> Unit = {},
    val onOpenExistingFolder: () -> Unit = {},
    val onBackToExternal: () -> Unit = {},
)

private sealed interface SyncSheet {
    data object AddDevice : SyncSheet
    data object Rename : SyncSheet
    data object Mode : SyncSheet
    data object Power : SyncSheet
    data object Log : SyncSheet
    data class Remove(val device: DeviceRow) : SyncSheet
    data class Adopt(val row: ProposalRow, val notes: Int) : SyncSheet
}

/** La page Synchronisation (Réglages). Stockage externe : seulement le choix du mode ; stockage privé : tout le reste. */
@Composable
internal fun SyncPage(switchActions: SyncSwitchActions) {
    val context = LocalContext.current
    if (WorkspaceLocation.mode(context) == StorageMode.Integrated) IntegratedSyncPage(switchActions)
    else ExternalSyncPage(switchActions)
}

@Composable
private fun ExternalSyncPage(actions: SyncSwitchActions) {
    val context = LocalContext.current
    val folderName = WorkspaceLocation.displayName(context)
    Group(
        "Mode de stockage",
        note = "Vos notes sont dans un dossier que vous avez choisi, synchronisé par un autre outil (Syncthing, stockage en ligne, transfert manuel).\nLa synchronisation intégrée de Neo Calendar est inactive : les deux ne tournent jamais ensemble sur les mêmes notes.",
    ) {
        row(NeoIcons.FolderOpen, "Dossier synchronisé par une autre app", folderName, chevron = false, onClick = null)
        row(NeoIcons.RefreshCw, "Passer à la synchronisation intégrée", "Recommandé", onClick = actions.onSwitchToIntegrated)
    }
}

@Composable
private fun IntegratedSyncPage(switchActions: SyncSwitchActions) {
    val context = LocalContext.current
    val controller = remember { SyncController.get(context) }
    val model = remember { SyncPageModel(context) }
    val ui by model.ui.collectAsState()
    val status by controller.status.collectAsState()
    val settings by controller.settings.settings.collectAsState()
    val scope = rememberCoroutineScope()
    var sheet by remember { mutableStateOf<SyncSheet?>(null) }
    var showQr by remember { mutableStateOf(false) }

    // Le moteur tourne tant que la page est ouverte (appairage), même sans appareil ; relu toutes les 3 s.
    DisposableEffect(Unit) {
        controller.setPageOpen(true)
        onDispose { controller.setPageOpen(false) }
    }
    LaunchedEffect(Unit) {
        while (true) {
            model.refresh()
            delay(3_000)
        }
    }

    fun report(error: String?) { if (error != null) Notices.show(error) }

    Group("Mode de stockage", note = "Vos notes sont dans le stockage privé de Neo Calendar, synchronisé par le moteur intégré.\nCe mode et un dossier synchronisé par une autre app s'excluent : jamais les deux sur les mêmes notes.") {
        row(NeoIcons.Check, "Synchronisation intégrée", "Recommandé", chevron = false, onClick = null)
        row(NeoIcons.FolderOpen, "Ouvrir un dossier existant", null, onClick = switchActions.onOpenExistingFolder)
        row(NeoIcons.Upload, "Revenir à un dossier externe", null, onClick = switchActions.onBackToExternal)
    }

    Group("État") {
        row(NeoIcons.RefreshCw, status.text(), null, chevron = false, onClick = null)
    }

    Group("Cet appareil", note = "Pour appairer un autre appareil, scannez ce QR code depuis lui, ou saisissez l'identifiant.") {
        val id = ui.myId
        row(NeoIcons.Smartphone, "Nom", ui.myName.ifBlank { "Sans nom" }, onClick = { sheet = SyncSheet.Rename })
        if (id == null) {
            row(null, "Identifiant", "Démarrage du moteur…", chevron = false, onClick = null)
        } else {
            text(id)
            custom { shape ->
                if (showQr) Column(
                    Modifier.fillMaxWidth().padding(vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { QrCode(id, description = "QR code de l'identifiant de cet appareil") }
            }
            row(NeoIcons.Plus, if (showQr) "Masquer le QR code" else "Afficher le QR code", null, chevron = false, onClick = { showQr = !showQr })
            row(NeoIcons.Copy, "Copier l'identifiant", null, chevron = false) {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Identifiant", id))
                Notices.show("Identifiant copié")
            }
            row(NeoIcons.ExternalLink, "Partager", null, chevron = false) {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, id)
                context.startActivity(Intent.createChooser(send, null))
            }
        }
    }

    Group("Appareils") {
        for (device in ui.devices) {
            row(NeoIcons.Users, device.name, lastSeenLabel(device.connected, device.lastSeen, Instant.now()), dot = if (device.connected) Neo.Success else Neo.TextFaint) {
                sheet = SyncSheet.Remove(device)
            }
        }
        row(NeoIcons.Plus, "Ajouter un appareil", null, onClick = { sheet = SyncSheet.AddDevice })
    }

    if (ui.pendingDevices.isNotEmpty()) Group(
        "Demandes de connexion",
        note = "Comparez l'identifiant à celui que l'autre appareil affiche avant d'accepter. Rien n'est jamais accepté automatiquement.",
    ) {
        for (pending in ui.pendingDevices) custom { _ -> PendingDeviceCard(pending, { scope.launch { report(model.accept(pending)) } }, { scope.launch { report(model.reject(pending.id)) } }) }
    }

    Group("Dossier de notes", note = "Un seul dossier est synchronisé : celui de ce téléphone, partagé automatiquement avec chaque appareil accepté.") {
        val folder = ui.folder
        row(NeoIcons.FolderOpen, "Dossier partagé", if (folder == null) "Aucun" else "${folder.deviceIds.size - 1} appareil(s)", chevron = false, onClick = null)
        for (proposal in ui.proposals) custom { _ ->
            ProposalCard(
                proposal,
                onAdopt = { scope.launch { sheet = SyncSheet.Adopt(proposal, model.localNoteCount()) } },
                onIgnore = { scope.launch { report(model.refuseFolder(proposal.proposal)) } },
            )
        }
    }

    Group("Fonctionnement") {
        row(NeoIcons.Clock, "Mode", if (settings.runMode == RunMode.LikeFork) "Comme Syncthing-Fork" else "Seulement quand l'app est ouverte", onClick = { sheet = SyncSheet.Mode })
        if (settings.runMode == RunMode.LikeFork) toggle(NeoIcons.Timer, "Démarrage automatique", settings.autoStart) { on -> controller.settings.update { it.copy(autoStart = on) } }
        toggle(NeoIcons.Globe, "Sur Wi-Fi", settings.conditions.onWifi) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onWifi = on)) } }
        toggle(NeoIcons.Globe, "Sur Wi-Fi limité", settings.conditions.onMeteredWifi) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onMeteredWifi = on)) } }
        toggle(NeoIcons.Smartphone, "Sur données mobiles", settings.conditions.onMobileData) { on -> controller.settings.update { it.copy(conditions = it.conditions.copy(onMobileData = on)) } }
        row(NeoIcons.Bell, "Source d'alimentation", powerLabel(settings.conditions.power), onClick = { sheet = SyncSheet.Power })
        toggle(NeoIcons.Moon, "Respecter l'économiseur de batterie", settings.conditions.respectBatterySaver) { on ->
            controller.settings.update { it.copy(conditions = it.conditions.copy(respectBatterySaver = on)) }
        }
        if (settings.runMode == RunMode.LikeFork && !settings.autoStart) row(NeoIcons.Close, "Quitter", "Arrête la synchronisation jusqu'au prochain lancement", chevron = false) { controller.quit() }
    }

    Group("Conflits", note = "Quand deux appareils modifient la même note en même temps, Syncthing garde une copie. Elle n'est pas affichée comme évènement ; la fusion arrivera plus tard.") {
        row(NeoIcons.TriangleAlert, "Fichiers de conflit", ui.conflicts.toString(), chevron = false, onClick = null)
    }

    Group("Journal du moteur") {
        row(NeoIcons.FileText, "Afficher", null, onClick = { sheet = SyncSheet.Log })
        row(NeoIcons.ExternalLink, "Partager", null, chevron = false) { shareLog(context, controller.engine.logText()) }
    }

    when (val open = sheet) {
        null -> Unit
        SyncSheet.AddDevice -> AddDeviceSheet({ sheet = null }) { id, name -> model.addDevice(id, name) }
        SyncSheet.Rename -> RenameSheet(ui.myName, { sheet = null }) { name -> scope.launch { report(model.rename(name)) }; sheet = null }
        SyncSheet.Mode -> ChoiceDialog(
            "Fonctionnement", listOf(Option("fork", "Comme Syncthing-Fork"), Option("open", "Seulement quand l'app est ouverte")),
            if (settings.runMode == RunMode.LikeFork) "fork" else "open",
            { picked -> controller.settings.update { it.copy(runMode = if (picked == "fork") RunMode.LikeFork else RunMode.OnlyWhenOpen) }; sheet = null },
            { sheet = null },
        )
        SyncSheet.Power -> ChoiceDialog(
            "Source d'alimentation", PowerSource.entries.map { Option(it.name, powerLabel(it)) }, settings.conditions.power.name,
            { picked -> controller.settings.update { it.copy(conditions = it.conditions.copy(power = PowerSource.valueOf(picked))) }; sheet = null },
            { sheet = null },
        )
        SyncSheet.Log -> LogDialog(controller.engine.logText()) { sheet = null }
        is SyncSheet.Remove -> ConfirmPanel(
            "Retirer l'appareil",
            "Retirer « ${open.device.name} » ? Vos notes restent sur ce téléphone ; elles ne seront plus synchronisées avec lui.",
            "Retirer", danger = true, onDismiss = { sheet = null },
        ) { scope.launch { report(model.remove(open.device.id)) }; sheet = null }
        is SyncSheet.Adopt -> ConfirmPanel(
            "Synchroniser ce dossier",
            "${open.row.proposerName.ifBlank { "Cet appareil" }} propose le dossier « ${open.row.proposal.label.ifBlank { "Neo Calendar" }} ». " +
                "Vos ${open.notes} notes locales seront fusionnées avec celles de cet appareil ; aucune note n'est supprimée (une note écrasée reste récupérable dans la corbeille de synchronisation pendant 30 jours).",
            "Synchroniser", danger = false, onDismiss = { sheet = null },
        ) { scope.launch { report(model.adopt(open.row.proposal)) }; sheet = null }
    }
}

private fun powerLabel(power: PowerSource) = when (power) {
    PowerSource.Always -> "Secteur et batterie"
    PowerSource.ChargingOnly -> "Secteur seulement"
    PowerSource.BatteryOnly -> "Batterie seulement"
}

@Composable
private fun PendingDeviceCard(pending: PendingDevice, onAccept: () -> Unit, onReject: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SText("${pending.name.ifBlank { "Un appareil" }} veut se connecter", weight = 500, lineHeight = 19.5f)
        SText(DeviceIds.normalize(pending.id) ?: pending.id, color = Neo.TextFaint, size = 12f, lineHeight = 16f)
        if (pending.address.isNotEmpty()) SText(pending.address, color = Neo.TextFaint, size = 12f)
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextAction("Refuser", color = Neo.TextSecondary, onClick = onReject)
            TextAction("Accepter", onClick = onAccept)
        }
    }
}

@Composable
private fun ProposalCard(row: ProposalRow, onAdopt: () -> Unit, onIgnore: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SText("${row.proposerName.ifBlank { "Un appareil" }} propose un dossier", weight = 500, lineHeight = 19.5f)
        SText("« ${row.proposal.label.ifBlank { row.proposal.id }} »", color = Neo.TextSecondary, size = 13f)
        val refused = row.decision as? ProposalDecision.Refuse
        if (refused != null) SText(refused.reason, color = Neo.Danger, size = 12f, lineHeight = 16f)
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextAction("Ignorer", color = Neo.TextSecondary, onClick = onIgnore)
            if (refused == null) TextAction("Synchroniser…", onClick = onAdopt)
        }
    }
}

@Composable
private fun AddDeviceSheet(onDismiss: () -> Unit, onAdd: suspend (String, String) -> String?) {
    var id by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val scan = androidx.activity.compose.rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { id = it.trim() }
    }
    val valid = DeviceIds.isValid(id)
    BottomPanel(onDismiss) {
        UiText("Ajouter un appareil", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 6.dp))
        UiText(
            "Sur l'autre appareil, ouvrez Syncthing et affichez son identifiant (QR code ou texte), ou celui de Neo Calendar.",
            color = Neo.TextSecondary, size = 14.sp, modifier = Modifier.padding(horizontal = 18.dp),
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), horizontalArrangement = Arrangement.End) {
            TextAction("Scanner un QR code") {
                scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(false).setPrompt("Scannez l'identifiant de l'appareil"))
            }
        }
        TextInput(id, { id = it; error = null }, "Identifiant de l'appareil", Modifier.padding(horizontal = 18.dp), uri = true)
        if (id.isNotBlank() && !valid) UiText("Cet identifiant n'est pas valide (la somme de contrôle ne correspond pas).", color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 6.dp))
        TextInput(name, { name = it }, "Nom de l'appareil (facultatif)", Modifier.padding(start = 18.dp, end = 18.dp, top = 10.dp))
        error?.let { UiText(it, color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 6.dp)) }
        SheetFooter("Annuler", "Ajouter", onDismiss, {
            busy = true
            scope.launch {
                val result = onAdd(id, name)
                busy = false
                if (result == null) onDismiss() else error = result
            }
        }, enabled = valid && !busy)
    }
}

@Composable
private fun RenameSheet(current: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var text by remember { mutableStateOf(current) }
    BottomPanel(onDismiss) {
        UiText("Nom de cet appareil", size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 10.dp))
        TextInput(text, { text = it }, "Nom", Modifier.padding(horizontal = 18.dp))
        SheetFooter("Annuler", "Enregistrer", onDismiss, { onConfirm(text) }, enabled = text.isNotBlank() && text.trim() != current)
    }
}

@Composable
private fun LogDialog(log: String, onDismiss: () -> Unit) {
    NeoDialog("Journal du moteur", onDismiss, dismissLabel = "Fermer") {
        // Les derniers 20 000 caractères : le journal complet se partage.
        SText(log.takeLast(20_000).ifBlank { "Le journal est vide." }, color = Neo.TextSecondary, size = 11f, lineHeight = 15f)
    }
}

/** Le journal complet en fichier (un extra de texte est limité à ~1 Mo par Binder), partagé par le FileProvider de l'app. */
private fun shareLog(context: Context, log: String) {
    val dir = File(context.cacheDir, "updates").also { it.mkdirs() }
    val file = File(dir, "neo-calendar-sync.log")
    file.writeText(log.ifBlank { "Le journal est vide.\n" })
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(send, null))
}
```


Réglages : la ligne « Synchronisation » ouvre cette page (le dialogue `SyncDialog` disparaît), la page s'ouvre sous le titre « Synchronisation » :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SettingsScreen.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SettingsScreen.kt
@@ -130,4 +130,6 @@
     /** Les notes sont dans le stockage privé (synchronisation intégrée) : pas de « Changer de dossier ». */
     val integratedStorage: Boolean = false,
+    /** Les gestes de bascule de la page Synchronisation (dossier existant, retour à un dossier externe, passage à la synchro intégrée). */
+    val sync: SyncSwitchActions = SyncSwitchActions(),
     val oldAppInstalled: Boolean = false,
     val onUninstallOldApp: () -> Unit = {},
@@ -179,5 +181,5 @@
     Column(Modifier.fillMaxSize().background(Neo.Mantle)) {
         SettingsHeader(
-            when (page) { "calendars" -> "Calendriers"; "folder" -> "Dossier de données"; "appearance" -> "Apparence"; "timezones" -> "Fuseaux horaires"; "vaults" -> "Coffres Obsidian"; else -> "Paramètres" },
+            when (page) { "calendars" -> "Calendriers"; "folder" -> "Dossier de données"; "appearance" -> "Apparence"; "timezones" -> "Fuseaux horaires"; "vaults" -> "Coffres Obsidian"; "sync" -> "Synchronisation"; else -> "Paramètres" },
             onBack = { if (page.isNotEmpty()) page = "" else onBack() },
         )
@@ -212,4 +214,5 @@
                     "folder" -> FolderPage(actions)
                     "vaults" -> VaultsPage()
+                    "sync" -> SyncPage(actions.sync)
                     "appearance" -> AppearancePage { choice = "theme" }
                     else -> RootPage(data, actions, version, misfiled, converted, { page = it }, { choice = it }, { converted = null; confirm = "convert" })
@@ -241,5 +244,4 @@
             ICS_REFRESH_MINUTES.map { Option(it.toString(), icsFrequencyLabel(it)) }, data.icsDefaultMinutes.toString(), "Fréquence d'actualisation ICS par défaut",
         ) { actions.onIcsDefault(it.toInt()) }
-        "sync" -> SyncDialog(actions.folderName, onPickFolder = { choice = null; actions.onPickFolder() }, onDismiss = { choice = null })
     }
     when (confirm) {
@@ -324,5 +326,5 @@
         // Coffres Obsidian : la page de l'ancienne s'ouvre, mais ajouter un dossier est sans effet sur téléphone.
         row(NeoIcons.Library, "Coffres Obsidian", "Aucun dossier") { openPage("vaults") }
-        row(NeoIcons.RefreshCw, "Synchronisation", null) { openChoice("sync") }
+        row(NeoIcons.RefreshCw, "Synchronisation", null) { openPage("sync") }
     }
     // Seule l'ancienne version (autre paquet) y figure, et seulement tant qu'elle est installée.
@@ -634,33 +636,2 @@
 }
 
-/** La Synchronisation : un dialogue de texte (dossier, note, trois méthodes) ; `.nc-choice-dialog .nc-set-row` : 52 dp, 16 sp, valeur sous le nom. */
-@Composable
-private fun SyncDialog(folderName: String, onPickFolder: () -> Unit, onDismiss: () -> Unit) {
-    ChoiceCard("Synchronisation", onDismiss) {
-        val shape = RoundedCornerShape(12.dp)
-        Row(
-            Modifier.fillMaxWidth().heightIn(min = 52.dp).pressFill(shape, Neo.Hover, onClick = onPickFolder).padding(horizontal = 16.dp, vertical = 8.dp),
-            verticalAlignment = Alignment.CenterVertically,
-            horizontalArrangement = Arrangement.spacedBy(16.dp),
-        ) {
-            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(NeoIcons.FolderOpen, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
-            Column(Modifier.weight(1f)) {
-                SText("Dossier de données", size = 16f, lineHeight = 22.4f)
-                SText(folderName, color = Neo.TextSecondary, size = 16f, lineHeight = 22.4f, maxLines = 1)
-            }
-            Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
-        }
-        SText(
-            "Neo Calendar range ses données dans le dossier que vous choisissez. La synchronisation est assurée par l'outil que vous retenez.",
-            Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = Neo.SettingsNote, size = 13f, lineHeight = 18.85f,
-        )
-        SText("Méthodes possibles", Modifier.padding(start = 16.dp, top = 6.dp, bottom = 4.dp), color = Neo.SettingsValue, size = 13f, weight = 500)
-        for ((name, how) in listOf("Syncthing" to "Recommandé", "Stockage en ligne" to "OneDrive, Google Drive, Dropbox", "Transfert manuel" to "Par USB")) {
-            Column(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 32.dp, end = 16.dp, top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.Center) {
-                SText(name, size = 16f, lineHeight = 22.4f)
-                SText(how, color = Neo.TextSecondary, size = 16f, lineHeight = 22.4f)
-            }
-        }
-    }
-}
-
```


- [ ] **Step 6 : compiler et tester**

```powershell
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`. Vérifier que le manifeste fusionné déclare `com.journeyapps.barcodescanner.CaptureActivity` et la permission `CAMERA` : `Select-String "CaptureActivity|CAMERA" app\build\intermediates\merged_manifests\debug\processDebugManifest\AndroidManifest.xml`.

- [ ] **Step 7 : vérifier sur l'émulateur neuf (`Pixel_8_Sync`)**

Reprendre `.superpowers/syncthing/adb-outils.ps1` (Task 6, Step 1 bis). Réinitialiser les réglages de synchro du Step 7 de la Task 8 (supprimer `shared_prefs/neo_sync.xml` par `run-as ... rm`) puis installer, ouvrir Réglages, Synchronisation :

```powershell
. C:\dev\neo-calendar\.superpowers\syncthing\adb-outils.ps1
& $adb install -r app\build\outputs\apk\debug\app-debug.apk
& $adb shell run-as $pkg rm -f shared_prefs/neo_sync.xml
& $adb shell am force-stop $pkg
& $adb shell am start -n $pkg/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 4
Tap-Text "Réglages"   # ou le bouton du tiroir : voir la capture et adapter
Tap-Text "Synchronisation"
Start-Sleep -Seconds 6
Shot "t10-page"
```

Lire la capture : groupes « Mode de stockage », « État » (« Aucun appareil : la synchronisation est arrêtée » ou « Démarrage… » puis l'identifiant), « Cet appareil » avec un identifiant de 8 groupes de 7 caractères, « Appareils » vide avec « Ajouter un appareil ». Vérifier que l'identifiant affiché est celui du moteur :

```powershell
& $adb shell run-as $pkg cat files/syncthing/config.xml | Select-String '<device id='
```

Attendu : le premier `<device id="...">` est celui de la page. Afficher le QR code, capturer, vérifier qu'il est noir sur blanc, centré, net (le décodage par un lecteur se fait à la Task 12). « Ajouter un appareil » : saisir `abc` : le message « Cet identifiant n'est pas valide » apparaît et « Ajouter » reste désactivé ; coller l'identifiant de cet appareil : refusé par le geste (« C'est l'identifiant de cet appareil »). Fermer la page, constater que le moteur s'arrête (aucun appareil : `ps -A | grep syncthing` vide quelques secondes après). Changer la langue en English (Réglages, Langue) : les libellés de la page passent en anglais. Consigner dans `.superpowers/syncthing/rapport-t10.md` (local).

- [ ] **Step 8 : commit**

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
UI : page Synchronisation (appareils, QR code, demandes, dossier, fonctionnement, conflits, journal)

Remplace le dialogue d'information. Identifiant d'appareil en texte et en QR, ajout par scan ou saisie validée par la somme de contrôle, demandes entrantes avec l'identifiant complet (jamais acceptées automatiquement), adoption d'un dossier proposé après confirmation, deuxième dossier refusé avec explication, journal du moteur partageable. Le moteur tourne tant que la page est ouverte.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 11 : App, bascule des stockages, dossier existant, retour à un dossier externe, sauvegardes

Les trois passages d'un stockage à l'autre, avec la copie vérifiée de la Task 2 : dossier SAF vers synchronisation intégrée (avec l'avertissement `.stfolder`), « Ouvrir un dossier existant » (accepté seulement avec le marqueur, arrête le moteur), « Revenir à un dossier externe » (arrête le moteur, copie vérifiée dans un dossier VIDE, garde le stockage privé jusqu'à ce que l'utilisateur le vide). Règles communes : l'original n'est jamais modifié ni supprimé, le mode ne change qu'après une copie vérifiée, aucune note n'est écrite pendant une copie (verrou d'écriture du ViewModel), message précis en cas d'échec (quel fichier, pourquoi). Exclusion des secrets du moteur des sauvegardes Android. Tâche à risque (écriture et déplacement de données) : une revue sonnet des fichiers `StorageSwitch.kt` et `StorageSwitchHost.kt`, centrée sur : l'original jamais touché, le mode écrit en dernier, le stockage privé jamais écrasé ni vidé sans geste explicite, le moteur arrêté AVANT toute copie vers l'extérieur.

Écarts assumés : dans le sens « retour à un dossier externe », le dossier choisi doit être vide et la copie s'y fait directement (le renommage atomique d'un dossier temporaire n'existe pas en SAF) ; en cas d'échec, ce qui a été copié est supprimé, et le mode comme le stockage privé n'ont pas bougé. Le dossier privé est conservé après le retour : un nouveau passage à la synchro intégrée est refusé tant que ce stockage contient des notes, « Vider le stockage privé » (confirmation, jamais automatique) lève ce refus.

**Files:**
- Create: `app/.../nativeapp/sync/StorageSwitch.kt`, `app/.../nativeapp/ui/StorageSwitchHost.kt`, `app/src/main/res/xml/data_extraction_rules.xml`, `app/src/main/res/xml/backup_rules.xml`
- Modify: `app/.../nativeapp/NativeViewModel.kt`, `app/.../nativeapp/ui/NativeScreen.kt`, `app/.../nativeapp/ui/SyncPage.kt`, `app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `copyWorkspaceVerified`, `CopyFailure` (Task 2), `workspaceHasNotes` (Task 1), `WorkspaceLocation`, `StorageMode` (Task 6), `SyncController` (Tasks 8 et 9), `SyncSwitchActions` (Task 10).
- Produces :
  - `object StorageSwitch` : `inspectExternal(context): Inspection(hasStfolder)`, `privateHasNotes(context)`, `clearPrivate(context)`, `suspend fun switchToIntegrated(context): String?`, `suspend fun openExisting(context, picked: Intent): String?`, `suspend fun backToExternal(context, picked: Intent): String?` (chaque passage rend le message d'erreur ou null)
  - `NativeViewModel.switchStorage(block: suspend () -> String?): String?`
  - `@Composable internal fun rememberStorageSwitch(viewModel): SyncSwitchActions`

- [ ] **Step 1 : les trois passages**

```kotlin
package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.ahmed.neocalendar.core.workspace.CopyFailure
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.copyWorkspaceVerified
import com.ahmed.neocalendar.core.workspace.initNewWorkspace
import com.ahmed.neocalendar.core.workspace.isNeoCalendarFolder
import com.ahmed.neocalendar.core.workspace.workspaceHasNotes
import com.ahmed.neocalendar.nativeapp.SafWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Les trois passages d'un stockage à l'autre. Règles communes : l'original n'est JAMAIS modifié ni supprimé ; le mode ne
 * change qu'APRÈS une copie vérifiée (liste, tailles, SHA-256) ; sinon rien ne change et le message dit quel fichier et pourquoi.
 * À appeler hors du fil principal, sous le verrou d'écriture du ViewModel (`NativeViewModel.switchStorage`).
 */
object StorageSwitch {
    /** Ce que l'on sait d'un dossier externe avant de le copier : un `.stfolder` dit qu'une autre app Syncthing le partage encore. */
    class Inspection(val hasStfolder: Boolean)

    fun inspectExternal(context: Context): Inspection {
        val source = SafWorkspaceStorage(context, WorkspaceLocation.externalTreeUri(context, write = false))
        return Inspection(source.list("").any { it.name == ".stfolder" })
    }

    /** Le stockage privé contient-il de vraies notes (et pas seulement le marqueur et `.stignore`) ? */
    fun privateHasNotes(context: Context): Boolean {
        val root = WorkspaceLocation.privateRoot(context)
        return root.isDirectory && workspaceHasNotes(FileWorkspaceStorage(root))
    }

    /** « Vider le stockage privé » : geste explicite de l'utilisateur, jamais automatique. */
    fun clearPrivate(context: Context) {
        WorkspaceLocation.privateRoot(context).deleteRecursively()
    }

    /** Dossier externe vers stockage privé. Rend le message d'erreur, ou null quand tout a réussi. */
    suspend fun switchToIntegrated(context: Context): String? {
        if (WorkspaceLocation.mode(context) != StorageMode.External) return "Les notes sont déjà dans le stockage privé."
        val final = WorkspaceLocation.privateRoot(context)
        if (privateHasNotes(context)) {
            return "Le stockage privé contient déjà des notes (d'un passage précédent). Videz-le d'abord (Réglages, Synchronisation) pour éviter de les mélanger."
        }
        val staging = File(final.parentFile, "Neo Calendar.copie-en-cours")
        staging.deleteRecursively()
        return try {
            val source = SafWorkspaceStorage(context, WorkspaceLocation.externalTreeUri(context, write = false))
            staging.mkdirs()
            val destination = FileWorkspaceStorage(staging)
            copyWorkspaceVerified(source, destination)
            initNewWorkspace(destination)
            final.deleteRecursively()
            Files.move(staging.toPath(), final.toPath(), StandardCopyOption.ATOMIC_MOVE)
            WorkspaceLocation.setMode(context, StorageMode.Integrated)
            // L'app est au premier plan : le contrôleur le sait, « Quitter » n'a plus cours, le moteur peut démarrer.
            SyncController.get(context).onAppStarted()
            null
        } catch (e: CopyFailure) {
            staging.deleteRecursively()
            "La copie n'a pas pu être vérifiée, rien n'a changé. ${e.message}"
        } catch (e: Exception) {
            staging.deleteRecursively()
            "Le passage à la synchronisation intégrée a échoué, rien n'a changé : ${e.message ?: e}"
        }
    }

    /**
     * « Ouvrir un dossier existant » : le dossier n'est accepté que s'il porte le marqueur. Le moteur est arrêté, les notes
     * du dossier externe sont lues telles quelles. Le stockage privé est conservé.
     */
    suspend fun openExisting(context: Context, picked: Intent): String? {
        val uri = picked.data ?: return "Aucun dossier choisi."
        val flags = picked.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            context.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (e: Exception) {
            return e.message ?: e.toString()
        }
        val storage = SafWorkspaceStorage(context, uri)
        val marked = try { isNeoCalendarFolder(storage) } catch (e: Exception) { return "Dossier illisible : ${e.message ?: e}" }
        if (!marked) {
            runCatching { context.contentResolver.releasePersistableUriPermission(uri, flags) }
            return "Ce dossier n'est pas un dossier Neo Calendar : il ne contient ni .neo-calendar.json ni le sous-dossier .neo-calendar. Rien n'a changé."
        }
        SyncController.peek()?.engine?.stop()
        WorkspaceLocation.rememberTree(context, uri)
        WorkspaceLocation.setMode(context, StorageMode.External)
        SyncController.peek()?.reconcile()
        return null
    }

    /**
     * « Revenir à un dossier externe » : le moteur s'arrête, puis copie vérifiée des notes privées dans le dossier choisi (qui
     * doit être vide). Le stockage privé est conservé jusqu'à ce que l'utilisateur le vide.
     */
    suspend fun backToExternal(context: Context, picked: Intent): String? {
        val uri: Uri = picked.data ?: return "Aucun dossier choisi."
        val flags = picked.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            context.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (e: Exception) {
            return e.message ?: e.toString()
        }
        val controller = SyncController.peek()
        controller?.engine?.stop()
        return try {
            copyWorkspaceVerified(FileWorkspaceStorage(WorkspaceLocation.privateRoot(context)), SafWorkspaceStorage(context, uri))
            WorkspaceLocation.rememberTree(context, uri)
            WorkspaceLocation.setMode(context, StorageMode.External)
            null
        } catch (e: CopyFailure) {
            runCatching { context.contentResolver.releasePersistableUriPermission(uri, flags) }
            "La copie n'a pas pu être vérifiée, rien n'a changé. ${e.message}"
        } catch (e: Exception) {
            runCatching { context.contentResolver.releasePersistableUriPermission(uri, flags) }
            "Le retour à un dossier externe a échoué, rien n'a changé : ${e.message ?: e}"
        } finally {
            // Mode inchangé : le moteur repart ; mode externe : il reste arrêté.
            controller?.reconcile()
        }
    }
}
```


Le ViewModel donne le verrou d'écriture (aucune note n'est écrite pendant une copie) et relit ensuite le dossier :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt
@@ -626,4 +626,30 @@
     }
 
+    /**
+     * Un changement de stockage (bascule, dossier existant, retour à un dossier externe) : sous le même verrou que les écritures de
+     * notes (aucune note n'est écrite pendant une copie), puis le dossier est relu. Rend le message d'erreur, ou null.
+     */
+    suspend fun switchStorage(block: suspend () -> String?): String? {
+        if (!writeGate.tryEnter()) return "Une écriture est en cours : réessayez dans un instant."
+        _writing.value = true
+        try {
+            val error = withContext(Dispatchers.IO) {
+                try {
+                    block()
+                } catch (e: kotlinx.coroutines.CancellationException) {
+                    throw e
+                } catch (e: Exception) {
+                    e.message ?: e.toString()
+                }
+            }
+            reload(force = true)
+            loading?.join()
+            return error
+        } finally {
+            writeGate.leave()
+            _writing.value = false
+        }
+    }
+
     /** Le dossier tel qu'il est lu à l'instant (les écritures le relisent avant de rendre la main). */
     fun latestData(): WorkspaceData? = (_screen.value as? ScreenState.Ready)?.data
```


- [ ] **Step 2 : les dialogues et les gestes**

```kotlin
package com.ahmed.neocalendar.nativeapp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.ahmed.neocalendar.nativeapp.NativeViewModel
import com.ahmed.neocalendar.nativeapp.sync.StorageSwitch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private sealed interface SwitchStep {
    data object None : SwitchStep
    data class Confirm(val hasStfolder: Boolean) : SwitchStep
    data class Working(val message: String) : SwitchStep
    data class Reminder(val message: String) : SwitchStep
    data object ConfirmClear : SwitchStep
}

/**
 * Les gestes de bascule de la page Synchronisation, avec leurs dialogues (confirmation, copie en cours, rappel). À appeler
 * là où vit le sélecteur de dossier ; rend les actions à passer aux Réglages. Chaque passage tourne sous le verrou
 * d'écriture du ViewModel : aucune note n'est écrite pendant une copie.
 */
@Composable
internal fun rememberStorageSwitch(viewModel: NativeViewModel): SyncSwitchActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf<SwitchStep>(SwitchStep.None) }

    fun finish(error: String?, success: String, reminder: String? = null) {
        step = SwitchStep.None
        if (error != null) Notices.fail(error)
        else if (reminder != null) step = SwitchStep.Reminder(reminder)
        else Notices.show(success)
    }

    val openExisting = rememberLauncherForActivityResult(PickTree()) { picked ->
        if (picked != null) scope.launch {
            step = SwitchStep.Working("Ouverture du dossier…")
            finish(viewModel.switchStorage { StorageSwitch.openExisting(context, picked) }, "Dossier ouvert : la synchronisation intégrée est arrêtée.")
        }
    }
    val backToExternal = rememberLauncherForActivityResult(PickTree()) { picked ->
        if (picked != null) scope.launch {
            step = SwitchStep.Working("Copie et vérification des notes…")
            finish(viewModel.switchStorage { StorageSwitch.backToExternal(context, picked) }, "Notes copiées dans le dossier choisi. Le stockage privé est conservé.")
        }
    }

    when (val s = step) {
        SwitchStep.None -> Unit
        is SwitchStep.Confirm -> ConfirmPanel(
            "Passer à la synchronisation intégrée",
            "Vos notes vont être copiées dans le stockage privé de Neo Calendar, puis vérifiées fichier par fichier (liste, tailles, empreintes). " +
                "Votre dossier actuel n'est ni modifié ni supprimé." +
                if (s.hasStfolder) "\nCe dossier est encore partagé par une autre application Syncthing : une fois le passage fait, retirez-le de cette application, sinon le téléphone le synchroniserait deux fois." else "",
            "Copier et passer", danger = false, onDismiss = { step = SwitchStep.None },
        ) {
            val stfolder = s.hasStfolder
            scope.launch {
                step = SwitchStep.Working("Copie et vérification des notes…")
                val error = viewModel.switchStorage { StorageSwitch.switchToIntegrated(context) }
                finish(
                    error, "Notes copiées et vérifiées : la synchronisation intégrée est prête.",
                    reminder = if (stfolder) "Les notes sont maintenant dans le stockage privé. N'oubliez pas de retirer l'ancien dossier de l'autre application Syncthing, sinon le téléphone le synchroniserait deux fois." else null,
                )
            }
        }
        is SwitchStep.Working -> NeoDialog(s.message, onDismiss = {}, dismissLabel = "Patienter") {
            SText("Ne fermez pas l'application. Rien n'est écrit dans vos notes pendant la copie.", color = Neo.TextSecondary, size = 13f, lineHeight = 18f)
        }
        is SwitchStep.Reminder -> ConfirmPanel("Passage terminé", s.message, "OK", danger = false, onDismiss = { step = SwitchStep.None }) { step = SwitchStep.None }
        SwitchStep.ConfirmClear -> ConfirmPanel(
            "Vider le stockage privé",
            "Les notes copiées dans le stockage privé lors d'un passage précédent seront supprimées de ce téléphone. Vos notes du dossier externe ne sont pas touchées.",
            "Vider", danger = true, onDismiss = { step = SwitchStep.None },
        ) {
            scope.launch {
                withContext(Dispatchers.IO) { StorageSwitch.clearPrivate(context) }
                step = SwitchStep.None
                Notices.show("Stockage privé vidé.")
            }
        }
    }

    return remember {
        SyncSwitchActions(
            onSwitchToIntegrated = {
                scope.launch {
                    val inspection = try {
                        withContext(Dispatchers.IO) { StorageSwitch.inspectExternal(context) }
                    } catch (e: Exception) {
                        Notices.fail(e.message ?: e.toString())
                        return@launch
                    }
                    step = SwitchStep.Confirm(inspection.hasStfolder)
                }
            },
            onOpenExistingFolder = { openExisting.launch(Unit) },
            onBackToExternal = { backToExternal.launch(Unit) },
            onClearPrivate = { step = SwitchStep.ConfirmClear },
        )
    }
}
```


Branchement dans l'écran (le sélecteur de dossier devient `internal` pour être réutilisé) :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt
@@ -137,5 +137,5 @@
 
 /** Le sélecteur de dossier : la même demande que `pickDirectory` de la WebView (lecture, écriture, permission durable). */
-private class PickTree : androidx.activity.result.contract.ActivityResultContract<Unit, android.content.Intent?>() {
+internal class PickTree : androidx.activity.result.contract.ActivityResultContract<Unit, android.content.Intent?>() {
     override fun createIntent(context: android.content.Context, input: Unit) =
         android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
@@ -298,4 +298,5 @@
     }
     val oldAppInstalled by viewModel.oldAppInstalled.collectAsState()
+    val storageSwitch = rememberStorageSwitch(viewModel)
     LaunchedEffect(reloadError) { reloadError?.let { Notices.fail(it) } }
     LaunchedEffect(Unit) { viewModel.notices.collect { Notices.show(it) } }
@@ -720,4 +721,5 @@
                         folderName = viewModel.treeName(),
                         integratedStorage = WorkspaceLocation.mode(context) == StorageMode.Integrated,
+                        sync = storageSwitch,
                         oldAppInstalled = oldAppInstalled,
                         onUninstallOldApp = { uninstallOldApp(context) },
```


La page Synchronisation : une ligne « Vider le stockage privé » en mode dossier externe quand des notes d'un passage précédent y restent :

```diff
--- a/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SyncPage.kt
+++ b/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/SyncPage.kt
@@ -54,4 +54,5 @@
     val onOpenExistingFolder: () -> Unit = {},
     val onBackToExternal: () -> Unit = {},
+    val onClearPrivate: () -> Unit = {},
 )
 
@@ -78,4 +79,8 @@
     val context = LocalContext.current
     val folderName = WorkspaceLocation.displayName(context)
+    // Des notes restées dans le stockage privé d'un passage précédent : on propose de les vider (jamais automatiquement).
+    val leftover by androidx.compose.runtime.produceState(false) {
+        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { com.ahmed.neocalendar.nativeapp.sync.StorageSwitch.privateHasNotes(context) }
+    }
     Group(
         "Mode de stockage",
@@ -84,4 +89,5 @@
         row(NeoIcons.FolderOpen, "Dossier synchronisé par une autre app", folderName, chevron = false, onClick = null)
         row(NeoIcons.RefreshCw, "Passer à la synchronisation intégrée", "Recommandé", onClick = actions.onSwitchToIntegrated)
+        if (leftover) row(NeoIcons.Trash2, "Vider le stockage privé", "Notes d'un passage précédent", chevron = false, onClick = actions.onClearPrivate)
     }
 }
```


- [ ] **Step 3 : exclure les secrets du moteur des sauvegardes**

`allowBackup` est `false` aujourd'hui : ces règles sont une défense en profondeur (si la sauvegarde est un jour activée, la clé et le certificat du moteur ne partent pas : une restauration sur un autre téléphone dupliquerait l'identité de l'appareil Syncthing).

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12 et plus. Le dossier d'état du moteur (clé, certificat, secrets, index) ne quitte jamais le téléphone : une restauration
     sur un autre téléphone dupliquerait l'identité de l'appareil Syncthing. -->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="file" path="syncthing/" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="file" path="syncthing/" />
    </device-transfer>
</data-extraction-rules>
```


```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 et moins : même règle que data_extraction_rules.xml. -->
<full-backup-content>
    <exclude domain="file" path="syncthing/" />
</full-backup-content>
```


```diff
--- a/app/src/main/AndroidManifest.xml
+++ b/app/src/main/AndroidManifest.xml
@@ -42,4 +42,6 @@
     <application
         android:allowBackup="false"
+        android:dataExtractionRules="@xml/data_extraction_rules"
+        android:fullBackupContent="@xml/backup_rules"
         android:hardwareAccelerated="true"
         android:icon="@mipmap/ic_launcher"
```


- [ ] **Step 4 : compiler**

```powershell
.\gradlew.bat :core:test assembleDebug
```

Attendu : `BUILD SUCCESSFUL`. Le manifeste fusionné porte `android:dataExtractionRules` et `android:fullBackupContent` : `Select-String "dataExtractionRules|fullBackupContent" app\build\intermediates\merged_manifests\debug\processDebugManifest\AndroidManifest.xml`.

- [ ] **Step 5 : vérifier la bascule sur l'émulateur `Pixel_8` (celui d'Ahmed, avec son dossier SAF)**

Aucun risque pour le dossier d'origine (jamais modifié), mais l'état de l'app change : sauvegarder avant, restaurer après.

```powershell
. C:\dev\neo-calendar\.superpowers\syncthing\adb-outils.ps1
& $adb -s emulator-5554 devices
& $adb shell run-as $pkg cat shared_prefs/neo_android.xml > C:\dev\neo-calendar\.superpowers\syncthing\neo_android.avant-t11.xml
Get-Content C:\dev\neo-calendar\.superpowers\syncthing\neo_android.avant-t11.xml
```

Lire `tree_uri` : `content://com.android.externalstorage.documents/tree/primary%3A<chemin>` correspond à `/storage/emulated/0/<chemin>` (noter `<chemin>`). Empreinte du dossier d'origine AVANT :

```powershell
$src = "/storage/emulated/0/<chemin>"   # remplacer
& $adb shell "cd '$src' && find . -type f ! -path './.stfolder/*' ! -path './.stversions/*' ! -name '*.sync-conflict-*' | sort | xargs sha256sum" > C:\dev\neo-calendar\.superpowers\syncthing\src-avant.txt
(Get-Content C:\dev\neo-calendar\.superpowers\syncthing\src-avant.txt).Count
```

Installer le build, ouvrir Réglages, Synchronisation : le mode externe affiche « Dossier synchronisé par une autre app » et « Passer à la synchronisation intégrée ». Appuyer : le dialogue explique la copie vérifiée (et, si le dossier contient `.stfolder`, qu'une autre application Syncthing le partage encore). Confirmer « Copier et passer », attendre la fin. Contrôles :

```powershell
& $adb shell run-as $pkg cat shared_prefs/neo_android.xml
& $adb shell run-as $pkg sh -c "cd 'files/Neo Calendar' && find . -type f ! -name '.stignore' | sort | xargs sha256sum" > C:\dev\neo-calendar\.superpowers\syncthing\dest-apres.txt
& $adb shell "cd '$src' && find . -type f ! -path './.stfolder/*' ! -path './.stversions/*' ! -name '*.sync-conflict-*' | sort | xargs sha256sum" > C:\dev\neo-calendar\.superpowers\syncthing\src-apres.txt
Compare-Object (Get-Content C:\dev\neo-calendar\.superpowers\syncthing\src-avant.txt) (Get-Content C:\dev\neo-calendar\.superpowers\syncthing\src-apres.txt)
Compare-Object (Get-Content C:\dev\neo-calendar\.superpowers\syncthing\src-avant.txt) (Get-Content C:\dev\neo-calendar\.superpowers\syncthing\dest-apres.txt)
```

Attendu : `storage_mode` = `Integrated` ; AUCUNE différence entre `src-avant` et `src-apres` (l'original est intact) ni entre `src-avant` et `dest-apres` (copie identique, mêmes empreintes) ; la grille affiche les mêmes notes ; si `.stfolder` était présent, le rappel « retirez l'ancien dossier de l'autre application Syncthing » s'affiche. Puis, en mode privé : « Ouvrir un dossier existant » sur un dossier SANS marqueur (créer `adb shell mkdir /storage/emulated/0/Documents/EssaiSansMarqueur`, le choisir dans le sélecteur) : refusé, message « Ce dossier n'est pas un dossier Neo Calendar... Rien n'a changé. », mode inchangé. « Ouvrir un dossier existant » sur le dossier d'origine (avec marqueur) : accepté, mode `External`, moteur arrêté (`ps -A | grep syncthing` vide), grille identique. Retour à un dossier externe : repasser en intégré (« Vider le stockage privé » d'abord : le passage est REFUSÉ tant que le stockage privé contient des notes, message vérifié), puis « Revenir à un dossier externe » vers un dossier vide (`adb shell mkdir /storage/emulated/0/Documents/EssaiRetour`) : copie vérifiée, `Compare-Object` des empreintes de ce dossier avec `dest-apres.txt` vide de différences, mode `External`, ligne « Vider le stockage privé » visible, stockage privé conservé. Choisir un dossier NON vide pour le retour : refus « Le dossier de destination n'est pas vide ». Restaurer l'état d'origine :

```powershell
& $adb shell run-as $pkg sh -c "cat > shared_prefs/neo_android.xml" < C:\dev\neo-calendar\.superpowers\syncthing\neo_android.avant-t11.xml
& $adb shell am force-stop $pkg
& $adb shell run-as $pkg rm -rf "files/Neo Calendar" shared_prefs/neo_sync.xml
```

Consigner le tout dans `.superpowers/syncthing/rapport-t11.md` (local).

- [ ] **Step 6 : revue sonnet, puis commit**

Revue sonnet limitée à `sync/StorageSwitch.kt` et `ui/StorageSwitchHost.kt` (points en tête de tâche). Corriger sans seconde revue.

```powershell
cd C:\dev\neo-calendar
git add apps/android/native
git commit -m @'
App : bascule vérifiée vers la synchro intégrée, dossier existant, retour à un dossier externe

Copie vérifiée (liste, tailles, SHA-256) dans un dossier temporaire puis renommage atomique ; l'original n'est jamais touché, le mode ne change qu'après la copie, aucune note n'est écrite pendant. Avertissement quand un autre Syncthing partage encore le dossier (.stfolder). Dossier existant accepté seulement avec le marqueur (moteur arrêté) ; retour à un dossier externe vers un dossier vide. Clé et certificat du moteur exclus des sauvegardes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 12 : Vérification sur l'émulateur, cohabitation, temps de lancement, rapport

Tous les points de la spec section 9, vérifiés à l'écran par l'agent (captures lues avec l'outil Read, arbre d'accessibilité, `adb`), pas par Ahmed. Aucun code nouveau, sauf les corrections que cette vérification révèle (un commit par correction, test JUnit quand la logique est pure). Tâche de contrôle : pas de revue d'agent.

Garde-fous (rappel) : le Syncthing REEL du PC d'Ahmed (ports 8384, 22000, 21027, ses données) n'est jamais approché : le « PC » de l'essai est un second Syncthing lancé par cette tâche dans un dossier temporaire, sur des ports tirés au hasard, arrêté par son PID (jamais par son nom de processus). Notes d'essai uniquement dans le calendrier `Essai Compose`. Aucune désinstallation d'app d'émulateur sans demander.

**Files:**
- Create (locaux, non commités) : `.superpowers/syncthing/rapport.md`, captures `t12-*.png`
- Modify (non versionné) : `docs/PROCHAINE_VERSION.md`

**Interfaces:**
- Consumes: tout ce qui précède, APK debug construit par `.\gradlew.bat :core:test assembleDebug`, `adb-outils.ps1` (Task 6), `fetch-test-binary.sh` (Task 5).
- Produces: le rapport de vérification et la décision « livrable / bloqué » sur le temps de lancement.

- [ ] **Step 1 : build final et préparation**

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat :core:test assembleDebug
. C:\dev\neo-calendar\.superpowers\syncthing\adb-outils.ps1
& $adb devices
```

Attendu : `BUILD SUCCESSFUL` ; l'émulateur `Pixel_8_Sync` (créé à la Task 6) est démarré. Repartir d'un état neuf pour lui : désinstaller est INTERDIT sans demander, mais cet AVD ne contient que des essais : `adb -s <id> shell pm clear com.ahmedmili.neocalendar` est autorisé SUR `Pixel_8_Sync` UNIQUEMENT (vérifier son identifiant (`emulator-5554` ou `emulator-5556`) avec `adb devices -l` avant : `Pixel_8_Sync` n'est pas `Pixel_8`). Installer et lancer l'app, constater la première installation (grille vide, aucun écran de choix de dossier), capture `t12-01-premier-lancement`.

- [ ] **Step 2 : le second Syncthing de test, dans un dossier temporaire**

```powershell
$work = Join-Path $env:TEMP "neo-st-pc"
Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$work\home", "$work\Neo Calendar\Essai Compose" | Out-Null
$st = "C:\dev\neo-calendar\apps\android\native\syncthing\.work\windows\syncthing.exe"   # récupéré et vérifié à la Task 5
if (-not (Test-Path $st)) { throw "lancer d'abord fetch-test-binary.sh (Task 5, Step 3)" }
$guiPort = Get-Random -Minimum 41000 -Maximum 44000
$listenPort = Get-Random -Minimum 44001 -Maximum 47000
$env:STGUIADDRESS = "127.0.0.1:$guiPort"; $env:STGUIAPIKEY = "essai-neo"; $env:STNORESTART = "1"; $env:STNOUPGRADE = "1"
$pcProc = Start-Process $st -ArgumentList "serve", "--home=$work\home", "--no-browser", "--no-upgrade" -WindowStyle Hidden -PassThru
Remove-Item Env:STGUIADDRESS, Env:STGUIAPIKEY, Env:STNORESTART, Env:STNOUPGRADE
"PID du Syncthing de test : $($pcProc.Id), gui $guiPort, écoute $listenPort"
```

Vérifier qu'il n'a rien à voir avec le vrai : `Get-NetTCPConnection -OwningProcess $pcProc.Id | Select-Object LocalPort` ne montre ni 8384, ni 22000. Le configurer par l'API (isolé d'Internet : ni découverte, ni relais, ni UPnP) :

```powershell
function Pc($method, $path, $body) {
    $a = @("-s", "-X", $method, "-H", "X-API-Key: essai-neo", "-H", "Content-Type: application/json", "http://127.0.0.1:$guiPort$path")
    if ($body) {
        # Le corps passe par un fichier : pas de guillemets à imbriquer entre PowerShell et curl.
        $tmp = Join-Path $work "body.json"
        [IO.File]::WriteAllText($tmp, $body)
        $a += @("--data", "@$tmp")
    }
    & curl.exe @a
}
Start-Sleep -Seconds 5
$pcId = (Pc GET "/rest/system/status" | ConvertFrom-Json).myID
Pc PATCH "/rest/config/options" ('{"listenAddresses":["tcp://127.0.0.1:' + $listenPort + '"],"globalAnnounceEnabled":false,"localAnnounceEnabled":false,"relaysEnabled":false,"natEnabled":false,"urAccepted":-1,"startBrowser":false}')
"ID du PC d'essai : $pcId"
```

Récupérer l'identifiant et le port d'écoute du téléphone (lus dans ses fichiers : le téléphone doit avoir tourné une fois, page Synchronisation ouverte), rediriger ce port vers le PC, puis déclarer le téléphone côté PC et lui proposer un dossier :

```powershell
$phoneId = ((& $adb shell run-as $pkg cat files/syncthing/config.xml) | Select-String '<device id="([A-Z0-9-]+)"').Matches[0].Groups[1].Value
$phonePort = ((& $adb shell run-as $pkg cat shared_prefs/neo_sync.xml) | Select-String 'name="listenPort" value="(\d+)"').Matches[0].Groups[1].Value
$forward = Get-Random -Minimum 47001 -Maximum 50000
& $adb forward tcp:$forward tcp:$phonePort
Pc PUT "/rest/config/devices/$phoneId" ('{"deviceID":"' + $phoneId + '","name":"Telephone essai","addresses":["tcp://127.0.0.1:' + $forward + '"]}')
Pc PUT "/rest/config/folders/essai-neo" ('{"id":"essai-neo","label":"Neo Calendar","path":"' + ("$work\Neo Calendar" -replace '\\', '/') + '","type":"sendreceive","fsWatcherEnabled":true,"ignorePerms":true,"devices":[{"deviceID":"' + $pcId + '"},{"deviceID":"' + $phoneId + '"}]}')
```

Le `config.xml` du téléphone ne contient son propre identifiant qu'en premier `<device id=...>` : contrôler à l'œil que `$phoneId` est bien celui affiché sur la page Synchronisation du téléphone (capture).

- [ ] **Step 3 : appairage par l'interface (demande entrante, adoption)**

Sur le téléphone, Réglages, Synchronisation : dans les quelques secondes qui suivent, le PC d'essai se connecte, un groupe « Demandes de connexion » apparaît : « <nom> veut se connecter » avec l'identifiant COMPLET (comparer à `$pcId`, capture `t12-02-demande`). Rien n'est accepté tant qu'on n'appuie pas. Appuyer « Accepter » ; puis, quand le groupe « Dossier de notes » montre « <nom> propose un dossier », appuyer « Synchroniser… » : la confirmation dit combien de notes locales seront fusionnées (capture `t12-03-adoption`), confirmer. Vérifier :

```powershell
Pc GET "/rest/system/connections" | ConvertFrom-Json | Select-Object -ExpandProperty connections
& $adb shell run-as $pkg cat files/syncthing/config.xml | Select-String '<folder id='
```

Attendu : le téléphone connecté côté PC ; un seul `<folder id="essai-neo"` côté téléphone (le dossier créé par l'acceptation a été remplacé, c'est la décision `Replace`) ; la page montre « Connecté » et « À jour ». Le cas « deuxième proposition refusée » (dossier déjà lié à un autre appareil que le proposeur) est une décision pure, couverte par `SyncSetupTest` ; sur appareil, vérifier seulement la présentation de la confirmation et du refus s'il se produit.

- [ ] **Step 4 : synchro dans les deux sens, rappels, widget**

Téléphone vers PC : créer, par l'écran du téléphone, une note dans le calendrier `Essai Compose` (titre `Essai A`, horaire dans l'heure qui vient) ; son fichier (écrit par le noyau, atomiquement) doit apparaître côté PC en quelques secondes :

```powershell
Get-ChildItem -Recurse "$work\Neo Calendar" -File | Select-Object FullName, Length
```

Attendu : `Essai Compose\<note>.md` ; aucun `.neo-tmp-*`. PC vers téléphone : fixture dérivée du texte produit par l'app (changer seulement le titre et l'heure) :

```powershell
$note = Get-ChildItem "$work\Neo Calendar\Essai Compose" -Filter *.md | Select-Object -First 1
(Get-Content $note.FullName -Raw) -replace 'Essai A', 'Essai B venu du PC' | Set-Content -NoNewline -Encoding utf8 (Join-Path $note.DirectoryName "Essai B.md")
```

Attendu, app OUVERTE : la note « Essai B venu du PC » apparaît dans la grille sans geste (délai de l'ordre de 10 à 20 s : surveillance de fichiers de Syncthing). Rappels : Réglages, Rappel, choisir 10 minutes avant ; mettre l'heure de `Essai B` dans le quart d'heure à venir (éditer le fichier côté PC) ; app en ARRIÈRE-PLAN (touche Accueil) : attendre l'arrivée de la note, puis

```powershell
& $adb shell dumpsys alarm | Select-String "ahmedmili" -Context 0,3 | Select-Object -First 8
```

Attendu : une alarme exacte du paquet reprogrammée pour la note reçue (l'heure de rappel de `Essai B`). Ajouter le widget à l'écran d'accueil (appui long, Widgets) si le lanceur le permet, sinon noter « non vérifié à l'écran : poser un widget exige le dialogue du lanceur » (même limite que la parité du lot 5a). Suppression : supprimer `Essai B.md` côté PC : la note disparaît de la grille (et le fichier part dans `.stversions` côté téléphone : `run-as ... find "files/Neo Calendar/.stversions" -type f`).

- [ ] **Step 5 : conflit, ignoré au chargement et compté**

Couper la liaison (le PC ne peut plus joindre le téléphone), modifier la MÊME note des deux côtés, rétablir :

```powershell
& $adb forward --remove tcp:$forward
Start-Sleep -Seconds 5
(Get-Content $note.FullName -Raw) -replace 'Essai A', 'Essai A version PC' | Set-Content -NoNewline -Encoding utf8 $note.FullName
# côté téléphone : ouvrir la note « Essai A » et changer son titre en « Essai A version telephone », enregistrer
& $adb forward tcp:$forward tcp:$phonePort
Start-Sleep -Seconds 40
& $adb shell run-as $pkg find "files/Neo Calendar" -name "*sync-conflict*"
```

Attendu : un fichier `*.sync-conflict-*.md` côté téléphone (ou côté PC selon l'horodatage) ; sur le téléphone la grille ne montre la note QU'UNE fois (la copie de conflit n'est jamais chargée) ; la page Synchronisation affiche « Fichiers de conflit : 1 » (capture `t12-04-conflit`). Si le fichier de conflit est apparu seulement côté PC, il voyage aussi : il arrive côté téléphone et le compteur passe à 1.

- [ ] **Step 6 : les deux modes, une condition, « Quitter », arrêt forcé**

Ces quatre contrôles ont été faits sans appareil appairé à la Task 8 ; les refaire avec le PC d'essai connecté : (a) mode « Comme Syncthing-Fork » : service et notification présents, l'app fermée (balayée des récentes), le moteur continue et la synchro d'une nouvelle note du PC aboutit ; (b) mode « Seulement quand l'app est ouverte » : pas de service ; app mise en arrière-plan juste après avoir ÉCRIT une note sur le téléphone : le moteur attend (jusqu'à 60 s) que la note parte, la note est bien arrivée côté PC AVANT l'arrêt du moteur (`ps -A | grep syncthing` vide ensuite) ; (c) condition : `& $adb shell svc wifi disable` puis `& $adb shell svc data disable` : le moteur s'arrête, la page et la notification disent « En pause : hors ligne » ; `svc data enable` seul (Wi-Fi coupé) : « En pause : données mobiles non autorisées » (défaut de Syncthing-Fork) ; cocher « Sur données mobiles » : il repart ; (d) « Quitter » depuis la notification ; (e) arrêt forcé du processus (`run-as ... kill <pid>`) : relance en quelques secondes, journal explicite, le PC se reconnecte.

- [ ] **Step 7 : cohabitation avec Syncthing-Fork**

Syncthing-Fork 2.1.5.0 (APK x86_64 `C:\dev\syncthing-essais\fork-x86_64.apk`, paquet `com.github.catfriend1.syncthingfork`) actif en même temps que l'app, DANS les deux ordres de démarrage :

```powershell
& $adb install -r C:\dev\syncthing-essais\fork-x86_64.apk
& $adb shell am start -n com.github.catfriend1.syncthingfork/.activities.MainActivity
# passer l'accueil de Syncthing-Fork à l'écran (captures), attendre l'état vert
& $adb shell am force-stop com.ahmedmili.neocalendar; & $adb shell am start -n $pkg/com.ahmed.neocalendar.nativeapp.NativeActivity
Start-Sleep -Seconds 15
& $adb shell "ps -A | grep -i 'syncthing\|neocalendar'"
& $adb shell "cat /proc/net/udp /proc/net/udp6 | grep -i ':5223'"
```

Attendu : les DEUX moteurs vivent ; `:5223` (= 21027) n'est tenu en IPv4 que par l'uid de Syncthing-Fork (le nôtre n'écoute plus la découverte locale : `localAnnounceEnabled=false`) ; le port d'écoute de notre moteur est différent de celui de Syncthing-Fork ; la synchro avec le PC d'essai marche pendant que Syncthing-Fork tourne. Refaire dans l'autre ordre (arrêter les deux, lancer l'app d'abord puis Syncthing-Fork) : Syncthing-Fork garde son port de découverte et reste vert. Noter les ports lus.

- [ ] **Step 8 : temps de lancement, après**

Même protocole que la Task 6, Step 1 : état « stockage privé, un appareil appairé, moteur actif » sur `Pixel_8_Sync` ; et, pour comparer à armes égales, l'état « dossier SAF, 1.85 » mesuré à la Task 6 sur `Pixel_8` (même image système, mêmes réglages d'émulateur). 

```powershell
1..6 | ForEach-Object {
  & $adb shell am force-stop $pkg
  Start-Sleep -Seconds 3
  & $adb shell am start -W -n $pkg/com.ahmed.neocalendar.nativeapp.NativeActivity | Select-String "TotalTime"
}
& $adb logcat -d -s ActivityTaskManager:I | Select-String "Displayed com.ahmedmili.neocalendar"
& $adb shell run-as $pkg head -n 3 files/syncthing/logs/engine.log
```

Jeter la première mesure, comparer la moyenne des 5 suivantes à celle de `.superpowers/syncthing/lancement.md`. Critère : la grille s'affiche au moins aussi vite qu'en 1.85 (la lecture par vrai chemin doit même la raccourcir) ; une moyenne « après » supérieure à la moyenne « avant » de plus d'un écart-type des mesures est une régression : BLOQUER la livraison, chercher ce qui travaille avant la grille (profiler : `adb shell am start -W` + `Displayed`, journaux du moteur horodatés, `Trace` de `SyncController.get`), corriger, remesurer. Vérifier aussi que « le moteur prêt vient ensuite » : l'heure de la première ligne de `engine.log` est postérieure à `Displayed`. Mesurer enfin le démarrage à froid d'une installation neuve sans appareil (aucun moteur) pour séparer ce que coûte la lecture par vrai chemin de ce que coûte le moteur.

- [ ] **Step 9 : non-régressions et mise à jour depuis 1.85**

Refaire sur `Pixel_8` (installation d'Ahmed) le contrôle de la Task 6, Step 7 avec l'APK final : rien ne change (dossier SAF, aucun mode écrit, « Changer de dossier » présent, notes identiques, aucun moteur, aucune notification). `.\gradlew.bat :core:test` complet et `node --test scripts/*.test.mjs` (`npm test` en entier si possible) : tout vert. Vérifier que `git status` ne montre ni `jniLibs/` ni `.work/` ni `.superpowers/`.

- [ ] **Step 10 : arrêter proprement le PC d'essai, restaurer l'état**

```powershell
& $adb forward --remove-all
Stop-Process -Id $pcProc.Id
Remove-Item -Recurse -Force $work
```

(arrêt par le PID noté, jamais par le nom du processus). Vérifier que le vrai Syncthing d'Ahmed tourne toujours et n'a pas bougé : `Get-NetTCPConnection -LocalPort 8384 -State Listen` répond comme avant. Restaurer `Pixel_8` comme à la Task 11 (Step 5, restauration).

- [ ] **Step 11 : rapport, reste à faire, commande de livraison**

Écrire `.superpowers/syncthing/rapport.md` : un tableau « point de la spec section 9 / résultat / capture ou mesure » (première installation, mise à jour depuis 1.85, bascule vérifiée, synchro deux sens, rappels reprogrammés, les deux modes, condition Wi-Fi coupé, « Quitter », relance après arrêt forcé, cohabitation Syncthing-Fork dans les deux ordres, temps de lancement avant / après avec moyennes et écarts-types), les écarts assumés (messages composés non traduits ; retour à un dossier externe vers un dossier vide ; widget non vérifié à l'écran si le lanceur l'interdit), les valeurs relevées à la CI quand elles existeront (durée de `syncthing-build` à froid et avec cache, taille de l'APK release avec les deux ABI du moteur, durée du test à deux moteurs) avec la commande `gh run list --workflow=release.yml` / `gh run view <id> --log` pour les lire.

Ajouter à `docs/PROCHAINE_VERSION.md` (non versionné, le créer s'il manque) les suites : sous-projet 2 (PC : Syncthing embarqué, migration de qui a déjà un Syncthing), sous-projet 3 (appairage simplifié entre deux Neo Calendar), sous-projet 4 (résolution automatique des `*.sync-conflict-*`), conditions non reprises (liste de SSID, itinérance, mode avion, synchro auto des données, horaire), index des notes pour le démarrage.

Journal de dev : faire écrire par un agent `haiku` (modèle explicite) les fichiers `C:\Neo Calendar\Développement\2026-10-xx Neo Calendar · <tâche>.md` (un par tâche livrée, évènements horodatés, jamais « toute la journée », format d'un voisin lu avant d'écrire).

Livraison : ne PAS lancer `git ship` ; donner à Ahmed la commande à copier-coller, par exemple `git ship minor "Synchronisation intégrée sur Android : Syncthing embarqué, notes en stockage privé pour les nouvelles installations"`.

- [ ] **Step 12 : commit des corrections éventuelles**

Chaque correction que la vérification a rendue nécessaire est déjà commitée avec son test. Rien d'autre à commiter : le rapport et les captures sont locaux.

## Couverture de la spec

| Spec | Où |
|---|---|
| 1. Principes, lancement le plus rapide, mesure avant / après | Global Constraints ; Task 6 (mesure avant), Task 8 (le moteur démarre après la grille, hors du fil principal), Task 12 (mesure après, critère bloquant) |
| 2. Premier lancement sans question ; mise à jour sans rien changer ; deux modes exclusifs | Task 6 (`resolveStorageMode`, `prepareNewInstall`), Task 8 (le moteur ne démarre jamais en dossier externe), Task 11 |
| 2. Bascule SAF vers privé (`.stfolder`, copie, vérification, renommage atomique, original intact) ; dossier existant ; retour externe | Task 2 (copie vérifiée), Task 11 |
| 3. `FileWorkspaceStorage`, écriture atomique, fichiers ignorés dans les deux modes, `.stignore`, changements reçus regroupés sur 1 s | Task 1, Task 6, Task 9 |
| 4. Binaire compilé depuis les sources signées, deux ABI, `useLegacyPackaging` | Task 4 |
| 4. Configuration du moteur, ports, interface locale en socket Unix, supervision, journal | Tasks 3, 7, 8 |
| 5. Deux modes de fonctionnement, démarrage automatique, conditions réduites | Task 8 |
| 6. Page Synchronisation (mode, état, cet appareil, appareils, demandes, dossier, fonctionnement, conflits, journal) | Task 10 (et Task 11 pour les gestes de mode de stockage) |
| 7. Sécurité (pas d'accès local sans secret, appareils et dossier jamais acceptés seuls, binaire vérifié, statistiques coupées, secrets hors sauvegardes) | Tasks 3, 4, 7, 10, 11 |
| 8. Table des erreurs | copie : Tasks 2 et 11 ; moteur : Task 7 ; port : Task 8 ; disque : `StatusLine` (Task 8) ; identifiant : Tasks 2 et 3 ; second dossier : Task 3 ; conflit : Tasks 1 et 10 |
| 9. Tests JUnit, intégration CI, émulateur, cohabitation, lancement | Tasks 1, 2, 3, 5, 12 |
| 10. Vérifications préalables | Faites par les essais du 2026-10-01 ; reste à relever : taille de l'APK et durées CI (Tasks 4 et 12) |

## Décisions prises en écrivant ce plan (à relire)

- **Test d'intégration avancé** (Task 5 au lieu de la fin) : il valide l'API REST sur de vrais moteurs avant toute ligne d'Android.
- **`STNODEFAULTFOLDER` abandonnée** : absente de Syncthing v2.1.5 (vérifié dans le tarball). Un moteur neuf n'a aucun dossier, c'est testé.
- **`SOURCE_DATE_EPOCH=0` ne marche pas** avec `build.go` (il exige une valeur positive) : sans dépôt git, deux compilations auraient différé d'un horodatage. Époque épinglée dans `version.env`, `-trimpath` ajouté ; reproductibilité vérifiée entre deux dossiers.
- **`loadWorkspace(keepConflictCopies)`** : un filtre naïf sur `*.sync-conflict-*` aurait cassé le nettoyage existant des doublons des liens ICS (deux tests déjà dans le dépôt le prouvent) : seul ce nettoyage garde les copies de conflit.
- **`RemoteIndexUpdated` n'est pas un déclencheur de relecture** (la spec le cite) : il annonce un index, pas un fichier sur le disque ; `ItemFinished` et le retour au repos d'une synchro suffisent.
- **Moteur pendant la page ouverte** : pour afficher l'identifiant et appairer sans appareil, le moteur tourne tant que la page Synchronisation est ouverte, sans service ni notification, puis s'arrête s'il n'y a toujours aucun appareil.
- **Acceptation d'une demande entrante** : si l'appareil n'a pas encore proposé de dossier, l'app crée le sien (partagé avec lui) ; si le PC propose ensuite le sien, il le REMPLACE (même chemin, aucune note perdue) tant que le dossier n'est lié qu'au proposeur ; sinon proposition refusée avec explication.
- **Retour à un dossier externe** : vers un dossier vide, copie directe (pas de renommage atomique en SAF).
- **Un moteur à l'arrêt si hors ligne** (comme Syncthing-Fork) : pause « hors ligne », pas moteur qui tourne dans le vide.
- **Messages composés** (adoption, erreurs du moteur) non traduits en anglais.

## Ce que ce plan n'a PAS pu vérifier

- Le code de l'app (Tasks 6 à 11) compile (`assembleDebug` avec un `.so` x86_64 et les tests du noyau verts sur une copie jetable) mais n'a JAMAIS tourné sur un appareil pendant la rédaction : le socket Unix dans le processus d'une vraie app (l'essai du 2026-10-01 l'a validé en `app_process`), le service `specialUse`, le scan de QR code, la notification, les relances, tout ce que décrivent les Steps de vérification des Tasks 8, 10, 11 et 12.
- Le `.so` arm64-v8a n'a pas été compilé (seul x86_64 l'a été, deux fois, reproductible). Aucune exécution de la CI (cache, durée, NDK sous Linux, `sdkmanager "ndk;30.0.16248370"`).
- `TwoEnginesTest` a tourné deux fois, 2 tests verts en 19 s à chaque fois : avec un Syncthing Windows compilé depuis le tarball, puis avec le zip officiel Windows récupéré et vérifié par `fetch-test-binary.sh`. Jamais avec le binaire Linux.
- Les commandes `adb` et PowerShell des Tasks 6 à 12 (`avdmanager`, `uiautomator`, `Tap-Text`, `run-as`, `dumpsys`) sont écrites sans émulateur sous la main : à ajuster à la première exécution.
- Le décodage du QR code par un vrai lecteur, le widget à l'écran (dialogue du lanceur), les durées CI.
