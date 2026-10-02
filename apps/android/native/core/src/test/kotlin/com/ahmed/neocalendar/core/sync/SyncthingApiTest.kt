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

    @Test fun `la version du moteur est rendue sans son v`() {
        fake.answer("GET /rest/system/version", """{"version":"v2.1.5","os":"android"}""")
        assertEquals("2.1.5", api.version())
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
