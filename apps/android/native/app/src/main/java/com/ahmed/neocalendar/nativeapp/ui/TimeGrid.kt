package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.overscroll
import androidx.compose.foundation.rememberOverscrollEffect
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.weekdayShort
import com.ahmed.neocalendar.core.grid.DaySegment
import com.ahmed.neocalendar.core.grid.segmentForDay
import com.ahmed.neocalendar.core.layout.EVENT_VGAP
import com.ahmed.neocalendar.core.layout.GridEvent
import com.ahmed.neocalendar.core.layout.OVERLAP_COL_GAP
import com.ahmed.neocalendar.core.layout.computeOverlapGroups
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.timezones.offsetLabel
import com.ahmed.neocalendar.core.timezones.zoneHourLabel
import com.ahmed.neocalendar.core.timezones.zoneNowLabel
import com.ahmed.neocalendar.core.timezones.zoneShortName
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.ahmed.neocalendar.nativeapp.AppLocale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/** 64 dp par colonne de la gouttière (`STICKY_COL_PX` de `TimeGrid.tsx`) : celle de l'appareil, puis une par fuseau supplémentaire. */
val RailColumn = 64.dp

/** 54 dp : la largeur réelle de chaque colonne d'heures (`mobile.css:1537`), le reste de la colonne de 64 est vide. */
private val HourColumn = 54.dp

/** La gouttière entière : 64 dp, plus 64 dp par fuseau supplémentaire. */
fun railWidthFor(extraZones: Int): Dp = RailColumn * (1 + extraZones)

/** 59 dp : `min-height 58` et le filet bas de 1 px. */
val HeaderHeight = 59.dp
private const val MIN_BLOCK_DP = 26

/**
 * Compose seulement les colonnes qui se voient (plus une de marge de chaque
 * côté) et les place d'après la position de la grille : glisser relance la
 * mise en place, jamais la composition.
 */
@Composable
fun DayColumns(
    state: GridState,
    dayCount: Int,
    modifier: Modifier = Modifier,
    scrolls: Boolean = false,
    contentHeightPx: (maxHeight: Int) -> Int = { it },
    content: @Composable (day: Long) -> Unit,
) {
    val first by remember(state) { derivedStateOf { state.origin + floor(state.offsetDays).toLong() - 1 } }
    Layout(
        content = {
            for (day in first..(first + dayCount + 2)) key(day) { Box(Modifier.layoutId(day)) { content(day) } }
        },
        modifier = modifier.clipToBounds(),
    ) { measurables, c ->
        val columnWidth = c.maxWidth.toFloat() / dayCount
        state.columnWidthPx = columnWidth
        if (scrolls) state.viewportHeightPx = c.maxHeight.toFloat()
        val height = contentHeightPx(c.maxHeight)
        val placeables = measurables.map {
            it.measure(Constraints.fixed(ceil(columnWidth).toInt(), height))
        }
        layout(c.maxWidth, c.maxHeight) {
            val scrollY = if (scrolls) state.clampedScrollY.roundToInt() else 0
            for (i in measurables.indices) {
                val day = measurables[i].layoutId as Long
                val x = ((day - state.origin - state.offsetDays) * columnWidth).roundToInt()
                placeables[i].place(x, -scrollY)
            }
        }
    }
}

