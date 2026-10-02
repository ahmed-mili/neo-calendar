package com.ahmed.neocalendar.core.appearance

import kotlin.math.roundToInt

/*
 * Les couleurs d'un thème une fois résolues (thème + personnalisation + mode), en ARGB `0xAARRGGBB`.
 * Mêmes formules que `App.tsx` (`color-mix(in srgb, ...)`) quand une couleur est personnalisée ; sans personnalisation,
 * la palette que la feuille de style du thème fixe, telle quelle. En mode clair, la coque neutre de `App.css`
 * (`html.nc-appearance-light`) qui garde l'accent du thème.
 */

/** Ce que les écrans lisent : une couleur par rôle. `ink` et `surface` servent de teinte aux jetons dérivés. */
data class ThemeColors(
    val light: Boolean,
    val primary: Long,
    val secondary: Long,
    val crust: Long,
    val hover: Long,
    val border: Long,
    val text: Long,
    val muted: Long,
    val faint: Long,
    val onAccent: Long,
    val error: Long,
    val success: Long,
    val accent: Long,
    val accentStrong: Long,
)

fun argbOfHex(hex: String): Long = 0xFF000000L or hex.removePrefix("#").toLong(16)

fun alphaOf(argb: Long): Int = ((argb shr 24) and 0xFF).toInt()

fun withAlpha(argb: Long, alpha: Int): Long = (alpha.toLong().coerceIn(0, 255) shl 24) or (argb and 0x00FFFFFFL)

private fun channel(argb: Long, shift: Int) = ((argb shr shift) and 0xFF).toInt()

/** `color-mix(in srgb, a (1 - t), b t)` sur des couleurs opaques (l'alpha de `a` est gardé). */
fun mixColors(a: Long, b: Long, t: Double): Long {
    fun m(shift: Int) = (channel(a, shift) * (1 - t) + channel(b, shift) * t).roundToInt().coerceIn(0, 255)
    return (alphaOf(a).toLong() shl 24) or (m(16).toLong() shl 16) or (m(8).toLong() shl 8) or m(0).toLong()
}

private const val WHITE = 0xFFFFFFFFL
private const val BLACK = 0xFF000000L

/**
 * Résout les couleurs. Sombre : la palette du thème ; une surface, une encre ou un accent personnalisés remplacent
 * les couleurs qui en dépendent (formules de `App.tsx`). Clair : la coque neutre, l'accent du thème (ou le choisi).
 */
fun resolveThemeColors(theme: ThemeDefinition, custom: ThemeCustomization?, mode: AppearanceMode, systemDark: Boolean): ThemeColors {
    val light = when (mode) {
        AppearanceMode.Light -> true
        AppearanceMode.Dark -> false
        AppearanceMode.System -> !systemDark
    }
    val p = theme.palette
    val accent = argbOfHex(custom?.accent ?: theme.accent)
    val accentStrong = if (custom?.accent != null) mixColors(accent, WHITE, 0.22) else p.accentStrong
    if (light) {
        val l = theme.light
        val primary = argbOfHex(l.surface)
        val text = argbOfHex(l.ink)
        val lightAccent = argbOfHex(custom?.accent ?: l.accent)
        val tones = deriveTones(primary, text)
        return ThemeColors(
            light = true, primary = primary,
            secondary = mixColors(primary, text, 0.12), crust = mixColors(primary, text, 0.08),
            hover = mixColors(primary, text, tones.hoverMix), border = withAlpha(text, 0x38),
            text = text, muted = mixColors(primary, text, tones.mutedMix), faint = mixColors(primary, text, tones.faintMix),
            onAccent = accentTextOn(lightAccent, primary),
            error = readableColor(argbOfHex(l.error), primary, text, TEXT_CONTRAST),
            success = readableColor(argbOfHex(l.success), primary, text, GRAPHIC_CONTRAST),
            accent = lightAccent, accentStrong = mixColors(lightAccent, BLACK, 0.12),
        )
    }
    val surface = custom?.surface?.let { argbOfHex(it) }
    val ink = custom?.ink?.let { argbOfHex(it) }
    val primary = surface ?: argbOfHex(theme.surface)
    val text = ink ?: argbOfHex(theme.ink)
    val secondary = if (surface != null) mixColors(primary, text, SECONDARY_MIX) else p.secondary
    val customized = surface != null || ink != null
    // Personnalisé : proportions dérivées, comme le PC. Sinon la palette du thème, corrigée seulement là où elle ne
    // se lit pas : le survol si l'encre ne s'y lit pas, puis chaque texte atténué, rapproché de l'encre au minimum.
    val derived = if (customized) deriveTones(primary, text) else null
    val hover = when {
        derived != null -> mixColors(primary, text, derived.hoverMix)
        contrastRatio(text, p.hover) >= TEXT_CONTRAST -> p.hover
        else -> mixColors(primary, text, deriveTones(primary, text).hoverMix)
    }
    val surfaces = listOf(primary, secondary, mixColors(primary, text, FIELD_MIX), hover)
    fun tone(palette: Long, derivedMix: Double?, from: Double, min: Double): Long = when {
        derivedMix != null -> mixColors(primary, text, derivedMix)
        surfaces.all { contrastRatio(palette, it) >= min } -> palette
        else -> mixColors(primary, text, reachMix(primary, text, from, min, surfaces) ?: 1.0)
    }
    return ThemeColors(
        light = false,
        primary = primary,
        secondary = secondary,
        crust = if (surface != null) mixColors(primary, BLACK, 0.43) else p.crust,
        hover = hover,
        border = if (ink != null) withAlpha(text, 0x38) else p.border,
        text = text,
        muted = tone(p.muted, derived?.mutedMix, MUTED_MIX, TEXT_CONTRAST),
        faint = tone(p.faint, derived?.faintMix, FAINT_MIX, GRAPHIC_CONTRAST),
        onAccent = accentTextOn(accent, primary),
        error = readableColor(p.error, primary, text, TEXT_CONTRAST),
        success = readableColor(p.success, primary, text, GRAPHIC_CONTRAST),
        accent = accent, accentStrong = accentStrong,
    )
}

