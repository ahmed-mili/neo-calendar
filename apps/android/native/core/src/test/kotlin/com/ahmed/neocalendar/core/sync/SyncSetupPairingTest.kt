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
