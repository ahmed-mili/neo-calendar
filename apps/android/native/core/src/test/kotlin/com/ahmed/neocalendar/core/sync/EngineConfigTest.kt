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
        assertEquals(1, f.getValue("fsWatcherDelayS").jsonPrimitive.int)
        assertEquals(0, f.getValue("pullerDelayS").jsonPrimitive.int)
        assertEquals(1, EngineConfig.fastWatch().getValue("fsWatcherDelayS").jsonPrimitive.int)
        assertEquals(0, EngineConfig.fastWatch().getValue("pullerDelayS").jsonPrimitive.int)
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
