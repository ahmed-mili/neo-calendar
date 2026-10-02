# Android : lancement rapide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au lancement à froid de l'app Android native, la grille est remplie et utilisable en 1 s au plus (dossier SAF de 543 notes, 611 appels SAF aujourd'hui, 8,3 s), et un rond de chargement tourne tant que l'app n'est pas utilisable.

**Architecture:** Le noyau JVM pur gagne `CachedWorkspaceStorage`, qui enveloppe un `WorkspaceStorage` : `list` toujours délégué (il porte `lastModified` et le nouveau `size`), `readText` rendu depuis une copie quand date et taille concordent, lectures réelles en parallèle (4 au plus) par un nouveau `readTexts` que `loadWorkspace` appelle une fois les notes listées. La copie vit dans `filesDir/note-cache.bin` (format versionné, identité du dossier, somme de contrôle, écriture atomique), chargée et écrite hors du fil principal par `NativeViewModel.read()`. L'état `Loading` montre un `CircularProgressIndicator` aux couleurs du thème.

**Tech Stack:** Kotlin, JUnit 4 (`:core:test`, noyau JVM pur), Jetpack Compose Material 3, Android SAF (`DocumentsContract`), `java.util.concurrent`, `java.util.zip.CRC32`.

**Spec:** `docs/superpowers/specs/2026-10-02-android-lancement-rapide-design.md` (le lire en entier avant la Task 1).

## Global Constraints

Règles d'Ahmed et valeurs de la spec, qui s'imposent à toutes les tâches.

- **Fiabilité d'abord** : la copie ne sert qu'à éviter des lectures ; toute écriture passe par le dossier réel, comme aujourd'hui. Jamais de grille affichée depuis une copie sans avoir listé le dossier (`list` toujours délégué).
- **Le lancement le plus rapide possible** : rien de nouveau sur le chemin du premier écran ; la copie est chargée et écrite hors du fil principal ; l'écriture ne retarde jamais l'affichage. Critère : grille remplie et utilisable en **1 s au plus** à froid sur le téléphone d'Ahmed (mesure du §1 de la spec : 8,3 s, 611 appels SAF, 6 950 ms avant). Une régression BLOQUE la livraison.
- **Aucune migration** : une mise à jour ne change rien pour l'utilisateur ; sans copie (premier lancement après la mise à jour), lecture complète puis copie écrite ; aucun réglage, aucune demande.
- **Tout en Kotlin, aucun fichier Java créé.** D'autres personnes ont l'app : un dossier SAF existant reste le stockage.
- Critère de fraîcheur (celui de Syncthing) : une entrée de la copie sert si et seulement si `lastModified` ET `size` du listage réel sont connus (`lastModified > 0`, `size >= 0`) et égaux à ceux de la copie. Un fichier sans date ou sans taille connue est toujours relu. `size` vaut `-1` quand le stockage ne le sait pas.
- Lectures réelles en parallèle, **4 au plus** ; l'ordre et le résultat de `loadWorkspace` restent identiques à une lecture en série.
- Copie : fichier unique `filesDir/note-cache.bin`, jamais synchronisé, **exclu des sauvegardes** ; version du format, identité du dossier (URI SAF ou chemin privé), par fichier chemin, `lastModified`, `size`, contenu. Écriture atomique (temporaire puis renommage). Copie illisible, version inconnue ou dossier différent : ignorée et reconstruite, **jamais d'erreur visible**. Écriture impossible (disque plein) : ignorée et journalisée.
- Rond de chargement : indicateur circulaire qui tourne, centré, jeton d'accent du thème (`Neo.Accent`), pendant `ScreenState.Loading` une fois l'écran de démarrage relâché ; le plafond de 1,5 s de `holdSplashUntilReady` ne change pas.
- Appareils : l'émulateur `Pixel_8` ; CHAQUE commande adb porte `-s emulator-5554`. Le téléphone d'Ahmed `SGPZQ84XNFDQBE8L` sert UNIQUEMENT aux mesures et à l'installation de la version livrée : jamais d'APK de debug (signature différente), jamais d'écriture dans ses notes. Ne pas toucher à `emulator-5556`.
- **Commits** en français, avec les deux trailers : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex`.

Conventions de travail (reprises de `.superpowers/sdd/2026-10-01-android-syncthing-embarque/global-constraints.md`) :

- Copie de travail `C:\dev\neo-calendar`, branche `android-parite`. Commandes PowerShell dans `C:\dev\neo-calendar\apps\android\native`, avec `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`. Build : `.\gradlew.bat :core:test assembleDebug`. `$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.
- **Piège Windows** : `--tests '*mot*'` est transformé en nom de fichier par le lanceur Java. Toujours des noms de classe complets : `--tests 'com.ahmed.neocalendar.core.workspace.CachedWorkspaceStorageTest'`.
- **Fins de ligne** : les sources sont en CRLF (`core.autocrlf=true`). Les blocs de ce plan sont en LF : créer les fichiers neufs avec l'outil Write, modifier les existants avec l'outil Edit (garde les fins de ligne du fichier) ; un bloc `diff` se reporte hunk par hunk.
- Émulateur : ne JAMAIS désinstaller l'app (`adb install -r` seulement ; échec de signature : s'arrêter et demander). Sauvegarder `shared_prefs/neo_android.xml` avant tout essai de bascule.
- Pas de revue d'agent pour les tâches à faible risque (UI) ; une revue (sonnet) pour les Tasks 2, 3 et 4 (fraîcheur des données, persistance, branchement), jamais de re-revue après un correctif. Tout agent délégué : modèle `sonnet` écrit explicitement ; lire `quota` avant chaque dispatch, s'arrêter à 90 % sur 5 h sauf reset dans 20 min ou moins.

## Review Focus

Entrées et conditions que la spec implique sans qu'une tâche les teste d'elle-même, les plus probables d'abord. Chaque ligne a son test dans la tâche indiquée.

1. **Copie périmée servie** : fichier modifié alors que date ET taille sont identiques (limite connue de la spec, partagée avec Syncthing, à ne pas élargir en silence) ; date à 0 ou taille à -1 : toujours relu ; fichier remplacé par un autre de même chemin (date ou taille change) : relu ; horloge qui recule (date différente, même plus ancienne) : relu, la comparaison est une égalité, jamais un « plus récent que » (Task 2 : tests de date, de taille, d'inconnus, d'égalité stricte).
2. **Copie d'un autre dossier** après un changement de dossier SAF, une bascule Integrated/External ou un retour : identité différente, copie ignorée ; l'identité est vérifiée avant ET après l'ouverture du stockage (Task 3 : `NoteCacheCodecTest` identité ; Task 4 : garde d'identité dans `read()`).
3. **Fichier de copie tronqué, corrompu, d'une autre version, vide** : jamais d'exception, jamais d'erreur à l'écran, copie reconstruite (Task 3 : toutes les troncatures, un octet changé, version inconnue, fichier vide, déchets).
4. **Lecture parallèle** qui changerait l'ordre des notes, avalerait une erreur ou dépasserait 4 fils ; un fichier listé qui disparaît entre le listage et la lecture ; deux fichiers illisibles : l'erreur est celle du premier dans l'ordre de la série (Task 2 : égalité avec la série, pic de simultanéité, ordre de l'erreur ; Task 1 : même ordre en série).
5. **Coût ajouté au lancement** : décodage de la copie sur le chemin de la lecture, écriture de la copie à chaque lecture même inchangée, mémoire tenue après la lecture (Task 2 : `changed` faux sans modification donc aucune écriture ; Task 4 : écriture hors du fil de lecture, instantané seul retenu ; Task 6 : mesures).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `core/.../workspace/WorkspaceStorage.kt` (modifié) | `Entry.size`, `readTexts` par défaut en série |
| `core/.../workspace/Workspace.kt` (modifié) | `loadWorkspace` : lister d'abord, puis `readTexts` en un appel |
| `core/.../workspace/FileWorkspaceStorage.kt` (modifié) | `size` par `length()` |
| `core/.../workspace/CachedWorkspaceStorage.kt` (créé) | `CachedFile`, `CachedWorkspaceStorage` (copie, critère, lecture parallèle) |
| `core/.../workspace/NoteCacheCodec.kt` (créé) | format binaire, version, identité, CRC32 |
| `core/.../workspace/NoteCacheFile.kt` (créé) | lecture tolérante et écriture atomique du fichier |
| `app/.../SafWorkspaceStorage.kt` (modifié) | `COLUMN_SIZE`, `listings` concurrent |
| `app/.../WorkspaceLocation.kt` (modifié) | `cacheIdentity` |
| `app/.../NativeViewModel.kt` (modifié) | `read()` passe par la copie |
| `app/src/main/res/xml/backup_rules.xml`, `data_extraction_rules.xml` (modifiés) | exclusion de la copie |
| `app/.../ui/NativeScreen.kt` (modifié) | rond de chargement |
| tests `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/` | `CountingStorage.kt` (aide), `ReadTextsTest.kt`, `FileWorkspaceStorageSizeTest.kt`, `CachedWorkspaceStorageTest.kt`, `NoteCacheCodecTest.kt`, `NoteCacheFileTest.kt` |

