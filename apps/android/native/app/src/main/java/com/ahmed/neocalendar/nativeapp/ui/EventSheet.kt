package com.ahmed.neocalendar.nativeapp.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.form.BirthdayReturn
import com.ahmed.neocalendar.core.form.EntryKind
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.applyEntryKind
import com.ahmed.neocalendar.core.form.buildPayload
import com.ahmed.neocalendar.core.form.entryKindOf
import com.ahmed.neocalendar.core.form.formValuesOfDraft
import com.ahmed.neocalendar.core.form.formValuesOfEvent
import com.ahmed.neocalendar.core.form.withOccurrenceStatus
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.recurrence.RecurringEditChangeContext
import com.ahmed.neocalendar.core.recurrence.RecurringEditScope
import com.ahmed.neocalendar.core.recurrence.needsScopeChoice
import com.ahmed.neocalendar.core.recurrence.needsOccurrenceChoice
import com.ahmed.neocalendar.core.recurrence.occurrenceDateOf
import com.ahmed.neocalendar.core.recurrence.recurringEditChanges
import com.ahmed.neocalendar.core.tasks.isTask
import com.ahmed.neocalendar.nativeapp.ExternalOpen
import com.ahmed.neocalendar.nativeapp.NativeViewModel
import com.ahmed.neocalendar.nativeapp.WRITE_IGNORED
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import com.ahmed.neocalendar.nativeapp.ui.fields.CalendarField
import com.ahmed.neocalendar.nativeapp.ui.fields.DescriptionField
import com.ahmed.neocalendar.nativeapp.ui.fields.LinksField
import com.ahmed.neocalendar.nativeapp.ui.fields.LocationField
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenu
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenuItem
import com.ahmed.neocalendar.nativeapp.ui.fields.RemindersField
import com.ahmed.neocalendar.nativeapp.ui.fields.RepeatField
import com.ahmed.neocalendar.nativeapp.ui.fields.ScheduleFields
import com.ahmed.neocalendar.nativeapp.ui.fields.StatusField
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction
import com.ahmed.neocalendar.nativeapp.ui.fields.ValuePill
import com.ahmed.neocalendar.nativeapp.ui.fields.ICON_COLUMN_START
import java.time.LocalDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ce que la fiche ouvre : une note qui existe (avec l'identifiant affiché, celui d'un jour pour une série), ou une ébauche. */
sealed interface SheetTarget {
    data class Existing(val stored: StoredEvent, val displayId: String) : SheetTarget
    data class Draft(val start: LocalDateTime, val end: LocalDateTime, val allDay: Boolean, val calendarId: String? = null) : SheetTarget
}

private fun kindLabel(kind: EntryKind) = when (kind) {
    EntryKind.Event -> "Évènement"
    EntryKind.Task -> "Tâche"
    EntryKind.Birthday -> "Anniversaire"
}

/**
 * La fiche d'un évènement : lecture et édition dans une feuille de bas d'écran à
 * trois ancrages. Les modifications restent dans le formulaire jusqu'à
 * « Enregistrer » ; la note est alors écrite par le noyau (`serializeEventMarkdown`
 * sur le contenu précédent), et pour un jour de série une question demande si la
 * modification vaut pour celui-ci seulement ou pour toute la série.
 */