/** La grille entière : en-têtes, bande journée entière, puis heures et colonnes. */
@Composable
fun TimeGridArea(
    state: GridState,
    dayCount: Int,
    freeScroll: Boolean,
    timeFormat24h: Boolean,
    occurrences: com.ahmed.neocalendar.nativeapp.Occurrences,
    allDayCollapsed: Boolean,
    onToggleAllDayCollapsed: () -> Unit,
    actions: GridActions,
    dataVersion: Any,
    bottomInset: Dp,
    draft: SheetTarget.Draft? = null,
    onResizeDraft: (java.time.LocalDateTime, java.time.LocalDateTime) -> Unit = { _, _ -> },
    /** Les fuseaux horaires ajoutés aux Réglages : une colonne d'heures chacun, à droite de celle de l'appareil. */
    extraZones: List<ZoneId> = emptyList(),
    /** Les traits des horaires de prière du calendrier « Islam », dans sa couleur. */
    prayerLines: List<com.ahmed.neocalendar.core.prayer.PrayerLineSpec> = emptyList(),
    prayerColor: Color = Color.Unspecified,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    state.density = density.density
    // Sous minuit : 10 dp et l'inset bas, comme le `padding-bottom` de la zone défilante de l'ancienne.
    state.bottomPadPx = with(density) { (10.dp + bottomInset).toPx() }
    val overscroll = rememberOverscrollEffect()
    val scope = rememberCoroutineScope()
    val decay = rememberSplineBasedDecay<Float>()
    val zone = remember { ZoneId.systemDefault() }
    val haptic = LocalHapticFeedback.current
    val ix = remember(state) { GridInteraction(state, zone, scope) }
    ix.actions = actions
    ix.currentData = dataVersion

    // Une écriture part : son résultat (déplacement, redimensionnement) reste dessiné jusqu'à ce que le dossier relu l'ait remplacé.
    LaunchedEffect(occurrences) {
        if (ix.pendingData != null && ix.pendingData !== dataVersion) ix.clearPending()
    }
    LaunchedEffect(ix.hasPending) {
        if (ix.hasPending) {
            delay(4_000)
            ix.clearPending()
        }
    }

    // La ligne de l'heure actuelle avance à la minute juste.
    LaunchedEffect(state) {
        while (true) {
            val now = System.currentTimeMillis()
            state.nowMillis = now
            delay(60_000 - now % 60_000 + 50)
        }
    }

    val railWidth = railWidthFor(extraZones.size)
    Column(modifier.fillMaxSize()) {
        // Les en-têtes et la bande journée entière suivent le glissé horizontal, pas le vertical.
        Row(
            Modifier
                .fillMaxWidth()
                .height(HeaderHeight)
                .gridDrag(state, scope, freeScroll, vertical = false, decay = decay),
        ) {
            TimeZoneCorner(zone, extraZones, railWidth)
            DayColumns(state, dayCount, Modifier.weight(1f).fillMaxHeight()) { day -> DayHeader(day) }
        }
        AllDayBand(
            state = state,
            dayCount = dayCount,
            occurrences = occurrences,
            collapsed = allDayCollapsed,
            onToggleCollapsed = onToggleAllDayCollapsed,
            onEventClick = actions.onOpen,
            onToggleTask = actions.onToggleTask,
            onCreateAllDay = actions.onCreateAllDay,
            railWidth = railWidth,
            ix = ix,
            modifier = Modifier.gridDrag(state, scope, freeScroll, vertical = false, decay = decay),
        )
        Row(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .clipToBounds()
                .overscroll(overscroll)
                .gridPinch(state)
                .gridDrag(state, scope, freeScroll, vertical = true, decay = decay, overscroll = overscroll),
        ) {
            HourRail(state, dayCount, timeFormat24h, zone, extraZones, railWidth, prayerLines, prayerColor)
            Box(Modifier.weight(1f).fillMaxHeight().gridTouch(ix, haptic)) {
                GridBackground(state, dayCount)
                DayColumns(
                    state,
                    dayCount,
                    Modifier.fillMaxSize(),
                    scrolls = true,
                    contentHeightPx = { (24 * state.hourPx).roundToInt() },
                ) { day ->
                    val events = occurrences.timed[day]
                    if (!events.isNullOrEmpty()) {
                        DayEvents(day, events, ix, timeFormat24h, zone)
                    }
                }
                if (prayerLines.isNotEmpty()) PrayerLinesLayer(state, dayCount, prayerLines, prayerColor)
                NowLine(state, dayCount, zone)
                MoveGhost(ix, dayCount, timeFormat24h)
                if (draft != null && !draft.allDay) DraftPreview(ix, draft.start, draft.end, onResizeDraft)
            }
        }
        LaunchedEffect(state.viewportHeightPx) { state.initialScrollIfNeeded(hourNow(zone)) }
    }
}

private fun hourNow(zone: ZoneId): Float {
    val now = java.time.ZonedDateTime.now(zone)
    return now.hour + now.minute / 60f
}

/** `0 1px 2px rgba(0,0,0,.62)` : l'ombre qui garde lisible le texte de la grille sur n'importe quel fond d'écran. */
@Composable
private fun legibleShadow(): Shadow {
    val d = LocalDensity.current.density
    return Shadow(Color.Black.copy(alpha = 0.62f), Offset(0f, d), 2f * d)
}

/** « GMT+2 » : le décalage de l'appareil (`offsetLabel`, `TimezonePicker.tsx:21`). */
private fun gmtLabel(zone: ZoneId): String = offsetLabel(zone, Instant.now())

