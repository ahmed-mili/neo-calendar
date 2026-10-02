package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
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
            .withCustomization("github", ThemeCustomization(accent = "#112233", uiFont = "Inter", translucentSidebar = true, contrast = 61, wallpaperId = "none"))
        val text = start.toJsonText()
        assertEquals(start, parseAppearancePreferences(text))
        assertEquals(
            """{"mode":"light","translucentSidebar":false,"contrast":30,"themeOverrides":{"github":{"accent":"#112233","uiFont":"Inter","translucentSidebar":true,"contrast":61,"wallpaperId":"none"}}}""",
            text,
        )
    }

    @Test fun `choisir un fond ne touche pas aux personnalisations`() {
        val p = AppearancePreferences().withCustomization("one", ThemeCustomization(accent = "#445566")).withWallpaper("none")
        assertEquals("#445566", p.themeOverrides.getValue("one").accent)
        assertEquals("none", p.wallpaperId)
    }

    @Test fun `sans reglage global le fond est celui du theme actuel puis le defaut`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        assertEquals("panorama-valley-portrait", p.resolvedWallpaperId("github"))
        assertEquals(DEFAULT_ANDROID_WALLPAPER_ID, p.resolvedWallpaperId("one"))
        assertEquals("panorama-valley-portrait", effectiveThemeAppearance(getTheme("github"), p).wallpaperId)
    }

    @Test fun `le reglage global l'emporte sur un fond par theme incoherent`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
            .withWallpaper("none")
        assertEquals("none", p.resolvedWallpaperId("github"))
        assertEquals("none", effectiveThemeAppearance(getTheme("github"), p).wallpaperId)
    }

    @Test fun `un reglage global inconnu est ecarte`() {
        val p = parseAppearancePreferences("""{"wallpaperId":"inconnu","themeOverrides":{"github":{"wallpaperId":"panorama-valley-portrait"}}}""")
        assertNull(p.wallpaperId)
        assertEquals("panorama-valley-portrait", p.resolvedWallpaperId("github"))
    }

    @Test fun `le JSON d'une version plus ancienne se relit tel quel et se reecrit sans cle globale`() {
        val old = """{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{"catppuccin-mocha":{"wallpaperId":"golden-summit-portrait"}}}"""
        val p = parseAppearancePreferences(old)
        assertNull(p.wallpaperId)
        assertEquals("golden-summit-portrait", p.resolvedWallpaperId("catppuccin-mocha"))
        assertEquals(old, p.toJsonText())
    }

    @Test fun `la cle globale est ecrite en dernier et relue`() {
        val p = AppearancePreferences().withWallpaper("none")
        assertEquals(
            """{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{},"wallpaperId":"none"}""",
            p.toJsonText(),
        )
        assertEquals(p, parseAppearancePreferences(p.toJsonText()))
    }

    @Test fun `changer de theme fige le fond tant que rien n'est global`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        val pinned = p.withPinnedWallpaper("github")
        assertEquals("panorama-valley-portrait", pinned.wallpaperId)
        assertEquals("panorama-valley-portrait", pinned.resolvedWallpaperId("one"))
        assertSame(pinned, pinned.withPinnedWallpaper("one"))
    }

    @Test fun `enregistrer les couleurs garde le fond par theme et reinitialiser fige le fond`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        val saved = p.withCustomization("github", ThemeCustomization(accent = "#112233"))
        assertEquals("panorama-valley-portrait", saved.resolvedWallpaperId("github"))
        val reset = saved.withoutCustomization("github")
        assertFalse(reset.themeOverrides.containsKey("github"))
        assertEquals("panorama-valley-portrait", reset.resolvedWallpaperId("github"))
    }

    @Test fun `un theme retire dans les preferences ne plante rien`() {
        val p = parseAppearancePreferences("""{"wallpaperId":"none","themeOverrides":{"tokyo-night":{"accent":"#112233"}}}""")
        assertEquals("none", effectiveThemeAppearance(getTheme("tokyo-night"), p).wallpaperId)
    }

    @Test fun `un theme retire garde son fond en passant sur Catppuccin, puis le fond de Catppuccin, puis le defaut`() {
        val own = AppearancePreferences()
            .withCustomization("theme-retire", ThemeCustomization(wallpaperId = "golden-summit-portrait"))
        assertEquals("golden-summit-portrait", own.resolvedWallpaperId("theme-retire"))
        assertEquals(
            "golden-summit-portrait",
            effectiveThemeAppearance(getTheme("theme-retire"), own, savedThemeId = "theme-retire").wallpaperId,
        )
        val viaCatppuccin = AppearancePreferences()
            .withCustomization("catppuccin-mocha", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        assertEquals("panorama-valley-portrait", viaCatppuccin.resolvedWallpaperId("theme-retire"))
        assertEquals(DEFAULT_ANDROID_WALLPAPER_ID, AppearancePreferences().resolvedWallpaperId("theme-retire"))
        // Un thème conservé sans fond propre ne prend pas celui de Catppuccin.
        assertEquals(DEFAULT_ANDROID_WALLPAPER_ID, viaCatppuccin.resolvedWallpaperId("github"))
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

    @Test fun `le registre garde les six themes choisis`() {
        assertEquals(listOf("catppuccin-mocha", "github", "one", "ayu", "rose-pine", "vercel"), THEMES.map { it.id })
        assertEquals("ayu", getTheme("ayu").id)
        assertEquals("catppuccin-mocha", getTheme("zzz").id)
        for (retired in listOf("tokyo-night", "absolutely", "linear", "lobster", "matrix", "oscurange", "raycast", "vscode-plus")) {
            assertEquals("catppuccin-mocha", getTheme(retired).id)
            assertEquals("catppuccin-mocha", themeIdOfDesktopPreferences("""{"themeId":"$retired"}"""))
        }
    }

    @Test fun `un theme retire garde son fond d'avant en passant sur Catppuccin`() {
        val p = parseAppearancePreferences("""{"themeOverrides":{"tokyo-night":{"wallpaperId":"golden-summit-portrait"}}}""")
        assertEquals(
            "golden-summit-portrait",
            effectiveThemeAppearance(getTheme("tokyo-night"), p, savedThemeId = "tokyo-night").wallpaperId,
        )
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
