package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeShareTest {
    private val effective = effectiveThemeAppearance(getTheme("tokyo-night"), AppearancePreferences())

    @Test fun `le texte copie a le prefixe et les cles de l'ancienne`() {
        val text = themeShareText("tokyo-night", effective)
        assertTrue(text.startsWith("codex-theme-v1:{\"codeThemeId\":\"tokyo-night\",\"theme\":{\"accent\":\"#3d59a1\",\"contrast\":60,"))
        assertTrue(text.endsWith("\"variant\":\"dark\"}"))
    }

    @Test fun `copier puis importer redonne le theme`() {
        val custom = effective.copy(accent = "#112233", contrast = 20, translucentSidebar = false, wallpaperId = "none")
        val back = parseThemeShare(themeShareText("tokyo-night", custom)) as ThemeImport.Ok
        assertEquals("tokyo-night", back.theme.themeId)
        assertEquals("#112233", back.theme.accent)
        assertEquals(20, back.theme.contrast)
        assertEquals(false, back.theme.translucentSidebar)
        assertEquals(custom.uiFont, back.theme.uiFont)
    }

    @Test fun `la copie du theme ne porte plus de fond`() {
        val text = themeShareText("tokyo-night", effective)
        assertFalse(text.contains("wallpaperId"))
    }

    @Test fun `le prefixe est facultatif`() {
        val raw = """{"codeThemeId":"ayu","theme":{"accent":"#aabbcc"}}"""
        assertEquals("#aabbcc", ((parseThemeShare(raw) as ThemeImport.Ok).theme).accent)
        assertEquals("#aabbcc", ((parseThemeShare("  codex-theme-v1:$raw ") as ThemeImport.Ok).theme).accent)
    }

    @Test fun `un texte qui n'est pas du json est invalide`() {
        assertEquals(ThemeImport.Invalid, parseThemeShare("n'importe quoi"))
        assertEquals(ThemeImport.Invalid, parseThemeShare("codex-theme-v1:[1,2]"))
    }

    @Test fun `un theme inconnu n'est pas installe`() {
        assertEquals(ThemeImport.NotInstalled, parseThemeShare("""{"codeThemeId":"solarized"}"""))
        assertEquals(ThemeImport.NotInstalled, parseThemeShare("{}"))
    }

    @Test fun `les champs invalides laissent le brouillon`() {
        val ok = parseThemeShare("""{"codeThemeId":"one","theme":{"contrast":"x","wallpaperId":"inconnu","opaqueWindows":"oui"}}""") as ThemeImport.Ok
        assertNull(ok.theme.contrast)
        assertNull(ok.theme.translucentSidebar)
    }
}