/**
 * Le coin de la grille, au-dessus des heures : le fuseau de l'appareil (« GMT+2 »), puis une case de 64 dp par fuseau
 * supplémentaire avec son nom court (`nc-tz-corner-label` : 10 / 600, `TextFaint`) ; le filet prolonge celui des en-têtes.
 */
@Composable
private fun TimeZoneCorner(zone: ZoneId, extraZones: List<ZoneId>, railWidth: Dp) {
    val label = remember(zone) { gmtLabel(zone) }
    val names = remember(extraZones) { extraZones.map { zoneShortName(it, Instant.now()) } }
    Row(
        Modifier
            .width(railWidth)
            .fillMaxHeight()
            .drawBehind { drawLine(Neo.AllDayCellBorder, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f) },
    ) {
        Box(Modifier.width(RailColumn).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Text(
                label,
                color = Neo.Label,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                softWrap = false,
                style = TextStyle(shadow = legibleShadow()),
                modifier = Modifier.padding(horizontal = 2.dp, vertical = 1.dp),
            )
        }
        for (name in names) {
            Box(Modifier.width(RailColumn).fillMaxHeight(), contentAlignment = Alignment.Center) {
                Text(name, color = Neo.TextFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, softWrap = false, modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp))
            }
        }
    }
}

@Composable
private fun DayHeader(day: Long) {
    val date = LocalDate.ofEpochDay(day)
    val isToday = date == LocalDate.now()
    val weekday = remember(day) { weekdayShort(date) }
    val shadow = legibleShadow()
    Row(
        Modifier
            .fillMaxSize()
            .drawBehind { drawLine(Neo.BarPress, Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), 1f) }
            .padding(start = 2.dp, end = 2.dp, top = 7.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.Top,
    ) {
        // Une seule ligne : l'abréviation du jour, puis le nombre dans sa case de 25 x 25.
        Box(Modifier.height(25.dp), contentAlignment = Alignment.Center) {
            Text(
                weekday,
                color = Neo.Label,
                fontSize = 12.sp,
                fontWeight = FontWeight(if (isToday) 600 else 650),
                maxLines = 1,
                style = TextStyle(shadow = shadow),
            )
        }
        Spacer(Modifier.width(4.dp))
        Box(
            Modifier
                .defaultMinSize(25.dp, 25.dp)
                .then(if (isToday) Modifier.background(Neo.Today, RoundedCornerShape(8.dp)) else Modifier)
                .padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                date.dayOfMonth.toString(),
                color = if (isToday) Color.White else Neo.Label,
                fontSize = 12.sp,
                fontWeight = FontWeight(if (isToday) 600 else 500),
                maxLines = 1,
                style = if (isToday) TextStyle.Default else TextStyle(shadow = shadow),
            )
        }
    }
}

/** Le format d'heure de l'axe : « 09:00 » en 24 h, « 9 AM » sinon. */
private fun hourLabel(hour: Int, timeFormat24h: Boolean): String =
    if (timeFormat24h) "%02d:00".format(AppLocale.current, hour)
    else when {
        hour == 0 -> "12 AM"
        hour < 12 -> "$hour AM"
        hour == 12 -> "12 PM"
        else -> "${hour - 12} PM"
    }