Déviation de la spec, assumée : le §5 place les tests du format de la copie côté « App ». Le module `app` n'a aucun dossier de tests ; le codec et le fichier vivent donc dans le noyau (java.io pur), testés en JUnit `:core:test` comme le reste. L'app n'a que du branchement.

Hors périmètre, inchangé : `RemoteRefresh.kt` (relecture app fermée après une synchro reçue, stockage privé) et `SyncPageModel.kt` lisent sans copie ; ils profitent seulement du `readTexts` par défaut en série, sans changement de comportement.

Les chemins `core/...` ci-dessus sont sous `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/`, ceux `app/...` sous `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/`.

---

### Task 1: Noyau : `size` dans `Entry`, `readTexts`, `loadWorkspace` en deux temps

**Files:**
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/WorkspaceStorage.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/Workspace.kt:32-76`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/FileWorkspaceStorage.kt` (méthode `list`)
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/SafWorkspaceStorage.kt`
- Create: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/CountingStorage.kt`
- Test: `.../workspace/ReadTextsTest.kt`, `.../workspace/FileWorkspaceStorageSizeTest.kt`

**Interfaces:**
- Consumes: `WorkspaceStorage`, `loadWorkspace(storage, keepConflictCopies)` existants.
- Produces:
  - `WorkspaceStorage.Entry(name: String, isDirectory: Boolean, lastModified: Long = 0L, size: Long = -1L)`
  - `WorkspaceStorage.readTexts(relativePaths: List<String>): List<String?>` : méthode d'interface avec corps par défaut = `relativePaths.map { readText(it) }` ; même longueur et même ordre que l'entrée, `null` pour un fichier absent.
  - `loadWorkspace` inchangé de l'extérieur ; lit toutes les notes en UN appel `readTexts`, dans l'ordre de parcours de la série ; un fichier listé mais illisible lève `java.io.IOException("Lecture impossible : <chemin>")` pour le PREMIER chemin illisible dans l'ordre.
  - Test : `internal class CountingStorage` (voir Step 1).

- [ ] **Step 1: Écrire l'aide de test `CountingStorage` et les tests qui échouent**

Créer `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/CountingStorage.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Un stockage en mémoire qui compte ses appels et mesure la simultanéité des lectures. Les chemins sont
 * ceux du stockage ("Cal/a.md") ; les dossiers se déduisent des chemins.
 */
internal class CountingStorage(private val readDelayMs: Long = 0L) : WorkspaceStorage {
    class Stamped(var text: String, var lastModified: Long, var size: Long)

    val files = java.util.TreeMap<String, Stamped>()
    /** Chemins listés mais dont la lecture rend null (fichier disparu ou illisible). */
    val unreadable = mutableSetOf<String>()
    val reads = ConcurrentHashMap<String, AtomicInteger>()
    val listCalls = AtomicInteger()
    private val running = AtomicInteger()
    val peak = AtomicInteger()

    fun put(path: String, text: String, lastModified: Long = 1000L, size: Long = text.toByteArray(Charsets.UTF_8).size.toLong()) = apply {
        files[path] = Stamped(text, lastModified, size)
    }

    /** Lectures de notes (`.md`) seulement : les réglages lus au passage ne comptent pas. */
    fun noteReads(): Int = reads.filterKeys { it.endsWith(".md") }.values.sumOf { it.get() }

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        listCalls.incrementAndGet()
        val prefix = if (relativeDir.isEmpty()) "" else "$relativeDir/"
        val out = LinkedHashMap<String, WorkspaceStorage.Entry>()
        for ((path, stamped) in files) {
            if (!path.startsWith(prefix)) continue
            val rest = path.substring(prefix.length)
            if (rest.contains('/')) {
                val dir = rest.substringBefore('/')
                out.getOrPut(dir) { WorkspaceStorage.Entry(dir, true) }
            } else {
                out[rest] = WorkspaceStorage.Entry(rest, false, stamped.lastModified, stamped.size)
            }
        }
        return out.values.sortedBy { it.name.lowercase(Locale.ROOT) }
    }

    override fun readText(relativePath: String): String? {
        reads.getOrPut(relativePath) { AtomicInteger() }.incrementAndGet()
        val now = running.incrementAndGet()
        peak.accumulateAndGet(now) { a, b -> maxOf(a, b) }
        try {
            if (readDelayMs > 0) Thread.sleep(readDelayMs)
            if (relativePath in unreadable) return null
            return files[relativePath]?.text
        } finally {
            running.decrementAndGet()
        }
    }
}
```

Créer `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/ReadTextsTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ReadTextsTest {
    @Test fun `size vaut -1 quand le stockage ne le dit pas`() {
        assertEquals(-1L, WorkspaceStorage.Entry("a.md", false, 5L).size)
        assertEquals(-1L, WorkspaceStorage.Entry("a.md", false).size)
    }

    @Test fun `readTexts par defaut lit dans l'ordre demande et rend null pour un absent`() {
        val s = CountingStorage().put("Cal/a.md", "A").put("Cal/b.md", "B")
        assertEquals(listOf("B", null, "A"), s.readTexts(listOf("Cal/b.md", "Cal/zz.md", "Cal/a.md")))
        assertEquals(emptyList<String?>(), s.readTexts(emptyList()))
    }

    @Test fun `loadWorkspace garde l'ordre de la serie, sous-dossiers compris`() {
        val s = CountingStorage()
            .put("Cal2/b.md", "B")
            .put("Cal1/sub/c.md", "C")
            .put("Cal1/a.md", "A")
            .put("Cal1/notes.txt", "pas une note")
        val loaded = loadWorkspace(s)
        assertEquals(listOf("Cal1/a.md", "Cal1/sub/c.md", "Cal2/b.md"), loaded.eventFiles.map { it.relativePath })
        assertEquals(listOf("A", "C", "B"), loaded.eventFiles.map { it.contents })
        assertEquals(listOf("Cal1", "Cal1", "Cal2"), loaded.eventFiles.map { it.calendarPath })
    }

    @Test fun `un dossier sans calendrier lit les notes de la racine`() {
        val s = CountingStorage().put("b.md", "B").put("a.md", "A")
        val loaded = loadWorkspace(s)
        assertEquals(listOf("a.md", "b.md"), loaded.eventFiles.map { it.relativePath })
        assertEquals(listOf("A", "B"), loaded.eventFiles.map { it.contents })
    }

    @Test fun `un fichier liste mais illisible leve une erreur qui nomme le premier dans l'ordre`() {
        val s = CountingStorage().put("Cal/a.md", "A").put("Cal/b.md", "B").put("Cal/c.md", "C")
        s.unreadable += "Cal/c.md"
        s.unreadable += "Cal/b.md"
        try {
            loadWorkspace(s)
            fail("une erreur était attendue")
        } catch (e: IOException) {
            assertTrue(e.message, e.message!!.contains("Cal/b.md"))
        }
    }
}
```

Créer `core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/FileWorkspaceStorageSizeTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FileWorkspaceStorageSizeTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `list donne la taille en octets d'un fichier et -1 pour un dossier`() {
        val s = FileWorkspaceStorage(tmp.root)
        s.createDirectory("", "Cal")
        s.createFileWithText("Cal", "é.md", "text/markdown", "é")
        val root = s.list("").single()
        assertEquals(-1L, root.size)
        val file = s.list("Cal").single()
        assertEquals(2L, file.size) // « é » vaut 2 octets en UTF-8
        assertEquals(true, file.lastModified > 0L)
    }
}
```

- [ ] **Step 2: Lancer les tests, constater l'échec**

Run (PowerShell, dans `apps\android\native`) :
`.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.ReadTextsTest' --tests 'com.ahmed.neocalendar.core.workspace.FileWorkspaceStorageSizeTest'`
Expected: FAIL à la compilation (`Unresolved reference` sur `size` et `readTexts`).

