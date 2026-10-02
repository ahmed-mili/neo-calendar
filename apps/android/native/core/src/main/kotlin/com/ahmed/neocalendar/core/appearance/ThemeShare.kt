package com.ahmed.neocalendar.core.appearance

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/*
 * « Copier le thème » et « Importer un thème » de `DesktopSettings.tsx` : le texte `codex-theme-v1:{json}` que l'ancienne
 * met dans le presse-papiers et relit (avec ou sans le préfixe). Le natif écrit et lit le même format.
 */

private const val PREFIX = "codex-theme-v1:"

/** `copyCurrentTheme` : la clé `semanticColors` de l'ancienne n'est pas reprise (l'import ne la lit pas). */
fun themeShareText(themeId: String, theme: EffectiveThemeAppearance, scheme: String = "dark"): String = PREFIX + JsonObject(
    linkedMapOf(
        "codeThemeId" to JsonPrimitive(themeId),
        "theme" to JsonObject(
            linkedMapOf(
                "accent" to JsonPrimitive(theme.accent),
                "contrast" to JsonPrimitive(theme.contrast),
                "fonts" to JsonObject(linkedMapOf("code" to JsonPrimitive(theme.codeFont), "ui" to JsonPrimitive(theme.uiFont))),
                "ink" to JsonPrimitive(theme.ink),
                "opaqueWindows" to JsonPrimitive(!theme.translucentSidebar),
                "surface" to JsonPrimitive(theme.surface),
            ),
        ),
        "variant" to JsonPrimitive(scheme),
    ),
).toString()

/** Ce qu'un thème importé change du brouillon ; un champ absent ou invalide laisse le brouillon tel quel. */
data class ImportedTheme(
    val themeId: String,
    val accent: String? = null,
    val surface: String? = null,
    val ink: String? = null,
    val contrast: Int? = null,
    val uiFont: String? = null,
    val codeFont: String? = null,
    val translucentSidebar: Boolean? = null,
)

sealed interface ThemeImport {
    data class Ok(val theme: ImportedTheme) : ThemeImport

    /** Le texte n'est pas du JSON : « Fichier de thème invalide ». */
    data object Invalid : ThemeImport

    /** Un thème que Neo Calendar n'a pas : « Ce thème n’est pas installé dans Neo Calendar ». */
    data object NotInstalled : ThemeImport
}

private fun JsonElement?.str() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** `importThemeFile`. */
fun parseThemeShare(text: String): ThemeImport {
    val trimmed = text.trim()
    val json = if (trimmed.startsWith(PREFIX)) trimmed.removePrefix(PREFIX) else trimmed
    val root = try { Json.parseToJsonElement(json) as? JsonObject } catch (_: Exception) { null } ?: return ThemeImport.Invalid
    val id = root["codeThemeId"].str()
    if (THEMES.none { it.id == id }) return ThemeImport.NotInstalled
    val theme = root["theme"] as? JsonObject
    val fonts = theme?.get("fonts") as? JsonObject
    val contrast = (theme?.get("contrast") as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
    val opaque = (theme?.get("opaqueWindows") as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
    return ThemeImport.Ok(
        ImportedTheme(
            themeId = id!!,
            accent = theme?.get("accent").str(),
            surface = theme?.get("surface").str(),
            ink = theme?.get("ink").str(),
            contrast = contrast?.let { Math.round(it).toInt().coerceIn(0, 100) },
            uiFont = fonts?.get("ui").str(),
            codeFont = fonts?.get("code").str(),
            translucentSidebar = opaque?.not(),
        ),
    )
}