/** Seuils de lisibilité (spec §3.3) : texte 4,5 ; icônes, pastilles et texte discret 3. */
const val TEXT_CONTRAST = 4.5
const val GRAPHIC_CONTRAST = 3.0

/** Valeurs des réglages (titres, valeurs de droite) : entre le texte secondaire et le texte discret. */
fun settingsValueColor(c: ThemeColors): Long = mixColors(c.muted, c.faint, 0.18)

/** Notes et chevrons des réglages : plus près du texte discret. */
fun settingsNoteColor(c: ThemeColors): Long = mixColors(c.muted, c.faint, 0.78)

private const val SECONDARY_MIX = 0.12
private const val FIELD_MIX = 0.16
private const val HOVER_MIX = 0.22
private const val MUTED_MIX = 0.72
private const val FAINT_MIX = 0.52

/** Le survol et les deux textes atténués : proportions d'encre dans la surface (mêmes règles que `panelTokens.ts`). */
class Tones(val hoverMix: Double, val mutedMix: Double, val faintMix: Double)

/** La plus petite proportion d'encre, à partir de `from`, dont le mélange avec la surface tient `min` sur chaque fond (`null` si aucune). */
fun reachMix(surface: Long, ink: Long, from: Double, min: Double, backgrounds: List<Long>): Double? {
    for (step in Math.round(from * 100).toInt()..100) {
        val color = mixColors(surface, ink, step / 100.0)
        if (backgrounds.all { contrastRatio(color, it) >= min }) return step / 100.0
    }
    return null
}

/**
 * Départ : les proportions d'origine (survol 22 %, secondaire 72 %, discret 52 % d'encre). Une palette peu contrastée
 * ne les tient pas : on rapproche d'abord le texte de l'encre (jusqu'à 100 %), puis, si l'encre elle-même ne se lit pas
 * sur le survol, on éclaircit moins le survol (jusqu'au niveau du champ). Une palette qui tient déjà garde les
 * proportions d'origine.
 */
fun deriveTones(surface: Long, ink: Long): Tones {
    val fixed = listOf(surface, mixColors(surface, ink, SECONDARY_MIX), mixColors(surface, ink, FIELD_MIX))
    for (hover in Math.round(HOVER_MIX * 100).toInt() downTo Math.round(FIELD_MIX * 100).toInt()) {
        val surfaces = fixed + mixColors(surface, ink, hover / 100.0)
        val muted = reachMix(surface, ink, MUTED_MIX, TEXT_CONTRAST, surfaces) ?: continue
        val faint = reachMix(surface, ink, FAINT_MIX, GRAPHIC_CONTRAST, surfaces) ?: muted
        return Tones(hover / 100.0, muted, minOf(faint, muted))
    }
    return Tones(FIELD_MIX, 1.0, 1.0)
}

/** Texte sur accent : la couleur de la surface si elle se lit (4,5), sinon le noir ou le blanc le plus lisible. */
fun accentTextOn(accent: Long, surface: Long): Long =
    if (contrastRatio(surface, accent) >= TEXT_CONTRAST) surface else readableOn(accent)

/** Un rouge ou un vert rapproché de l'encre juste ce qu'il faut pour se lire sur le fond et sur le panneau. */
fun readableColor(color: Long, surface: Long, ink: Long, min: Double): Long =
    ensureContrast(color, listOf(surface, mixColors(surface, ink, SECONDARY_MIX)), min, ink)
