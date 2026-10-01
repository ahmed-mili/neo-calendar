package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.grid.DaySegment
import com.ahmed.neocalendar.core.grid.ResizeEdge
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import java.time.ZoneId

/** Le bloc d'évènement de l'inventaire §6 : bande de 4 dp, rayon 4, teinte 15 % de la couleur du calendrier. */
@Composable
internal fun EventBlock(
    event: DisplayEvent,
    segment: DaySegment,
    timeFormat24h: Boolean,
    zone: ZoneId,
    dimmed: Boolean,
    resizing: Boolean,
    onToggleTask: (DisplayEvent) -> Unit,
    onHandleDrag: (ResizeEdge, Float) -> Unit,
    onHandleEnd: (ResizeEdge) -> Unit,
    onHandleCancel: () -> Unit,
    onOpen: (DisplayEvent) -> Unit,
) {
    val accent = remember(event.color) { parseCalendarColor(event.color) }
    val surface = Neo.Surface
    val fill = remember(accent, surface) { accent.copy(alpha = 0.15f).compositeOver(surface) }
    val past = event.end.toEpochMilli() < System.currentTimeMillis()
    val completed = event.isTask && event.taskStatus == "complete"
    val shape = RoundedCornerShape(4.dp)
    val ink = if (past || completed) Neo.TextSecondary else Neo.Text
    val time = remember(event.start, event.end, timeFormat24h) {
        "${formatClock(event.start, zone, timeFormat24h)} – ${formatClock(event.end, zone, timeFormat24h)}"
    }
    // Une heure vaut 60 minutes sur l'axe : « court » se juge en minutes, pas en pixels (le zoom les change).
    val short = segment.durationHours * 60 <= 40
    Box(
        Modifier
            .fillMaxSize()
            .alpha(if (dimmed) PENDING_DIM else 1f)
            .cssShadow(offsetY = 5.dp, blur = 14.dp, color = Color.Black.copy(alpha = 0.18f), radius = 4.dp)
            .background(fill, shape)
            .clip(shape)
            // Le toucher (ouvrir, déplacer, redimensionner) est lu par la grille ; ceci ne dit que « ouvrir » aux technologies d'assistance.
            .semantics(mergeDescendants = true) {
                onClick {
                    onOpen(event)
                    true
                }
            }
            .then(if (resizing) Modifier.border(1.5.dp, accent, shape) else Modifier)
            .drawBehind {
                drawRect(accent.copy(alpha = if (past) 0.4f else 1f), size = Size(4.dp.toPx(), size.height))
            }
            .padding(start = 11.dp, end = 7.dp, top = 5.dp, bottom = 5.dp),
    ) {
        if (short) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (event.isTask) TaskCheck(completed, ink, event.editable) { onToggleTask(event) }
                // Titre puis heure dans un seul texte : c'est l'heure qui est coupée en premier.
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = ink, fontWeight = FontWeight.SemiBold, textDecoration = if (completed) TextDecoration.LineThrough else null)) {
                            append(event.title)
                        }
                        if (segment.durationHours * 60 > 20) {
                            withStyle(SpanStyle(color = Neo.TextSecondary)) { append("  $time") }
                        }
                    },
                    fontSize = 11.sp,
                    lineHeight = 14.3.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        } else {
            // Le titre rétrécit en premier (il perd ses lignes du bas), puis le lieu, jamais l'heure.
            BoxWithConstraints(Modifier.fillMaxSize()) {
                // Le lieu n'apparaît que si le contenu a la hauteur de trois lignes (`@container (min-height: 52px)`).
                val location = event.location?.trim().orEmpty()
                val showLocation = location.isNotEmpty() && maxHeight >= 52.dp
                Column(Modifier.fillMaxSize()) {
                    Row(Modifier.weight(1f, fill = false), verticalAlignment = Alignment.Top) {
                        if (event.isTask) TaskCheck(completed, ink, event.editable) { onToggleTask(event) }
                        Text(
                            event.title,
                            color = ink,
                            fontSize = 11.sp,
                            lineHeight = 14.3.sp,
                            fontWeight = FontWeight.SemiBold,
                            overflow = TextOverflow.Clip,
                            textDecoration = if (completed) TextDecoration.LineThrough else null,
                        )
                    }
                    if (showLocation) {
                        Text(location, color = Neo.TextSecondary, fontSize = 11.sp, lineHeight = 14.3.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(time, color = Neo.TextSecondary, fontSize = 11.sp, lineHeight = 14.3.sp, maxLines = 1, softWrap = false)
                }
            }
        }
        if (resizing) {
            // Le haut à droite déplace le début, le bas à gauche la fin (la case de la tâche reste libre) ; un segment ne montre que ses vrais bords.
            if (segment.startsThisDay) {
                ResizeHandle(ResizeEdge.Top, accent, Modifier.align(Alignment.TopEnd), onHandleDrag, onHandleEnd, onHandleCancel)
            }
            if (segment.endsThisDay) {
                ResizeHandle(ResizeEdge.Bottom, accent, Modifier.align(Alignment.BottomStart), onHandleDrag, onHandleEnd, onHandleCancel)
            }
        }
    }
}

/** L'opacité du bloc d'origine pendant qu'on le déplace, ou que son nouveau créneau attend la relecture. */
internal const val PENDING_DIM = 0.35f

/** Une poignée : un disque de 12 dp dans une zone de toucher de 32 x 28 dp, tirée d'un seul doigt. */
@Composable
private fun ResizeHandle(
    edge: ResizeEdge,
    accent: Color,
    modifier: Modifier,
    onDrag: (ResizeEdge, Float) -> Unit,
    onEnd: (ResizeEdge) -> Unit,
    onCancel: () -> Unit,
) {
    val drag by rememberUpdatedState(onDrag)
    val end by rememberUpdatedState(onEnd)
    val cancel by rememberUpdatedState(onCancel)
    Box(
        modifier
            .size(width = 32.dp, height = 28.dp)
            .pointerInput(edge) {
                var total = 0f
                detectDragGestures(
                    onDragStart = { total = 0f },
                    onDrag = { change, amount ->
                        change.consume()
                        total += amount.y
                        drag(edge, total)
                    },
                    onDragEnd = { end(edge) },
                    onDragCancel = { cancel() },
                )
            },
        contentAlignment = if (edge == ResizeEdge.Top) Alignment.TopCenter else Alignment.BottomCenter,
    ) {
        Box(Modifier.size(12.dp).background(Color.White, CircleShape).padding(2.dp).background(accent, CircleShape))
    }
}

/** La case d'une tâche : un anneau pointillé, un disque coché une fois faite (TaskCheckbox.tsx). */
@Composable
fun TaskCheck(completed: Boolean, ink: Color, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(22.dp)
            .then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier)
            .semantics {
                role = Role.Checkbox
                stateDescription = if (completed) "Terminée" else "À faire"
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(14.dp)) {
            val stroke = 1.5.dp.toPx()
            if (completed) {
                drawCircle(ink)
                val tick = Path().apply {
                    moveTo(size.width * 4f / 14f, size.height * 7f / 14f)
                    lineTo(size.width * 6f / 14f, size.height * 9f / 14f)
                    lineTo(size.width * 10f / 14f, size.height * 5f / 14f)
                }
                drawPath(tick, Neo.Surface, style = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
            } else {
                drawCircle(
                    ink.copy(alpha = 0.85f),
                    radius = (size.minDimension - stroke) / 2f,
                    style = Stroke(stroke, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.4f * density, 2.2f * density))),
                )
            }
        }
    }
}
