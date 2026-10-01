package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WallpaperRecoveryTest {
    private val files = listOf(
        WallpaperFile("a-portrait.jpg", 100),
        WallpaperFile("b-portrait.jpg", 300),
        WallpaperFile("c.jpg", 200),
        WallpaperFile("notes.txt", 900),
    )

    @Test fun `le plus recent est repris sans son extension`() {
        assertEquals("b-portrait", recoveredWallpaperId(null, files))
        assertEquals("b-portrait", recoveredWallpaperId("", files))
    }

    @Test fun `un choix memorise n'est jamais ecrase`() {
        assertNull(recoveredWallpaperId("none", files))
        assertNull(recoveredWallpaperId("theme-default", files))
    }

    @Test fun `pas d'image pas de choix`() {
        assertNull(recoveredWallpaperId(null, emptyList()))
        assertNull(recoveredWallpaperId(null, listOf(WallpaperFile("notes.txt", 5), WallpaperFile(".jpg", 6))))
    }

    @Test fun `a date egale le nom tranche`() {
        assertEquals("z", recoveredWallpaperId(null, listOf(WallpaperFile("a.jpg", 1), WallpaperFile("z.jpg", 1))))
    }
}
