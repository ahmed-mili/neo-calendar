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
    private val setup = SyncSetup(SyncthingApi(fake), "/data/files/Neo Calendar", retryDelayMs = 0)

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

    @Test fun `un PUT du nouveau dossier qui echoue est retente puis signale que le dossier a ete retire`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        folder("neo-1", me, pc)
        fake.answer("DELETE /rest/config/folders/neo-1", "")
        fake.answer("PUT /rest/config/folders/f1", "boom", code = 500)
        try { setup.adopt(PendingFolder("f1", "Neo Calendar", pc)); fail() } catch (e: FolderLostException) { assertEquals("neo-1", e.oldId) }
        assertEquals(3, fake.calls.count { it.method == "PUT" && it.path == "/rest/config/folders/f1" })
        // La demande reste (jamais effacée avant que le dossier existe) : l'utilisateur peut réessayer.
        assertTrue(fake.calls.none { it.method == "DELETE" && it.path.startsWith("/rest/cluster/pending/folders") })
    }

    @Test fun `un PUT qui reussit au deuxieme essai adopte normalement`() {
        fake.answer("GET /rest/system/status", """{"myID":"$me"}""")
        folder("neo-1", me, pc)
        fake.answer("DELETE /rest/config/folders/neo-1", "")
        val flaky = object : HttpTransport {
            var puts = 0
            override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult =
                if (method == "PUT" && path == "/rest/config/folders/f1" && ++puts == 1) HttpResult(500, "boom") else fake.request(method, path, body, readTimeoutMs)
        }
        fake.answer("PUT /rest/config/folders/f1", "")
        fake.answer("DELETE /rest/cluster/pending/folders?folder=f1&device=$pc", "")
        val decision = SyncSetup(SyncthingApi(flaky), "/data/files/Neo Calendar", retryDelayMs = 0).adopt(PendingFolder("f1", "Neo Calendar", pc))
        assertEquals(ProposalDecision.Replace("neo-1"), decision)
        assertEquals(2, flaky.puts)
    }
}
