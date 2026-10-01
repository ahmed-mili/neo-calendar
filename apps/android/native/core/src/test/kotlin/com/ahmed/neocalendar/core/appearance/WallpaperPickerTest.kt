package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WallpaperPickerTest {
    @Test fun `le catalogue a vingt photos portrait et sept categories`() {
        assertEquals(20, WALLPAPER_PHOTOS.size)
        assertTrue(WALLPAPER_PHOTOS.all { it.id.endsWith("-portrait") })
        assertEquals(7, availableCategories().size)
        assertTrue(WALLPAPER_PHOTOS.any { it.id == DEFAULT_ANDROID_WALLPAPER_ID })
    }

    @Test fun `ce qui manque ne compte que les fichiers absents`() {
        val installed = setOf("starlit-snow-peak-portrait.jpg")
        val missing = missingWallpapers(WALLPAPER_PHOTOS, installed)
        assertEquals(19, missing.size)
        assertFalse(missing.any { it.id == "starlit-snow-peak-portrait" })
    }

    @Test fun `le bouton dit combien reste a prendre`() {
        assertNull(batchNote(null, 0))
        assertEquals("Tout télécharger (19)", batchNote(null, 19))
        assertEquals("Téléchargement… 3/19", batchNote(BatchProgress(3, 19, 0), 16))
        assertEquals("1 fond n'a pas pu être téléchargé — appuyez pour réessayer", batchNote(BatchProgress(19, 19, 1), 1))
        assertEquals("2 fonds n'ont pas pu être téléchargés — appuyez pour réessayer", batchNote(BatchProgress(19, 19, 2), 2))
        assertNull(batchNote(BatchProgress(19, 19, 0), 0))
    }

    @Test fun `un filtre garde la categorie`() {
        assertEquals(WALLPAPER_PHOTOS.size, wallpapersInCategory("all").size)
        assertTrue(wallpapersInCategory("night").all { it.category == "night" })
        assertEquals(3, wallpapersInCategory("night").size)
    }

    @Test fun `seules les photos ont un fichier`() {
        assertNull(wallpaperFileOf("none"))
        assertNull(wallpaperFileOf("theme-default"))
        assertEquals("panorama-valley-portrait.jpg", wallpaperFileOf("panorama-valley-portrait"))
    }

    @Test fun `les identifiants connus`() {
        assertTrue(isKnownWallpaperId("none"))
        assertTrue(isKnownWallpaperId("theme-default"))
        assertTrue(isKnownWallpaperId("golden-summit"))
        assertTrue(isKnownWallpaperId("golden-summit-portrait"))
        assertFalse(isKnownWallpaperId("nope"))
        assertEquals("Photo de Benjamin Voros", wallpaperCredit(WALLPAPER_PHOTOS.first { it.id == "starlit-snow-peak-portrait" }))
    }
}
