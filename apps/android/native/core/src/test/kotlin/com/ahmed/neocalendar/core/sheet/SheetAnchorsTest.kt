package com.ahmed.neocalendar.core.sheet

import org.junit.Assert.assertEquals
import org.junit.Test

class SheetAnchorsTest {
    // Les valeurs de useSheetDrag.test.ts : la fiche repose à 61 % plafonnés à 480, le brouillon à 50 % plafonnés à 210.
    @Test fun restOffsetFollowsTheVariant() {
        assertEquals(780f - 780f * 0.61f, restOffsetFor(780f, draft = false), 0.001f)
        assertEquals(1000f - 480f, restOffsetFor(1000f, draft = false), 0.001f)
        assertEquals(780f - 210f, restOffsetFor(780f, draft = true), 0.001f)
        assertEquals(100f * 0.39f, restOffsetFor(100f, draft = false), 0.001f)
    }

    @Test fun lowAnchorIsTheStripAndNeverAboveTheMiddle() {
        assertEquals(780f - SHEET_PEEK, offsetForStop(SheetStop.Low, restOffsetFor(780f, false), 780f), 0.001f)
        // Une feuille plus basse que la bande reste au milieu.
        assertEquals(60f, offsetForStop(SheetStop.Low, 60f, 100f), 0.001f)
        assertEquals(780f, offsetForStop(SheetStop.Closed, 300f, 780f), 0.001f)
        assertEquals(0f, offsetForStop(SheetStop.Full, 300f, 780f), 0.001f)
    }

    @Test fun releaseSettlesOnTheNearestAnchor() {
        val rest = restOffsetFor(780f, false)
        assertEquals(SheetStop.Half, settleSheet(rest + 20f, rest, 780f, 0f))
        assertEquals(SheetStop.Full, settleSheet(40f, rest, 780f, 0f))
        assertEquals(SheetStop.Low, settleSheet(770f - 96f, rest, 780f, 0f))
    }

    // Une chiquenaude avance d'un cran dans son sens, jamais plus : lancer la feuille vers le bas depuis le haut ne la ferme pas.
    @Test fun aFlickMovesOneStepInItsDirection() {
        val rest = restOffsetFor(780f, false)
        assertEquals(SheetStop.Half, settleSheet(10f, rest, 780f, 0.8f))
        assertEquals(SheetStop.Full, settleSheet(rest, rest, 780f, -0.8f))
        assertEquals(SheetStop.Closed, settleSheet(780f - 96f, rest, 780f, 0.8f))
        assertEquals(SheetStop.Half, settleSheet(rest, rest, 780f, 0.3f))
    }

    @Test fun theHandleClimbsOneRungAndComesBackToTheMiddleFromTheTop() {
        assertEquals(SheetStop.Half, nextStopOnTap(SheetStop.Low))
        assertEquals(SheetStop.Full, nextStopOnTap(SheetStop.Half))
        assertEquals(SheetStop.Half, nextStopOnTap(SheetStop.Full))
        assertEquals(HandleGlyph.Up, handleGlyphFor(SheetStop.Low))
        assertEquals(HandleGlyph.Bar, handleGlyphFor(SheetStop.Half))
        assertEquals(HandleGlyph.Down, handleGlyphFor(SheetStop.Full))
    }

    @Test fun theBodyOnlyDragsTheSheetDownFromItsTop() {
        assertEquals(true, dragsSheetFromBody(0f, 12f))
        assertEquals(false, dragsSheetFromBody(40f, 12f))
        assertEquals(false, dragsSheetFromBody(0f, -12f))
    }

    @Test fun theDraftIsNeverTallerThan780AndTheNoteStopsFourteenBelowTheStatusBar() {
        assertEquals(780f, sheetHeightFor(914f, 48f, draft = true), 0.001f)
        assertEquals(0.92f * 500f, sheetHeightFor(500f, 48f, draft = true), 0.001f)
        assertEquals(852f, sheetHeightFor(914f, 48f, draft = false), 0.001f)
    }
}
