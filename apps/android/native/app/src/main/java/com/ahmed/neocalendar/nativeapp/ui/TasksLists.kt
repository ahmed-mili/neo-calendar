package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.core.tasks.TaskItem
import com.ahmed.neocalendar.core.tasks.effectiveDue
import com.ahmed.neocalendar.core.tasks.hasTaskCompletionDate
import com.ahmed.neocalendar.core.tasks.isOverdue
import com.ahmed.neocalendar.core.tasks.matchesTaskQuery
import java.time.LocalDate
import kotlin.math.max

/**
 * Les deux listes du tiroir, en fenêtre centrée (`.nc-task-modal`, `DesktopTasksPanel.tsx`) : « À faire » (échéance la plus proche
 * d'abord) et « Terminé » (la plus récente d'abord). La case coche la tâche sans quitter la liste ; dans « À faire », une tâche
 * qu'on vient de finir reste en bas sous « Terminées récemment » jusqu'à la fermeture.
 */
@Composable
fun TasksList(
    complete: Boolean,
    tasks: List<TaskItem>,
    tasksById: Map<String, TaskItem>,
    today: LocalDate,
    onDismiss: () -> Unit,
    onTaskClick: (TaskItem) -> Unit,
    onToggleTask: (TaskItem, Boolean) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var recentIds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    val shown = remember(tasks, query) { tasks.filter { matchesTaskQuery(it, query) } }
    val recent = remember(recentIds, tasksById, query) {
        recentIds.mapNotNull { tasksById[it] }.filter { it.status == "complete" && matchesTaskQuery(it, query) }
    }
    val todayIso = remember(today) { today.toString() }
    val toggle = { task: TaskItem, done: Boolean ->
        if (!complete && done && task.id !in recentIds) recentIds = recentIds + task.id
        onToggleTask(task, done)
    }

    NeoModal(onDismiss, insets = false) {
        val statusTop = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
        val navBottom = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier
                // Le voile se pose avec `padding: max(12px, inset haut) 12px max(12px, inset bas)`.
                .padding(start = 12.dp, end = 12.dp, top = max(12f, statusTop.value).dp, bottom = max(12f, navBottom.value).dp)
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.85f).dp)
                .shadow(24.dp, shape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.BorderStrong, shape)
                .clip(shape)
                .consumeTaps(),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .drawBehind { drawRect(Neo.Border, topLeft = Offset(0f, size.height - 1.dp.toPx()), size = Size(size.width, 1.dp.toPx())) }
                    .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (complete) "Terminé" else "À faire",
                    color = Neo.Text,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Box(Modifier.size(44.dp).pressFill(RoundedCornerShape(5.dp), Neo.Hover, onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Icon(NeoIcons.Close, "Fermer", tint = Neo.TextSecondary, modifier = Modifier.size(14.dp))
                }
            }
            val fieldShape = RoundedCornerShape(8.dp)
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                    .heightIn(min = 44.dp)
                    .border(1.dp, Neo.Border, fieldShape)
                    .padding(horizontal = 10.dp, vertical = 7.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (query.isEmpty()) Text("Rechercher une tâche", color = Neo.TextFaint, fontSize = 16.sp, maxLines = 1)
                BasicTextField(
                    query,
                    { query = it },
                    singleLine = true,
                    textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp),
                    cursorBrush = SolidColor(Neo.Accent),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(8.dp)) {
                for (task in shown) {
                    androidx.compose.runtime.key(task.id) { TaskRow(task, todayIso, today.year, { onTaskClick(task) }) { toggle(task, it) } }
                }
                if (!complete && recent.isNotEmpty()) {
                    Text(
                        "TERMINÉES RÉCEMMENT",
                        color = Neo.TextFaint,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.33.sp,
                        modifier = Modifier
                            .padding(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 4.dp)
                            .fillMaxWidth()
                            .drawBehind { drawRect(Neo.Border, size = Size(size.width, 1.dp.toPx())) }
                            .padding(top = 8.dp),
                    )
                    for (task in recent) {
                        androidx.compose.runtime.key("recent-${task.id}") { TaskRow(task, todayIso, today.year, { onTaskClick(task) }) { toggle(task, it) } }
                    }
                }
                if (shown.isEmpty() && recent.isEmpty()) {
                    Text(
                        if (query.isNotBlank()) "Rien ne correspond" else "Rien ici",
                        color = Neo.TextFaint,
                        fontSize = 12.5.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 18.dp),
                    )
                }
            }
        }
    }
}