@Composable
private fun HourRail(
    state: GridState, dayCount: Int, timeFormat24h: Boolean, zone: ZoneId, extraZones: List<ZoneId>, railWidth: Dp,
    prayerLines: List<com.ahmed.neocalendar.core.prayer.PrayerLineSpec>, prayerColor: Color,
) {
    val measurer = rememberTextMeasurer()
    val shadow = legibleShadow()
    val label = Neo.Label
    val style = remember(shadow, label) { TextStyle(color = label, fontSize = 10.sp, lineHeight = 10.sp, textAlign = TextAlign.End, shadow = shadow) }
    // Les colonnes des autres fuseaux : 11 sp (`.nc-tz-label`, que mobile.css ne réduit pas), comme les heures de l'ancienne.
    val extraStyle = remember(shadow, label) { TextStyle(color = label, fontSize = 11.sp, lineHeight = 11.sp, textAlign = TextAlign.End, shadow = shadow) }
    val nowStyle = remember { TextStyle(color = Color.White, fontSize = 10.sp, lineHeight = 10.sp, fontWeight = FontWeight.Bold) }
    val labels = remember(timeFormat24h) { (0..23).map { hourLabel(it, timeFormat24h) } }
    // Ce que marque chaque fuseau quand il est « h » heures chez l'appareil, pour le premier jour visible (l'écart change avec l'heure d'été).
    val zoneLabels = remember(extraZones, zone, timeFormat24h) { HashMap<Long, List<List<String>>>() }
    Canvas(Modifier.width(railWidth).fillMaxHeight().clipToBounds()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val widthPx = size.width
        // Une colonne de 54 dp se pose sur un pixel entier (142 px à 2,625), comme celle de la WebView.
        val columnPx = kotlin.math.round(HourColumn.toPx())
        // Chaque colonne d'heures fait 54 dp : les libellés sont collés à 8 dp de son bord droit.
        val right = columnPx - 8.dp.toPx()
        for (h in 1..23) {
            val y = h * hourPx - scroll
            // L'étiquette est centrée sur sa ligne ; on saute ce qui sort de la vue.
            if (y < -20.dp.toPx() || y > size.height + 20.dp.toPx()) continue
            val layout = measurer.measure(labels[h], style, maxLines = 1)
            drawText(layout, topLeft = Offset(right - layout.size.width, y - layout.size.height / 2f))
        }
        if (extraZones.isNotEmpty()) {
            val firstDay = state.firstDayEpoch
            val perZone = zoneLabels.getOrPut(firstDay) {
                extraZones.map { z -> (1..23).map { h -> zoneHourLabel(z, zone, LocalDate.ofEpochDay(firstDay), h, timeFormat24h) } }
            }
            extraZones.indices.forEach { i ->
                val columnLeft = columnPx * (i + 1)
                for (h in 1..23) {
                    val y = h * hourPx - scroll
                    if (y < -20.dp.toPx() || y > size.height + 20.dp.toPx()) continue
                    val layout = measurer.measure(perZone[i][h - 1], extraStyle, maxLines = 1)
                    // Le bord droit de la colonne (1 dp) est dans sa boîte : les libellés sont à 8 dp de ce bord, donc à 9 du bord de la colonne.
                    drawText(layout, topLeft = Offset(columnLeft + right - 1.dp.toPx() - layout.size.width, y - layout.size.height / 2f))
                }
                // `.nc-tz-column` : le bord droit de 1 dp, de la couleur des lignes de la grille.
                drawLine(Neo.GridLine, Offset(columnLeft + columnPx - 0.5f * density, 0f), Offset(columnLeft + columnPx - 0.5f * density, size.height), density)
            }
        }
        // L'heure de chaque prière (`nc-prayer-label`) : la pastille de l'heure actuelle, à la couleur du calendrier, dans la première colonne.
        for (line in prayerLines) {
            val y = line.hours.toFloat() * hourPx - scroll
            if (y !in 0f..size.height) continue
            val layout = measurer.measure(prayerClock(line.minutes, timeFormat24h), nowStyle, maxLines = 1)
            val boxW = layout.size.width + 12.dp.toPx()
            val boxH = 16.dp.toPx()
            val left = columnPx - 4.dp.toPx() - boxW
            val top = y - boxH / 2f
            drawRoundRect(prayerColor, Offset(left, top), Size(boxW, boxH), CornerRadius(4.dp.toPx()))
            drawText(layout, topLeft = Offset(left + 6.dp.toPx(), top + 4.dp.toPx()))
        }
        // La pastille de l'heure actuelle (`nc-now-label`) : sur la colonne la plus proche de la grille (la dernière), à 4 dp de son bord droit ;
        // elle dit l'heure de ce fuseau. Posée sur l'étiquette voisine, quand la colonne d'aujourd'hui se voit.
        val now = Instant.ofEpochMilli(state.nowMillis).atZone(zone)
        val todayCol = LocalDate.now(zone).toEpochDay() - state.origin - state.offsetDays
        if (todayCol + 1f > 0f && todayCol < dayCount) {
            val y = (now.hour + now.minute / 60f) * hourPx - scroll
            if (y in 0f..size.height) {
                val last = extraZones.lastOrNull()
                val text = if (last == null) formatClock(Instant.ofEpochMilli(state.nowMillis), zone, timeFormat24h)
                else zoneNowLabel(last, Instant.ofEpochMilli(state.nowMillis), timeFormat24h)
                val layout = measurer.measure(text, nowStyle, maxLines = 1)
                val boxW = layout.size.width + 12.dp.toPx()
                val boxH = 16.dp.toPx()
                val left = columnPx * (extraZones.size + 1) - 4.dp.toPx() - boxW
                val top = y - boxH / 2f
                drawRoundRect(Neo.Today, Offset(left, top), Size(boxW, boxH), CornerRadius(4.dp.toPx()))
                drawText(layout, topLeft = Offset(left + 6.dp.toPx(), top + 4.dp.toPx()))
            }
        }
        // Le bord droit de la gouttière.
        drawLine(Neo.GridLine, Offset(widthPx - 0.5f * density, 0f), Offset(widthPx - 0.5f * density, size.height), density)
    }
}