- [ ] **Step 3: Implémenter**

`WorkspaceStorage.kt`, remplacer l'interface de tête par :

```kotlin
/** Un dossier de notes, lu par chemins relatifs à sa racine ("" = racine). Lecture seule. */
interface WorkspaceStorage {
    /** Enfants directs, triés comme le Java (nom en minuscules, Locale.ROOT). */
    fun list(relativeDir: String): List<Entry>

    /** Texte UTF-8 d'un fichier, ou null s'il n'existe pas. */
    fun readText(relativePath: String): String?

    /**
     * Les textes de plusieurs fichiers : même longueur et même ordre que `relativePaths`, null pour un absent.
     * Par défaut en série ; un stockage peut les lire en parallèle sans changer l'ordre ni le résultat.
     */
    fun readTexts(relativePaths: List<String>): List<String?> = relativePaths.map { readText(it) }

    /**
     * `lastModified` en ms depuis 1970 quand le stockage le sait (0 sinon) ; `size` en octets quand il le sait
     * (-1 sinon, et pour un dossier).
     */
    data class Entry(val name: String, val isDirectory: Boolean, val lastModified: Long = 0L, val size: Long = -1L)
}
```

`Workspace.kt`, remplacer `loadWorkspace`, `read` et `collectEvents` (de la ligne 32 à la ligne 76, `isNote` entre les deux reste) par :

```kotlin
fun loadWorkspace(storage: WorkspaceStorage, keepConflictCopies: Boolean = false): LoadedWorkspace {
    val ignored = { name: String -> isSyncArtifact(name) && !(keepConflictCopies && isConflictCopy(name)) }
    val children = storage.list("").filterNot { ignored(it.name) }
    val calendars = ArrayList<WorkspaceCalendar>()
    val notes = ArrayList<PendingNote>()
    for (d in children) {
        if (!d.isDirectory || d.name.startsWith(".")) continue
        calendars += WorkspaceCalendar(d.name, d.name)
        collectNotes(storage, d.name, d.name, notes, ignored)
    }
    if (calendars.isEmpty()) {
        calendars += WorkspaceCalendar("", "Default")
        for (f in children) {
            if (f.isDirectory || !isNote(f.name)) continue
            notes += PendingNote(f.name, "", f.name)
        }
    }
    // Tout est listé d'abord, puis toutes les notes sont lues en un appel : un stockage peut les lire en parallèle.
    val texts = storage.readTexts(notes.map { it.path })
    val events = notes.mapIndexed { i, n ->
        WorkspaceEventFile(n.path, n.calendarPath, n.fileName, texts[i] ?: throw java.io.IOException("Lecture impossible : ${n.path}"))
    }
    return LoadedWorkspace(calendars, events, readPreferences(storage))
}

private fun isNote(name: String) = name.lowercase(java.util.Locale.ROOT).endsWith(".md")

/** Une note listée, pas encore lue. */
private class PendingNote(val path: String, val calendarPath: String, val fileName: String)

/** Toutes les notes d'un calendrier, sous-dossiers compris ; le calendrier reste celui du dossier de tête. */
private fun collectNotes(
    storage: WorkspaceStorage,
    calendarPath: String,
    directory: String,
    out: MutableList<PendingNote>,
    ignored: (String) -> Boolean,
) {
    for (f in storage.list(directory).filterNot { ignored(it.name) }) {
        val path = "$directory/${f.name}"
        if (f.isDirectory) {
            if (f.name.startsWith(".")) continue
            collectNotes(storage, calendarPath, path, out, ignored)
            continue
        }
        if (!isNote(f.name)) continue
        out += PendingNote(path, calendarPath, f.name)
    }
}
```

(La fonction privée `read(storage, path)` disparaît : plus aucun appelant dans le fichier ; `grep -n "read(storage" Workspace.kt` ne doit rien rendre.)

`FileWorkspaceStorage.kt`, dans `list` :

```diff
-            .map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified()) }
+            .map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified(), if (it.isDirectory) -1L else it.length()) }
```

`SafWorkspaceStorage.kt` (app), quatre hunks :

```diff
-    private class Doc(val uri: Uri, val name: String, val isDirectory: Boolean, val lastModified: Long)
+    private class Doc(val uri: Uri, val name: String, val isDirectory: Boolean, val lastModified: Long, val size: Long)
```
```diff
-        return children(dir).map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified) }
+        return children(dir).map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified, it.size) }
```
```diff
-    private val listings = HashMap<Uri, List<Doc>>()
+    // Concurrent : `readTexts` du stockage en copie lit en parallèle, et chaque lecture remonte le chemin par `children`.
+    private val listings = java.util.concurrent.ConcurrentHashMap<Uri, List<Doc>>()
```
```diff
             DocumentsContract.Document.COLUMN_LAST_MODIFIED,
+            DocumentsContract.Document.COLUMN_SIZE,
         )
```
```diff
                     if (c.isNull(3)) 0L else c.getLong(3),
+                    if (c.isNull(4)) -1L else c.getLong(4),
                 )
```

- [ ] **Step 4: Lancer toute la suite du noyau**

Run: `.\gradlew.bat :core:test`
Expected: `BUILD SUCCESSFUL`, aucun test existant (`WorkspaceTest`, `IgnoredFilesTest`, `IcsSyncTest`, `VerifiedCopyTest`…) en échec. Puis `.\gradlew.bat assembleDebug` : `BUILD SUCCESSFUL` (vérifie `SafWorkspaceStorage`).

- [ ] **Step 5: Commit**

