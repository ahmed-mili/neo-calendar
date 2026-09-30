package com.ahmed.neocalendar.core.tasks

import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import java.text.Normalizer
import java.util.Locale
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de src/ui/tasks/index.ts (isTask, getTaskStatus), taskList.ts
 * (collectTasks, effectiveDue, isOverdue), desktopTaskGroups.ts et
 * taskSearch.ts : les listes « À faire » / « Terminé » du tiroir.
 */

private fun completedOf(event: NeoEvent): JsonElement? = when (event) {
    is NeoEvent.Single -> event.completed
    is NeoEvent.Recurring -> event.completed
    is NeoEvent.Rrule -> event.completed
    is NeoEvent.Someday -> event.completed
}

/** Un évènement devient une tâche en portant un champ `completed`. */
fun isTask(event: NeoEvent): Boolean = completedOf(event).let { it != null && it !is JsonNull }

/**
 * « todo » ou « complete ». Une série ne répond pas pour elle-même (chaque
 * occurrence a son état) : null, comme `getTaskStatus`.
 */
fun getTaskStatus(event: NeoEvent): String? {
    if (event !is NeoEvent.Single && event !is NeoEvent.Someday) return null
    val completed = completedOf(event)
    if (completed == null || completed is JsonNull) return null
    val primitive = completed as JsonPrimitive
    // Le reste est une date ISO : le moment où la tâche a été finie.
    val todo = if (primitive.isString) primitive.content == "in-progress" else primitive.content == "false"
    return if (todo) "todo" else "complete"
}

data class TaskItem(
    val id: String,
    val title: String,
    /** `AAAA-MM-JJ`, ou null quand la tâche n'a aucune date. */
    val date: String?,
    /** L'échéance, quand il y en a une. Indépendante de `date`. */
    val due: String?,
    val status: String,
    /** Horodatage de fin ; null tant qu'elle est à faire. */
    val completedAt: String?,
    val calendarId: String,
    val calendarName: String,
    val color: String,
    val editable: Boolean,
)

/** Le jour auquel une tâche se juge : son échéance, sinon sa date. */
fun effectiveDue(task: TaskItem): String? = task.due ?: task.date

/** En cours et le jour dû est passé. Les dates ISO se comparent comme des chaînes. */
fun isOverdue(task: TaskItem, today: String): Boolean =
    task.status == "todo" && effectiveDue(task)?.let { it < today } == true

fun hasTaskCompletionDate(date: String?, due: String?): Boolean = !(due ?: date).isNullOrEmpty()

/**
 * Toutes les tâches des calendriers visibles, lues dans les notes brutes (pas
 * dans la fenêtre affichée : une tâche en retard est justement hors fenêtre).
 * Les séries en sont exclues, comme `collectTasks`.
 */
fun collectTasks(
    events: List<StoredEvent>,
    calendars: Map<String, CalendarModel>,
    hiddenCalendarIds: Set<String>,
): List<TaskItem> {
    val out = ArrayList<TaskItem>()
    for (stored in events) {
        if (stored.calendarId in hiddenCalendarIds) continue
        val calendar = calendars[stored.calendarId] ?: continue
        val event = stored.event
        if (event !is NeoEvent.Single && event !is NeoEvent.Someday) continue
        val status = getTaskStatus(event) ?: continue
        val completed = completedOf(event)
        val due = when (event) {
            is NeoEvent.Single -> event.due
            is NeoEvent.Someday -> event.due
        }
        out += TaskItem(
            id = stored.id,
            title = event.title,
            date = (event as? NeoEvent.Single)?.date,
            due = (due as? JsonPrimitive)?.takeIf { it.isString }?.content,
            status = status,
            completedAt = if (status == "complete") (completed as? JsonPrimitive)?.takeIf { it.isString }?.content else null,
            calendarId = calendar.id,
            calendarName = calendar.name,
            color = calendar.color,
            editable = calendar.editable && stored.readOnly != true,
        )
    }
    return out
}

data class TaskGroups(val todo: List<TaskItem>, val complete: List<TaskItem>)

/**
 * Une tâche finie sans date ni échéance compte comme à faire (on ne peut pas
 * dire quand elle l'a été). À faire : échéance la plus proche d'abord, les
 * sans-date à la fin ; terminées : la plus récente d'abord. Tri stable.
 */
fun buildDesktopTaskGroups(tasks: List<TaskItem>): TaskGroups {
    val todo = ArrayList<TaskItem>()
    val complete = ArrayList<TaskItem>()
    for (task in tasks) {
        if (task.status == "complete" && hasTaskCompletionDate(task.date, task.due)) complete += task
        else if (task.status == "complete") todo += task.copy(status = "todo", completedAt = null)
        else todo += task
    }
    val byDue = Comparator<TaskItem> { a, b ->
        val left = effectiveDue(a)
        val right = effectiveDue(b)
        when {
            left != null && right != null -> left.compareTo(right)
            left != null -> -1
            right != null -> 1
            else -> 0
        }
    }
    val byCompletion = Comparator<TaskItem> { a, b ->
        val left = a.completedAt
        val right = b.completedAt
        when {
            left != null && right != null -> right.compareTo(left)
            left != null -> -1
            right != null -> 1
            else -> 0
        }
    }
    return TaskGroups(todo.sortedWith(byDue), complete.sortedWith(byCompletion))
}

private val COMBINING_MARKS = Regex("""\p{Mn}""")
private val WHITESPACE = Regex("""\s+""")

/** Sans casse ni diacritiques : « reinscription » retrouve « Réinscription ». */
fun normalizeForSearch(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD).replace(COMBINING_MARKS, "").lowercase(Locale.ROOT)

/** Chaque mot doit se retrouver dans le titre ou le nom du calendrier ; un champ vide ne cache rien. */
fun matchesTaskQuery(task: TaskItem, query: String): Boolean {
    val terms = normalizeForSearch(query).split(WHITESPACE).filter { it.isNotEmpty() }
    if (terms.isEmpty()) return true
    val haystack = normalizeForSearch("${task.title} ${task.calendarName}")
    return terms.all { it in haystack }
}
