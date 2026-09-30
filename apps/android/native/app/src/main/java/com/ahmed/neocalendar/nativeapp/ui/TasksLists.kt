package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.format.formatDatedDayWithYear
import com.ahmed.neocalendar.core.tasks.TaskItem
import com.ahmed.neocalendar.core.tasks.effectiveDue
import com.ahmed.neocalendar.core.tasks.isOverdue
import com.ahmed.neocalendar.core.tasks.matchesTaskQuery
import java.time.LocalDate

/** Les deux listes du tiroir : « À faire » (échéance la plus proche d'abord) et « Terminé » (la plus récente d'abord). */
@Composable
fun TasksList(
    complete: Boolean,
    tasks: List<TaskItem>,
    today: LocalDate,
    onBack: () -> Unit,
    onTaskClick: (TaskItem) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val shown = remember(tasks, query) { tasks.filter { matchesTaskQuery(it, query) } }
    val todayIso = remember(today) { today.toString() }

    Column(Modifier.fillMaxSize()) {
        ListHeader(if (complete) "Terminé" else "À faire", onBack)
        ListSearchField(query, { query = it }, "Rechercher une tâche", Modifier.padding(horizontal = 16.dp))
        if (shown.isEmpty()) {
            EmptyNote(if (query.isNotBlank()) "Rien ne correspond" else "Rien ici")
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(shown) { task -> TaskRow(task, todayIso, today.year) { onTaskClick(task) } }
            }
        }
    }
}

@Composable
private fun TaskRow(task: TaskItem, todayIso: String, currentYear: Int, onClick: () -> Unit) {
    val done = task.status == "complete"
    val accent = remember(task.color) { parseCalendarColor(task.color) }
    val late = isOverdue(task, todayIso)
    val day = effectiveDue(task)
    val shape = RoundedCornerShape(12.dp)
    // Teinte du calendrier à 12 % sur la surface, comme le bloc d'évènement de la grille.
    val fill = remember(accent) { accent.copy(alpha = 0.12f).compositeOver(Neo.Surface) }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(shape)
            .background(fill)
            .border(1.dp, Neo.Border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TaskCheck(done, accent)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                task.title.ifBlank { "Sans titre" },
                color = if (done) Neo.TextSecondary else Neo.Text,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (done) TextDecoration.LineThrough else null,
            )
            Text(task.calendarName, color = Neo.TextFaint, fontSize = 11.sp, maxLines = 1, modifier = Modifier.padding(top = 2.dp))
        }
        if (day != null) {
            Column(Modifier.padding(start = 10.dp), horizontalAlignment = Alignment.End) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (task.due != null) {
                        Icon(NeoIcons.Flag, null, tint = if (late) Neo.Today else Neo.TextSecondary, modifier = Modifier.size(12.dp))
                    }
                    Text(
                        // Une date illisible s'affiche telle quelle plutôt que de faire tomber la liste.
                        runCatching { formatDatedDayWithYear(LocalDate.parse(day.take(10)), currentYear) }.getOrDefault(day),
                        color = if (late) Neo.Today else Neo.TextSecondary,
                        fontSize = 12.sp,
                        maxLines = 1,
                        modifier = Modifier.padding(start = if (task.due != null) 4.dp else 0.dp),
                    )
                }
                if (late) {
                    Text("En retard", color = Neo.Today, fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp))
                } else if (task.due != null && !done) {
                    Text("Échéance", color = Neo.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
    }
}

/** La case de la tâche : un anneau à faire, un disque coché quand c'est fini. */
@Composable
fun TaskCheck(done: Boolean, accent: Color, size: androidx.compose.ui.unit.Dp = 22.dp) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .then(if (done) Modifier.background(accent) else Modifier.border(2.dp, Neo.TextSecondary, CircleShape)),
        contentAlignment = Alignment.Center,
    ) {
        if (done) Icon(NeoIcons.Check, null, tint = Neo.Background, modifier = Modifier.size(size * 0.64f))
    }
}
