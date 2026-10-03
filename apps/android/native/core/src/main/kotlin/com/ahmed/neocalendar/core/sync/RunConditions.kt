package com.ahmed.neocalendar.core.sync

enum class RunMode { LikeFork, OnlyWhenOpen }

enum class PowerSource { Always, ChargingOnly, BatteryOnly }

/** Les conditions de fonctionnement (version réduite de Syncthing-Fork ; Wi-Fi et données mobiles par défaut : les notes pèsent peu, et un « Wi-Fi uniquement » laissait la synchro en pause sans que l'utilisateur le sache). */
data class RunConditions(
    val onWifi: Boolean = true,
    val onMeteredWifi: Boolean = true,
    val onMobileData: Boolean = true,
    val power: PowerSource = PowerSource.Always,
    val respectBatterySaver: Boolean = true,
)

enum class NetworkKind { None, Wifi, Mobile, Other }

/** Ce que le téléphone dit à l'instant. Ethernet compte comme Wifi (comme Syncthing-Fork). */
data class DeviceSnapshot(val network: NetworkKind, val metered: Boolean, val charging: Boolean, val powerSave: Boolean)

enum class PauseReason(val label: String, val network: Boolean = false) {
    BatterySaver("économiseur de batterie actif"),
    NeedsCharging("seulement sur secteur"),
    NeedsBattery("seulement sur batterie"),
    NoNetwork("hors ligne", true),
    WifiNotAllowed("Wi-Fi non autorisé", true),
    MeteredWifiNotAllowed("Wi-Fi limité non autorisé", true),
    MobileDataNotAllowed("données mobiles non autorisées", true),
}

sealed interface RunDecision {
    data object Run : RunDecision
    data class Pause(val reason: PauseReason) : RunDecision
}

/** Le moteur doit-il tourner maintenant ? `pairing` : un appairage est en cours ou la page est au premier plan. Dans l'ordre de Syncthing-Fork : économiseur, source d'alimentation, réseau. */
fun decideRun(conditions: RunConditions, snapshot: DeviceSnapshot, pairing: Boolean = false): RunDecision {
    // Pendant un appairage (maintien pris ou page Synchronisation au premier plan), l'économiseur ne coupe pas le moteur.
    if (conditions.respectBatterySaver && snapshot.powerSave && !pairing) return RunDecision.Pause(PauseReason.BatterySaver)
    when (conditions.power) {
        PowerSource.ChargingOnly -> if (!snapshot.charging) return RunDecision.Pause(PauseReason.NeedsCharging)
        PowerSource.BatteryOnly -> if (snapshot.charging) return RunDecision.Pause(PauseReason.NeedsBattery)
        PowerSource.Always -> Unit
    }
    return when (snapshot.network) {
        NetworkKind.None, NetworkKind.Other -> RunDecision.Pause(PauseReason.NoNetwork)
        NetworkKind.Wifi -> when {
            !conditions.onWifi -> RunDecision.Pause(PauseReason.WifiNotAllowed)
            snapshot.metered && !conditions.onMeteredWifi -> RunDecision.Pause(PauseReason.MeteredWifiNotAllowed)
            else -> RunDecision.Run
        }
        NetworkKind.Mobile -> if (conditions.onMobileData) RunDecision.Run else RunDecision.Pause(PauseReason.MobileDataNotAllowed)
    }
}