```powershell
git add apps/android/native
git commit -m @'
Noyau : taille des fichiers dans le listage, lecture des notes en un appel readTexts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 2: Noyau : `CachedWorkspaceStorage` et lecture parallèle bornée

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/CachedWorkspaceStorage.kt`
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/workspace/CachedWorkspaceStorageTest.kt`

**Interfaces:**
- Consumes: `WorkspaceStorage`, `Entry.size`, `readTexts`, `CountingStorage` (Task 1).
- Produces:
  - `data class CachedFile(val lastModified: Long, val size: Long, val text: String)`
  - `class CachedWorkspaceStorage(delegate: WorkspaceStorage, initial: Map<String, CachedFile> = emptyMap(), parallelism: Int = 4) : WorkspaceStorage`, avec `fun snapshot(): Map<String, CachedFile>` (les fichiers LUS pendant cette passe, avec leur date et taille du listage) et `val changed: Boolean` (`snapshot() != initial` : vrai si une lecture réelle a eu lieu, ou si un fichier de la copie n'a pas été revu).
  - Une instance sert une seule passe de lecture (`loadWorkspace` + éventuel `snapshot`).

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `CachedWorkspaceStorageTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CachedWorkspaceStorageTest {
    private fun tree() = CountingStorage()
        .put("Cal/a.md", "alpha")
        .put("Cal/b.md", "bravo")
        .put("Cal/c.md", "charlie")

    /** La copie telle qu'une première passe la laisse. */
    private fun warm(s: CountingStorage): Map<String, CachedFile> {
        val c = CachedWorkspaceStorage(s)
        loadWorkspace(c)
        return c.snapshot()
    }

    @Test fun `sans copie tout est lu et la copie garde les trois notes`() {
        val s = tree()
        val c = CachedWorkspaceStorage(s)
        val loaded = loadWorkspace(c)
        assertEquals(3, s.noteReads())
        assertEquals(listOf("alpha", "bravo", "charlie"), loaded.eventFiles.map { it.contents })
        assertEquals(setOf("Cal/a.md", "Cal/b.md", "Cal/c.md"), c.snapshot().keys)
        assertEquals(CachedFile(1000L, 5L, "alpha"), c.snapshot().getValue("Cal/a.md"))
        assertTrue(c.changed)
    }

    @Test fun `date et taille identiques : aucune lecture, meme resultat, rien a ecrire`() {
        val s = tree()
        val copy = warm(s)
        val before = s.noteReads()
        val c = CachedWorkspaceStorage(s, copy)
        val loaded = loadWorkspace(c)
        assertEquals(before, s.noteReads())
        assertEquals(loadWorkspace(tree()), loaded)
        assertFalse(c.changed)
    }

    @Test fun `le listage reste toujours demande au stockage reel`() {
        val s = tree()
        val copy = warm(s)
        val calls = s.listCalls.get()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(calls * 2, s.listCalls.get())
    }

    @Test fun `la date change : ce seul fichier est relu`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/b.md").apply { text = "bravo2"; lastModified = 2000L; size = 6L }
        val before = s.noteReads()
        val c = CachedWorkspaceStorage(s, copy)
        val loaded = loadWorkspace(c)
        assertEquals(1, s.noteReads() - before)
        assertEquals("bravo2", loaded.eventFiles[1].contents)
        assertEquals("bravo2", c.snapshot().getValue("Cal/b.md").text)
        assertTrue(c.changed)
    }

    @Test fun `la taille change avec la meme date : le fichier est relu`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/a.md").apply { text = "alpha plus long"; size = 15L }
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals("alpha plus long", loadWorkspace(c).eventFiles[0].contents)
    }

    @Test fun `une date plus ancienne que la copie est relue aussi : c'est une egalite, pas un plus recent`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/c.md").apply { text = "charlie2"; lastModified = 10L; size = 8L }
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals("charlie2", loadWorkspace(c).eventFiles[2].contents)
    }

    @Test fun `meme date et meme taille : la copie sert (limite connue, celle de Syncthing)`() {
        val s = tree()
        val copy = warm(s)
        s.files.getValue("Cal/a.md").text = "ALPHA" // 5 octets, date inchangée
        assertEquals("alpha", loadWorkspace(CachedWorkspaceStorage(s, copy)).eventFiles[0].contents)
    }

    @Test fun `une date inconnue est toujours relue et jamais gardee`() {
        val s = tree().put("Cal/u.md", "inconnu", lastModified = 0L)
        val copy = warm(s)
        assertFalse("Cal/u.md" in copy)
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(1, s.noteReads() - before)
    }

    @Test fun `une taille inconnue est toujours relue et jamais gardee`() {
        val s = tree().put("Cal/u.md", "inconnu", size = -1L)
        val copy = warm(s)
        assertFalse("Cal/u.md" in copy)
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(1, s.noteReads() - before)
    }

    @Test fun `un fichier disparu sort de la copie`() {
        val s = tree()
        val copy = warm(s)
        s.files.remove("Cal/c.md")
        val c = CachedWorkspaceStorage(s, copy)
        assertEquals(2, loadWorkspace(c).eventFiles.size)
        assertEquals(setOf("Cal/a.md", "Cal/b.md"), c.snapshot().keys)
        assertTrue(c.changed)
    }

    @Test fun `un fichier non liste est lu au stockage reel a chaque fois et jamais garde`() {
        val s = tree().put("Cal/.neo-calendar/x.json", "{}")
        val c = CachedWorkspaceStorage(s, emptyMap())
        assertEquals("{}", c.readText("Cal/.neo-calendar/x.json"))
        assertEquals("{}", c.readText("Cal/.neo-calendar/x.json"))
        assertEquals(2, s.reads.getValue("Cal/.neo-calendar/x.json").get())
        assertFalse("Cal/.neo-calendar/x.json" in c.snapshot())
        assertNull(c.readText("n'existe/pas.md"))
    }

    @Test fun `un fichier liste qui disparait avant sa lecture rend null et n'est pas garde`() {
        val s = tree()
        val c = CachedWorkspaceStorage(s, emptyMap())
        c.list("Cal")
        s.unreadable += "Cal/b.md"
        assertNull(c.readText("Cal/b.md"))
        assertFalse("Cal/b.md" in c.snapshot())
    }

    @Test fun `seuls les fichiers lus sont gardes`() {
        val s = tree().put("Cal/notes.txt", "pas une note")
        val c = CachedWorkspaceStorage(s, emptyMap())
        loadWorkspace(c)
        assertFalse("Cal/notes.txt" in c.snapshot())
    }

    private fun many(delay: Long) = CountingStorage(delay).apply {
        for (i in 0 until 24) put("Cal${i % 3}/n${"%02d".format(i)}.md", "texte $i")
    }

    @Test fun `la lecture parallele rend exactement le resultat de la serie, 4 fils au plus`() {
        val serial = loadWorkspace(many(0L))
        val s = many(25L)
        val c = CachedWorkspaceStorage(s)
        val loaded = loadWorkspace(c)
        assertEquals(serial, loaded)
        assertEquals(24, s.noteReads())
        assertTrue("pic = ${s.peak.get()}", s.peak.get() in 2..4)
    }

    @Test fun `parallelism 1 lit en serie`() {
        val s = many(5L)
        loadWorkspace(CachedWorkspaceStorage(s, parallelism = 1))
        assertEquals(1, s.peak.get())
    }

    @Test fun `deux fichiers illisibles en parallele : l'erreur est celle du premier dans l'ordre de la serie`() {
        val s = many(10L)
        s.unreadable += "Cal2/n20.md"
        s.unreadable += "Cal0/n03.md"
        try {
            loadWorkspace(CachedWorkspaceStorage(s))
            fail("une erreur était attendue")
        } catch (e: IOException) {
            // Ordre de la série : Cal0 avant Cal2.
            assertTrue(e.message, e.message!!.contains("Cal0/n03.md"))
        }
    }

    @Test fun `deuxieme passe sur 24 notes : plus aucune lecture`() {
        val s = many(0L)
        val copy = CachedWorkspaceStorage(s).also { loadWorkspace(it) }.snapshot()
        val before = s.noteReads()
        loadWorkspace(CachedWorkspaceStorage(s, copy))
        assertEquals(before, s.noteReads())
    }
}
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.CachedWorkspaceStorageTest'`
Expected: FAIL à la compilation (`Unresolved reference` : `CachedWorkspaceStorage`, `CachedFile`).

- [ ] **Step 3: Implémenter**

Créer `CachedWorkspaceStorage.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/** Le contenu d'un fichier tel qu'il était à `lastModified` et `size` (le critère de Syncthing). */
data class CachedFile(val lastModified: Long, val size: Long, val text: String)

/**
 * Un `WorkspaceStorage` qui épargne les lectures inutiles. `list` va toujours au stockage réel (il donne la date et la taille
 * de chaque fichier) ; `readText` rend la copie quand la date ET la taille listées, toutes deux connues, sont celles de la
 * copie, sinon lit le stockage réel. Un fichier sans date ou sans taille connue est toujours relu (jamais gardé). Une
 * égalité stricte : une date plus ancienne, après un retour d'horloge ou un fichier remplacé, relit aussi.
 *
 * Les lectures réelles de `readTexts` se font en parallèle, `parallelism` au plus ; l'ordre et le résultat sont ceux d'une
 * lecture en série, et l'erreur levée est celle du premier fichier en échec dans l'ordre demandé.
 *
 * Une instance sert une seule passe : `list` puis `readText`/`readTexts`, puis `snapshot()` pour la copie suivante.
 */
class CachedWorkspaceStorage(
    private val delegate: WorkspaceStorage,
    private val initial: Map<String, CachedFile> = emptyMap(),
    private val parallelism: Int = 4,
) : WorkspaceStorage {
    private val listed = ConcurrentHashMap<String, WorkspaceStorage.Entry>()
    private val kept = ConcurrentHashMap<String, CachedFile>()

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val entries = delegate.list(relativeDir)
        for (e in entries) if (!e.isDirectory) listed[if (relativeDir.isEmpty()) e.name else "$relativeDir/${e.name}"] = e
        return entries
    }

    override fun readText(relativePath: String): String? {
        // Un fichier que le listage n'a pas montré (les réglages d'un dossier caché) : ni copie ni garde.
        val entry = listed[relativePath] ?: return delegate.readText(relativePath)
        val usable = entry.lastModified > 0L && entry.size >= 0L
        val known = initial[relativePath]
        if (usable && known != null && known.lastModified == entry.lastModified && known.size == entry.size) {
            kept[relativePath] = known
            return known.text
        }
        val text = delegate.readText(relativePath) ?: return null
        // La date et la taille sont celles du listage, prises AVANT la lecture : un fichier modifié entre les deux
        // ne s'y reconnaît pas au passage suivant et est relu.
        if (usable) kept[relativePath] = CachedFile(entry.lastModified, entry.size, text)
        return text
    }

    override fun readTexts(relativePaths: List<String>): List<String?> {
        if (parallelism <= 1 || relativePaths.size <= 1) return relativePaths.map { readText(it) }
        val pool = Executors.newFixedThreadPool(minOf(parallelism, relativePaths.size))
        try {
            val futures = relativePaths.map { path -> pool.submit(Callable { readText(path) }) }
            // `get` dans l'ordre demandé : le premier échec de la série est celui qui remonte.
            return futures.map {
                try {
                    it.get()
                } catch (e: ExecutionException) {
                    throw e.cause ?: IOException("Lecture impossible", e)
                }
            }
        } finally {
            pool.shutdownNow()
        }
    }

    /** Les fichiers lus pendant cette passe, avec la date et la taille du listage. Un fichier disparu n'y est plus. */
    fun snapshot(): Map<String, CachedFile> = HashMap(kept)

    /** Vrai quand la copie suivante diffère de celle reçue : une lecture réelle a eu lieu, ou un fichier a disparu. */
    val changed: Boolean get() = kept != initial
}
```

