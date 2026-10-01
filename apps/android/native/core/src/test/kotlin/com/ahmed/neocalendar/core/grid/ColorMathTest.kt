package com.ahmed.neocalendar.core.grid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ColorMathTest {
    @Test fun normalizeHexAccepteTroisOuSixChiffres() {
        assertEquals("#aabbcc", normalizeHex("#ABC"))
        assertEquals("#89b4fa", normalizeHex("89B4FA"))
        assertEquals("#112233", normalizeHex("  #112233 "))
        assertNull(normalizeHex("#12345"))
        assertNull(normalizeHex("rouge"))
    }

    @Test fun lesPastillesFontLAllerRetour() {
        for (hex in COLOR_PICKER_PRESETS + listOf("#000000", "#ffffff", "#006400", "#0036b2", "#72c8ee")) {
            val hsv = hexToHsv(hex)
            assertEquals(hex, hsvToHex(hsv.h, hsv.s, hsv.v))
        }
    }

    @Test fun lesCouleursPrimairesOntLeurTeinte() {
        assertEquals(0f, hexToHsv("#ff0000").h, 0.01f)
        assertEquals(120f, hexToHsv("#00ff00").h, 0.01f)
        assertEquals(240f, hexToHsv("#0000ff").h, 0.01f)
        assertEquals("#ff0000", hsvToHex(360f, 1f, 1f))
        assertEquals("#000000", hsvToHex(200f, 0.5f, 0f))
    }
}
