package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppearancePreferencesTest {
    @Test fun `rien de memorise donne les defauts de l'ancienne`() {
        for (text in listOf(null, "", "null", "pas du json", "[]", "42")) {
            val p = parseAppearancePreferences(text)
            assertEquals(AppearanceMode.Dark, p.mode)
            assertTrue(p.translucentSidebar)
            assertEquals(50, p.contrast)
            assertTrue(p.themeOverrides.isEmpty())
        }
    }

    @Test fun `le texte de l'ancienne est lu`() {
        val text = """{"mode":"system","translucentSidebar":false,"contrast":"70","themeOverrides":{"catppuccin-mocha":{"accent":"#AABBCC","wallpaperId":"panorama-valley-portrait","contrast":120,"surface":"nope"}}}"""
        val p = parseAppearancePreferences(text)
        assertEquals(AppearanceMode.System, p.mode)
        assertFalse(p.translucentSidebar)
        assertEquals(70, p.contrast)
        val c = p.themeOverrides.getValue("catppuccin-mocha")
        assertEquals("#aabbcc", c.accent)
        assertEquals("panorama-valley-portrait", c.wallpaperId)
        assertEquals(100, c.contrast)
        assertNull(c.surface)
    }

    @Test fun `un mode ou un fond inconnu est ecarte`() {
        val p = parseAppearancePreferences("""{"mode":"auto","themeOverrides":{"x":{"wallpaperId":"inconnu"}}}""")
        assertEquals(AppearanceMode.Dark, p.mode)
        assertNull(p.themeOverrides.getValue("x").wallpaperId)
    }

    @Test fun `ecrire puis relire redonne la meme chose`() {
        val start = AppearancePreferences(AppearanceMode.Light, false, 30)
            .withCustomization("tokyo-night", ThemeCustomization(accent = "#112233", uiFont = "Inter", translucentSidebar = true, contrast = 61, wallpaperId = "none"))
        val text = start.toJsonText()
        assertEquals(start, parseAppearancePreferences(text))
        assertEquals(
            """{"mode":"light","translucentSidebar":false,"contrast":30,"themeOverrides":{"tokyo-night":{"accent":"#112233","uiFont":"Inter","translucentSidebar":true,"contrast":61,"wallpaperId":"none"}}}""",
            text,
        )
    }

    @Test fun `choisir un fond garde le reste de la personnalisation`() {
        val p = AppearancePreferences().withCustomization("one", ThemeCustomization(accent = "#445566")).withWallpaper("one", "none")
        assertEquals("#445566", p.themeOverrides.getValue("one").accent)
        assertEquals("none", p.themeOverrides.getValue("one").wallpaperId)
    }

    @Test fun `reinitialiser un theme n'efface que lui`() {
        val p = AppearancePreferences().withCustomization("one", ThemeCustomization(accent = "#445566")).withCustomization("ayu", ThemeCustomization(accent = "#778899"))
        val reset = p.withoutCustomization("one")
        assertFalse(reset.themeOverrides.containsKey("one"))
        assertTrue(reset.themeOverrides.containsKey("ayu"))
    }

    @Test fun `les valeurs en vigueur suivent le theme sauf personnalisation`() {
        val mocha = getTheme("catppuccin-mocha")
        val plain = effectiveThemeAppearance(mocha, AppearancePreferences())
        assertEquals("#658ff2", plain.accent)
        assertEquals(60, plain.contrast)
        assertTrue(plain.translucentSidebar)
        assertEquals(DEFAULT_ANDROID_WALLPAPER_ID, plain.wallpaperId)
        val own = effectiveThemeAppearance(mocha, AppearancePreferences().withCustomization("catppuccin-mocha", ThemeCustomization(accent = "#000001", contrast = 10)))
        assertEquals("#000001", own.accent)
        assertEquals(10, own.contrast)
        assertEquals("#1e1e2e", own.surface)
        // Un thème à fenêtres opaques n'a pas de barre latérale translucide par défaut.
        assertFalse(effectiveThemeAppearance(getTheme("github"), AppearancePreferences()).translucentSidebar)
    }

    @Test fun `les effets du fond ont les bornes et les defauts de l'ancienne`() {
        assertEquals(WallpaperEffectValues(), parseWallpaperEffects(null))
        assertEquals(WallpaperEffectValues(), parseWallpaperEffects("n'importe quoi"))
        val e = parseWallpaperEffects("""{"backgroundBrightness":3,"backgroundBlur":-4,"containerOpacity":"0.25"}""")
        assertEquals(1.0, e.backgroundBrightness, 0.0)
        assertEquals(0.0, e.backgroundBlur, 0.0)
        assertEquals(0.25, e.containerOpacity, 0.0)
        assertEquals(e, parseWallpaperEffects(e.toJsonText()))
    }

    @Test fun `le theme choisi se lit et s'ecrit sans toucher aux autres preferences`() {
        val stored = """{"dataFolder":"content://x","themeId":"ayu","vaultFolders":["a"]}"""
        assertEquals("ayu", themeIdOfDesktopPreferences(stored))
        assertEquals("catppuccin-mocha", themeIdOfDesktopPreferences(null))
        assertEquals("catppuccin-mocha", themeIdOfDesktopPreferences("""{"themeId":"inconnu"}"""))
        assertEquals(
            """{"dataFolder":"content://x","themeId":"one","vaultFolders":["a"]}""",
            desktopPreferencesWithTheme(stored, "one"),
        )
        assertEquals("""{"themeId":"one"}""", desktopPreferencesWithTheme(null, "one"))
        assertEquals("""{"themeId":"one"}""", desktopPreferencesWithTheme("corrompu{", "one"))
    }

    @Test fun `le registre a les quatorze themes de l'ancienne`() {
        assertEquals(14, THEMES.size)
        assertEquals("catppuccin-mocha", THEMES.first().id)
        assertEquals("ayu", getTheme("ayu").id)
        assertEquals("catppuccin-mocha", getTheme("zzz").id)
    }

    @Test fun `enregistrer sans rien changer ne laisse pas de personnalisation`() {
        val theme = getTheme("github")
        val saved = ThemeCustomization(
            accent = theme.accent, surface = theme.surface, ink = theme.ink, uiFont = theme.uiFont, codeFont = theme.codeFont,
            translucentSidebar = !theme.opaqueWindows, contrast = theme.contrast, wallpaperId = "none",
        ).withoutThemeDefaults(theme)
        assertEquals(ThemeCustomization(wallpaperId = "none"), saved)
        assertEquals("#000000", ThemeCustomization(accent = "#000000").withoutThemeDefaults(theme).accent)
    }
}