- [ ] **Step 4: Lancer les tests**

Run: `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.CachedWorkspaceStorageTest'` puis `.\gradlew.bat :core:test`
Expected: `BUILD SUCCESSFUL`, les 17 tests de la classe passent, suite entière verte. Si `la lecture parallele ... 4 fils au plus` échoue sur `2..4` avec un pic de 1, la machine sérialise les fils : relancer une fois, et si c'est reproductible, signaler au lieu d'élargir l'intervalle.

- [ ] **Step 5: Commit**

```powershell
git add apps/android/native/core
git commit -m @'
Noyau : CachedWorkspaceStorage (copie des notes lues, critère date et taille, lecture parallèle 4 au plus)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 3: Noyau : format et fichier de la copie (`NoteCacheCodec`, `NoteCacheFile`)

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/NoteCacheCodec.kt`
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/workspace/NoteCacheFile.kt`
- Test: `.../workspace/NoteCacheCodecTest.kt`, `.../workspace/NoteCacheFileTest.kt`

**Interfaces:**
- Consumes: `CachedFile` (Task 2).
- Produces:
  - `object NoteCacheCodec { const val VERSION = 1; fun encode(identity: String, files: Map<String, CachedFile>, version: Int = VERSION): ByteArray; fun decode(raw: ByteArray, identity: String): Map<String, CachedFile>? }` : `decode` rend `null` pour TOUT défaut (trop court, somme de contrôle fausse, magique ou version inconnus, autre identité, longueurs absurdes, octets en trop) et ne lève jamais.
  - `class NoteCacheFile(file: java.io.File) { fun load(identity: String): Map<String, CachedFile>; fun save(identity: String, files: Map<String, CachedFile>) }` : `load` rend une carte vide pour tout défaut (jamais d'exception) ; `save` est atomique (temporaire `<nom>.tmp` du même dossier, `fsync`, renommage), synchronisé, lève `IOException` si l'écriture échoue et ne laisse alors aucun temporaire.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `NoteCacheCodecTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NoteCacheCodecTest {
    private val files = mapOf(
        "Cal/é note.md" to CachedFile(1_700_000_000_123L, 42L, "---\ntitle: « Réunion » 😀\n---\n\ncorps\r\nsuite"),
        "Cal/vide.md" to CachedFile(5L, 0L, ""),
    )

    @Test fun `aller-retour : accents, emoji, retours a la ligne, texte vide`() {
        val raw = NoteCacheCodec.encode("saf:content://x", files)
        assertEquals(files, NoteCacheCodec.decode(raw, "saf:content://x"))
    }

    @Test fun `une copie sans fichier fait l'aller-retour`() {
        val raw = NoteCacheCodec.encode("private:/a", emptyMap())
        assertEquals(emptyMap<String, CachedFile>(), NoteCacheCodec.decode(raw, "private:/a"))
    }

    @Test fun `un autre dossier : copie ignoree`() {
        val raw = NoteCacheCodec.encode("saf:content://x", files)
        assertNull(NoteCacheCodec.decode(raw, "saf:content://autre"))
        assertNull(NoteCacheCodec.decode(raw, "private:/x"))
        assertNull(NoteCacheCodec.decode(raw, ""))
    }

    @Test fun `une version inconnue est ignoree`() {
        val raw = NoteCacheCodec.encode("id", files, version = NoteCacheCodec.VERSION + 1)
        assertNull(NoteCacheCodec.decode(raw, "id"))
        assertNotNull(NoteCacheCodec.decode(NoteCacheCodec.encode("id", files), "id"))
    }

    @Test fun `toute troncature est ignoree sans exception`() {
        val raw = NoteCacheCodec.encode("id", files)
        for (n in raw.indices) assertNull("tronquée à $n", NoteCacheCodec.decode(raw.copyOf(n), "id"))
    }

    @Test fun `un seul octet change, n'importe lequel, est ignore`() {
        val raw = NoteCacheCodec.encode("id", files)
        for (i in raw.indices) {
            val bad = raw.copyOf()
            bad[i] = (bad[i].toInt() xor 0x01).toByte()
            assertNull("octet $i", NoteCacheCodec.decode(bad, "id"))
        }
    }

    @Test fun `des octets en trop sont ignores`() {
        val raw = NoteCacheCodec.encode("id", files)
        assertNull(NoteCacheCodec.decode(raw + byteArrayOf(0), "id"))
    }

    @Test fun `vide et dechets sont ignores`() {
        assertNull(NoteCacheCodec.decode(ByteArray(0), "id"))
        assertNull(NoteCacheCodec.decode(ByteArray(64) { it.toByte() }, "id"))
        assertNull(NoteCacheCodec.decode("pas une copie".toByteArray(), "id"))
    }
}
```

Créer `NoteCacheFileTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class NoteCacheFileTest {
    @get:Rule val tmp = TemporaryFolder()

    private val files = mapOf("Cal/a.md" to CachedFile(10L, 3L, "abc"))

    private fun cache() = NoteCacheFile(File(tmp.root, "note-cache.bin"))

    @Test fun `un fichier absent donne une copie vide`() {
        assertEquals(emptyMap<String, CachedFile>(), cache().load("id"))
    }

    @Test fun `enregistrer puis recharger, sans temporaire laisse`() {
        val c = cache()
        c.save("id", files)
        assertEquals(files, c.load("id"))
        assertEquals(listOf("note-cache.bin"), tmp.root.list()!!.toList())
    }

    @Test fun `un second enregistrement remplace le premier`() {
        val c = cache()
        c.save("id", files)
        val other = mapOf("Cal/b.md" to CachedFile(20L, 1L, "z"))
        c.save("id", other)
        assertEquals(other, c.load("id"))
    }

    @Test fun `un autre dossier, un fichier tronque ou des dechets donnent une copie vide`() {
        val c = cache()
        c.save("id", files)
        assertEquals(emptyMap<String, CachedFile>(), c.load("autre"))
        val target = File(tmp.root, "note-cache.bin")
        target.writeBytes(target.readBytes().copyOf(10))
        assertEquals(emptyMap<String, CachedFile>(), c.load("id"))
        target.writeBytes("n'importe quoi".toByteArray())
        assertEquals(emptyMap<String, CachedFile>(), c.load("id"))
    }

    @Test fun `un dossier cible illisible n'a pas d'exception : un repertoire a la place du fichier`() {
        File(tmp.root, "note-cache.bin").mkdir()
        assertEquals(emptyMap<String, CachedFile>(), cache().load("id"))
    }

    @Test fun `une ecriture impossible leve IOException et ne laisse aucun temporaire`() {
        val c = NoteCacheFile(File(File(tmp.root, "absent"), "note-cache.bin"))
        try {
            c.save("id", files)
            fail("une IOException était attendue")
        } catch (e: IOException) {
            assertFalse(File(tmp.root, "absent").exists())
        }
    }

    @Test fun `un echec de remplacement garde l'ancienne copie`() {
        val c = cache()
        c.save("id", files)
        // Un répertoire non vide à la place du temporaire fait échouer l'écriture avant tout renommage.
        File(tmp.root, "note-cache.bin.tmp").apply { mkdir(); File(this, "x").writeText("x") }
        try {
            c.save("id", mapOf("Cal/b.md" to CachedFile(1L, 1L, "b")))
            fail("une IOException était attendue")
        } catch (e: IOException) {
            assertEquals(files, c.load("id"))
        }
        assertTrue(File(tmp.root, "note-cache.bin").isFile)
    }
}
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.NoteCacheCodecTest' --tests 'com.ahmed.neocalendar.core.workspace.NoteCacheFileTest'`
Expected: FAIL à la compilation (`Unresolved reference` : `NoteCacheCodec`, `NoteCacheFile`).