/** Les lignes d'heure, les séparateurs de jours et la ligne de l'heure actuelle. */
@Composable
private fun GridBackground(state: GridState, dayCount: Int) {
    Canvas(Modifier.fillMaxSize()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val columnWidth = size.width / dayCount
        val offset = state.offsetDays
        // 1 dp (un pixel CSS) : `rgba(155,160,185,0.17)`.
        val hairline = 1.dp.toPx()

        for (h in 0..24) {
            val y = h * hourPx - scroll
            if (y < -1f || y > size.height + 1f) continue
            drawLine(Neo.GridLine, Offset(0f, y), Offset(size.width, y), hairline)
        }
        val firstIdx = floor(offset).toInt()
        for (i in firstIdx..firstIdx + dayCount + 1) {
            val x = (i - offset) * columnWidth
            if (x < 0f || x > size.width) continue
            drawLine(Neo.GridLine, Offset(x, 0f), Offset(x, size.height), hairline)
        }
    }
}

/**
 * Le trait vif d'une ligne de temps sur la colonne de son jour (`.nc-now-today-line`, `.nc-now-tick`) : un segment de 2 dp, rayon 1 dp,
 * strictement dans `[x, x + columnWidth]`, son ombre `0 0 3px rgba(0,0,0,.35)` (+ halo facultatif) sur la même forme, puis le tiret
 * de 2 x 6 dp au bord gauche. Partagé par la ligne de l'heure et la ligne de prière. `brush` remplace la couleur du segment (reflet de la Jumu'a).
 */
internal fun DrawScope.drawDayLine(
    x: Float, y: Float, columnWidth: Float, color: Color,
    brush: Brush? = null, haloDp: Float = 0f,
) {
    val thick = 2.dp.toPx()
    val radius = 1.dp.toPx()
    val top = y - thick / 2f
    fun shadow(c: Color, blurDp: Float, l: Float, t: Float, w: Float, h: Float) = drawIntoCanvas { canvas ->
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            this.color = c.toArgb()
            // Le sigma d'un flou de `blurDp` px CSS est blurDp / 2.
            maskFilter = android.graphics.BlurMaskFilter((blurDp / 2f * density - 0.5f) / 0.57735f, android.graphics.BlurMaskFilter.Blur.NORMAL)
        }
        canvas.nativeCanvas.drawRoundRect(l, t, l + w, t + h, radius, radius, paint)
    }
    shadow(Color.Black.copy(alpha = 0.35f), 3f, x, top, columnWidth, thick)
    if (haloDp > 0f) shadow(color, haloDp, x, top, columnWidth, thick)
    val corner = CornerRadius(radius)
    if (brush != null) drawRoundRect(brush, Offset(x, top), Size(columnWidth, thick), corner)
    else drawRoundRect(color, Offset(x, top), Size(columnWidth, thick), corner)
    val tickTop = y - 3.dp.toPx()
    val tickSize = Size(2.dp.toPx(), 6.dp.toPx())
    shadow(Color.Black.copy(alpha = 0.35f), 3f, x, tickTop, tickSize.width, tickSize.height)
    drawRoundRect(color, Offset(x, tickTop), tickSize, corner)
}

/** L'heure actuelle, au-dessus des évènements (z-index 5 et 6 de l'ancienne) : un filet pâle, un trait vif et ombré sur la colonne d'aujourd'hui. */
@Composable
private fun NowLine(state: GridState, dayCount: Int, zone: ZoneId) {
    Canvas(Modifier.fillMaxSize()) {
        val hourPx = state.hourPx
        val scroll = state.clampedScrollY
        val columnWidth = size.width / dayCount
        val hairline = 1.dp.toPx()
        val todayX = (LocalDate.now(zone).toEpochDay() - state.origin - state.offsetDays) * columnWidth
        val now = Instant.ofEpochMilli(state.nowMillis).atZone(zone)
        val nowHours = now.hour + now.minute / 60f
        val y = nowHours * hourPx - scroll
        if (y in 0f..size.height) {
            drawLine(Neo.Today.copy(alpha = 0.3f), Offset(0f, y), Offset(size.width, y), hairline)
            if (todayX + columnWidth > 0f && todayX < size.width) {
                drawDayLine(todayX, y, columnWidth, Neo.Today)
            }
        }
    }
}

