package com.ahmed.neocalendar.core.sync

import org.junit.Test
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

class BootStartTest {
    private val ready = SyncSettings(configured = true, autoStart = true, runMode = RunMode.LikeFork, quit = false)

    @Test
    fun `demarre a l'allumage seulement avec un appareil, le demarrage automatique, le mode Comme Syncthing-Fork et sans Quitter`() {
        assertTrue(ready.startsAtBoot())
    }

    @Test
    fun `le demarrage automatique est desactive par defaut`() {
        assertFalse(SyncSettings(configured = true).startsAtBoot())
    }

    @Test
    fun `chaque condition manquante suffit a ne rien demarrer`() {
        assertFalse(ready.copy(configured = false).startsAtBoot())
        assertFalse(ready.copy(autoStart = false).startsAtBoot())
        assertFalse(ready.copy(runMode = RunMode.OnlyWhenOpen).startsAtBoot())
        assertFalse(ready.copy(quit = true).startsAtBoot())
    }
}