/** Une ligne (`.nc-tasks-item`) : 52 dp, teinte du calendrier à 8 %, rayon 4, case de 44 dp, titre 16 sp, échéance 11 sp à droite. */
@Composable
private fun TaskRow(task: TaskItem, todayIso: String, currentYear: Int, onClick: () -> Unit, onToggle: (Boolean) -> Unit) {
    val done = task.status == "complete"
    val accent = remember(task.color) { parseCalendarColor(task.color) }
    val late = isOverdue(task, todayIso)
    val day = effectiveDue(task)
    val canToggle = task.editable && hasTaskCompletionDate(task.date, task.due)
    val shape = RoundedCornerShape(4.dp)
    Row(
        Modifier
            .padding(bottom = 2.dp)
            .fillMaxWidth()
            .alpha(if (done) 0.6f else 1f)
            .clip(shape)
            .background(accent.copy(alpha = 0.08f))
            .pressFill(shape, accent.copy(alpha = 0.08f), onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(44.dp)
                .alpha(if (canToggle) 1f else 0.5f)
                .let { if (canToggle) it.clickable(indication = null, interactionSource = null) { onToggle(!done) } else it },
            contentAlignment = Alignment.Center,
        ) { TaskGlyph(done, 12) }
        Text(
            task.title.ifBlank { "Sans titre" },
            color = Neo.Text,
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textDecoration = if (done) TextDecoration.LineThrough else null,
            modifier = Modifier.weight(1f),
        )
        if (day != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (task.due != null) Text("⚑", color = if (late) Neo.Overdue else Neo.TextFaint, fontSize = 11.sp, modifier = Modifier.alpha(0.75f).padding(end = 3.dp))
                Text(
                    // Une date illisible s'affiche telle quelle plutôt que de faire tomber la liste.
                    runCatching { formatDatedDayWithYear(LocalDate.parse(day.take(10)), currentYear) }.getOrDefault(day),
                    color = if (late) Neo.Overdue else Neo.TextFaint,
                    fontSize = 11.sp,
                    fontWeight = if (late) FontWeight.SemiBold else null,
                    maxLines = 1,
                )
            }
        }
    }
}

/** La case de la tâche : un anneau pointillé, un disque coché une fois finie (TaskCheckbox.tsx), à la couleur du texte. */
@Composable
fun TaskGlyph(done: Boolean, size: Int = 14) {
    val ink = Neo.Text
    androidx.compose.foundation.Canvas(Modifier.size(size.dp)) {
        val stroke = 1.5.dp.toPx() * size / 14f
        if (done) {
            drawCircle(ink)
            val tick = androidx.compose.ui.graphics.Path().apply {
                moveTo(this@Canvas.size.width * 4f / 14f, this@Canvas.size.height * 7f / 14f)
                lineTo(this@Canvas.size.width * 6f / 14f, this@Canvas.size.height * 9f / 14f)
                lineTo(this@Canvas.size.width * 10f / 14f, this@Canvas.size.height * 5f / 14f)
            }
            drawPath(
                tick,
                Neo.Surface,
                style = androidx.compose.ui.graphics.drawscope.Stroke(
                    stroke,
                    cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    join = androidx.compose.ui.graphics.StrokeJoin.Round,
                ),
            )
        } else {
            drawCircle(
                ink.copy(alpha = 0.85f),
                radius = (this.size.minDimension - stroke) / 2f,
                style = androidx.compose.ui.graphics.drawscope.Stroke(
                    stroke,
                    cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(2.4f * density * size / 14f, 2.2f * density * size / 14f)),
                ),
            )
        }
    }
}
