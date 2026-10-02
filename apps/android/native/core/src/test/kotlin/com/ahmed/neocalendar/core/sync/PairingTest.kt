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
