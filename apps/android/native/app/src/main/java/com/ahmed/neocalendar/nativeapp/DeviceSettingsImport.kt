package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.ahmed.neocalendar.WidgetData
import com.ahmed.neocalendar.core.grid.clampDayCount
import com.ahmed.neocalendar.core.migration.DeviceSettings
import com.ahmed.neocalendar.core.migration.deleteDeviceSettings
import com.ahmed.neocalendar.core.migration.localStorageScript
import com.ahmed.neocalendar.core.migration.readDeviceSettings
import java.io.ByteArrayInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

private const val TAG = "NeoNative"

// Mêmes noms que NativeViewModel / IcsSync / WidgetData : l'endroit exact où l'app relit ces réglages.
private const val DEVICE_PREFS = "neo_native"
private const val KEY_DAY_COUNT = "dayCount"
private const val KEY_ALLDAY_COLLAPSED = "allDayCollapsed"
private const val KEY_ICS_STATE = "icsRuntimeState"

// L'origine qu'avait l'ancienne interface (WebView) : le localStorage est par origine.
private const val WEB_HOST = "neo-calendar.local"
private const val WEB_TIMEOUT_MS = 10_000L

/**
 * Passage depuis com.ahmed.neocalendar : juste après le choix du dossier, réapplique ce que l'ancienne app a déposé
 * dans `.neo-calendar/android-device-settings.json`, puis supprime ce fichier. Absent, illisible ou d'une version
 * inconnue : ignoré (valeurs par défaut), noté dans le journal. Si le localStorage de la WebView n'a pas pu être
 * réécrit, le fichier reste (un nouveau choix du dossier réessaie) plutôt que de perdre fond d'écran et apparence.
 * À appeler hors du fil principal.
 */
suspend fun importDeviceSettings(app: Context, tree: Uri) {
    val storage = try {
        SafWorkspaceStorage(app, tree)
    } catch (e: Exception) {
        Log.w(TAG, "import des réglages : dossier illisible", e)
        return
    }
    val settings = withContext(Dispatchers.IO) { readDeviceSettings(storage) }
    if (settings == null) {
        Log.i(TAG, "import des réglages : pas d'export de l'ancienne app (ou illisible), valeurs par défaut")
        return
    }
    withContext(Dispatchers.IO) { applyToPreferences(app, settings) }
    val webOk = settings.webViewLocalStorage.isEmpty() || injectLocalStorage(app, settings.webViewLocalStorage)
    if (!webOk) {
        Log.w(TAG, "import des réglages : localStorage de la WebView non réécrit, export conservé")
        return
    }
    withContext(Dispatchers.IO) {
        try {
            deleteDeviceSettings(storage)
        } catch (e: Exception) {
            Log.w(TAG, "import des réglages : export non supprimé", e)
        }
    }
    if (settings.webViewLocalStorage.isNotEmpty()) {
        withContext(Dispatchers.Main) { com.ahmed.neocalendar.nativeapp.ui.theme.NeoAppearance.importFromWebView(app) }
    }
    Log.i(TAG, "import des réglages : fait (${settings.webViewLocalStorage.size} clés de localStorage)")
}

private fun applyToPreferences(app: Context, settings: DeviceSettings) {
    val edit = app.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE).edit()
    settings.dayCount?.let { edit.putInt(KEY_DAY_COUNT, clampDayCount(it)) }
    settings.allDayCollapsed?.let { edit.putBoolean(KEY_ALLDAY_COLLAPSED, it) }
    settings.icsRuntimeState?.let { edit.putString(KEY_ICS_STATE, it) }
    edit.commit()
    for ((key, ids) in settings.widgetCalendars) {
        val id = key.removePrefix("w").toIntOrNull() ?: continue
        WidgetData.chooseCalendars(app, id, ids)
    }
}

/**
 * Une WebView invisible sur la MÊME origine que l'ancienne interface (https://neo-calendar.local) : la page servie est vide
 * (l'APK n'embarque plus aucun fichier de l'ancienne interface), seule l'origine compte. Rend vrai quand chaque clé est écrite.
 */
private suspend fun injectLocalStorage(app: Context, entries: Map<String, String>): Boolean = withContext(Dispatchers.Main) {
    var web: WebView? = null
    val ok = withTimeoutOrNull(WEB_TIMEOUT_MS) {
        suspendCancellableCoroutine<Boolean> { cont ->
            var done = false
            fun finish(result: Boolean) {
                if (done) return
                done = true
                if (cont.isActive) cont.resume(result)
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
                        view.evaluateJavascript(localStorageScript(entries)) { finish(it == "true") }
                    }

                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) finish(false)
                    }
                }
                view.loadUrl("https://$WEB_HOST/index.html")
            } catch (e: Exception) {
                Log.w(TAG, "localStorage de la WebView non réécrit", e)
                finish(false)
            }
        }
    } ?: false
    if (ok) delay(500) // laisse le stockage du moteur se poser avant de détruire la vue
    web?.let { Handler(Looper.getMainLooper()).post { it.destroy() } }
    ok
}
