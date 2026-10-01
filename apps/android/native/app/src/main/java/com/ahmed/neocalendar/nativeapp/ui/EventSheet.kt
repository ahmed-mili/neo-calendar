package com.ahmed.neocalendar.nativeapp.ui

import android.content.ContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.viewModelScope
import com.ahmed.neocalendar.core.form.BirthdayReturn
import com.ahmed.neocalendar.core.form.EntryKind
import com.ahmed.neocalendar.core.form.EventFormValues
import com.ahmed.neocalendar.core.form.applyEntryKind
import com.ahmed.neocalendar.core.form.buildPayload
import com.ahmed.neocalendar.core.form.entryKindOf
import com.ahmed.neocalendar.core.form.formValuesOfDraft
import com.ahmed.neocalendar.core.form.formValuesOfEvent
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.toRecord
import com.ahmed.neocalendar.core.recurrence.RecurringEditChangeContext
import com.ahmed.neocalendar.core.recurrence.RecurringEditScope
import com.ahmed.neocalendar.core.recurrence.isSeries
import com.ahmed.neocalendar.core.recurrence.needsOccurrenceChoice
import com.ahmed.neocalendar.core.recurrence.needsScopeChoice
import com.ahmed.neocalendar.core.recurrence.occurrenceDateOf
import com.ahmed.neocalendar.core.recurrence.recurringEditChanges
import com.ahmed.neocalendar.core.sheet.SheetStop
import com.ahmed.neocalendar.core.sheet.adjacentOccurrenceId
import com.ahmed.neocalendar.core.sheet.freshNote
import com.ahmed.neocalendar.core.tasks.isTask
import com.ahmed.neocalendar.nativeapp.ExternalOpen
import com.ahmed.neocalendar.nativeapp.NativeViewModel
import com.ahmed.neocalendar.nativeapp.WRITE_IGNORED
import com.ahmed.neocalendar.nativeapp.WorkspaceData
import com.ahmed.neocalendar.nativeapp.ui.fields.CalendarField
import com.ahmed.neocalendar.nativeapp.ui.fields.AddLinkDialog
import com.ahmed.neocalendar.nativeapp.ui.fields.DescriptionEditor
import com.ahmed.neocalendar.nativeapp.ui.fields.DescriptionField
import com.ahmed.neocalendar.nativeapp.ui.fields.DescriptionToolbar
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.ahmed.neocalendar.core.description.appendMarkdownToDescription
import com.ahmed.neocalendar.core.description.markdownLinkForAttachment
import com.ahmed.neocalendar.core.description.readInlineLinks
import com.ahmed.neocalendar.nativeapp.ui.fields.ICON_COLUMN_START
import com.ahmed.neocalendar.nativeapp.ui.fields.LinksField
import com.ahmed.neocalendar.nativeapp.ui.fields.LocationField
import com.ahmed.neocalendar.nativeapp.ui.fields.Popover
import com.ahmed.neocalendar.nativeapp.ui.fields.PopoverEntry
import com.ahmed.neocalendar.nativeapp.ui.fields.PopoverSurface
import com.ahmed.neocalendar.nativeapp.ui.fields.RemindersField
import com.ahmed.neocalendar.nativeapp.ui.fields.RepeatField
import com.ahmed.neocalendar.nativeapp.ui.fields.ScheduleFields
import com.ahmed.neocalendar.nativeapp.ui.fields.SeriesSteps
import java.time.LocalDateTime
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ce que la fiche ouvre : une note qui existe (avec l'identifiant affiché, celui d'un jour pour une série), ou une ébauche. */
sealed interface SheetTarget {
    data class Existing(val stored: StoredEvent, val displayId: String) : SheetTarget
    data class Draft(val start: LocalDateTime, val end: LocalDateTime, val allDay: Boolean, val calendarId: String? = null, val serial: Long = System.nanoTime()) : SheetTarget
}

