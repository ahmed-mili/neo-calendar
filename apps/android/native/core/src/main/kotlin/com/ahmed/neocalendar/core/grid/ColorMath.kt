package com.ahmed.neocalendar.core.grid

import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Les maths du sélecteur de couleur (ColorPicker.tsx) : #rrggbb vers teinte / saturation / valeur et retour.
 * La teinte va de 0 à 360, la saturation et la valeur de 0 à 1.
 */

data class Hsv(val h: Float, val s: Float, val v: Float)

/** Les 12 pastilles du sélecteur (ColorPicker.tsx : PRESETS). */
val COLOR_PICKER_PRESETS: List<String> = listOf(
    "#ed201d", "#fd7941", "#f4be40", "#5ecc89", "#33b5b5", "#4ca8df",
    "#6c6fe8", "#985df6", "#f45d9e", "#b07d53", "#b8b8b8", "#6b7684",
)

private val HEX3 = Regex("^#[0-9a-fA-F]{3}$")
private val HEX6 = Regex("^#[0-9a-fA-F]{6}$")

/** `#rgb` ou `#rrggbb` (le `#` peut manquer), en `#rrggbb` minuscule ; null si ce n'est pas une couleur. */
fun normalizeHex(text: String): String? {
    val clean = text.trim().let { if (it.startsWith("#")) it else "#$it" }
    return when {
        HEX6.matches(clean) -> clean.lowercase()
        HEX3.matches(clean) -> "#" + clean.drop(1).map { "$it$it" }.joinToString("").lowercase()
        else -> null
    }
}

fun hexToHsv(hex: String): Hsv {
    val n = normalizeHex(hex) ?: "#89b4fa"
    val r = n.substring(1, 3).toInt(16) / 255f
    val g = n.substring(3, 5).toInt(16) / 255f
    val b = n.substring(5, 7).toInt(16) / 255f
    val max = maxOf(r, g, b)
    val d = max - minOf(r, g, b)
    var h = 0f
    if (d != 0f) {
        h = when (max) {
            r -> ((g - b) / d) % 6f
            g -> (b - r) / d + 2f
            else -> (r - g) / d + 4f
        } * 60f
        if (h < 0f) h += 360f
    }
    return Hsv(h, if (max == 0f) 0f else d / max, max)
}

fun hsvToHex(h: Float, s: Float, v: Float): String {
    val hue = h.coerceIn(0f, 360f)
    val c = v * s
    val x = c * (1f - abs((hue / 60f) % 2f - 1f))
    val m = v - c
    val (r, g, b) = when {
        hue < 60f -> Triple(c, x, 0f)
        hue < 120f -> Triple(x, c, 0f)
        hue < 180f -> Triple(0f, c, x)
        hue < 240f -> Triple(0f, x, c)
        hue < 300f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    fun channel(value: Float) = ((value + m) * 255f).roundToInt().coerceIn(0, 255).toString(16).padStart(2, '0')
    return "#${channel(r)}${channel(g)}${channel(b)}"
}
