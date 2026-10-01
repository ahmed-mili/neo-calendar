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
        // Chaque moteur est mémorisé avant son démarrage : si le second échoue, tearDown arrête quand même le premier.
        a = Engine("A", File(path), tmp.newFolder("a")).also { a = it; it.start() }
        b = Engine("B", File(path), tmp.newFolder("b")).also { b = it; it.start() }
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
