package com.ahmed.neocalendar.nativeapp.ui.theme

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.ahmed.neocalendar.R

/**
 * Les deux piles de l'ancienne : le calendrier (barre, tiroir, grille, fiche) tombe sur Roboto, la police
 * système du téléphone ; les Réglages et les dialogues sont en Inter Variable (poids 520 / 540 / 650 / 750 réels).
 */
object NeoFonts {
    val calendar: FontFamily = FontFamily.SansSerif

    private val interWeights = listOf(400, 500, 520, 540, 600, 650, 700, 750)

    private val interVariable: FontFamily = FontFamily(
        interWeights.map { w ->
            Font(
                R.font.inter_variable,
                weight = FontWeight(w),
                variationSettings = FontVariation.Settings(FontVariation.weight(w)),
            )
        },
    )

    /** `"Inter Variable"` : à appliquer avec `fontWeight = FontWeight(540)` etc. */
    val inter: FontFamily get() = interVariable
}
