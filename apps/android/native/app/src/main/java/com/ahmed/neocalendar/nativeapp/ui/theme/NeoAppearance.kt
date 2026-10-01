package com.ahmed.neocalendar.nativeapp.ui.theme

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ahmed.neocalendar.WallpaperStore
import com.ahmed.neocalendar.core.appearance.AppearanceMode
import com.ahmed.neocalendar.core.appearance.AppearancePreferences
import com.ahmed.neocalendar.core.appearance.DEFAULT_THEME_ID
import com.ahmed.neocalendar.core.appearance.EffectiveThemeAppearance
import com.ahmed.neocalendar.core.appearance.ThemeCustomization
import com.ahmed.neocalendar.core.appearance.WallpaperEffectValues
import com.ahmed.neocalendar.core.appearance.WallpaperFile
import com.ahmed.neocalendar.core.appearance.desktopPreferencesWithTheme
import com.ahmed.neocalendar.core.appearance.effectiveThemeAppearance
import com.ahmed.neocalendar.core.appearance.getTheme
import com.ahmed.neocalendar.core.appearance.parseAppearancePreferences
import com.ahmed.neocalendar.core.appearance.parseWallpaperEffects
import com.ahmed.neocalendar.core.appearance.recoveredWallpaperId
import com.ahmed.neocalendar.core.appearance.resolveThemeColors
import com.ahmed.neocalendar.core.appearance.themeIdOfDesktopPreferences
import com.ahmed.neocalendar.core.appearance.toJsonText
import com.ahmed.neocalendar.core.appearance.withCustomization
import com.ahmed.neocalendar.core.appearance.withWallpaper
import com.ahmed.neocalendar.core.appearance.withoutThemeDefaults
import com.ahmed.neocalendar.core.appearance.withoutCustomization
import com.ahmed.neocalendar.nativeapp.AppLanguage
import org.json.JSONObject
import org.json.JSONTokener

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
 * Le thème, le mode de couleur, la personnalisation, le fond d'écran et ses effets, la langue. Ils sont rangés aux MÊMES
 * endroits que l'ancienne interface (le `localStorage` de la WebView : `neo-calendar.appearance`,
 * `neo-calendar-wallpaper-effects-v1`, `desktop-settings.json:preferences` pour le `themeId`, `neo-calendar.language`)
 * ET dans les préférences natives, lues sans attendre. À chaque lancement une WebView muette, sur la même origine que
 * l'ancienne, relit les quatre clés : ce que l'ancienne interface a changé entre-temps l'emporte, puis tout est recopié
 * dans les préférences natives. Chaque choix fait ici est écrit dans les deux (la WebView avec 400 ms de répit, un curseur
 * qu'on glisse n'ouvre pas une WebView par image).
 */
object NeoAppearance {
    private const val PREFS = "neo_native_appearance"
    private const val ORIGIN = "https://neo-calendar.local/index.html"
    private const val APPEARANCE_KEY = "neo-calendar.appearance"
    private const val EFFECTS_KEY = "neo-calendar-wallpaper-effects-v1"
    private const val DESKTOP_KEY = "desktop-settings.json:preferences"
    private const val LANGUAGE_KEY = "neo-calendar.language"

    var tokens by mutableStateOf(CatppuccinMocha)
        private set

    var themeId by mutableStateOf(DEFAULT_THEME_ID)
        private set

    var preferences by mutableStateOf(AppearancePreferences())
        private set

    var effects by mutableStateOf(WallpaperEffects())
        private set

    /** Le mode « système » suit ceci (rafraîchi par l'écran, qui lit `isSystemInDarkTheme`). */
    var systemDark by mutableStateOf(true)
        private set

    val theme get() = getTheme(themeId)

    /** Les valeurs en vigueur du thème courant (personnalisation comprise). */
    val effective: EffectiveThemeAppearance get() = effectiveThemeAppearance(theme, preferences)

    /** Le fond choisi pour le thème courant (jamais nul : le fond par défaut d'Android sinon). */
    val wallpaperId: String get() = effective.wallpaperId

    val isLight: Boolean
        get() = when (preferences.mode) {
            AppearanceMode.Light -> true
            AppearanceMode.Dark -> false
            AppearanceMode.System -> !systemDark
        }

    private val handler = Handler(Looper.getMainLooper())
    private var pendingWebWrite: Runnable? = null