- [ ] **Step 3: Implémenter**

Créer `NoteCacheCodec.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32

/**
 * Le format de la copie des notes lues : magique, version, identité du dossier, nombre de fichiers, puis par fichier
 * chemin, `lastModified`, `size` et texte (UTF-8, longueur en tête), et pour finir un CRC32 sur tout ce qui précède.
 * `decode` ne lève jamais : tout défaut (troncature, octet changé, version ou dossier différents) rend null, et la copie
 * est alors reconstruite sans rien montrer à l'utilisateur.
 */
object NoteCacheCodec {
    const val VERSION = 1
    private const val MAGIC = 0x4E434E43 // « NCNC »
    private const val CRC_BYTES = 8
    private const val MAX_FILES = 1_000_000

    fun encode(identity: String, files: Map<String, CachedFile>, version: Int = VERSION): ByteArray {
        val body = ByteArrayOutputStream()
        DataOutputStream(body).use { out ->
            out.writeInt(MAGIC)
            out.writeInt(version)
            writeString(out, identity)
            out.writeInt(files.size)
            for ((path, f) in files) {
                writeString(out, path)
                out.writeLong(f.lastModified)
                out.writeLong(f.size)
                writeString(out, f.text)
            }
        }
        val bytes = body.toByteArray()
        val crc = CRC32().apply { update(bytes) }.value
        return bytes + ByteBuffer.allocate(CRC_BYTES).putLong(crc).array()
    }

    fun decode(raw: ByteArray, identity: String): Map<String, CachedFile>? {
        try {
            if (raw.size < CRC_BYTES + 8) return null
            val bodySize = raw.size - CRC_BYTES
            val expected = ByteBuffer.wrap(raw, bodySize, CRC_BYTES).long
            if (CRC32().apply { update(raw, 0, bodySize) }.value != expected) return null
            val input = DataInputStream(ByteArrayInputStream(raw, 0, bodySize))
            if (input.readInt() != MAGIC || input.readInt() != VERSION) return null
            if (readString(input) != identity) return null
            val count = input.readInt()
            if (count < 0 || count > MAX_FILES) return null
            val out = HashMap<String, CachedFile>(count * 2)
            repeat(count) {
                val path = readString(input) ?: return null
                val lastModified = input.readLong()
                val size = input.readLong()
                out[path] = CachedFile(lastModified, size, readString(input) ?: return null)
            }
            // Des octets en trop : ce n'est pas notre fichier.
            return if (input.available() == 0) out else null
        } catch (e: Exception) {
            return null
        }
    }

    private fun writeString(out: DataOutputStream, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        out.writeInt(bytes.size)
        out.write(bytes)
    }

    /** Le texte, ou null si la longueur annoncée dépasse ce qui reste (jamais d'allocation démesurée). */
    private fun readString(input: DataInputStream): String? {
        val length = input.readInt()
        if (length < 0 || length > input.available()) return null
        val bytes = ByteArray(length)
        input.readFully(bytes)
        return String(bytes, Charsets.UTF_8)
    }
}
```

Note : `readString` rend aussi `null` pour l'identité ; `null != identity` est vrai, donc la copie est ignorée (comportement voulu). Un chemin ou un texte nul dans la boucle fait `return null` de `decode` (retour non local depuis `repeat`, qui est `inline`).

Créer `NoteCacheFile.kt` :

```kotlin
package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Le fichier de la copie des notes (`filesDir/note-cache.bin`) : lecture tolérante, écriture atomique. */
class NoteCacheFile(private val file: File) {
    /** La copie de ce dossier, ou vide pour tout défaut (absente, abîmée, autre version, autre dossier) : jamais d'exception. */
    fun load(identity: String): Map<String, CachedFile> = try {
        if (file.isFile) NoteCacheCodec.decode(file.readBytes(), identity) ?: emptyMap() else emptyMap()
    } catch (e: Exception) {
        emptyMap()
    }

    /**
     * Temporaire du même dossier, `fsync`, puis renommage atomique : un arrêt en plein milieu laisse l'ancienne copie
     * entière. Lève `IOException` si l'écriture échoue (disque plein) ; l'appelant l'ignore et la journalise.
     */
    @Synchronized
    fun save(identity: String, files: Map<String, CachedFile>) {
        val bytes = NoteCacheCodec.encode(identity, files)
        val temporary = File(file.parentFile, file.name + ".tmp")
        try {
            FileOutputStream(temporary).use { out ->
                out.write(bytes)
                out.flush()
                out.fd.sync()
            }
            Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: Throwable) {
            // Le temporaire d'un échec précédent (ou ce répertoire d'essai) n'est effacé que s'il est un simple fichier.
            if (temporary.isFile) temporary.delete()
            throw e
        }
    }
}
```

