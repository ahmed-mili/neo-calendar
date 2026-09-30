package com.ahmed.neocalendar.nativeapp

import android.app.Application
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.grid.DEFAULT_DAY_COUNT
import com.ahmed.neocalendar.core.grid.buildCalendarModels
import com.ahmed.neocalendar.core.grid.clampDayCount
import com.ahmed.neocalendar.core.layout.AllDayLanesResult
import com.ahmed.neocalendar.core.layout.GridEvent
import com.ahmed.neocalendar.core.layout.packAllDayLanes
import com.ahmed.neocalendar.core.form.nowUtcIso
import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.preferences.parseWorkspacePreferences
import com.ahmed.neocalendar.core.recurrence.DisplayEvent
import com.ahmed.neocalendar.core.recurrence.neoEventToDisplayEvents
import com.ahmed.neocalendar.core.workspace.EventWriter
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

private const val TREE_PREFS = "neo_android"
private const val TREE_KEY = "tree_uri"
private const val DEVICE_PREFS = "neo_native"
private const val KEY_DAY_COUNT = "dayCount"
private const val KEY_ALLDAY_COLLAPSED = "allDayCollapsed"

/** Deux rechargements du dossier ne se suivent pas à moins de 400 ms (inventaire §1). */
private const val MIN_RELOAD_GAP_MS = 400L

/** Les occurrences se calculent par tranches de 14 jours, gardées tant que le dossier ne change pas. */
private const val CHUNK_DAYS = 14L

/** Ce que l'écran lit du dossier : tout est déjà calculé, rien ne touche plus le disque. */
class WorkspaceData(
    val calendars: List<CalendarModel>,
    val events: List<StoredEvent>,
    val firstDay: Int,
    val freeScroll: Boolean,
    val timeFormat24h: Boolean,
    val hiddenCalendarIds: Set<String>,
    val defaultCalendarPath: String?,
    val defaultEventsAsTasks: Boolean,
    val mapsApp: String,
    val mapsTravelMode: String,
)

sealed interface ScreenState {
    data object Loading : ScreenState
    data class Failed(val message: String) : ScreenState
    data class Ready(val data: WorkspaceData) : ScreenState
}

/**
 * Les occurrences de la fenêtre lue, sans les calendriers masqués : les
 * évènements horodatés rangés par jour (un évènement qui traverse minuit est
 * sur chacun des jours qu'il touche), et les barres de la bande journée entière.
 */
class Occurrences(
    /** Jours (epochDay) couverts par cette fenêtre, bornes incluses. */
    val fromDay: Long,
    val toDay: Long,
    val timed: Map<Long, List<DisplayEvent>>,
    val lanes: AllDayLanesResult,
    val allDay: List<DisplayEvent>,
) {
    companion object {
        val Empty = Occurrences(0, -1, emptyMap(), AllDayLanesResult(emptyList(), 0), emptyList())
    }
}

