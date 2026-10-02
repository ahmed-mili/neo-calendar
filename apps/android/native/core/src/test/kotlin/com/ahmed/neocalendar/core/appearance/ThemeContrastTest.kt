package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Seuils de la spec §3.3 : texte 4,5 ; grands éléments, icônes et pastilles 3.
 * Limite : le contraste est mesuré sur surface opaque ; la transparence sur le fond d'écran est jugée aux captures.
 */
class ThemeContrastTest {
    private val text = TEXT_CONTRAST
    private val graphic = GRAPHIC_CONTRAST

    /**
     * `thème/mode/paire` -> raison : seulement si la palette officielle est seule en cause. Mêmes entrées que
     * `themeContrast.test.ts` (PC) ; justifiées dans `docs/superpowers/specs/2026-10-02-themes-releve-palettes.md`.
     */
    private val exemptions = mapOf(
        "one/dark/accent sur panneau (pastille, icône)" to "Le bleu de bouton One (#4d78cc) fait 3,25 sur le fond One officiel : au ras du seuil, sous 3 sur le panneau.",
        "ayu/light/accent sur fond (pastille, icône)" to "Le jaune-orangé Ayu Light (#f29718) ne fait que 2,22 sur le fond officiel (#fcfcfc) : la palette seule est en cause.",
        "ayu/light/accent sur panneau (pastille, icône)" to "Même couleur officielle (#f29718) sur un panneau plus sombre que le fond Ayu Light.",
        "rose-pine/light/accent sur fond (pastille, icône)" to "Le rose Dawn (#d7827e) ne fait que 2,60 sur le fond Dawn officiel (#faf4ed) : la palette seule est en cause.",
        "rose-pine/light/accent sur panneau (pastille, icône)" to "Même rose officiel (#d7827e) sur un panneau plus sombre que le fond Dawn.",
    )

    private class Pair(val name: String, val fg: Long, val bg: Long, val min: Double)

    private fun pairs(c: ThemeColors): List<Pair> {
        val list = ArrayList<Pair>()
        val field = mixColors(c.primary, c.text, 0.16)
        for ((surfaceName, surface) in listOf("fond" to c.primary, "panneau" to c.secondary, "champ" to field, "survol" to c.hover)) {
            list += Pair("texte sur $surfaceName", c.text, surface, text)
            list += Pair("secondaire sur $surfaceName", c.muted, surface, text)
            list += Pair("discret sur $surfaceName", c.faint, surface, graphic)
        }
        list += Pair("valeur de réglage sur panneau", settingsValueColor(c), c.secondary, text)
        list += Pair("note de réglage sur panneau", settingsNoteColor(c), c.secondary, graphic)
        list += Pair("texte sur accent", c.onAccent, c.accent, text)
        list += Pair("accent sur fond (pastille, icône)", c.accent, c.primary, graphic)
        list += Pair("accent sur panneau (pastille, icône)", c.accent, c.secondary, graphic)
        list += Pair("erreur sur fond", c.error, c.primary, text)
        list += Pair("succès sur fond", c.success, c.primary, graphic)
        return list
    }

    @Test fun `chaque theme tient ses seuils en sombre et en clair`() {
        val failures = ArrayList<String>()
        for (theme in THEMES) for (mode in listOf(AppearanceMode.Dark, AppearanceMode.Light)) {
            val colors = resolveThemeColors(theme, null, mode, systemDark = mode == AppearanceMode.Dark)
            for (pair in pairs(colors)) {
                val key = "${theme.id}/${mode.key}/${pair.name}"
                val ratio = contrastRatio(pair.fg, pair.bg)
                if (ratio < pair.min && key !in exemptions) failures += "$key : ${"%.2f".format(java.util.Locale.ROOT, ratio)} < ${pair.min}"
            }
        }
        assertEquals(emptyList<String>(), failures)
    }
}
