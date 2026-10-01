package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import android.util.Log
import com.ahmed.neocalendar.core.grid.DEFAULT_DAY_COUNT
import com.ahmed.neocalendar.core.grid.clampDayCount
import com.ahmed.neocalendar.core.migration.DeviceSettings
import com.ahmed.neocalendar.core.migration.deviceSettingsJson
import com.ahmed.neocalendar.core.migration.webViewStorageFromJs
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
    // L origine de MainActivity (APP_HOST) : le localStorage est par origine.
    private const val WEB_HOST = "neo-calendar.local"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()

    /** Le localStorage de l'ancienne interface, lu une fois par lancement ; null tant que la lecture n'a pas abouti. */
    @Volatile private var webViewStorage: Map<String, String>? = null

    /** Les exports attendent la fin (réussie ou non) de la lecture de la WebView : sinon le premier effacerait la clé. */
    @Volatile private var webViewAttempted = false
    private var webViewStarted = false

    /** À appeler au lancement et après chaque changement de ces réglages. */
    fun request(context: Context) {
        if (!webViewAttempted) return
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
            webViewLocalStorage = webViewStorage,
        )
        writeDeviceSettings(SafWorkspaceStorage(app, tree), deviceSettingsJson(settings, Instant.now()))
    }

    /**
     * Au lancement, sur le fil principal : une WebView invisible sur la MÊME origine que MainActivity (https://neo-calendar.local),
     * qui lit tout son localStorage puis se détruit, puis premier export. Aucun script de l'ancienne interface ne tourne :
     * la page servie est vide, seule l'origine compte. Échec, délai de 10 s ou localStorage vide : l'export se fait sans la clé.
     */
    fun start(context: Context) {
        if (webViewStarted) {
            request(context)
            return
        }
        webViewStarted = true
        val app = context.applicationContext
        val handler = Handler(Looper.getMainLooper())
        var web: WebView? = null
        var done = false
        fun finish(storage: Map<String, String>?) {
            if (done) return
            done = true
            webViewStorage = storage
            webViewAttempted = true
            handler.post { web?.destroy(); web = null }
            request(app)
        }
        try {
            val view = WebView(app)
            web = view
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.allowFileAccess = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) view.settings.safeBrowsingEnabled = false
            view.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    val body = if (request.url.host == WEB_HOST) "<!doctype html><title>.</title>" else ""
                    return WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(body.toByteArray()))
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    view.evaluateJavascript("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))") { finish(webViewStorageFromJs(it)) }
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                    if (request.isForMainFrame) finish(null)
                }
            }
            handler.postDelayed({ finish(null) }, 10_000)
            view.loadUrl("https://$WEB_HOST/index.html")
        } catch (e: Exception) {
            Log.w("NeoNative", "localStorage de la WebView non lu", e)
            finish(null)
        }
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