class NativeViewModel(app: Application) : AndroidViewModel(app) {
    private val zone: ZoneId get() = ZoneId.systemDefault()
    private val devicePrefs = app.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)

    private val _screen = MutableStateFlow<ScreenState>(ScreenState.Loading)
    val screen: StateFlow<ScreenState> = _screen.asStateFlow()

    /** Un rechargement raté alors que des notes sont déjà à l'écran : on les garde et on le dit. */
    private val _reloadError = MutableStateFlow<String?>(null)
    val reloadError: StateFlow<String?> = _reloadError.asStateFlow()

    private val _dayCount = MutableStateFlow(clampDayCount(devicePrefs.getInt(KEY_DAY_COUNT, DEFAULT_DAY_COUNT)))
    val dayCount: StateFlow<Int> = _dayCount.asStateFlow()

    private val _allDayCollapsed = MutableStateFlow(devicePrefs.getBoolean(KEY_ALLDAY_COLLAPSED, false))
    val allDayCollapsed: StateFlow<Boolean> = _allDayCollapsed.asStateFlow()

    /** L'œil du tiroir : masque pour la session, n'écrit rien (l'écriture vient avec les réglages). */
    private val _hidden = MutableStateFlow<Set<String>>(emptySet())
    val hidden: StateFlow<Set<String>> = _hidden.asStateFlow()

    private val _occurrences = MutableStateFlow(Occurrences.Empty)
    val occurrences: StateFlow<Occurrences> = _occurrences.asStateFlow()

    private var lastReloadAt = 0L
    private var loading: Job? = null

    /** Un seul fil calcule : le cache des tranches n'est touché que par lui. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val compute: CoroutineDispatcher = Dispatchers.Default.limitedParallelism(1)
    private val chunkCache = HashMap<Long, List<DisplayEvent>>()
    private var wantedFrom = 0L
    private var wantedTo = -1L
    private var calendarById: Map<String, CalendarModel> = emptyMap()
    private var computeJob: Job? = null

    fun setDayCount(n: Int) {
        val clamped = clampDayCount(n)
        _dayCount.value = clamped
        devicePrefs.edit().putInt(KEY_DAY_COUNT, clamped).apply()
    }

    fun setAllDayCollapsed(collapsed: Boolean) {
        _allDayCollapsed.value = collapsed
        devicePrefs.edit().putBoolean(KEY_ALLDAY_COLLAPSED, collapsed).apply()
    }

    fun toggleCalendar(id: String) {
        _hidden.update { if (id in it) it - id else it + id }
        publish()
    }

    /** Relit le dossier ; ignoré s'il y en a une en cours ou si la dernière lecture date de moins de 400 ms. */
    fun reload(force: Boolean = false) {
        val now = SystemClock.elapsedRealtime()
        // Après une écriture, la lecture en cours (partie avant elle) est périmée : on la remplace.
        if (force) loading?.cancel() else if (loading?.isActive == true) return
        if (!force && lastReloadAt != 0L && now - lastReloadAt < MIN_RELOAD_GAP_MS) return
        lastReloadAt = now
        loading = viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { read() }
                val firstLoad = _screen.value !is ScreenState.Ready
                // Les calendriers masqués de la session survivent au rechargement ; au premier chargement, ceux du fichier.
                if (firstLoad) _hidden.value = data.hiddenCalendarIds
                val known = data.calendars.map { it.id }.toSet()
                _hidden.update { it.filterTo(HashSet()) { id -> id in known } }
                withContext(compute) {
                    chunkCache.clear()
                    calendarById = data.calendars.associateBy { it.id }
                    eventsForCompute = data.events
                }
                _reloadError.value = null
                _screen.value = ScreenState.Ready(data)
                publish()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = e.message ?: e.toString()
                if (_screen.value is ScreenState.Ready) _reloadError.value = message
                else _screen.value = ScreenState.Failed(message)
            }
        }
    }

    @Volatile
    private var eventsForCompute: List<StoredEvent> = emptyList()

    /** Dit à quels jours l'écran regarde ; les tranches manquantes se calculent hors du fil principal. */
    fun ensureWindow(firstDay: Long, lastDay: Long) {
        val published = _occurrences.value
        // Hystérésis : la fenêtre publiée garde une tranche de marge, on ne la décale qu'en la frôlant.
        if (firstDay - CHUNK_DAYS >= published.fromDay && lastDay + CHUNK_DAYS <= published.toDay) return
        wantedFrom = firstDay
        wantedTo = lastDay
        publish()
    }

    private fun publish() {
        val from = wantedFrom
        val to = wantedTo
        if (to < from) return
        computeJob?.cancel()
        computeJob = viewModelScope.launch(compute) {
            val first = Math.floorDiv(from, CHUNK_DAYS) - 2
            val last = Math.floorDiv(to, CHUNK_DAYS) + 2
            val hiddenNow = _hidden.value
            val raw = LinkedHashMap<String, DisplayEvent>()
            for (chunk in first..last) {
                val list = chunkCache.getOrPut(chunk) { computeChunk(chunk) }
                for (e in list) raw.putIfAbsent(e.id, e)
            }
            val fromDay = first * CHUNK_DAYS
            val toDay = last * CHUNK_DAYS + CHUNK_DAYS - 1
            _occurrences.value = assemble(raw.values.filter { it.calendarId !in hiddenNow }, fromDay, toDay)
        }
    }

    private fun computeChunk(chunk: Long): List<DisplayEvent> {
        val startDay = LocalDate.ofEpochDay(chunk * CHUNK_DAYS)
        val endDay = startDay.plusDays(CHUNK_DAYS)
        val start = startDay.atStartOfDay(zone).toInstant()
        val end = endDay.atStartOfDay(zone).toInstant()
        val out = ArrayList<DisplayEvent>()
        for (stored in eventsForCompute) {
            val calendar = calendarById[stored.calendarId] ?: continue
            // Un jour de marge avant : une occurrence qui a commencé la veille et finit dans la tranche.
            val occurrences = neoEventToDisplayEvents(
                stored.event, stored.id, calendar.id, calendar.name, calendar.color, calendar.editable,
                start.minusSeconds(24 * 3600), end.minusMillis(1),
            )
            for (o in occurrences) if (o.end > start && o.start < end || (o.start == o.end && o.start >= start && o.start < end)) out += o
        }
        return out
    }

    private fun assemble(events: List<DisplayEvent>, fromDay: Long, toDay: Long): Occurrences {
        val timed = HashMap<Long, MutableList<DisplayEvent>>()
        val allDay = ArrayList<DisplayEvent>()
        for (e in events.sortedWith(compareBy({ it.start }, { it.id }))) {
            if (e.allDay) {
                allDay += e
                continue
            }
            val firstDay = e.start.atZone(zone).toLocalDate().toEpochDay()
            // La fin est exclusive : un évènement qui finit à minuit ne touche pas le jour suivant.
            val lastInstant = if (e.end > e.start) e.end.minusMillis(1) else e.start
            val lastDay = lastInstant.atZone(zone).toLocalDate().toEpochDay()
            for (day in maxOf(firstDay, fromDay)..minOf(lastDay, toDay)) timed.getOrPut(day) { ArrayList() } += e
        }
        val days: List<Instant> = (fromDay..toDay).map { LocalDate.ofEpochDay(it).atStartOfDay(zone).toInstant() }
        val order = allDay.withIndex().associate { (index, e) -> e.id to index.toLong() }
        val lanes = packAllDayLanes(
            allDay.map { GridEvent(it.id, it.start, it.end) },
            days,
            arrivalOf = { order.getValue(it.id) },
            zone = zone,
        )
        return Occurrences(fromDay, toDay, timed, lanes, allDay)
    }

    /** Le dossier choisi, avec les mêmes contrôles que `MainActivity.tree()` ; `write` exige aussi l'autorisation d'écrire. */
    private fun treeUri(write: Boolean): Uri {
        val context = getApplication<Application>()
        val raw = context.getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty()
        if (raw.isEmpty()) throw Exception("Sélectionnez d'abord un dossier de notes.")
        val uri = Uri.parse(raw)
        val grants = context.contentResolver.persistedUriPermissions.filter { it.uri == uri }
        if (grants.none { it.isReadPermission }) throw Exception("L'autorisation du dossier a été révoquée. Sélectionnez-le à nouveau.")
        if (write && grants.none { it.isWritePermission }) {
            throw Exception("L'autorisation d'écrire dans le dossier a été révoquée. Sélectionnez-le à nouveau.")
        }
        return uri
    }

    /** Les écritures se suivent : une seule à la fois, puis le dossier est relu, qu'elle ait réussi ou non. */
    private val writeLock = Mutex()

    /** Rend le message de l'erreur, ou null quand l'écriture a réussi. */
    private suspend fun write(block: (EventWriter, SafWorkspaceStorage) -> Unit): String? {
        val error = writeLock.withLock {
            withContext(Dispatchers.IO) {
                try {
                    val storage = SafWorkspaceStorage(getApplication(), treeUri(write = true))
                    block(EventWriter(storage), storage)
                    null
                } catch (e: Exception) {
                    e.message ?: e.toString()
                }
            }
        }
        reload(force = true)
        return error
    }

    suspend fun createEvent(calendarPath: String, payload: JsonObject): String? =
        write { writer, _ -> writer.create(calendarPath, payload) }

    suspend fun updateEvent(stored: StoredEvent, payload: JsonObject, targetCalendarPath: String): String? =
        write { writer, _ -> writer.update(stored, payload, targetCalendarPath) }

    suspend fun detachOccurrence(
        stored: StoredEvent,
        payload: JsonObject,
        occurrenceDate: String,
        date: String,
        targetCalendarPath: String,
    ): String? = write { writer, _ ->
        writer.detachOccurrence(stored, payload, occurrenceDate, date, targetCalendarPath, ::nowUtcIso)
    }

    suspend fun deleteEvent(stored: StoredEvent): String? = write { writer, _ -> writer.delete(stored) }

    suspend fun deleteOccurrence(stored: StoredEvent, date: String, following: Boolean): String? =
        write { writer, _ -> writer.deleteOccurrence(stored, date, following) }

    suspend fun duplicateEvent(stored: StoredEvent, calendarPath: String): String? =
        write { writer, _ -> writer.duplicate(stored, calendarPath) }

    /** Pour ouvrir une pièce jointe : le dossier en lecture, sans rien écrire. */
    fun attachmentStorage(): SafWorkspaceStorage? = runCatching { SafWorkspaceStorage(getApplication(), treeUri(write = false)) }.getOrNull()

    /** Lit le dossier : mêmes contrôles que `MainActivity.tree()`, puis le noyau fait le reste. */
    private fun read(): WorkspaceData {
        val context = getApplication<Application>()
        val workspace = loadWorkspace(SafWorkspaceStorage(context, treeUri(write = false)))
        // La lecture tolérante du noyau : un fichier étrange ne plante pas, il retombe sur les valeurs lues une à une.
        val preferences = parseWorkspacePreferences(workspace.preferences)
        val calendars = buildCalendarModels(workspace.calendars, preferences, AppLocale.current)
        val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
        val events = workspace.eventFiles.mapNotNull {
            parseStoredEvent(EventFile(it.relativePath, it.calendarPath, it.fileName, it.contents), known)
        }
        val hiddenPaths = (preferences["hiddenCalendarPaths"] as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
        fun flag(key: String, fallback: Boolean) =
            (preferences[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: fallback
        return WorkspaceData(
            calendars = calendars,
            events = events,
            firstDay = (preferences["firstDay"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 1,
            freeScroll = flag("freeScroll", false),
            timeFormat24h = flag("timeFormat24h", true),
            hiddenCalendarIds = hiddenPaths.map { calendarIdFromPath(it) }.toSet(),
            defaultCalendarPath = (preferences["defaultCalendarPath"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            defaultEventsAsTasks = flag("defaultEventsAsTasks", false),
            mapsApp = (preferences["mapsApp"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "ask",
            mapsTravelMode = (preferences["mapsTravelMode"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "auto",
        )
    }
}
