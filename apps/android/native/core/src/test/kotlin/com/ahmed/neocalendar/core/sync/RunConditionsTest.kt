package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class RunConditionsTest {
    private val defaults = RunConditions()
    private fun snap(
        network: NetworkKind = NetworkKind.Wifi, metered: Boolean = false, charging: Boolean = false, powerSave: Boolean = false,
    ) = DeviceSnapshot(network, metered, charging, powerSave)

    private fun pause(reason: PauseReason) = RunDecision.Pause(reason)

    @Test fun `les defauts autorisent Wi-Fi, Wi-Fi limite et donnees mobiles`() {
        assertEquals(RunConditions(onWifi = true, onMeteredWifi = true, onMobileData = true, power = PowerSource.Always, respectBatterySaver = true), defaults)
    }

    @Test fun `Wi-Fi ordinaire, on tourne sur secteur ou sur batterie`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap()))
        assertEquals(RunDecision.Run, decideRun(defaults, snap(charging = true)))
    }

    @Test fun `Wi-Fi limite accepte par defaut, refuse si decoche`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap(metered = true)))
        assertEquals(pause(PauseReason.MeteredWifiNotAllowed), decideRun(defaults.copy(onMeteredWifi = false), snap(metered = true)))
    }

    @Test fun `donnees mobiles acceptees par defaut, refusees si decochees`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap(network = NetworkKind.Mobile, metered = true)))
        assertEquals(pause(PauseReason.MobileDataNotAllowed), decideRun(defaults.copy(onMobileData = false), snap(network = NetworkKind.Mobile, metered = true)))
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

    @Test fun `pendant un appairage l'economiseur ne coupe pas le moteur`() {
        assertEquals(RunDecision.Run, decideRun(defaults, snap(powerSave = true), pairing = true))
        assertEquals(pause(PauseReason.NoNetwork), decideRun(defaults, snap(network = NetworkKind.None, powerSave = true), pairing = true))
    }

    @Test fun `seules les raisons reseau sont marquees reseau`() {
        assertEquals(setOf(PauseReason.NoNetwork, PauseReason.WifiNotAllowed, PauseReason.MeteredWifiNotAllowed, PauseReason.MobileDataNotAllowed), PauseReason.entries.filter { it.network }.toSet())
    }
}
