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
