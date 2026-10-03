package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineWantedTest {
    private fun wanted(
        switching: Boolean = false,
        integrated: Boolean = true,
        running: Boolean = true,
        pageOpen: Boolean = false,
        visible: Boolean = false,
        held: Boolean = false,
        background: Boolean = false,
    ) = engineWanted(switching, integrated, running, pageOpen, visible, held, background)

    @Test fun `page ouverte et visible`() = assertTrue(wanted(pageOpen = true, visible = true))

    @Test fun `page ouverte mais app masquee sans maintien`() = assertFalse(wanted(pageOpen = true, visible = false))

    @Test fun `le maintien d'appairage garde le moteur app masquee`() = assertTrue(wanted(pageOpen = true, visible = false, held = true))

    @Test fun `le maintien ne passe pas les autres conditions`() {
        assertFalse(wanted(held = true, switching = true))
        assertFalse(wanted(held = true, integrated = false))
        assertFalse(wanted(held = true, running = false))
    }

    @Test fun `arriere-plan`() = assertTrue(wanted(background = true))

    @Test fun `rien ne le demande`() = assertFalse(wanted())
}