/** Un évènement placé dans sa colonne de chevauchement, pour un jour. */
private class Placed(val event: DisplayEvent, val segment: DaySegment, val column: Int, val total: Int)

private fun placeDay(day: Long, events: List<DisplayEvent>, zone: ZoneId): List<Placed> {
    val date = LocalDate.ofEpochDay(day)
    val dayStart = date.atStartOfDay(zone).toInstant()
    val nextStart = date.plusDays(1).atStartOfDay(zone).toInstant()
    val segments = HashMap<String, DaySegment>()
    val grid = ArrayList<GridEvent>()
    val byId = HashMap<String, DisplayEvent>()
    for (e in events) {
        val segment = segmentForDay(e.start, e.end, date, zone) ?: continue
        segments[e.id] = segment
        byId[e.id] = e
        // Les chevauchements se jugent sur la part du jour, pas sur l'évènement entier.
        grid += GridEvent(e.id, maxOf(e.start, dayStart), minOf(if (e.end > e.start) e.end else e.start, nextStart))
    }
    return computeOverlapGroups(grid).flatMap { group ->
        group.events.map { Placed(byId.getValue(it.event.id), segments.getValue(it.event.id), it.column, it.totalColumns) }
    }
}

@Composable
private fun DayEvents(
    day: Long,
    source: List<DisplayEvent>,
    ix: GridInteraction,
    timeFormat24h: Boolean,
    zone: ZoneId,
) {
    val state = ix.grid
    // Un redimensionnement en attente remplace les heures de son bloc, le temps de la relecture.
    val preview = ix.resizePreview
    val events = remember(source, preview) { if (preview == null) source else source.map { ix.shown(it) } }
    val placed = remember(day, events) { placeDay(day, events, zone) }
    val movingId = ix.movingId
    val resizeId = ix.resizeId
    DisposableEffect(day) { onDispose { ix.rects.remove(day) } }
    Layout(
        content = {
            for (p in placed) key(p.event.id) {
                EventBlock(
                    event = p.event,
                    segment = p.segment,
                    timeFormat24h = timeFormat24h,
                    zone = zone,
                    dimmed = p.event.id == movingId,
                    resizing = p.event.id == resizeId && p.event.editable,
                    onToggleTask = ix.actions.onToggleTask,
                    onHandleDrag = { edge, total -> ix.resizeDrag(p.event, day, edge, total) },
                    onHandleEnd = { edge -> ix.resizeEnd(edge) },
                    onHandleCancel = ix::resizeCancel,
                    onOpen = ix.actions.onOpen,
                )
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { measurables, c ->
        val hourPx = state.hourPx
        val gap = (OVERLAP_COL_GAP + 1).dp.toPx()
        val vgap = EVENT_VGAP.dp.toPx()
        // Colonne de jour + 5 dp, largeur `colonne - 17 dp` (le filet de 1 dp de l'ancienne décale tout d'un cran).
        val margin = 5.dp.toPx()
        val minHeight = MIN_BLOCK_DP.dp.toPx()
        val rects = placed.map { p ->
            val slot = c.maxWidth.toFloat() / p.total
            val width = maxOf(slot - gap, 8.dp.toPx())
            val top = p.segment.topHours.toFloat() * hourPx + vgap / 2
            val height = maxOf(p.segment.durationHours.toFloat() * hourPx - vgap, minHeight)
            arrayOf(p.column * slot + margin, top, width, height)
        }
        // Les gestes retrouvent le bloc sous le doigt dans ces rectangles.
        ix.rects[day] = placed.mapIndexed { i, p -> BlockRect(p.event, p.segment, rects[i][0], rects[i][1], rects[i][2], rects[i][3]) }
        val placeables = measurables.mapIndexed { i, m ->
            val r = rects[i]
            m.measure(Constraints.fixed(r[2].roundToInt(), r[3].roundToInt()))
        }
        layout(c.maxWidth, c.maxHeight) {
            placeables.forEachIndexed { i, p -> p.place(rects[i][0].roundToInt(), rects[i][1].roundToInt()) }
        }
    }
}

fun formatClock(instant: Instant, zone: ZoneId, timeFormat24h: Boolean): String =
    com.ahmed.neocalendar.core.format.formatClock(instant, zone, timeFormat24h)