    /** Un choix fait ici que la WebView n'a pas encore reçu : la relecture ne doit pas le défaire. */
    private var unsynced = false

    // --- Lecture ---

    /** Lecture synchrone des préférences natives (quelques octets), puis la relecture de la WebView. */
    fun load(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val storedAppearance = prefs.getString("appearance", null)
        preferences = if (storedAppearance != null) parseAppearancePreferences(storedAppearance) else legacyPreferences(prefs)
        themeId = getTheme(prefs.getString("theme_id", null)).id
        unsynced = prefs.getBoolean("unsynced", false)
        effects = if (prefs.contains("effects")) fromValues(parseWallpaperEffects(prefs.getString("effects", null)))
        else WallpaperEffects(prefs.getFloat("brightness", 0.7f), prefs.getFloat("blur", 5f), prefs.getFloat("container_opacity", 0.4f)).normalized()
        AppLanguage.set(prefs.getString("language", null))
        systemDark = (context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) != android.content.res.Configuration.UI_MODE_NIGHT_NO
        refreshTokens()
        syncFromWebView(context.applicationContext)
    }

    /** Avant le lot 5b : seul le fond du thème Catppuccin était rangé, sous `wallpaper_id`. */
    private fun legacyPreferences(prefs: android.content.SharedPreferences): AppearancePreferences {
        val id = prefs.getString("wallpaper_id", null)?.takeIf { it.isNotEmpty() } ?: return AppearancePreferences()
        return AppearancePreferences().withWallpaper(DEFAULT_THEME_ID, id)
    }

    fun followSystem(dark: Boolean) {
        if (systemDark == dark) return
        systemDark = dark
        refreshTokens()
    }

    // --- Changements (écrits aux deux endroits) ---

    fun setTheme(context: Context, id: String) {
        themeId = getTheme(id).id
        changed(context)
    }

    fun setMode(context: Context, mode: AppearanceMode) {
        preferences = preferences.copy(mode = mode)
        changed(context)
    }

    fun setCustomization(context: Context, custom: ThemeCustomization) {
        preferences = preferences.withCustomization(themeId, custom.withoutThemeDefaults(theme))
        changed(context)
    }

    fun setWallpaper(context: Context, id: String) {
        preferences = preferences.withWallpaper(themeId, id)
        changed(context)
    }

    fun resetTheme(context: Context) {
        preferences = preferences.withoutCustomization(themeId)
        changed(context)
    }

    fun setEffects(context: Context, newEffects: WallpaperEffects) {
        effects = newEffects.normalized()
        changed(context)
    }

    fun setLanguage(context: Context, code: String) {
        AppLanguage.set(code)
        changed(context)
    }

    private fun changed(context: Context) {
        refreshTokens()
        unsynced = true
        save(context)
        scheduleWebWrite(context.applicationContext)
    }

    private fun refreshTokens() {
        val custom = preferences.themeOverrides[themeId]
        val untouched = custom?.accent == null && custom?.surface == null && custom?.ink == null
        tokens = if (themeId == DEFAULT_THEME_ID && !isLight && untouched) CatppuccinMocha
        else deriveTokens(
            themeId,
            resolveThemeColors(theme, custom, preferences.mode, systemDark),
            if (themeId == DEFAULT_THEME_ID) CatppuccinMocha.themeWallpaperFile else "",
        )
    }

    private fun save(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("appearance", preferences.toJsonText())
            .putString("theme_id", themeId)
            .putString("effects", toValues(effects).toJsonText())
            .putString("language", AppLanguage.code)
            .putBoolean("unsynced", unsynced)
            .apply()
    }

    private fun fromValues(v: WallpaperEffectValues) =
        WallpaperEffects(v.backgroundBrightness.toFloat(), v.backgroundBlur.toFloat(), v.containerOpacity.toFloat()).normalized()

    private fun toValues(e: WallpaperEffects) =
        WallpaperEffectValues(e.brightness.toDouble(), e.blur.toDouble(), e.containerOpacity.toDouble())

    // --- La WebView : même origine que l'ancienne interface, donc même `localStorage` ---

