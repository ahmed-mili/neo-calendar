package com.ahmed.neocalendar.core.appearance

import kotlin.math.roundToInt
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/*
 * Port de `apps/windows/src/themes/appearancePreferences.ts` : ce que l'ancienne interface range dans le
 * `localStorage` sous `neo-calendar.appearance`. Le natif lit et écrit exactement ce texte (dans la WebView ET
 * dans ses préférences), pour que les deux interfaces restent d'accord.
 */

/** Les trois modes de couleur (`AppearanceMode`) ; défaut sombre. */
enum class AppearanceMode(val key: String) {
    System("system"), Light("light"), Dark("dark");

    companion object {
        fun of(key: Any?): AppearanceMode = entries.firstOrNull { it.key == key } ?: Dark
    }
}

/** `ThemeCustomization` : ce qu'une personne a changé sur UN thème. Un champ absent suit le thème. */
data class ThemeCustomization(
    val accent: String? = null,
    val surface: String? = null,
    val ink: String? = null,
    val uiFont: String? = null,
    val codeFont: String? = null,
    val translucentSidebar: Boolean? = null,
    val contrast: Int? = null,
    val wallpaperId: String? = null,
)

data class AppearancePreferences(
    val mode: AppearanceMode = AppearanceMode.Dark,
    val translucentSidebar: Boolean = true,
    val contrast: Int = 50,
    val themeOverrides: Map<String, ThemeCustomization> = emptyMap(),
)

/** `getEffectiveThemeAppearance` : les valeurs en vigueur d'un thème, sa personnalisation par-dessus ses défauts. */
data class EffectiveThemeAppearance(
    val accent: String,
    val surface: String,
    val ink: String,
    val uiFont: String,
    val codeFont: String,
    val translucentSidebar: Boolean,
    val contrast: Int,
    val wallpaperId: String,
)

private fun clampContrast(value: Double?, fallback: Int = 50): Int =
    if (value == null || !value.isFinite()) fallback else value.roundToInt().coerceIn(0, 100)

private val HEX = Regex("#[0-9a-fA-F]{6}")

/** `normalizeHex` : `#rrggbb`, en minuscules ; tout le reste est absent. */
fun normalizeHex(value: String?): String? = value?.trim()?.takeIf { HEX.matches(it) }?.lowercase()

private fun normalizeFont(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() && it.length <= 240 }

private fun JsonElement?.string(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonElement?.number(): Double? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive is JsonNull) return null
    return if (primitive.isString) primitive.content.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull() else primitive.content.toDoubleOrNull()
}

private fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

private fun normalizeCustomization(value: JsonElement?): ThemeCustomization {
    val input = value as? JsonObject ?: return ThemeCustomization()
    return ThemeCustomization(
        accent = normalizeHex(input["accent"].string()),
        surface = normalizeHex(input["surface"].string()),
        ink = normalizeHex(input["ink"].string()),
        uiFont = normalizeFont(input["uiFont"].string()),
        codeFont = normalizeFont(input["codeFont"].string()),
        translucentSidebar = input["translucentSidebar"].bool(),
        contrast = if (input["contrast"] != null) clampContrast(input["contrast"].number()) else null,
        wallpaperId = input["wallpaperId"].string()?.takeIf { isKnownWallpaperId(it) },
    )
}

/** `normalizeAppearancePreferences` : tolérant, jamais d'exception. */
fun normalizeAppearancePreferences(value: JsonElement?): AppearancePreferences {
    val input = value as? JsonObject ?: return AppearancePreferences()
    val overrides = LinkedHashMap<String, ThemeCustomization>()
    (input["themeOverrides"] as? JsonObject)?.forEach { (id, custom) -> overrides[id] = normalizeCustomization(custom) }
    return AppearancePreferences(
        mode = AppearanceMode.of(input["mode"].string()),
        translucentSidebar = input["translucentSidebar"].bool() ?: true,
        contrast = clampContrast(input["contrast"].number()),
        themeOverrides = overrides,
    )
}

/** Lit le texte du `localStorage` ; absent, vide ou illisible : les défauts. */
fun parseAppearancePreferences(text: String?): AppearancePreferences {
    if (text.isNullOrBlank() || text == "null") return AppearancePreferences()
    return try { normalizeAppearancePreferences(Json.parseToJsonElement(text)) } catch (_: Exception) { AppearancePreferences() }
}

private fun ThemeCustomization.toJson(): JsonObject {
    val fields = LinkedHashMap<String, JsonElement>()
    accent?.let { fields["accent"] = JsonPrimitive(it) }
    surface?.let { fields["surface"] = JsonPrimitive(it) }
    ink?.let { fields["ink"] = JsonPrimitive(it) }
    uiFont?.let { fields["uiFont"] = JsonPrimitive(it) }
    codeFont?.let { fields["codeFont"] = JsonPrimitive(it) }
    translucentSidebar?.let { fields["translucentSidebar"] = JsonPrimitive(it) }
    contrast?.let { fields["contrast"] = JsonPrimitive(it) }
    wallpaperId?.let { fields["wallpaperId"] = JsonPrimitive(it) }
    return JsonObject(fields)
}

