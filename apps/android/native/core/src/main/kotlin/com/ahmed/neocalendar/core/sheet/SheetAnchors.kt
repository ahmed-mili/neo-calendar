package com.ahmed.neocalendar.core.sheet

/*
 * Les ancrages de la feuille d'évènement, port de `useSheetDrag.ts` : la feuille a toujours la même hauteur, et c'est sa
 * translation (0 = pleine, `height` = hors de l'écran) qui dit où elle se tient. Les unités sont des dp.
 */

/** Où la feuille peut se poser : trois ancrages ouverts (plein, moitié, bas) et fermée. */
enum class SheetStop { Full, Half, Low, Closed }

/** Au-delà de cette vitesse (px/ms) une chiquenaude décide seule, quelle que soit la distance parcourue. */
const val FLICK_VELOCITY = 0.5f

/** Ce qui reste visible de la feuille à son ancrage le plus bas : la poignée et l'en-tête. */
const val SHEET_PEEK = 96f

/** La hauteur de repos (ancrage « moitié ») : une part de la feuille, plafonnée. Brouillon : 50 % et 210 ; fiche : 61 % et 480. */
private val REST_SHARE = mapOf(false to 0.61f, true to 0.5f)
private val REST_CEILING = mapOf(false to 480f, true to 210f)

/** `restOffsetFor` : la translation qui laisse la feuille à sa hauteur de repos. */
fun restOffsetFor(height: Float, draft: Boolean): Float {
    val restHeight = minOf(height * REST_SHARE.getValue(draft), REST_CEILING.getValue(draft))
    return (height - restHeight).coerceIn(0f, height)
}

private class Rung(val stop: SheetStop, val offset: Float)

/** Chaque ancrage et la translation qui y met la feuille, du haut vers le bas (`anchorLadder`). */
private fun ladder(restOffset: Float, height: Float) = listOf(
    Rung(SheetStop.Full, 0f),
    Rung(SheetStop.Half, restOffset),
    // Jamais au-dessus du milieu : une feuille plus basse que la bande n'a pas plus bas où aller.
    Rung(SheetStop.Low, maxOf(restOffset, height - SHEET_PEEK)),
    Rung(SheetStop.Closed, height),
)

/** `offsetForAnchor`. */
fun offsetForStop(stop: SheetStop, restOffset: Float, height: Float): Float =
    ladder(restOffset, height).first { it.stop == stop }.offset

/**
 * `settleSheet` : l'ancrage où un lâcher se pose. Une chiquenaude avance d'un cran dans le sens où elle a été lancée plutôt
 * que d'aller au plus proche ; `velocity` est positive vers le bas.
 */
fun settleSheet(offset: Float, restOffset: Float, height: Float, velocity: Float): SheetStop {
    val rungs = ladder(restOffset, height)
    var nearest = 0
    for (i in rungs.indices) if (kotlin.math.abs(rungs[i].offset - offset) < kotlin.math.abs(rungs[nearest].offset - offset)) nearest = i
    if (velocity > FLICK_VELOCITY) return rungs[minOf(nearest + 1, rungs.size - 1)].stop
    if (velocity < -FLICK_VELOCITY) return rungs[maxOf(nearest - 1, 0)].stop
    return rungs[nearest].stop
}

/** `nextAnchorOnTap` : un appui sur la poignée monte d'un cran, et revient au milieu depuis le haut. */
fun nextStopOnTap(stop: SheetStop): SheetStop = when (stop) {
    SheetStop.Low -> SheetStop.Half
    SheetStop.Half -> SheetStop.Full
    else -> SheetStop.Half
}

/** Ce que la poignée dessine, et donc ce qu'un appui fera : chevron vers le haut (bas), trait (moitié), chevron vers le bas (plein). */
enum class HandleGlyph { Up, Bar, Down }

/** `sheetHandleGlyph`. */
fun handleGlyphFor(stop: SheetStop): HandleGlyph = when (stop) {
    SheetStop.Low -> HandleGlyph.Up
    SheetStop.Full -> HandleGlyph.Down
    else -> HandleGlyph.Bar
}

/** `dragsSheetFromBody` : un glissé qui part du corps ne déplace la feuille que vers le bas, et le contenu étant en haut. */
fun dragsSheetFromBody(scrollTop: Float, dy: Float): Boolean = scrollTop <= 0f && dy > 0f

/**
 * La hauteur de la feuille, qui ne change jamais pendant un geste. Brouillon : `min(92dvh, 780px)`. Fiche : sous la barre
 * d'état, à 14 dp (852 dp sur un écran de 914).
 */
fun sheetHeightFor(availableHeight: Float, topInset: Float, draft: Boolean): Float =
    if (draft) minOf(availableHeight * 0.92f, 780f) else (availableHeight - topInset - 14f).coerceAtLeast(0f)
