package com.ahmed.neocalendar.core.appearance

import kotlin.math.pow
import kotlin.math.roundToInt

/** Luminance relative WCAG 2.x d'une couleur opaque (l'alpha est ignoré). */
fun relativeLuminance(argb: Long): Double {
    fun lin(shift: Int): Double {
        val c = ((argb shr shift) and 0xFF).toInt() / 255.0
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * lin(16) + 0.7152 * lin(8) + 0.0722 * lin(0)
}

/** Le premier plan (éventuellement translucide) composé sur un fond opaque. */
fun over(fg: Long, bg: Long): Long {
    val a = alphaOf(fg) / 255.0
    fun m(shift: Int): Long {
        val top = ((fg shr shift) and 0xFF).toInt()
        val back = ((bg shr shift) and 0xFF).toInt()
        return (top * a + back * (1 - a)).roundToInt().coerceIn(0, 255).toLong()
    }
    return 0xFF000000L or (m(16) shl 16) or (m(8) shl 8) or m(0)
}

/** Rapport de contraste WCAG 2.x ; le premier plan translucide est composé sur `bg`. */
fun contrastRatio(fg: Long, bg: Long): Double {
    val a = relativeLuminance(over(fg, bg))
    val b = relativeLuminance(bg)
    return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
}

/** Du blanc ou du noir, selon ce qui se lit le mieux sur `bg`. */
fun readableOn(bg: Long): Long =
    if (contrastRatio(0xFFFFFFFFL, bg) >= contrastRatio(0xFF000000L, bg)) 0xFFFFFFFFL else 0xFF000000L

/**
 * La couleur `color` rapprochée de `toward` (par pas de 1 %) jusqu'à tenir `min` sur chacun des fonds.
 * Rend `color` telle quelle quand elle tient déjà, et `toward` si rien ne suffit.
 */
fun ensureContrast(color: Long, backgrounds: List<Long>, min: Double, toward: Long): Long {
    for (step in 0..100) {
        val candidate = if (step == 0) color else mixColors(color, toward, step / 100.0)
        if (backgrounds.all { contrastRatio(candidate, it) >= min }) return candidate
    }
    return toward
}