Attention au test `un echec de remplacement garde l'ancienne copie` : le temporaire est un répertoire non vide, `FileOutputStream` lève `FileNotFoundException` (sous-classe d'`IOException`), `temporary.isFile` est faux, il n'est pas supprimé, l'ancienne copie reste. Si la plateforme de test lève autre chose qu'une `IOException`, adapter le test, pas le code.

- [ ] **Step 4: Lancer les tests**

Run: `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.workspace.NoteCacheCodecTest' --tests 'com.ahmed.neocalendar.core.workspace.NoteCacheFileTest'` puis `.\gradlew.bat :core:test`
Expected: `BUILD SUCCESSFUL`, 8 tests du codec et 7 du fichier verts, suite entière verte.

- [ ] **Step 5: Commit**

```powershell
git add apps/android/native/core
git commit -m @'
Noyau : format de la copie des notes (version, identité du dossier, CRC32) et écriture atomique

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 4: App : brancher la copie dans `read()`, identité du dossier, exclusion des sauvegardes

**Files:**
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/WorkspaceLocation.kt` (après `displayName`)
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt` (`read()`, ligne 870, et imports)
- Modify: `apps/android/native/app/src/main/res/xml/backup_rules.xml`
- Modify: `apps/android/native/app/src/main/res/xml/data_extraction_rules.xml`

**Interfaces:**
- Consumes: `CachedWorkspaceStorage`, `CachedFile`, `NoteCacheFile` (Tasks 2 et 3), `WorkspaceLocation.mode`, `openStorage`, `readWorkspaceData`.
- Produces: `WorkspaceLocation.cacheIdentity(context: Context): String` (`"private:<chemin absolu de privateRoot>"`, `"saf:<URI choisie>"` ou `""` quand rien n'est choisi) ; `read()` passe par la copie.

Pas de test JUnit possible ici (le module `app` n'a pas de tests) : la logique testable est dans le noyau ; cette tâche se vérifie par le build puis par la Task 6. Les quatre erreurs à éviter sont dans le code ci-dessous : identité vérifiée avant et après l'ouverture, écriture hors du fil de lecture, instantané seul retenu, erreur d'écriture journalisée et ignorée.

- [ ] **Step 1: `cacheIdentity`**

`WorkspaceLocation.kt`, après la fonction `displayName`, ajouter :

```kotlin
    /**
     * Ce que la copie des notes lues sait du dossier : change dès qu'on change de dossier SAF ou de mode de stockage, de sorte
     * qu'une copie ne sert jamais pour un autre dossier. Chaîne vide : rien n'est choisi (aucune copie).
     */
    fun cacheIdentity(context: Context): String = when (mode(context)) {
        StorageMode.Integrated -> "private:" + privateRoot(context).absolutePath
        StorageMode.External -> "saf:" + prefs(context).getString(KEY_TREE, "").orEmpty()
        null -> ""
    }
```

- [ ] **Step 2: `read()` passe par la copie**

`NativeViewModel.kt` : ajouter aux imports du fichier (ordre alphabétique des voisins) :

```kotlin
import com.ahmed.neocalendar.core.workspace.CachedWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.NoteCacheFile
```

Remplacer la ligne 869-870 :

```diff
-    /** Lit le dossier selon le mode (permission durable contrôlée pour le SAF), puis le noyau fait le reste. */
-    private fun read(): WorkspaceData = readWorkspaceData(openStorage(write = false))
+    /** La copie des notes lues : un fichier unique du stockage privé, jamais synchronisé, exclu des sauvegardes. */
+    private val noteCache by lazy { NoteCacheFile(java.io.File(getApplication<Application>().filesDir, "note-cache.bin")) }
+
+    /**
+     * Lit le dossier selon le mode (permission durable contrôlée pour le SAF), puis le noyau fait le reste. Les fichiers dont
+     * la date et la taille n'ont pas bougé viennent de la copie ; le dossier est toujours listé pour de vrai. La copie est
+     * chargée ici, hors du fil principal, et réécrite après coup (jamais avant le retour) seulement si la lecture a changé quelque chose.
+     */
+    private fun read(): WorkspaceData {
+        val app = getApplication<Application>()
+        val identity = WorkspaceLocation.cacheIdentity(app)
+        val storage = openStorage(write = false)
+        // Le dossier ou le mode a pu changer entre l'identité et l'ouverture : sans identité sûre, lecture sans copie.
+        if (identity.isEmpty() || WorkspaceLocation.cacheIdentity(app) != identity) return readWorkspaceData(storage)
+        val cached = CachedWorkspaceStorage(storage, noteCache.load(identity))
+        val data = readWorkspaceData(cached)
+        if (cached.changed) {
+            val snapshot = cached.snapshot()
+            viewModelScope.launch(Dispatchers.IO) {
+                try {
+                    noteCache.save(identity, snapshot)
+                } catch (e: Exception) {
+                    // Disque plein ou autre : l'app marche comme sans copie, rien à montrer.
+                    android.util.Log.w("NoteCache", "Copie des notes non écrite", e)
+                }
+            }
+        }
+        return data
+    }
```

- [ ] **Step 3: Exclure la copie des sauvegardes**

`backup_rules.xml` :

```diff
     <exclude domain="file" path="syncthing/" />
+    <exclude domain="file" path="note-cache.bin" />
+    <exclude domain="file" path="note-cache.bin.tmp" />
 </full-backup-content>
```

`data_extraction_rules.xml`, dans `cloud-backup` ET `device-transfer` :

```diff
         <exclude domain="file" path="syncthing/" />
+        <exclude domain="file" path="note-cache.bin" />
+        <exclude domain="file" path="note-cache.bin.tmp" />
     </cloud-backup>
```
```diff
         <exclude domain="file" path="syncthing/" />
+        <exclude domain="file" path="note-cache.bin" />
+        <exclude domain="file" path="note-cache.bin.tmp" />
     </device-transfer>
```

Mettre aussi à jour le commentaire d'en-tête de `data_extraction_rules.xml` : ajouter la phrase « La copie des notes lues (`note-cache.bin`) est reconstruite à volonté : elle ne voyage pas non plus. »

- [ ] **Step 4: Build**

Run: `.\gradlew.bat :core:test assembleDebug`
Expected: `BUILD SUCCESSFUL`. Vérifier `grep -rn "\.java" apps/android/native/app/src --include=*.java -l` : aucun fichier Java créé.

- [ ] **Step 5: Commit**

```powershell
git add apps/android/native
git commit -m @'
Android : la lecture du dossier passe par la copie des notes (identité du dossier, écriture hors du fil principal, exclue des sauvegardes)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 5: App : rond de chargement pendant `Loading`

**Files:**
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt:166-168` et imports

**Interfaces:**
- Consumes: `ScreenState.Loading`, `Neo.Accent`, `tr(...)` (`ui/I18n.kt`).
- Produces: rien pour les autres tâches.

Tâche d'interface : pas de test JUnit ; la vérification à l'écran est la Task 6 (jamais faite par Ahmed, c'est à l'agent de la faire par capture).

- [ ] **Step 1: Remplacer le `Unit` de `Loading`**

`NativeScreen.kt` :

```diff
-                // Pas de spinner : le splash système tient jusqu'à la lecture du dossier (`holdSplashUntilReady`), puis la grille arrive remplie.
-                ScreenState.Loading -> Unit
+                // Le splash système tient jusqu'à la lecture du dossier (`holdSplashUntilReady`, 1,5 s au plus) : s'il est relâché
+                // avant la fin, un rond tourne sur le fond d'écran, jamais un écran immobile.
+                ScreenState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
+                    CircularProgressIndicator(
+                        color = Neo.Accent,
+                        modifier = Modifier.semantics { contentDescription = tr("Chargement") },
+                    )
+                }
```

Ajouter aux imports (près de ceux de même famille) :

```kotlin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
```

`Alignment`, `Box`, `fillMaxSize`, `Modifier` et `Neo` sont déjà importés dans ce fichier. « Chargement » n'a pas forcément d'entrée dans `res/raw/i18n_fr_en` : `tr` retombe sur le texte français quand le dictionnaire ne connaît pas (comportement documenté de `Translator.tr`), rien ne casse. Si l'entrée est facile à ajouter dans le format du fichier, l'ajouter ; sinon laisser.

- [ ] **Step 2: Build**

Run: `.\gradlew.bat :core:test assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```powershell
git add apps/android/native
git commit -m @'
Android : un rond de chargement tourne tant que le dossier n'est pas lu

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex
'@
```

---

### Task 6: Vérification : émulateur, puis mesure sur le téléphone d'Ahmed après livraison

**Files:** aucun fichier du dépôt. Un éventuel `delay` temporaire (Step 4) est annulé par `git checkout`. Travailler dans le répertoire des scratchpads pour les vidéos et les traces.

**Interfaces:** consomme les APK des Tasks 1 à 5.

Les variables PowerShell : `$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`, `$pkg = "com.ahmedmili.neocalendar"`. Chaque appel adb porte `-s emulator-5554` (émulateur) ; le téléphone n'est visé qu'au Step 8, avec la version livrée.

- [ ] **Step 1: Installer le debug sur l'émulateur seulement**

```powershell
Get-ChildItem app\build\outputs\apk\debug\*.apk
& $adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk
```
Expected: `Success`. En cas d'échec de signature : s'arrêter et demander (jamais de désinstallation). Sauvegarder d'abord `shared_prefs/neo_android.xml` : `& $adb -s emulator-5554 shell run-as $pkg cat shared_prefs/neo_android.xml` et noter le mode (`storage_mode`) : le chemin SAF réel n'est exercé que si l'émulateur est en `External` ; sinon, la colonne SAF `COLUMN_SIZE` n'est vérifiée que par la mesure du Step 8 (le dire dans le rapport).

- [ ] **Step 2: Premier lancement : la copie apparaît**

```powershell
& $adb -s emulator-5554 shell run-as $pkg rm -f files/note-cache.bin
& $adb -s emulator-5554 shell am force-stop $pkg
& $adb -s emulator-5554 shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER $pkg
```
Lancer avec le composant rendu par `resolve-activity` : `& $adb -s emulator-5554 shell am start -W -n <composant>`. Attendre 3 s puis :
`& $adb -s emulator-5554 shell run-as $pkg ls -l files/`
Expected: `note-cache.bin` présent (taille > 0), pas de `note-cache.bin.tmp`.

- [ ] **Step 3: Lancement chaud, fraîcheur, copie abîmée**

