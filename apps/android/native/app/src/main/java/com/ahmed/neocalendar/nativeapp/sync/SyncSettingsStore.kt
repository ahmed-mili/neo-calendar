package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import com.ahmed.neocalendar.core.sync.PowerSource
import com.ahmed.neocalendar.core.sync.RunConditions
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.SyncSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Les réglages de synchro dans `SharedPreferences` (`neo_sync`), lus une fois et suivis par un flux. */
class SyncSettingsStore(context: Context) {
    private companion object {
        /**
         * Le démarrage automatique, sous une clé neuve : chaque modification de la synchro réécrivait tous les réglages, donc
         * `autoStart = false` (l'ancien défaut) figure chez tout le monde sans distinguer un choix. L'ancienne clé est
         * ignorée : chaque appareil repart une fois avec le démarrage automatique activé, et tout choix fait ensuite est gardé.
         */
        const val AUTO_START_KEY = "autoStartOn"
    }

    private val prefs = context.applicationContext.getSharedPreferences("neo_sync", Context.MODE_PRIVATE)
    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<SyncSettings> = _settings.asStateFlow()

    val value: SyncSettings get() = _settings.value

    private fun read(): SyncSettings {
        val d = SyncSettings()
        val c = d.conditions
        return SyncSettings(
            runMode = RunMode.entries.firstOrNull { it.name == prefs.getString("runMode", null) } ?: d.runMode,
            autoStart = prefs.getBoolean(AUTO_START_KEY, d.autoStart),
            conditions = RunConditions(
                onWifi = prefs.getBoolean("onWifi", c.onWifi),
                onMeteredWifi = prefs.getBoolean("onMeteredWifi", c.onMeteredWifi),
                onMobileData = prefs.getBoolean("onMobileData", c.onMobileData),
                power = PowerSource.entries.firstOrNull { it.name == prefs.getString("power", null) } ?: c.power,
                respectBatterySaver = prefs.getBoolean("respectBatterySaver", c.respectBatterySaver),
            ),
            listenPort = prefs.getInt("listenPort", d.listenPort),
            configured = prefs.getBoolean("configured", d.configured),
            quit = prefs.getBoolean("quit", d.quit),
            resetFolderIndex = prefs.getBoolean("resetFolderIndex", d.resetFolderIndex),
        )
    }

    @Synchronized
    fun update(change: (SyncSettings) -> SyncSettings) {
        val next = change(_settings.value)
        if (next == _settings.value) return
        prefs.edit()
            .putString("runMode", next.runMode.name)
            .putBoolean(AUTO_START_KEY, next.autoStart)
            .putBoolean("onWifi", next.conditions.onWifi)
            .putBoolean("onMeteredWifi", next.conditions.onMeteredWifi)
            .putBoolean("onMobileData", next.conditions.onMobileData)
            .putString("power", next.conditions.power.name)
            .putBoolean("respectBatterySaver", next.conditions.respectBatterySaver)
            .putInt("listenPort", next.listenPort)
            .putBoolean("configured", next.configured)
            .putBoolean("quit", next.quit)
            .putBoolean("resetFolderIndex", next.resetFolderIndex)
            .commit()
        _settings.value = next
    }
}
