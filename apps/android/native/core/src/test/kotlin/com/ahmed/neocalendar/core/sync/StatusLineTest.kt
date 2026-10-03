package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusLineTest {
    private val idle = FolderState("idle", 0, 0, "")

    private fun line(
        hasDevices: Boolean = true,
        engine: EngineState = EngineState.Running,
        decision: RunDecision = RunDecision.Run,
        folder: FolderState? = idle,
        connected: Boolean = true,
    ) = summarize(hasDevices, engine, decision, folder, connected)

    @Test fun `a jour`() { assertEquals(StatusLine.UpToDate, line()); assertEquals("À jour", line().text()) }

    @Test fun `sans appareil rien ne tourne`() {
        assertEquals(StatusLine.NotConfigured, line(hasDevices = false, engine = EngineState.Stopped))
    }

    @Test fun `synchro en cours avec le nombre de fichiers`() {
        assertEquals("Synchronisation en cours (3 fichiers)", line(folder = FolderState("syncing", 3, 100, "")).text())
        assertEquals("Synchronisation en cours (1 fichier)", line(folder = FolderState("syncing", 1, 100, "")).text())
    }

    @Test fun `en pause avec la condition qui manque`() {
        assertEquals("En pause : Wi-Fi limité non autorisé", line(decision = RunDecision.Pause(PauseReason.MeteredWifiNotAllowed), engine = EngineState.Stopped).text())
    }

    @Test fun `hors ligne quand aucun appareil n'est connecte`() {
        assertEquals(StatusLine.Offline, line(connected = false))
    }

    @Test fun `erreur du moteur avant tout, relance annoncee`() {
        assertEquals("Erreur : boom", line(engine = EngineState.Failed("boom")).text())
        assertEquals("Erreur : boom (nouvel essai dans 4 s)", line(engine = EngineState.Backoff(2, 4_000, "boom")).text())
    }

    @Test fun `erreur du dossier, par exemple disque plein`() {
        assertEquals("Erreur : disque plein", line(folder = FolderState("error", 0, 0, "disque plein")).text())
    }

    @Test fun `demarrage tant que le moteur ne repond pas`() {
        assertEquals(StatusLine.Starting, line(engine = EngineState.Starting, folder = null))
        assertEquals(StatusLine.Starting, line(folder = null))
    }

    @Test fun `binaire absent`() {
        assertEquals(StatusLine.Error("moteur de synchronisation absent de cette version"), line(engine = EngineState.Missing, folder = null))
    }

    @Test fun `sans appareil, une pause ou une erreur du moteur reste visible`() {
        assertEquals(StatusLine.Paused(PauseReason.MobileDataNotAllowed), line(hasDevices = false, engine = EngineState.Stopped, decision = RunDecision.Pause(PauseReason.MobileDataNotAllowed)))
        assertEquals(StatusLine.Error("boom"), line(hasDevices = false, engine = EngineState.Failed("boom")))
        assertEquals(StatusLine.Error("moteur de synchronisation absent de cette version"), line(hasDevices = false, engine = EngineState.Missing, folder = null))
        assertEquals(StatusLine.NotConfigured, line(hasDevices = false, engine = EngineState.Running, folder = null))
    }
}
