package com.ahmed.neocalendar.nativeapp.ui.theme

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject

/** `WallpaperEffects` de `wallpaperEffects.ts` : mêmes bornes, mêmes défauts. */
data class WallpaperEffects(
    val brightness: Float = 0.7f,
    val blur: Float = 5f,
    val containerOpacity: Float = 0.4f,
) {
    fun normalized() = WallpaperEffects(
        brightness.coerceIn(0f, 1f).orDefault(0.7f),
        blur.coerceIn(0f, 20f).orDefault(5f),
        containerOpacity.coerceIn(0f, 1f).orDefault(0.4f),
    )

    private fun Float.orDefault(fallback: Float) = if (isNaN()) fallback else this
}

/**
 * Le thème courant, le fond d'écran choisi et ses effets. Lus de la même source que l'ancienne interface :
 * `localStorage` de la WebView (`neo-calendar.appearance`, `neo-calendar-wallpaper-effects-v1`). Au premier
 * lancement natif une WebView muette, sur la même origine que l'ancienne, relit ces deux clés et les recopie
 * dans les préférences natives, qui prennent le relais (le choix du fond, aux Réglages, y écrira).
 */
object NeoAppearance {
    private const val PREFS = "neo_native_appearance"
    private const val ORIGIN = "https://neo-calendar.local/index.html"
    private const val APPEARANCE_KEY = "neo-calendar.appearance"
    private const val EFFECTS_KEY = "neo-calendar-wallpaper-effects-v1"

    var tokens by mutableStateOf(CatppuccinMocha)
        private set

    /** `null` : rien de choisi, donc le fond par défaut du thème pour Android. */
    var wallpaperId by mutableStateOf<String?>(null)
        private set

    var effects by mutableStateOf(WallpaperEffects())
        private set

    /** Lecture synchrone des préférences natives (quelques octets). */
    fun load(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        wallpaperId = prefs.getString("wallpaper_id", null)
        effects = WallpaperEffects(
            prefs.getFloat("brightness", 0.7f),
            prefs.getFloat("blur", 5f),
            prefs.getFloat("container_opacity", 0.4f),
        ).normalized()
        if (!prefs.getBoolean("migrated", false)) migrateFromWebView(context.applicationContext)
    }

    /** Pour la page Apparence des Réglages. */
    fun update(context: Context, wallpaper: String?, newEffects: WallpaperEffects) {
        wallpaperId = wallpaper
        effects = newEffects.normalized()
        save(context)
    }

    private fun save(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("wallpaper_id", wallpaperId)
            .putFloat("brightness", effects.brightness)
            .putFloat("blur", effects.blur)
            .putFloat("container_opacity", effects.containerOpacity)
            .putBoolean("migrated", true)
            .apply()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun migrateFromWebView(context: Context) {
        val web = try { WebView(context) } catch (_: Exception) { return }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(
                    "(function(){try{return JSON.stringify({a:localStorage.getItem('$APPEARANCE_KEY'),e:localStorage.getItem('$EFFECTS_KEY')})}catch(x){return null}})()",
                ) { raw ->
                    try {
                        // evaluateJavascript rend une chaîne JSON entre guillemets : on la déballe, puis on la lit.
                        val outer = org.json.JSONTokener(raw ?: "null").nextValue()
                        if (outer is String) apply(context, JSONObject(outer))
                    } catch (_: Exception) {
                        // Illisible : on garde les défauts, la prochaine ouverture retentera.
                    }
                    view.destroy()
                }
            }
        }
        web.loadDataWithBaseURL(ORIGIN, "<html></html>", "text/html", "utf-8", null)
    }

    private fun apply(context: Context, stored: JSONObject) {
        val appearance = stored.optString("a").takeIf { it.isNotEmpty() && it != "null" }?.let { JSONObject(it) }
        val id = appearance?.optJSONObject("themeOverrides")?.optJSONObject(CatppuccinMocha.id)?.optString("wallpaperId")
            ?.takeIf { it.isNotEmpty() }
        val fx = stored.optString("e").takeIf { it.isNotEmpty() && it != "null" }?.let { JSONObject(it) }
        wallpaperId = id
        effects = WallpaperEffects(
            fx?.optDouble("backgroundBrightness", 0.7)?.toFloat() ?: 0.7f,
            fx?.optDouble("backgroundBlur", 5.0)?.toFloat() ?: 5f,
            fx?.optDouble("containerOpacity", 0.4)?.toFloat() ?: 0.4f,
        ).normalized()
        save(context)
    }
}