private fun kindLabel(kind: EntryKind) = when (kind) {
    EntryKind.Event -> "Événement"
    EntryKind.Task -> "Tâche"
    EntryKind.Birthday -> "Anniversaire"
}

/** Une question que la fiche pose avant de partir : la portée d'une modification retenue sur un jour de série. */
private class HeldScope(val changes: List<com.ahmed.neocalendar.core.recurrence.RecurringEditChange>, val isTask: Boolean, val then: (() -> Unit)?)

/**
 * La fiche d'un évènement, comme `EventPanel.tsx` : une feuille de bas d'écran à trois ancrages. Il n'y a ni bouton
 * « Enregistrer » ni dialogue d'abandon : chaque modification est écrite au fil de l'eau (400 ms après la dernière frappe),
 * et un brouillon devient une note dès qu'il a un titre. Une série n'écrit rien tant que la fiche est ouverte : la portée
 * (« cet évènement seulement » ou toute la série) est demandée à la sortie.
 */
@Composable
fun EventSheet(
    target: SheetTarget,
    data: WorkspaceData,
    viewModel: NativeViewModel,
    closeSignal: Int,
    replacing: Boolean,
    onStay: () -> Unit,
    onDraftCommitted: () -> Unit,
    onOpenOccurrence: (displayId: String, date: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val writes = viewModel.viewModelScope
    val latestData by rememberUpdatedState(data)
    val editableCalendars = remember(data) { data.calendars.filter { it.editable } }
    val key = when (target) {
        is SheetTarget.Existing -> "note:${target.displayId}"
        is SheetTarget.Draft -> "draft:${target.serial}"
    }
    val isDraftSheet = target is SheetTarget.Draft
    // La note ouverte : celle du brouillon une fois écrite, et à chaque écriture la note relue du dossier.
    var live by remember(key) { mutableStateOf((target as? SheetTarget.Existing)?.stored) }
    var displayId by remember(key) { mutableStateOf((target as? SheetTarget.Existing)?.displayId) }
    val stored = live

    val currentCalendarId = when (target) {
        is SheetTarget.Existing -> target.stored.calendarId
        is SheetTarget.Draft -> target.calendarId
            ?: data.defaultCalendarPath?.let { path -> editableCalendars.firstOrNull { it.relativePath == path }?.id }
            ?: editableCalendars.firstOrNull()?.id.orEmpty()
    }
    val calendarIds = editableCalendars.map { it.id }
    val initial = remember(key) {
        when (target) {
            is SheetTarget.Existing -> formValuesOfEvent(target.stored.event, calendarIds, currentCalendarId)
            is SheetTarget.Draft -> formValuesOfDraft(
                target.start, target.end, target.allDay, data.defaultEventsAsTasks, calendarIds, currentCalendarId,
            )
        }
    }
    var values by remember(key) { mutableStateOf(initial) }
    // Ce que la dernière écriture a pris : la fiche n'écrit que ce qui en diffère.
    var baseline by remember(key) { mutableStateOf(initial) }
    var birthdayReturn by remember(key) { mutableStateOf<BirthdayReturn?>(null) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    var kindMenu by remember { mutableStateOf(false) }
    var overflowMenu by remember { mutableStateOf(false) }
    var dialog by remember(key) { mutableStateOf<SheetDialog?>(null) }
    var held by remember(key) { mutableStateOf<HeldScope?>(null) }
    // L'éditeur de description (sa barre se pose au-dessus du clavier), la boîte « Ajouter un lien » et le choix de fichiers.
    val descriptionEditor = remember(key) { DescriptionEditor() }
    var linkDialog by remember(key) { mutableStateOf<androidx.compose.ui.text.TextRange?>(null) }
    var attaching by remember(key) { mutableStateOf(false) }
    val flushLock = remember(key) { Mutex() }
    // Faux dès que la fiche quitte l'écran : une écriture qui finit après ne touche plus la fiche suivante.
    val alive = remember(key) { AtomicBoolean(true) }
    val pickFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        descriptionEditor.holdFocus = false
        val note = live
        if (uris.isNotEmpty() && note != null) {
            attaching = true
            scope.launch {
                try {
                    // `pickEventAttachments` : chaque fichier est copié à côté de la note, ses liens sont ajoutés à la fin de la description.
                    val links = uris.map { uri ->
                        val copied = viewModel.copyAttachment(note.relativePath, uri)
                        markdownLinkForAttachment(copied.fileName, copied.markdownPath)
                    }
                    descriptionEditor.replaceAll(appendMarkdownToDescription(values.description, links.joinToString("\n")))
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Notices.fail(e.message ?: e.toString())
                } finally {
                    attaching = false
                }
            }
        }
    }
    val sheetState = rememberSheetState(if (isDraftSheet) SheetStop.Half else SheetStop.Full, isDraftSheet)

    val calendarOfNote = stored?.let { s -> latestData.calendars.firstOrNull { it.id == s.calendarId } }
    val editable = (isDraftSheet && stored == null) || (stored?.readOnly != true && calendarOfNote?.editable == true)
    val series = stored?.event?.let { isSeries(it) } == true
    val occurrenceDate = if (series) occurrenceDateOf(displayId) else null
    val kind = entryKindOf(values)
    val dirty = values != baseline
    // Un jour de série ouvert : rien n'est écrit avant la sortie (`needsScopeChoice`).
    val heldSeries = stored != null && needsScopeChoice(stored.event.toRecord(), displayId, isDraft = false)

    fun calendarPath(form: EventFormValues): String =
        editableCalendars.getOrNull(form.calendarIndex)?.relativePath ?: stored?.calendarPath.orEmpty()

    /** Le formulaire tel que l'écrirait la note ; un brouillon porte un titre rogné. */
    fun payload(form: EventFormValues): JsonObject {
        val built = form.buildPayload()
        return if (stored == null) JsonObject(built + ("title" to JsonPrimitive(form.title.trim()))) else built
    }

    /** Écrit ce que le formulaire dit de plus que la dernière écriture, jusqu'à ce qu'il n'y ait plus rien. */
    suspend fun flush(): Unit = flushLock.withLock {
        var attempts = 0
        while (attempts++ < 12) {
            val snapshot = values
            if (snapshot == baseline) return
            val opened = live
            if (opened == null) {
                // `shouldAutoCommitDraft` : le brouillon n'existe qu'une fois qu'il a un titre et une date.
                if (snapshot.title.isBlank() || snapshot.date.isEmpty()) return
                val written = viewModel.createEvent(calendarPath(snapshot), payload(snapshot))
                if (written.error == WRITE_IGNORED) { delay(250); continue }
                if (written.error != null) { error = written.error; Notices.fail(written.error); return }
                val created = written.note
                if (created == null) {
                    // La note est écrite mais introuvable après relecture : ne pas la recréer.
                    if (alive.get()) onDismiss()
                    return
                }
                live = created
                displayId = created.id
                baseline = snapshot
                error = null
                if (alive.get()) onDraftCommitted()
                continue
            }
            // La note telle que le dossier la rend maintenant : une écriture d'une autre fiche a pu la renommer depuis.
            val note = freshNote(viewModel.latestData()?.events.orEmpty(), opened, calendarPath(snapshot)) ?: opened
            if (!editable || (needsScopeChoice(note.event.toRecord(), displayId, isDraft = false))) return
            val written = viewModel.updateEvent(note, payload(snapshot), calendarPath(snapshot))
            if (written.error == WRITE_IGNORED) { delay(250); continue }
            // Une écriture à moitié faite (la note déplacée, puis l'écriture refusée) : la fiche suit la note là où elle est.
            live = written.note ?: freshNote(viewModel.latestData()?.events.orEmpty(), note, calendarPath(snapshot)) ?: note
            if (written.error != null) { error = written.error; Notices.fail(written.error); return }
            baseline = snapshot
            error = null
        }
    }

    // L'enregistrement au fil de l'eau (`debouncedAutoSave` : 400 ms après la dernière modification).
    LaunchedEffect(values) {
        if (values == baseline) return@LaunchedEffect
        if (live == null) {
            // Un brouillon devient une note dès que le titre le décide, sans attendre.
            if (values.title.isNotBlank() && values.date.isNotEmpty()) writes.launch { flush() }
            return@LaunchedEffect
        }
        if (heldSeries) return@LaunchedEffect
        delay(400)
        writes.launch { flush() }
    }

    // Les heures du brouillon suivent son aperçu sur la grille (`NEO_ANDROID_DRAFT_LIVE_TIME`).
    if (target is SheetTarget.Draft && stored == null) {
        LaunchedEffect(target.start, target.end, target.allDay) {
            if (!target.allDay) {
                values = values.copy(
                    date = target.start.toLocalDate().toString(),
                    startTime = target.start.toLocalTime().toString().take(5),
                    endTime = target.end.toLocalTime().toString().take(5),
                )
            }
        }
    }

    /** La question de la portée, avec ce qui change ; null quand rien n'est retenu. */
    fun scopeQuestion(then: (() -> Unit)?): HeldScope? {
        val note = stored ?: return null
        if (!heldSeries || !dirty) return null
        val changes = recurringEditChanges(
            note.event.toRecord(),
            payload(values),
            RecurringEditChangeContext(
                previousCalendarId = note.calendarId,
                nextCalendarId = editableCalendars.getOrNull(values.calendarIndex)?.id,
                previousCalendarLabel = calendarOfNote?.name,
                nextCalendarLabel = editableCalendars.getOrNull(values.calendarIndex)?.name,
            ),
        )
        return HeldScope(changes, isTask(note.event), then)
    }

    /** Toutes les sorties passent ici : la question de la portée d'abord, l'écriture en suspens ensuite. */
    fun leave(slide: Boolean, then: () -> Unit = onDismiss) {
        val question = scopeQuestion(then)
        if (question != null) {
            if (!slide) sheetState.comeBack()
            held = question
            return
        }
        writes.launch { flush() }
        if (slide) sheetState.slideOut(then) else then()
    }

    /** Une réponse à la question : l'écriture part, la fiche s'en va sans l'attendre. */
    fun answer(choice: RecurringEditScope, question: HeldScope) {
        val note = stored ?: return
        val snapshot = values
        val built = payload(snapshot)
        val path = calendarPath(snapshot)
        val day = occurrenceDate.orEmpty()
        writes.launch {
            // Comme `flush` : une écriture en cours fait attendre celle-ci, elle ne l'annule pas.
            var attempts = 0
            var written: NativeViewModel.NoteWrite
            do {
                if (attempts > 0) delay(250)
                val current = freshNote(viewModel.latestData()?.events.orEmpty(), note, path) ?: note
                written = if (choice == RecurringEditScope.Occurrence) {
                    // Une date laissée telle quelle veut dire « le jour ouvert » ; une date changée, que ce jour y est déplacé.
                    val seriesStart = (current.event as? NeoEvent.Rrule)?.startDate ?: (current.event as? NeoEvent.Recurring)?.startRecur
                    val target = if (snapshot.date.isNotEmpty() && snapshot.date != seriesStart) snapshot.date else day
                    viewModel.detachOccurrence(current, built, day, target, path)
                } else {
                    viewModel.updateEvent(current, built, path)
                }
            } while (written.error == WRITE_IGNORED && ++attempts < 12)
            val message = written.error
            if (message == WRITE_IGNORED) Notices.fail("Une autre écriture n'a pas fini : la modification de la série n'a pas été enregistrée.")
            else if (message != null) Notices.fail(message)
        }
        held = null
        baseline = snapshot
        val next = question.then
        if (next != null) next() else sheetState.slideOut(onDismiss)
    }

    // Un appui ailleurs (la grille, le bouton +, la barre du haut) ferme la fiche comme la croix, la question de portée comprise.
    var lastSignal by remember(key) { mutableStateOf(closeSignal) }
    LaunchedEffect(closeSignal) {
        if (closeSignal != lastSignal) {
            lastSignal = closeSignal
            // Un appui sur un autre bloc : la fiche cède la place sans glisser, après la question de portée s'il y en a une.
            if (held == null) leave(slide = !replacing)
        }
    }
    // Une fiche qui s'en va sans passer par la sortie (une autre s'ouvre à sa place) n'abandonne pas ce qui était en suspens.
    DisposableEffect(key) {
        onDispose {
            alive.set(false)
            writes.launch { flush() }
        }
    }
    // L'app qui passe en arrière-plan écrit sans attendre les 400 ms : un processus tué ensuite ne perd pas la dernière frappe.
    val lifecycle = remember(context) {
        generateSequence(context) { (it as? ContextWrapper)?.baseContext }.firstNotNullOfOrNull { it as? LifecycleOwner }?.lifecycle
    }
    DisposableEffect(key, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) writes.launch { flush() } }
        lifecycle?.addObserver(observer)
        onDispose { lifecycle?.removeObserver(observer) }
    }

    BackHandler(enabled = true) {
        when {
            dialog != null -> dialog = null
            held != null -> { held = null; onStay() }
            else -> leave(slide = true)
        }
    }

    val previous = if (series) adjacentOccurrenceId(stored?.event, displayId, -1) else null
    val following = if (series) adjacentOccurrenceId(stored?.event, displayId, 1) else null
    fun step(direction: Int) {
        val wanted = (if (direction > 0) following else previous) ?: return
        leave(slide = false) { onOpenOccurrence(wanted.first, wanted.second) }
    }

    SheetFrame(
        state = sheetState,
        onSwipedAway = { leave(slide = false) },
        header = {
            val headerStart = if (isDraftSheet) 22.dp else 14.dp
            Row(
                Modifier.fillMaxWidth().padding(start = headerStart, end = 14.dp, top = 17.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box {
                    val shape = RoundedCornerShape(6.dp)
                    Row(
                        Modifier.heightIn(min = 40.dp).let { if (editable) it.pressFill(shape, Neo.Hover, on = kindMenu) { kindMenu = true } else it.alpha(0.72f) }
                            .padding(horizontal = 8.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(kindLabel(kind), color = Neo.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        if (editable) Icon(NeoIcons.ChevronDown, null, tint = Neo.Text, modifier = Modifier.padding(start = 4.dp).size(13.dp))
                    }
                    Popover(kindMenu, { kindMenu = false }, PopoverSurface(Neo.Surface, 7.dp, 4.dp, true), width = 176.dp) {
                        for (choice in EntryKind.entries) {
                            PopoverEntry(kindLabel(choice), 44.dp, radius = 5.dp, active = choice == kind) {
                                kindMenu = false
                                val change = applyEntryKind(values, choice, birthdayReturn)
                                values = change.values
                                birthdayReturn = change.birthdayReturn
                            }
                        }
                    }
                }
                Box(Modifier.weight(1f))
                // Le bouton est toujours là dans l'ancienne ; en lecture seule son menu est vide (rien à dessiner).
                if (stored != null) {
                    Box {
                        HeaderButton(NeoIcons.Ellipsis, "Plus d'actions", 22.dp, on = overflowMenu) { if (editable) overflowMenu = true }
                        Popover(overflowMenu && editable, { overflowMenu = false }, PopoverSurface(Neo.Surface, 6.dp, 4.dp, true), width = 182.dp, alignEnd = true) {
                            PopoverEntry("Dupliquer", 46.dp, textSize = 15, radius = 11.dp, icon = NeoIcons.CopyPlus, horizontalPadding = 12.dp) {
                                overflowMenu = false
                                held = null
                                writes.launch {
                                    val message = viewModel.duplicateEvent(stored, stored.calendarPath)
                                    if (message == null) Notices.show("Événement dupliqué") else if (message != WRITE_IGNORED) Notices.fail(message)
                                }
                                sheetState.slideOut(onDismiss)
                            }
                            PopoverEntry(
                                if (isTask(stored.event)) "Supprimer la tâche" else "Supprimer l'événement", 46.dp, textSize = 15, radius = 11.dp,
                                icon = NeoIcons.Trash2, color = Neo.Danger, iconTint = Neo.Danger, horizontalPadding = 12.dp,
                            ) {
                                overflowMenu = false
                                dialog = if (series && occurrenceDate != null && needsOccurrenceChoice(stored.event, displayId.orEmpty())) {
                                    SheetDialog.DeleteOccurrence(isTask(stored.event))
                                } else {
                                    SheetDialog.DeleteNote(isTask(stored.event))
                                }
                            }
                        }
                    }
                }
                HeaderButton(NeoIcons.Close, "Fermer", 22.dp) { leave(slide = true) }
            }
        },
        body = {
            val keyboard = LocalSoftwareKeyboardController.current
            val focusManager = LocalFocusManager.current
            // Une fiche en lecture seule ne fait jamais monter le clavier, et la fermer le range.
            LaunchedEffect(editable) { if (!editable) { focusManager.clearFocus(); keyboard?.hide() } }
            DisposableEffect(Unit) { onDispose { keyboard?.hide() } }
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)
                    // Un champ qui prend le curseur déploie le brouillon (`onFocusIn` de useSheetDrag).
                    .onFocusChanged { if (it.hasFocus && isDraftSheet && sheetState.stop != SheetStop.Full) sheetState.glideTo(SheetStop.Full) },
            ) {
                TitleRow(values.title, editable, isDraftSheet) { values = values.copy(title = it) }
                Rule()

                ScheduleFields(values, editable, data.timeFormat24h, data.firstDay, canClearDate = stored != null) { values = it }
                if (values.date.isNotEmpty()) {
                    val steps = if (previous != null || following != null) SeriesSteps(previous != null, following != null, ::step) else null
                    RepeatField(values, editable, data.firstDay, steps) { values = it }
                }
                Spacer(Modifier.height(8.5.dp))
                Rule()
                Spacer(Modifier.height(2.dp))

                CalendarField(
                    calendars = editableCalendars,
                    selectedIndex = values.calendarIndex,
                    readOnlyName = calendarOfNote?.name,
                    editable = editable,
                ) { values = values.copy(calendarIndex = it) }
                Spacer(Modifier.height(6.dp))

                // Rien à annoncer pour ce qui n'a pas de moment (`form.date || form.isRecurring`).
                if (values.date.isNotEmpty() || values.isRecurring) {
                    RemindersField(values.reminders, values.allDay, editable) { values = values.copy(reminders = it) }
                }

                LocationField(
                    location = values.location,
                    geo = stored?.event?.geo,
                    editable = editable,
                    mapsApp = data.mapsApp,
                    mapsTravelMode = data.mapsTravelMode,
                ) { values = values.copy(location = it) }
                // Un lieu rempli (lien) pèse 9 px de moins qu'un champ vide (`min-height: 44px` des champs, pas du bouton).
                Spacer(Modifier.height(if (values.location.isEmpty()) 9.5.dp else 5.5.dp))
                Rule()
                Spacer(Modifier.height(5.dp))

                val open: (String) -> Unit = { targetPath ->
                    if (ExternalOpen.isWebTarget(targetPath)) {
                        ExternalOpen.openLink(context, targetPath)
                    } else {
                        scope.launch {
                            ExternalOpen.openAttachment(context, viewModel.attachmentStorage(), stored?.relativePath.orEmpty(), targetPath)
                        }
                    }
                }
                DescriptionField(values.description, editable, { values = values.copy(description = it) }, open, descriptionEditor)
                LinksField(values.description, open)

                error?.let {
                    Text(
                        it,
                        color = Neo.Danger, fontSize = 13.sp,
                        modifier = Modifier.padding(start = ICON_COLUMN_START, end = 16.dp, top = 10.dp),
                    )
                }
            }
            // La barre au-dessus du clavier : tant que le curseur est dans la description.
            if (editable && descriptionEditor.focused) {
                DescriptionToolbar(
                    descriptionEditor,
                    // Une ébauche n'est pas encore une note : il n'y a pas de dossier où ranger le fichier (`!eventId`).
                    attachDisabled = stored == null || attaching,
                    onAttach = { descriptionEditor.holdFocus = true; pickFiles.launch(arrayOf("*/*")) },
                    onLink = { descriptionEditor.holdFocus = true; linkDialog = descriptionEditor.value.selection },
                )
            }
        },
    )

    linkDialog?.let { selection ->
        AddLinkDialog(
            existing = remember(values.description) { readInlineLinks(values.description).map { it.target } },
            onInsert = { descriptionEditor.insert(it, selection) },
            onDismiss = { linkDialog = null; descriptionEditor.holdFocus = false },
        )
    }
    held?.let { question ->
        ScopeDialog(
            question.changes, question.isTask,
            onChoose = { choice -> answer(choice, question) },
            onCancel = { held = null; onStay() },
        )
    }
    when (val shown = dialog) {
        null -> Unit
        is SheetDialog.DeleteNote -> ConfirmDialog(
            title = if (shown.isTask) "Supprimer la tâche ?" else "Supprimer l'événement ?",
            message = "La note est supprimée du dossier.",
            confirm = "Supprimer",
            onConfirm = {
                dialog = null
                val note = stored ?: return@ConfirmDialog
                writes.launch {
                    val message = viewModel.deleteEvent(note)
                    if (message != null && message != WRITE_IGNORED) Notices.fail(message)
                }
                held = null
                sheetState.slideOut(onDismiss)
            },
            onCancel = { dialog = null },
        )
        is SheetDialog.DeleteOccurrence -> DeleteOccurrenceDialog(
            isTask = shown.isTask,
            onChoose = { following ->
                dialog = null
                val note = stored ?: return@DeleteOccurrenceDialog
                writes.launch {
                    val message = viewModel.deleteOccurrence(note, occurrenceDate.orEmpty(), following)
                    if (message != null && message != WRITE_IGNORED) Notices.fail(message)
                }
                held = null
                sheetState.slideOut(onDismiss)
            },
            onCancel = { dialog = null },
        )
        else -> Unit
    }
}

