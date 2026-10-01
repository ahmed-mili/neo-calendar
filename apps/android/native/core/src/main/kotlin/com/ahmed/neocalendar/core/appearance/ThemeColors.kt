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

/** La coque claire de `App.css:3650` (fond, surface, encre, bordure) ; l'accent et les états viennent du thème. */
private object LightShell {
    const val PRIMARY = 0xFFF5F5F6L
    const val SECONDARY = 0xFFFFFFFFL
    const val CRUST = 0xFFE9E9ECL
    const val HOVER = 0xFFEDEDF0L
    const val BORDER = 0x1F18181BL
    const val TEXT = 0xFF242428L
    const val MUTED = 0xFF6D6D75L
    const val FAINT = 0xFF9A9AA3L
    const val ON_ACCENT = 0xFFFFFFFFL
}

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
        return ThemeColors(
            light = true, primary = LightShell.PRIMARY, secondary = LightShell.SECONDARY, crust = LightShell.CRUST,
            hover = LightShell.HOVER, border = LightShell.BORDER, text = LightShell.TEXT, muted = LightShell.MUTED,
            faint = LightShell.FAINT, onAccent = LightShell.ON_ACCENT, error = p.error, success = p.success,
            accent = accent, accentStrong = mixColors(accent, BLACK, 0.12),
        )
    }
    val surface = custom?.surface?.let { argbOfHex(it) }
    val ink = custom?.ink?.let { argbOfHex(it) }
    val primary = surface ?: argbOfHex(theme.surface)
    val text = ink ?: argbOfHex(theme.ink)
    return ThemeColors(
        light = false,
        primary = primary,
        secondary = if (surface != null) mixColors(primary, text, 0.12) else p.secondary,
        crust = if (surface != null) mixColors(primary, BLACK, 0.43) else p.crust,
        hover = if (surface != null) mixColors(primary, text, 0.22) else p.hover,
        border = if (ink != null) withAlpha(text, 0x38) else p.border,
        text = text,
        muted = if (ink != null || surface != null) mixColors(primary, text, 0.72) else p.muted,
        faint = if (ink != null || surface != null) mixColors(primary, text, 0.52) else p.faint,
        onAccent = p.onAccent, error = p.error, success = p.success, accent = accent, accentStrong = accentStrong,
    )
}