1. Relancer à froid (`force-stop` puis `am start -W`) : l'app affiche la grille, `adb logcat -d -s NoteCache` ne montre rien.
2. Fraîcheur : choisir une note du calendrier `Essai Compose` (jamais une autre), changer son titre par `run-as` + `sed -i` (le format est celui du fichier : lire le fichier d'abord), relancer à froid, capturer (`screencap`) et constater le nouveau titre à l'écran. Remettre l'ancien titre ensuite.
3. Copie tronquée : `run-as $pkg sh -c "head -c 100 files/note-cache.bin > files/x && mv files/x files/note-cache.bin"`, relancer à froid : la grille s'affiche normalement, aucun message d'erreur, et la copie retrouve sa taille d'origine après coup (`ls -l files/`).
4. Copie d'un autre dossier : si l'émulateur a un second dossier à disposition, basculer puis revenir ; sinon couvert par `NoteCacheCodecTest` et noté « non vérifié sur appareil ».

- [ ] **Step 4: Rond de chargement visible (essai temporaire, jamais commité)**

Le rond n'apparaît que si `Loading` dure plus de 1,5 s. Pour le voir, ajouter TEMPORAIREMENT dans `NativeViewModel.reload`, juste avant `val data = withContext(Dispatchers.IO) {` : `kotlinx.coroutines.delay(5_000)`. Reconstruire, `install -r` sur l'émulateur, puis :

```powershell
& $adb -s emulator-5554 shell am force-stop $pkg
Start-Process -NoNewWindow $adb -ArgumentList "-s emulator-5554 shell screenrecord --time-limit 9 /sdcard/rond.mp4"
Start-Sleep 1
& $adb -s emulator-5554 shell am start -W -n <composant>
Start-Sleep 9
& $adb -s emulator-5554 pull /sdcard/rond.mp4 <scratchpad>\rond.mp4
ffmpeg -i <scratchpad>\rond.mp4 -vf fps=2 <scratchpad>\rond-%02d.png
```
Lire deux images successives à 3 s et 4 s (outil Read sur les PNG) : le rond est centré, couleur d'accent, et a changé d'angle entre les deux. Puis `git checkout apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/NativeViewModel.kt` : il revient à l'état commité (le `delay` disparaît ; `git diff --stat` vide), reconstruire et réinstaller.

- [ ] **Step 5: Suite complète avant livraison**

Run: `.\gradlew.bat :core:test assembleDebug`
Expected: `BUILD SUCCESSFUL`. `git status` propre.

- [ ] **Step 6: Livraison (commande à donner à Ahmed, pas à exécuter)**

Donner à Ahmed la commande à copier-coller dans son terminal (ça ne consomme pas son quota), depuis `C:\dev\neo-calendar` :
`git ship "Android : lancement rapide (copie des notes lues, rond de chargement)"`
Attendre qu'il annonce que la version est installée sur son téléphone (le workflow Release prend 8 à 10 minutes ; l'installation passe par la version livrée, JAMAIS par un APK de debug).

- [ ] **Step 7: Mesure du premier lancement après mise à jour (sans copie)**

Sur `SGPZQ84XNFDQBE8L`, version livrée installée, jamais lancée depuis. Protocole du §1 de la spec, sous Git Bash avec `MSYS_NO_PATHCONV=1` (sinon `/sdcard/...` est réécrit en chemin Windows) :

```bash
export MSYS_NO_PATHCONV=1
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"; S=SGPZQ84XNFDQBE8L; PKG=com.ahmedmili.neocalendar
"$ADB" -s $S shell am force-stop $PKG
# Trace Perfetto : la config passe par l'entrée standard.
"$ADB" -s $S shell perfetto -c - --txt -o /data/misc/perfetto-traces/lancement.pftrace <<'EOF' &
buffers: { size_kb: 65536 fill_policy: DISCARD }
data_sources: { config { name: "linux.ftrace" ftrace_config {
  ftrace_events: "binder/binder_transaction"
  ftrace_events: "binder/binder_transaction_received"
  ftrace_events: "sched/sched_switch"
  atrace_categories: "binder_driver"
  atrace_categories: "am"
} } }
duration_ms: 14000
EOF
sleep 2
"$ADB" -s $S shell screenrecord --time-limit 12 --bit-rate 4000000 /sdcard/lancement.mp4 &
sleep 1
"$ADB" -s $S shell am start -W -n <composant>   # composant : resolve-activity, comme au Step 2
wait
"$ADB" -s $S pull /sdcard/lancement.mp4 <scratchpad>/lancement-1.mp4
"$ADB" -s $S pull /data/misc/perfetto-traces/lancement.pftrace <scratchpad>/lancement-1.pftrace
```
Vidéo : instants de changement d'image par ffmpeg, `ffmpeg -i lancement-1.mp4 -vf "select='gt(scene,0.01)',showinfo" -f null - 2>&1 | grep pts_time`. Le dernier changement notable est « grille remplie ». Trace : ouvrir avec `trace_processor_shell` (le même que la mesure du 2026-10-02 ; reprendre sa requête) et compter les transactions dont le serveur est `com.android.externalstorage` et leur durée totale. Requête de départ, NON vérifiée contre la version de `trace_processor_shell` disponible, à ajuster aux colonnes réelles : `INCLUDE PERFETTO MODULE android.binder; SELECT count(*), sum(dur) FROM android_binder_txns WHERE server_process = 'com.android.externalstorage';`.
Attendu : grille remplie nettement avant 8,3 s (lecture parallèle sans copie, de l'ordre de 6,9 s / 4 plus le calcul) ; rond de chargement visible sur la vidéo entre le relâchement du démarrage et la grille ; appels SAF toujours de l'ordre de 600 (un par fichier). Ce n'est PAS le critère final.

- [ ] **Step 8: Mesure du lancement chaud (le critère)**

Quitter l'app (`force-stop`), refaire exactement le Step 7 (fichiers `lancement-2.*`).
Critère de la spec : **grille remplie en 1 s au plus** après l'appui, appels `com.android.externalstorage` de l'ordre de 17 à 25 (un par dossier listé) au lieu de 611, durée totale en dizaines de millisecondes au lieu de 6 950 ms. Résultat à consigner : avant (1.86.0 : 8,3 s, 611 appels, 6 950 ms), après premier lancement, après lancement chaud.

Si le critère n'est pas tenu : NE PAS livrer comme tel ; chercher la cause par la trace (décodage de la copie, listage de 17 dossiers à ~11 ms, travail de calcul) avant tout correctif, et le dire à Ahmed. Ne jamais écrire dans les notes du téléphone : la fraîcheur se vérifie sur l'émulateur (Step 3), pas ici.

- [ ] **Step 9: Cocher et clore**

Dans `docs/PROCHAINE_VERSION.md` (non versionné), cocher le point « lancement rapide » seulement si le critère du Step 8 est tenu. Pas de commit pour cette tâche (aucun fichier suivi modifié).

---

## Self-review (faite après écriture)

- Couverture de la spec : §3.1 (`size`, `CachedWorkspaceStorage`, critère, fichier disparu, lecture parallèle 4 au plus identique à la série) = Tasks 1 et 2 ; §3.2 (fichier, version, identité, atomique, hors du fil principal, exclusion des sauvegardes, copie abîmée ignorée, écritures de l'app qui ne touchent pas la copie : la relecture voit la nouvelle date) = Tasks 3 et 4 ; §3.3 = Task 5 ; §4 (tableau d'erreurs) = tests des Tasks 2 et 3 et journalisation de la Task 4 ; §5 (tests et mesures) = tests JUnit, déviation « format côté noyau » assumée en tête, Task 6.
- Aucun « TBD » ni « à compléter » ; chaque étape de code a son code.
- Cohérence des types : `CachedFile(lastModified, size, text)`, `CachedWorkspaceStorage(delegate, initial, parallelism)`, `snapshot()`, `changed`, `NoteCacheCodec.encode/decode`, `NoteCacheFile.load/save`, `WorkspaceLocation.cacheIdentity` : mêmes noms et mêmes signatures de la Task 2 à la Task 4.
- Points non vérifiés signalés dans le plan : requête `android_binder_txns` (Task 6 Step 7), chemin SAF sur émulateur selon son mode, `COLUMN_SIZE` du fournisseur du téléphone (mesuré seulement au Step 8), entrée de dictionnaire anglais pour « Chargement ».
