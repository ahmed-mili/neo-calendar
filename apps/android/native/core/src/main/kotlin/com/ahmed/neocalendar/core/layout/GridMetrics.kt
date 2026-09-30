package com.ahmed.neocalendar.core.layout

/*
 * Port des mesures de calendarConstants.ts qui ne lisent ni le DOM ni l'état
 * du zoom : bornes de la hauteur d'heure et gabarits de la grille, en pixels.
 */

const val MIN_HOUR_HEIGHT = 32
const val MAX_HOUR_HEIGHT = 320

/** Hauteur d'heure au repos sur téléphone. */
const val ANDROID_HOUR_HEIGHT = 72

/** Hauteur d'une ligne de la bande journée entière. */
const val ALLDAY_ROW_HEIGHT = 24

/** Lignes visibles de la bande journée entière avant qu'elle défile. */
const val ALLDAY_MAX_ROWS = 4

/** Marge retirée à droite de chaque évènement. */
const val OVERLAP_COL_GAP = 16

/** Espace vertical entre deux évènements bout à bout. */
const val EVENT_VGAP = 4

fun clampHourHeight(px: Double): Double = minOf(maxOf(px, MIN_HOUR_HEIGHT.toDouble()), MAX_HOUR_HEIGHT.toDouble())
