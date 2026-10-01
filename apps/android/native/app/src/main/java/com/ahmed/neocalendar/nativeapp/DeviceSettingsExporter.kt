package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import android.util.Log
import com.ahmed.neocalendar.core.grid.DEFAULT_DAY_COUNT
import com.ahmed.neocalendar.core.grid.clampDayCount
import com.ahmed.neocalendar.core.migration.DeviceSettings
import com.ahmed.neocalendar.core.migration.deviceSettingsJson
import com.ahmed.neocalendar.core.migration.writeDeviceSettings
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

/**
 * Passage sous com.ahmedmili.neocalendar : ce qui ne vit que dans l'appareil (SharedPreferences) est déposé dans
 * `.neo-calendar/android-device-settings.json` du dossier de notes. Les valeurs sont relues AU MOMENT d'écrire :
 * des demandes qui se suivent donnent le même fichier, et un fichier inchangé n'est pas réécrit.
 * Jamais sur le fil principal ; un échec (pas de dossier, autorisation révoquée) est noté et ignoré.
 */
object DeviceSettingsExporter {
    // Mêmes noms que NativeViewModel / IcsSync / WidgetData.
    private const val DEVICE_PREFS = "neo_native"
    private const val KEY_DAY_COUNT = "dayCount"
    private const val KEY_ALLDAY_COLLAPSED = "allDayCollapsed"
    private const val KEY_ICS_STATE = "icsRuntimeState"
    private const val WIDGET_CHOICES = "neo-calendar-widget-calendars"
    private const val TREE_PREFS = "neo_android"
    private const val TREE_KEY = "tree_uri"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()

    /** À appeler au lancement et après chaque changement de ces réglages. */
    fun request(context: Context) {
        val app = context.applicationContext
        scope.launch {
            lock.withLock {
                try {
                    export(app)
                } catch (e: Exception) {
                    Log.w("NeoNative", "réglages d'appareil non exportés", e)
                }
            }
        }
    }

    private fun export(app: Context) {
        val tree = writableTree(app) ?: return
        val device = app.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)
        val widgets = app.getSharedPreferences(WIDGET_CHOICES, Context.MODE_PRIVATE).all.mapNotNull { (key, value) ->
            (value as? Set<*>)?.let { key to it.filterIsInstance<String>().toSet() }
        }.toMap()
        val settings = DeviceSettings(
            dayCount = clampDayCount(device.getInt(KEY_DAY_COUNT, DEFAULT_DAY_COUNT)),
            allDayCollapsed = device.getBoolean(KEY_ALLDAY_COLLAPSED, false),
            icsRuntimeState = device.getString(KEY_ICS_STATE, null)?.let { runCatching { Json.parseToJsonElement(it) }.getOrNull() },
            widgetCalendars = widgets,
        )
        writeDeviceSettings(SafWorkspaceStorage(app, tree), deviceSettingsJson(settings, Instant.now()))
    }

    /** Le dossier de notes avec l'autorisation d'écrire, ou null s'il n'y en a pas (rien à exporter alors). */
    private fun writableTree(app: Context): Uri? {
        val raw = app.getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty()
        if (raw.isEmpty()) return null
        val uri = Uri.parse(raw)
        val grants = app.contentResolver.persistedUriPermissions.filter { it.uri == uri }
        return if (grants.any { it.isReadPermission } && grants.any { it.isWritePermission }) uri else null
    }
}
