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

    @Test fun `le mode systeme suit l'appareil`() {
        assertFalse(resolveThemeColors(mocha, null, AppearanceMode.System, systemDark = true).light)
        assertTrue(resolveThemeColors(mocha, null, AppearanceMode.System, systemDark = false).light)
        assertTrue(resolveThemeColors(mocha, null, AppearanceMode.Light, systemDark = true).light)
        assertFalse(resolveThemeColors(mocha, null, AppearanceMode.Dark, systemDark = false).light)
    }

    @Test fun `le clair est la coque neutre avec l'accent du theme`() {
        val c = resolveThemeColors(getTheme("ayu"), null, AppearanceMode.Light, systemDark = true)
        assertEquals(0xFFF5F5F6L, c.primary)
        assertEquals(0xFFFFFFFFL, c.secondary)
        assertEquals(0xFF242428L, c.text)
        assertEquals(0xFFE6B450L, c.accent)
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
            assertEquals(argbOfHex(theme.accent), c.accent)
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