    private fun scheduleWebWrite(context: Context) {
        unsynced = true
        pendingWebWrite?.let { handler.removeCallbacks(it) }
        val job = Runnable { writeToWebView(context) }
        pendingWebWrite = job
        handler.postDelayed(job, 400)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun newWebView(context: Context, onLoaded: (WebView) -> Unit) {
        val web = try { WebView(context) } catch (_: Exception) { return }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) = onLoaded(view)
        }
        web.loadDataWithBaseURL(ORIGIN, "<html></html>", "text/html", "utf-8", null)
    }

    /** Recopie le choix dans le `localStorage` : l'ancienne interface lit les mêmes clés à son prochain démarrage. */
    private fun writeToWebView(context: Context) {
        val appearance = JSONObject.quote(preferences.toJsonText())
        val effectsText = JSONObject.quote(toValues(effects).toJsonText())
        val theme = JSONObject.quote(themeId)
        val language = JSONObject.quote(AppLanguage.code)
        newWebView(context) { view ->
            view.evaluateJavascript(
                "(function(){try{localStorage.setItem('$APPEARANCE_KEY',$appearance);localStorage.setItem('$EFFECTS_KEY',$effectsText);" +
                    "localStorage.setItem('$LANGUAGE_KEY',$language);" +
                    "var o={};try{o=JSON.parse(localStorage.getItem('$DESKTOP_KEY')||'{}')||{}}catch(e){}o.themeId=$theme;" +
                    "localStorage.setItem('$DESKTOP_KEY',JSON.stringify(o));return 1}catch(x){return 0}})()",
            ) {
                unsynced = false
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("unsynced", false).apply()
                view.destroy()
            }
        }
    }

    /** Ce que l'ancienne interface a rangé depuis la dernière fois l'emporte ; sans rien à lire, le natif pousse le sien. */
    private fun syncFromWebView(context: Context) {
        newWebView(context) { view ->
            view.evaluateJavascript(
                "(function(){try{return JSON.stringify({a:localStorage.getItem('$APPEARANCE_KEY'),e:localStorage.getItem('$EFFECTS_KEY')," +
                    "d:localStorage.getItem('$DESKTOP_KEY'),l:localStorage.getItem('$LANGUAGE_KEY')})}catch(x){return null}})()",
            ) { raw ->
                try {
                    // evaluateJavascript rend une chaîne JSON entre guillemets : on la déballe, puis on la lit.
                    val outer = JSONTokener(raw ?: "null").nextValue()
                    if (outer is String) applyFromWebView(context, JSONObject(outer))
                } catch (_: Exception) {
                    // Illisible : on garde les préférences natives, la prochaine ouverture retentera.
                }
                view.destroy()
            }
        }
    }

    private fun JSONObject.text(key: String): String? = optString(key).takeIf { it.isNotEmpty() && it != "null" }

    private fun applyFromWebView(context: Context, stored: JSONObject) {
        // Un choix fait ici passe avant ce que la WebView contient encore : on le lui envoie, on ne le relit pas.
        if (unsynced) { scheduleWebWrite(context); return }
        stored.text("a")?.let { preferences = parseAppearancePreferences(it) }
        stored.text("e")?.let { effects = fromValues(parseWallpaperEffects(it)) }
        stored.text("d")?.let { themeId = themeIdOfDesktopPreferences(it) }
        stored.text("l")?.let { AppLanguage.set(it) }
        refreshTokens()
        save(context)
        if (stored.text("a") == null || stored.text("d") == null || stored.text("l") == null || stored.text("e") == null) scheduleWebWrite(context)
        if (preferences.themeOverrides[themeId]?.wallpaperId == null) recoverWallpaper(context)
    }

    /**
     * Aucun fond mémorisé (ni dans la WebView, ni ici) mais des images dans `.neo-calendar/wallpapers/` : la plus récente
     * est le dernier fond téléchargé, donc choisi. Elle devient le choix, aux deux endroits ; un choix existant n'est jamais touché.
     */
    private fun recoverWallpaper(context: Context) {
        Thread {
            val listing = try { WallpaperStore(context).installedWithDates() } catch (_: Exception) { return@Thread }
            val files = listing.chunked(2).map { WallpaperFile(it[0] as String, it[1] as Long) }
            val id = recoveredWallpaperId(null, files) ?: return@Thread
            handler.post {
                if (preferences.themeOverrides[themeId]?.wallpaperId != null) return@post
                setWallpaper(context, id)
            }
        }.start()
    }
}