/** Le titre : 16 sp dans une ligne (padding 6 / 8, marge 0 10 8, rayon 6, bord transparent), 25 sp / 650 sur un brouillon. */
@Composable
private fun TitleRow(title: String, editable: Boolean, draft: Boolean, onChange: (String) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(6.dp)
    val size = if (draft) 25.sp else 16.sp
    val weight = if (draft) FontWeight(650) else FontWeight.Normal
    Box(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = if (draft) 4.dp else 17.dp, bottom = if (draft) 12.dp else 15.dp)
            .background(if (focused) Neo.Hover else Color.Transparent, shape)
            .border(1.dp, Color.Transparent, shape)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        if (title.isEmpty()) Text("Titre", color = Neo.TextFaint, fontSize = size, fontWeight = weight)
        BasicTextField(
            title,
            onChange,
            enabled = editable,
            textStyle = TextStyle(color = Neo.Text, fontSize = size, fontWeight = weight),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
        )
    }
}

/** Le filet entre deux blocs : 1 dp, de la colonne d'icônes (26 dp) au bord droit. */
@Composable
private fun Rule() {
    Box(Modifier.fillMaxWidth().padding(start = 26.dp).height(1.dp).background(Neo.Border))
}

/** Un bouton de l'en-tête : 48x48, rayon 12, glyphe `TextSecondary` de `glyph` dp. */
@Composable
private fun HeaderButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, glyph: androidx.compose.ui.unit.Dp, on: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(48.dp).pressFill(RoundedCornerShape(12.dp), Neo.Hover, on = on, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, tint = Neo.TextSecondary, modifier = Modifier.size(glyph)) }
}
