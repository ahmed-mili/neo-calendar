package com.ahmed.neocalendar.nativeapp.ui

import android.content.Context
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.R
import com.ahmed.neocalendar.core.prayer.PrayerLineSpec
import com.ahmed.neocalendar.core.prayer.PrayerName
import com.ahmed.neocalendar.core.prayer.PrayerTimetable
import com.ahmed.neocalendar.core.prayer.parsePrayerTimetables

/** Les mosquées dont l'app connaît le calendrier : les mêmes tables que l'ancienne (`res/raw/prayer_timetables.json`). */
object PrayerTables {
    private var cache: List<PrayerTimetable>? = null

    fun get(context: Context): List<PrayerTimetable> = cache ?: try {
        context.resources.openRawResource(R.raw.prayer_timetables).bufferedReader(Charsets.UTF_8).use { parsePrayerTimetables(it.readText()) }
    } catch (_: Exception) {
        // Sans tables, aucune mosquée à suivre : la grille n'a simplement pas de traits.
        emptyList()
    }.also { cache = it }
}

/** L'heure d'une prière dans la gouttière, telle que la mosquée l'imprime (`prayerClock`, sans conversion de fuseau). */
fun prayerClock(minutes: Int, timeFormat24h: Boolean): String {
    val hour = minutes / 60
    val minute = "%02d".format(minutes % 60)
    if (timeFormat24h) return "%02d:%s".format(hour, minute)
    return "${if (hour % 12 == 0) 12 else hour % 12}:$minute ${if (hour < 12) "AM" else "PM"}"
}

private fun DrawScope.softShadow(from: Offset, to: Offset, thick: Float, color: Color, blurDp: Float) {
    drawIntoCanvas { canvas ->
        val glow = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color.toArgb()
            strokeWidth = thick
            strokeCap = android.graphics.Paint.Cap.ROUND
            maskFilter = android.graphics.BlurMaskFilter((blurDp / 2f * density - 0.5f) / 0.57735f, android.graphics.BlurMaskFilter.Blur.NORMAL)
        }
        canvas.nativeCanvas.drawLine(from.x, from.y, to.x, to.y, glow)
    }
}

/**
 * Les horaires de prière sur la grille (`.nc-prayer-line-full`, `.nc-prayer-line`) : un filet de 1 dp à 30 % de la couleur en travers de
 * toutes les colonnes, et sur la colonne du jour de la prière un trait de 2 dp, bouts arrondis, ombre `0 0 3px`, avec son tiret de 2 x 6
 * au bord gauche. La Jumu'a se distingue par sa texture : un reflet clair glisse le long du trait (2,6 s) et un halo de 6 dp.
 */
@Composable
fun PrayerLinesLayer(state: GridState, dayCount: Int, lines: List<PrayerLineSpec>, color: Color) {
    val hasJumua = lines.any { it.name == PrayerName.Jumua }
    // `nc-prayer-shimmer` : la position du fond passe de 100 % à -100 % sur un fond de 200 % de large.
    val shimmer = if (hasJumua) {
        rememberInfiniteTransition(label = "prayer-shimmer").animateFloat(
            initialValue = 1f, targetValue = -1f,
            animationSpec = infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Restart), label = "shimmer",
        ).value
    } else {
        0f
    }
    Canvas(Modifier.fillMaxSize()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val columnWidth = size.width / dayCount
        val hairline = 1.dp.toPx()
        val thick = 2.dp.toPx()
        for (line in lines) {
            val y = line.hours.toFloat() * hourPx - scroll
            if (y !in -4f..size.height + 4f) continue
            drawLine(color.copy(alpha = 0.3f), Offset(0f, y), Offset(size.width, y), hairline)
            val x = (line.date.toEpochDay() - state.origin - state.offsetDays).toFloat() * columnWidth
            if (x + columnWidth <= 0f || x >= size.width) continue
            val jumua = line.name == PrayerName.Jumua
            softShadow(Offset(x, y), Offset(x + columnWidth, y), thick, Color.Black.copy(alpha = 0.35f), 3f)
            if (jumua) softShadow(Offset(x, y), Offset(x + columnWidth, y), thick, color, 6f)
            if (jumua) {
                // `background-position: p% 0` sur un fond de 2 colonnes : son bord gauche est à (1 - 2) x p colonnes, p allant de 1 à -1.
                val start = x - shimmer * columnWidth
                val brush = Brush.horizontalGradient(
                    0f to color, 0.3f to color, 0.5f to Color.White, 0.7f to color, 1f to color,
                    startX = start, endX = start + 2f * columnWidth,
                )
                drawLine(brush, Offset(x, y), Offset(x + columnWidth, y), thick, StrokeCap.Round)
            } else {
                drawLine(color, Offset(x, y), Offset(x + columnWidth, y), thick, StrokeCap.Round)
            }
            // Le tiret du bord gauche de la colonne (`::before`).
            drawRoundRect(color, Offset(x, y - 3.dp.toPx()), Size(2.dp.toPx(), 6.dp.toPx()), CornerRadius(1.dp.toPx()))
        }
    }
}