/** Le texte que `JSON.stringify(normalized)` écrit dans le `localStorage` : mêmes clés, même ordre. */
fun AppearancePreferences.toJsonText(): String {
    val overrides = LinkedHashMap<String, JsonElement>()
    themeOverrides.forEach { (id, custom) -> overrides[id] = custom.toJson() }
    return JsonObject(
        linkedMapOf(
            "mode" to JsonPrimitive(mode.key),
            "translucentSidebar" to JsonPrimitive(translucentSidebar),
            "contrast" to JsonPrimitive(contrast),
            "themeOverrides" to JsonObject(overrides),
        ),
    ).toString()
}

fun effectiveThemeAppearance(
    theme: ThemeDefinition,
    preferences: AppearancePreferences,
    defaultWallpaper: String = DEFAULT_ANDROID_WALLPAPER_ID,
): EffectiveThemeAppearance {
    val override = preferences.themeOverrides[theme.id] ?: ThemeCustomization()
    return EffectiveThemeAppearance(
        accent = override.accent ?: theme.accent,
        surface = override.surface ?: theme.surface,
        ink = override.ink ?: theme.ink,
        uiFont = override.uiFont ?: theme.uiFont,
        codeFont = override.codeFont ?: theme.codeFont,
        translucentSidebar = override.translucentSidebar ?: !theme.opaqueWindows,
        contrast = override.contrast ?: theme.contrast,
        wallpaperId = override.wallpaperId ?: defaultWallpaper,
    )
}

/** `setThemeCustomization` : la personnalisation est normalisée avant d'être rangée. */
fun AppearancePreferences.withCustomization(themeId: String, customization: ThemeCustomization): AppearancePreferences =
    copy(themeOverrides = themeOverrides + (themeId to normalizeCustomization(customization.toJson())))

/** `resetThemeCustomization`. */
fun AppearancePreferences.withoutCustomization(themeId: String): AppearancePreferences = copy(themeOverrides = themeOverrides - themeId)

/** Un seul champ change (le fond choisi, par exemple) : le reste de la personnalisation du thème est gardé. */
fun AppearancePreferences.withWallpaper(themeId: String, wallpaperId: String): AppearancePreferences =
    withCustomization(themeId, (themeOverrides[themeId] ?: ThemeCustomization()).copy(wallpaperId = wallpaperId))

// --- Les effets du fond (`wallpaperEffects.ts`) ---

data class WallpaperEffectValues(
    val backgroundBrightness: Double = 0.7,
    val backgroundBlur: Double = 5.0,
    val containerOpacity: Double = 0.4,
)

private fun clampEffect(value: Double?, min: Double, max: Double, fallback: Double): Double =
    if (value == null || !value.isFinite()) fallback else value.coerceIn(min, max)

/** `normalizeWallpaperEffects`. */
fun normalizeWallpaperEffects(value: JsonElement?): WallpaperEffectValues {
    val input = value as? JsonObject
    return WallpaperEffectValues(
        clampEffect(input?.get("backgroundBrightness").number(), 0.0, 1.0, 0.7),
        clampEffect(input?.get("backgroundBlur").number(), 0.0, 20.0, 5.0),
        clampEffect(input?.get("containerOpacity").number(), 0.0, 1.0, 0.4),
    )
}

fun parseWallpaperEffects(text: String?): WallpaperEffectValues {
    if (text.isNullOrBlank() || text == "null") return WallpaperEffectValues()
    return try { normalizeWallpaperEffects(Json.parseToJsonElement(text)) } catch (_: Exception) { WallpaperEffectValues() }
}

/** `JSON.stringify` des trois valeurs, dans l'ordre de l'ancienne. */
fun WallpaperEffectValues.toJsonText(): String = JsonObject(
    linkedMapOf(
        "backgroundBrightness" to JsonPrimitive(backgroundBrightness),
        "backgroundBlur" to JsonPrimitive(backgroundBlur),
        "containerOpacity" to JsonPrimitive(containerOpacity),
    ),
).toString()

// --- Le thème choisi (`themeId`) : dans le `localStorage` sous `desktop-settings.json:preferences` ---

/** Le `themeId` d'un texte de préférences de bureau ; un identifiant inconnu rend Catppuccin (`normalizeDesktopPreferences`). */
fun themeIdOfDesktopPreferences(text: String?): String {
    val id = try { (Json.parseToJsonElement(text ?: "null") as? JsonObject)?.get("themeId").string() } catch (_: Exception) { null }
    return getTheme(id ?: DEFAULT_THEME_ID).id
}

/**
 * Le texte de préférences de bureau avec `themeId` changé, tout le reste gardé tel quel (dossier, coffres...).
 * Vide ou illisible : un objet qui ne porte que le thème (l'ancienne le complète à sa lecture).
 */
fun desktopPreferencesWithTheme(text: String?, themeId: String): String {
    val current = try { Json.parseToJsonElement(text ?: "null") as? JsonObject } catch (_: Exception) { null }
    val fields = LinkedHashMap<String, JsonElement>(current ?: emptyMap())
    fields["themeId"] = JsonPrimitive(themeId)
    return JsonObject(fields).toString()
}
