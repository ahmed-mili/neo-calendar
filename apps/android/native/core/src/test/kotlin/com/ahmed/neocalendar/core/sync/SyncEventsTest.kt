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