@Composable
fun EventSheet(target: SheetTarget, data: WorkspaceData, viewModel: NativeViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val editableCalendars = remember(data) { data.calendars.filter { it.editable } }
    val existing = target as? SheetTarget.Existing
    val stored = existing?.stored
    val isDraft = target is SheetTarget.Draft

    val currentCalendarId = when (target) {
        is SheetTarget.Existing -> target.stored.calendarId
        is SheetTarget.Draft -> target.calendarId
            ?: data.defaultCalendarPath?.let { path -> editableCalendars.firstOrNull { it.relativePath == path }?.id }
            ?: editableCalendars.firstOrNull()?.id.orEmpty()
    }
    val calendarIds = editableCalendars.map { it.id }
    val initial = remember(target, data.calendars) {
        when (target) {
            is SheetTarget.Existing -> formValuesOfEvent(target.stored.event, calendarIds, currentCalendarId)
            is SheetTarget.Draft -> formValuesOfDraft(
                target.start, target.end, target.allDay, data.defaultEventsAsTasks, calendarIds, currentCalendarId,
            )
        }
    }
    var values by remember(target) { mutableStateOf(initial) }
    var birthdayReturn by remember(target) { mutableStateOf<BirthdayReturn?>(null) }
    var error by remember(target) { mutableStateOf<String?>(null) }
    var busy by remember(target) { mutableStateOf(false) }
    // Une écriture en cours (même lancée depuis la grille) verrouille Enregistrer, Supprimer et Dupliquer.
    val writing by viewModel.writing.collectAsState()
    val blocked = busy || writing
    var kindMenu by remember { mutableStateOf(false) }
    var overflowMenu by remember { mutableStateOf(false) }
    var dialog by remember(target) { mutableStateOf<SheetDialog?>(null) }

    val calendarOfNote = stored?.let { s -> data.calendars.firstOrNull { it.id == s.calendarId } }
    val editable = isDraft || (stored?.readOnly != true && calendarOfNote?.editable == true)
    val dirty = values != initial
    val series = stored?.event?.let { com.ahmed.neocalendar.core.recurrence.isSeries(it) } == true
    val occurrenceDate = if (series) occurrenceDateOf(existing?.displayId) else null
    val kind = entryKindOf(values)

    fun calendarPath(): String =
        editableCalendars.getOrNull(values.calendarIndex)?.relativePath ?: stored?.calendarPath.orEmpty()

    /** Le formulaire tel que l'écrirait la note ; un brouillon porte un titre rogné. */
    fun payload(): JsonObject {
        val built = values.buildPayload()
        return if (isDraft) JsonObject(built + ("title" to JsonPrimitive(values.title.trim()))) else built
    }

    fun finish(message: String?, success: String? = null) {
        busy = false
        if (message == WRITE_IGNORED) return
        if (message == null) {
            if (success != null) Toast.makeText(context, success, Toast.LENGTH_SHORT).show()
            onDismiss()
        } else {
            error = message
        }
    }

    fun save(scopeChoice: RecurringEditScope?) {
        if (blocked) return
        if (isDraft && values.title.isBlank()) {
            error = "Donnez un titre à l'évènement."
            return
        }
        busy = true
        error = null
        scope.launch {
            val built = payload()
            val message = when {
                target is SheetTarget.Draft -> viewModel.createEvent(calendarPath(), built)
                stored != null && scopeChoice == RecurringEditScope.Occurrence -> {
                    // Une date laissée telle quelle veut dire « le jour ouvert » ; une date changée, que ce jour y est déplacé.
                    val seriesStart = (stored.event as? NeoEvent.Rrule)?.startDate ?: (stored.event as? NeoEvent.Recurring)?.startRecur
                    val day = if (values.date.isNotEmpty() && values.date != seriesStart) values.date else occurrenceDate.orEmpty()
                    viewModel.detachOccurrence(stored, built, occurrenceDate.orEmpty(), day, calendarPath())
                }
                stored != null -> viewModel.updateEvent(stored, built, calendarPath())
                else -> "Rien à enregistrer."
            }
            finish(message)
        }
    }

    fun onSave() {
        if (stored != null && needsScopeChoice(stored.event.toRecord(), existing?.displayId, isDraft = false) && dirty) {
            val changes = recurringEditChanges(
                stored.event.toRecord(),
                payload(),
                RecurringEditChangeContext(
                    previousCalendarId = stored.calendarId,
                    nextCalendarId = editableCalendars.getOrNull(values.calendarIndex)?.id,
                    previousCalendarLabel = calendarOfNote?.name,
                    nextCalendarLabel = editableCalendars.getOrNull(values.calendarIndex)?.name,
                ),
            )
            dialog = SheetDialog.Scope(changes, isTask(stored.event))
        } else {
            save(null)
        }
    }

    fun requestClose() {
        if (busy) return
        if (dirty && editable) dialog = SheetDialog.Discard else onDismiss()
    }

    BackHandler(enabled = true) { if (dialog != null) dialog = null else requestClose() }

    SheetFrame(
        initial = if (isDraft) SheetAnchor.Full else SheetAnchor.Half,
        onDismissRequest = ::requestClose,
        header = {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box {
                    ValuePill(kindLabel(kind), enabled = editable, open = kindMenu, chevron = editable, onClick = { kindMenu = true })
                    NeoMenu(kindMenu, { kindMenu = false }) {
                        for (choice in EntryKind.entries) {
                            NeoMenuItem(kindLabel(choice), choice == kind) {
                                kindMenu = false
                                val change = applyEntryKind(values, choice, birthdayReturn)
                                values = change.values
                                birthdayReturn = change.birthdayReturn
                            }
                        }
                    }
                }
                Box(Modifier.weight(1f))
                if (editable && (dirty || isDraft)) {
                    TextAction(if (busy) "Enregistrement…" else "Enregistrer", enabled = !blocked) { onSave() }
                }
                if (editable && stored != null) {
                    Box {
                        IconTarget(NeoIcons.EllipsisVertical, "Plus d'actions") { overflowMenu = true }
                        NeoMenu(overflowMenu, { overflowMenu = false }) {
                            NeoMenuItem("Dupliquer", enabled = !blocked) {
                                overflowMenu = false
                                if (blocked) return@NeoMenuItem
                                busy = true
                                scope.launch {
                                    finish(viewModel.duplicateEvent(stored, stored.calendarPath), "Évènement dupliqué")
                                }
                            }
                            NeoMenuItem("Supprimer", enabled = !blocked) {
                                overflowMenu = false
                                dialog = if (series && occurrenceDate != null && needsOccurrenceChoice(stored.event, existing?.displayId.orEmpty())) {
                                    SheetDialog.DeleteOccurrence(isTask(stored.event))
                                } else {
                                    SheetDialog.DeleteNote(isTask(stored.event))
                                }
                            }
                        }
                    }
                }
                IconTarget(NeoIcons.Close, "Fermer") { requestClose() }
            }
        },
        body = {
            val focus = remember { FocusRequester() }
            LaunchedEffect(isDraft) { if (isDraft) focus.requestFocus() }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
                // Titre
                Box(Modifier.fillMaxWidth().padding(start = ICON_COLUMN_START, end = 16.dp, top = 4.dp, bottom = 8.dp)) {
                    if (values.title.isEmpty()) Text("Titre", color = Neo.TextFaint, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                    BasicTextField(
                        values.title,
                        { values = values.copy(title = it) },
                        enabled = editable,
                        textStyle = TextStyle(color = Neo.Text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
                        cursorBrush = SolidColor(Neo.Accent),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    )
                }
                if (!editable) {
                    Text(
                        "Cet évènement est en lecture seule.",
                        color = Neo.TextFaint, fontSize = 13.sp,
                        modifier = Modifier.padding(start = ICON_COLUMN_START, end = 16.dp, bottom = 8.dp),
                    )
                }

                ScheduleFields(values, editable, data.timeFormat24h, canClearDate = !isDraft) { values = it }
                if (values.date.isNotEmpty()) RepeatField(values, editable, data.firstDay) { values = it }

                CalendarField(
                    calendars = editableCalendars,
                    selectedIndex = values.calendarIndex,
                    readOnlyName = calendarOfNote?.name,
                    editable = editable,
                ) { values = values.copy(calendarIndex = it) }

                RemindersField(values.reminders, values.allDay, editable) { values = values.copy(reminders = it) }

                LocationField(
                    location = values.location,
                    geo = stored?.event?.geo,
                    editable = editable,
                    mapsApp = data.mapsApp,
                    mapsTravelMode = data.mapsTravelMode,
                ) { values = values.copy(location = it) }

                val open: (String) -> Unit = { targetPath ->
                    if (ExternalOpen.isWebTarget(targetPath)) {
                        ExternalOpen.openLink(context, targetPath)
                    } else {
                        scope.launch {
                            ExternalOpen.openAttachment(context, viewModel.attachmentStorage(), stored?.relativePath.orEmpty(), targetPath)
                        }
                    }
                }
                DescriptionField(values.description, editable, { values = values.copy(description = it) }, open)
                LinksField(values.description, open)

                if (values.taskStatus != null) {
                    val complete = if (series && occurrenceDate != null) {
                        values.completedDates.orEmpty().contains(occurrenceDate)
                    } else {
                        values.taskStatus == "complete"
                    }
                    StatusField(complete, editable) {
                        values = if (series && occurrenceDate != null) values.withOccurrenceStatus(occurrenceDate, !complete)
                        else values.copy(taskStatus = if (complete) "todo" else "complete")
                    }
                }

                error?.let {
                    Text(
                        it,
                        color = Neo.Today, fontSize = 13.sp,
                        modifier = Modifier.padding(start = ICON_COLUMN_START, end = 16.dp, top = 10.dp),
                    )
                }
            }
        },
    )

    when (val shown = dialog) {
        null -> Unit
        is SheetDialog.Scope -> ScopeDialog(
            shown.changes, shown.isTask,
            onChoose = { choice -> dialog = null; save(choice) },
            onCancel = { dialog = null },
        )
        SheetDialog.Discard -> DiscardDialog(
            onSave = { dialog = null; onSave() },
            onDiscard = { dialog = null; onDismiss() },
            onCancel = { dialog = null },
        )
        is SheetDialog.DeleteNote -> ConfirmDialog(
            title = if (shown.isTask) "Supprimer la tâche ?" else "Supprimer l'évènement ?",
            message = "La note est supprimée du dossier.",
            confirm = "Supprimer",
            onConfirm = {
                dialog = null
                if (blocked) return@ConfirmDialog
                busy = true
                scope.launch { finish(viewModel.deleteEvent(stored!!), null) }
            },
            onCancel = { dialog = null },
        )
        is SheetDialog.DeleteOccurrence -> DeleteOccurrenceDialog(
            isTask = shown.isTask,
            onChoose = { following ->
                dialog = null
                if (blocked) return@DeleteOccurrenceDialog
                busy = true
                scope.launch { finish(viewModel.deleteOccurrence(stored!!, occurrenceDate.orEmpty(), following), null) }
            },
            onCancel = { dialog = null },
        )
    }
}

@Composable
private fun IconTarget(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(Neo.TouchTarget).clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, tint = Neo.Text, modifier = Modifier.size(22.dp)) }
}
