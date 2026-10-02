package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeColorsTest {
    private val mocha = getTheme("catppuccin-mocha")

    @Test fun `sans personnalisation le sombre est la palette du theme`() {
        val c = resolveThemeColors(mocha, null, AppearanceMode.Dark, systemDark = false)
        assertFalse(c.light)
        assertEquals(0xFF1E1E2EL, c.primary)
        assertEquals(0xFF181825L, c.secondary)
        assertEquals(0xFF11111BL, c.crust)
        assertEquals(0xFF313244L, c.hover)
        assertEquals(0xFFCDD6F4L, c.text)
        assertEquals(0xFF89B4FAL, c.accent)
        assertEquals(0xFFA3C5FBL, c.accentStrong)
    }

    @Test fun `le texte discret de Catppuccin sombre se lit sur le survol et correspond aux constantes de NeoTokens`() {
        val c = resolveThemeColors(mocha, null, AppearanceMode.Dark, systemDark = false)
        // `CatppuccinMocha` (NeoTokens.kt) reprend ces valeurs : textSecondary, textFaint, settingsValue, settingsNote.
        assertEquals(0xFFA1A8C9L, c.muted)
        assertEquals(0xFF80859DL, c.faint)
        assertEquals(0xFF9BA2C1L, settingsValueColor(c))
        assertEquals(0xFF878DA7L, settingsNoteColor(c))
        assertTrue(contrastRatio(c.faint, c.hover) >= 3.0)
    }

    @Test fun `le mode systeme suit l'appareil`() {
        assertFalse(resolveThemeColors(mocha, null, AppearanceMode.System, systemDark = true).light)
        assertTrue(resolveThemeColors(mocha, null, AppearanceMode.System, systemDark = false).light)
        assertTrue(resolveThemeColors(mocha, null, AppearanceMode.Light, systemDark = true).light)
        assertFalse(resolveThemeColors(mocha, null, AppearanceMode.Dark, systemDark = false).light)
    }

    @Test fun `le clair est la palette claire du theme, derivee comme le PC`() {
        val ayu = getTheme("ayu")
        val c = resolveThemeColors(ayu, null, AppearanceMode.Light, systemDark = true)
        assertTrue(c.light)
        assertEquals(argbOfHex(ayu.light.surface), c.primary)
        assertEquals(argbOfHex(ayu.light.ink), c.text)
        assertEquals(argbOfHex(ayu.light.accent), c.accent)
        assertEquals(mixColors(c.primary, c.text, 0.12), c.secondary)
        assertEquals(mixColors(c.primary, c.text, 0.08), c.crust)
        assertEquals(accentTextOn(c.accent, c.primary), c.onAccent)
    }

    @Test fun `un accent personnalise reste en clair`() {
        val c = resolveThemeColors(mocha, ThemeCustomization(accent = "#ff0000"), AppearanceMode.Light, false)
        assertEquals(0xFFFF0000L, c.accent)
    }

    @Test fun `les textes attenues se rapprochent de l'encre quand la palette ne les tient pas`() {
        // Latte : avec les proportions d'origine (72 % / 52 %), le secondaire ne fait que 3,63 sur le fond.
        val c = resolveThemeColors(mocha, null, AppearanceMode.Light, false)
        for (bg in listOf(c.primary, c.secondary, c.hover)) {
            assertTrue(contrastRatio(c.muted, bg) >= 4.5)
            assertTrue(contrastRatio(c.faint, bg) >= 3.0)
        }
    }

    @Test fun `le texte sur accent garde la surface quand elle se lit, sinon noir ou blanc`() {
        assertEquals(argbOfHex("#1e1e2e"), accentTextOn(argbOfHex("#89b4fa"), argbOfHex("#1e1e2e")))
        assertEquals(0xFF000000L, accentTextOn(argbOfHex("#4d78cc"), argbOfHex("#282c34")))
    }

    @Test fun `un rouge qui se lit est intact, un rouge pale est rapproche de l'encre`() {
        val black = 0xFF000000L
        val white = 0xFFFFFFFFL
        assertEquals(argbOfHex("#aa0000"), readableColor(argbOfHex("#aa0000"), white, black, TEXT_CONTRAST))
        val weak = readableColor(argbOfHex("#ff7383"), white, black, TEXT_CONTRAST)
        assertNotEquals(argbOfHex("#ff7383"), weak)
        assertTrue(contrastRatio(weak, white) >= 4.5)
    }

    @Test fun `une surface personnalisee recalcule les fonds comme App tsx`() {
        val c = resolveThemeColors(mocha, ThemeCustomization(surface = "#000000", ink = "#ffffff"), AppearanceMode.Dark, false)
        assertEquals(0xFF000000L, c.primary)
        // color-mix(surface 88%, ink 12%) : 12 % de 255 = 31
        assertEquals(0xFF1F1F1FL, c.secondary)
        // 22 % de 255 = 56
        assertEquals(0xFF383838L, c.hover)
        // muted : ink 72 % ; faint : ink 52 %
        assertEquals(0xFFB8B8B8L, c.muted)
        assertEquals(0xFF858585L, c.faint)
        assertEquals(0xFFFFFFFFL, c.text)
    }

    @Test fun `un accent personnalise change l'accent et son ton fort`() {
        val c = resolveThemeColors(mocha, ThemeCustomization(accent = "#ff0000"), AppearanceMode.Dark, false)
        assertEquals(0xFFFF0000L, c.accent)
        assertNotEquals(0xFF89B4FAL, c.accentStrong)
    }

    @Test fun `chaque theme se resout dans les deux modes`() {
        for (theme in THEMES) for (mode in AppearanceMode.entries) {
            val c = resolveThemeColors(theme, null, mode, true)
            assertEquals(0xFF, alphaOf(c.primary))
            assertEquals(argbOfHex(if (c.light) theme.light.accent else theme.accent), c.accent)
        }
    }

    @Test fun `mixColors suit color-mix en srgb`() {
        assertEquals(0xFF808080L, mixColors(0xFF000000L, 0xFFFFFFFFL, 0.5))
        assertEquals(0xFF000000L, mixColors(0xFF000000L, 0xFFFFFFFFL, 0.0))
        assertEquals(0xFFFFFFFFL, mixColors(0xFF000000L, 0xFFFFFFFFL, 1.0))
    }

    @Test fun `les couleurs hexadecimales deviennent des ARGB opaques`() {
        assertEquals(0xFF658FF2L, argbOfHex("#658ff2"))
        assertEquals(0x38C6D0F5L, withAlpha(0xFFC6D0F5L, 0x38))
    }
}
