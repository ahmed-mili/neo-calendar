package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class RunConditionsTest {
    private val defaults = RunConditions()
    private fun snap(
        network: NetworkKind = NetworkKind.Wifi, metered: Boolean = false, charging: Boolean = false, powerSave: Boolean = false,
    ) = DeviceSnapshot(network, metered, charging, powerSave)

    private fun pause(reason: PauseReason) = RunDecision.Pause(reason)

    @Test fun `les defauts sont ceux de Syncthing-Fork`() {
        assertEquals(RunConditions(onWifi = true, onMeteredWifi = false, onMobileData = false, power = PowerSource.Always, respectBatterySaver = true), defaults)
    }

    @Test fun `Wi-Fi ordinaire, on tourne sur secteur ou sur batterie`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap()))
        assertEquals(RunDecision.Run, decideRun(defaults, snap(charging = true)))
    }

    @Test fun `Wi-Fi limite refuse par defaut, accepte si autorise`() {
        assertEquals(pause(PauseReason.MeteredWifiNotAllowed), decideRun(defaults, snap(metered = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(onMeteredWifi = true), snap(metered = true)))
    }

    @Test fun `donnees mobiles refusees par defaut, acceptees si autorisees`() {
        assertEquals(pause(PauseReason.MobileDataNotAllowed), decideRun(defaults, snap(network = NetworkKind.Mobile, metered = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(onMobileData = true), snap(network = NetworkKind.Mobile, metered = true)))
    }

    @Test fun `Wi-Fi coupe dans les conditions`() {
        assertEquals(pause(PauseReason.WifiNotAllowed), decideRun(defaults.copy(onWifi = false), snap()))
    }

    @Test fun `sans reseau, hors ligne`() {
        assertEquals(pause(PauseReason.NoNetwork), decideRun(defaults, snap(network = NetworkKind.None)))
        assertEquals(pause(PauseReason.NoNetwork), decideRun(defaults, snap(network = NetworkKind.Other)))
    }

    @Test fun `source d'alimentation`() {
        val chargingOnly = defaults.copy(power = PowerSource.ChargingOnly)
        val batteryOnly = defaults.copy(power = PowerSource.BatteryOnly)
        assertEquals(pause(PauseReason.NeedsCharging), decideRun(chargingOnly, snap(charging = false)))
        assertEquals(RunDecision.Run, decideRun(chargingOnly, snap(charging = true)))
        assertEquals(pause(PauseReason.NeedsBattery), decideRun(batteryOnly, snap(charging = true)))
        assertEquals(RunDecision.Run, decideRun(batteryOnly, snap(charging = false)))
    }

    @Test fun `economiseur de batterie respecte par defaut, ignore si decoche`() {
        assertEquals(pause(PauseReason.BatterySaver), decideRun(defaults, snap(powerSave = true)))
        assertEquals(RunDecision.Run, decideRun(defaults.copy(respectBatterySaver = false), snap(powerSave = true)))
    }

    @Test fun `l'economiseur passe avant le reste`() {
        assertEquals(pause(PauseReason.BatterySaver), decideRun(defaults, snap(network = NetworkKind.None, powerSave = true)))
    }
}
