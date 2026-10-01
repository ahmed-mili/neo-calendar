package com.ahmed.neocalendar.nativeapp

import android.app.Application
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.icsLinksOf
import com.ahmed.neocalendar.core.preferences.withIcsFeedAdded
import com.ahmed.neocalendar.core.preferences.withIcsRefreshOverridesCleared
import com.ahmed.neocalendar.core.description.attachmentFolderName
import com.ahmed.neocalendar.core.description.attachmentMarkdownPath
import com.ahmed.neocalendar.core.description.uniqueAttachmentName
import com.ahmed.neocalendar.core.preferences.withPrayerColor
import com.ahmed.neocalendar.core.preferences.withPrayerJumua
import com.ahmed.neocalendar.core.preferences.withPrayerMosque
import com.ahmed.neocalendar.core.preferences.withTimezoneAdded
import com.ahmed.neocalendar.core.preferences.withTimezoneRemoved
import com.ahmed.neocalendar.core.tasks.misfiledEventsOf
import com.ahmed.neocalendar.core.timezones.timezoneAdded
import com.ahmed.neocalendar.core.preferences.withIcsFeedEdited
import com.ahmed.neocalendar.core.preferences.withIcsFeedRemoved
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
import com.ahmed.neocalendar.core.preferences.withCalendarColor
import com.ahmed.neocalendar.core.preferences.withCalendarHidden
import com.ahmed.neocalendar.core.preferences.withCalendarOrder
import com.ahmed.neocalendar.core.preferences.withCalendarReminder
import com.ahmed.neocalendar.core.preferences.withDefaultCalendar
import com.ahmed.neocalendar.core.preferences.withHiddenCalendars
import com.ahmed.neocalendar.core.preferences.withHolidayCalendar
import com.ahmed.neocalendar.core.preferences.withHolidayRemoved
import com.ahmed.neocalendar.core.holidays.holidayDisplayEvents
import com.ahmed.neocalendar.core.holidays.holidaySourcesOf
import com.ahmed.neocalendar.core.preferences.withSetting
import com.ahmed.neocalendar.core.workspace.EventWriter
import com.ahmed.neocalendar.core.workspace.createFolder
import com.ahmed.neocalendar.core.workspace.deleteFolder
import com.ahmed.neocalendar.core.workspace.renameCalendar as renameCalendarAndPreferences
import com.ahmed.neocalendar.core.workspace.updatePreferences
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import com.ahmed.neocalendar.core.workspace.WriteGate
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/** Rendu par une écriture refusée parce qu'une autre était en cours : ni un succès ni une erreur à afficher. */
const val WRITE_IGNORED = "\u0000write-ignored"

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
data class WorkspaceData(
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
    val reminderMinutes: List<Long>,
    val calendarReminderMinutes: Map<String, List<Long>>,
    /** Les liens ICS du fichier de préférences, et la fréquence par défaut de ceux qui n'ont pas la leur. */
    val icsLinks: List<IcsLink> = emptyList(),
    val icsDefaultMinutes: Int = 60,
    /** Les jours des calendriers de jours fériés (lecture seule, calculés sur l'appareil), de cinq ans avant à dix ans après. */
    val holidays: List<DisplayEvent> = emptyList(),
    /** Vue initiale (`initialView`), clic sur un jour du mois et fuseaux ajoutés : lus et écrits dans le fichier partagé. */
    val initialDesktop: String = "week",
    val initialMobile: String = "3days",
    val clickToCreateFromMonth: Boolean = true,
    val secondaryTimezones: List<String> = emptyList(),
    /** Réglages de prière, par chemin de calendrier : la mosquée suivie, la couleur des traits, les séances de Jumu'a choisies. */
    val prayerMosques: Map<String, String> = emptyMap(),
    val prayerColors: Map<String, String> = emptyMap(),
    val prayerJumua: Map<String, List<String>> = emptyMap(),
)

/** Où une notification ou le widget veut aller : la fiche d'un évènement, ou un brouillon. */
sealed interface NativeRoute {
    data class Event(val id: String) : NativeRoute
    data object NewEvent : NativeRoute
}

sealed interface ScreenState {
    data object Loading : ScreenState

    /** Aucun dossier de notes choisi (premier lancement) : rien n'est lu ni écrit avant ce choix. */
    data object NeedsFolder : ScreenState
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

    /** L'œil du tiroir : les calendriers masqués, lus du fichier de préférences et écrits par `toggleCalendar`. */
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
    @Volatile private var calendarById: Map<String, CalendarModel> = emptyMap()
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

    /** Masque ou affiche un calendrier : l'écran suit tout de suite, le fichier est relu puis écrit (clé `hiddenCalendarPaths` seule). */
    fun toggleCalendar(id: String) {
        val calendar = calendarById[id] ?: return
        val hide = id !in _hidden.value
        _solo.value = null
        _hidden.update { if (hide) it + id else it - id }
        publish()
        changePreferences { withCalendarHidden(it, calendar.relativePath, hide) }
    }

    /**
     * « N'afficher que ce calendrier » (useCalendarVisibility.ts) : tous les autres sont masqués, la liste d'avant est gardée
     * en mémoire (pas dans le fichier) ; le même geste sur le même calendrier la rétablit. Un masquage à la main met fin à la séance.
     */
    fun showOnly(id: String) {
        val calendars = calendarById.values
        val target = calendarById[id] ?: return
        val solo = _solo.value
        if (solo?.first == id) {
            _solo.value = null
            setHiddenPaths(solo.second)
            return
        }
        val before = calendars.filter { it.id in _hidden.value }.map { it.relativePath }
        _solo.value = id to before
        setHiddenPaths(calendars.filter { it.id != target.id }.map { it.relativePath })
    }

    private fun setHiddenPaths(paths: List<String>) {
        val ids = calendarById.values.filter { it.relativePath in paths }.map { it.id }.toSet()
        _hidden.value = ids
        publish()
        changePreferences { withHiddenCalendars(it, paths) }
    }

    /** Le calendrier isolé par « n'afficher que ce calendrier » et les chemins qui étaient masqués avant, ou null. */
    private val _solo = MutableStateFlow<Pair<String, List<String>>?>(null)
    val solo: StateFlow<Pair<String, List<String>>?> = _solo.asStateFlow()

    fun setDefaultCalendar(path: String) = changePreferences { withDefaultCalendar(it, path) }

    fun setCalendarColor(path: String, color: String) = changePreferences { withCalendarColor(it, path, color) }

    fun setCalendarOrder(paths: List<String>) = changePreferences { withCalendarOrder(it, paths) }

    /** `minutes` nul : le calendrier suit de nouveau le rappel général. */
    fun setCalendarReminder(path: String, minutes: List<Long>?) {
        patchData { d -> d.copy(calendarReminderMinutes = if (minutes == null) d.calendarReminderMinutes - path else d.calendarReminderMinutes + (path to minutes)) }
        changePreferences { withCalendarReminder(it, path, minutes) }
    }

    /** Un réglage simple : l'écran le montre tout de suite, le fichier suit. */
    fun setPreference(key: String, value: JsonPrimitive) {
        patchData { d ->
            when (key) {
                "firstDay" -> d.copy(firstDay = value.content.toInt())
                "timeFormat24h" -> d.copy(timeFormat24h = value.booleanOrNull ?: d.timeFormat24h)
                "freeScroll" -> d.copy(freeScroll = value.booleanOrNull ?: d.freeScroll)
                "defaultEventsAsTasks" -> d.copy(defaultEventsAsTasks = value.booleanOrNull ?: d.defaultEventsAsTasks)
                "mapsTravelMode" -> d.copy(mapsTravelMode = value.content)
                "mapsApp" -> d.copy(mapsApp = value.content)
                "clickToCreateEventFromMonthView" -> d.copy(clickToCreateFromMonth = value.booleanOrNull ?: d.clickToCreateFromMonth)
                "icsDefaultRefreshMinutes" -> d.copy(icsDefaultMinutes = value.content.toIntOrNull() ?: d.icsDefaultMinutes)
                else -> d
            }
        }
        changePreferences { withSetting(it, key, value) }
    }

    /** La vue initiale (`initialView.desktop` ou `.mobile`) : l'objet est réécrit en gardant l'autre clé. */
    fun setInitialView(which: String, value: String) {
        patchData { if (which == "desktop") it.copy(initialDesktop = value) else it.copy(initialMobile = value) }
        changePreferences { prefs ->
            val current = (prefs["initialView"] as? JsonObject).orEmpty()
            withSetting(prefs, "initialView", JsonObject(current + (which to JsonPrimitive(value))))
        }
    }

    /** La mosquée dont un calendrier suit les horaires ; `null` : aucune. */
    fun setPrayerMosque(path: String, mosqueId: String?) {
        patchData { d -> d.copy(prayerMosques = if (mosqueId == null) d.prayerMosques - path else d.prayerMosques + (path to mosqueId)) }
        changePreferences { withPrayerMosque(it, path, mosqueId) }
    }

    /** La couleur des traits de prière ; `null` : celle du calendrier. */
    fun setPrayerColor(path: String, hex: String?) {
        patchData { d -> d.copy(prayerColors = if (hex == null) d.prayerColors - path else d.prayerColors + (path to hex)) }
        changePreferences { withPrayerColor(it, path, hex) }
    }

    /** Les séances de Jumu'a choisies ; `null` : celles de la mosquée suivie. */
    fun setPrayerJumua(path: String, times: List<String>?) {
        patchData { d -> d.copy(prayerJumua = if (times == null) d.prayerJumua - path else d.prayerJumua + (path to times)) }
        changePreferences { withPrayerJumua(it, path, times) }
    }

    /** Un fuseau de plus (la colonne apparaît tout de suite) ; un nom inconnu, vide ou déjà présent ne change rien. */
    fun addTimezone(input: String) {
        patchData { d -> d.copy(secondaryTimezones = timezoneAdded(d.secondaryTimezones, input) ?: d.secondaryTimezones) }
        changePreferences { withTimezoneAdded(it, input) }
    }

    fun removeTimezone(zone: String) {
        patchData { d -> d.copy(secondaryTimezones = d.secondaryTimezones - zone) }
        changePreferences { withTimezoneRemoved(it, zone) }
    }

    /** « Appliquer à tous les liens » : chaque lien perd sa fréquence propre. */
    fun applyIcsFrequencyToAll() = changePreferences { withIcsRefreshOverridesCleared(it) }

    /**
     * « Reconvertir les tâches horaires en évènements » : une seule écriture pour toutes les notes (le dossier n'est relu qu'à la fin),
     * une note qui échoue est laissée telle quelle et ne compte pas. Rend le nombre de notes réécrites.
     */
    suspend fun convertMisfiledEvents(): Int {
        val notes = misfiledEventsOf(latestData()?.events.orEmpty())
        var converted = 0
        val error = write { writer, _ ->
            for (note in notes) {
                try {
                    writer.convertToPlainEvent(note)
                    converted++
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    android.util.Log.w("NeoNative", "note non reconvertie : ${note.relativePath}", e)
                }
            }
        }
        if (error != null && error != WRITE_IGNORED) _notices.tryEmit(error)
        return converted
    }

    /** Le rappel de toute l'application. */
    fun setReminders(minutes: List<Long>) {
        patchData { it.copy(reminderMinutes = minutes) }
        changePreferences { withSetting(it, "reminderMinutes", JsonArray(minutes.map { m -> JsonPrimitive(m) })) }
    }

    private fun patchData(change: (WorkspaceData) -> WorkspaceData) {
        (_screen.value as? ScreenState.Ready)?.let { _screen.value = ScreenState.Ready(change(it.data)) }
    }

    /** Les messages d'erreur des écritures sans attente (œil, couleur, réglages), affichés en toast. */
    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val notices: SharedFlow<String> = _notices.asSharedFlow()

    /** Une écriture de préférences à la fois, dans l'ordre des gestes ; chacune relit le fichier avant d'écrire. */
    private val prefsLock = Mutex()

    /** Écrit une préférence (relue juste avant) ; rend le message d'erreur, ou null. Une à la fois, dans l'ordre. */
    private suspend fun writePreferences(change: (JsonObject) -> JsonObject): String? = prefsLock.withLock {
        withContext(Dispatchers.IO) {
            try {
                updatePreferences(SafWorkspaceStorage(getApplication(), treeUri(write = true)), change)
                null
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                e.message ?: e.toString()
            }
        }
    }

    private fun changePreferences(change: (JsonObject) -> JsonObject) {
        viewModelScope.launch {
            val error = writePreferences(change)
            if (error != null) _notices.tryEmit(error)
            // Réussi ou non, l'écran repart du fichier.
            reload(force = true)
        }
    }

    // --- liens ICS -------------------------------------------------------------------------------

    private val icsSync = IcsSync(
        app,
        viewModelScope,
        { SafWorkspaceStorage(getApplication(), treeUri(write = true)) },
        ::writePreferences,
        { reload(force = true) },
    )

    /** L'état de chaque lien (dernière synchro, erreur) et ceux qui se synchronisent à l'instant. */
    val icsUi: StateFlow<IcsUi> = icsSync.ui

    /** Les liens dus d'après l'heure : au chargement, à la minuterie de 60 s, au retour dans l'app. */
    fun syncIcsDue() {
        val data = (_screen.value as? ScreenState.Ready)?.data ?: return
        icsSync.sync(data.icsLinks, data.icsDefaultMinutes)
    }

    /** « Actualiser » : ce lien, qu'il soit dû ou non. */
    fun refreshIcsLink(id: String) {
        val data = (_screen.value as? ScreenState.Ready)?.data ?: return
        icsSync.sync(data.icsLinks, data.icsDefaultMinutes, setOf(id))
    }

    /** Ajoute un lien au calendrier ; rend le message du refus, ou null. Le lien se synchronise dès la relecture. */
    suspend fun addIcsLink(calendarPath: String, name: String, url: String): String? {
        val error = writePreferences { withIcsFeedAdded(it, UUID.randomUUID().toString(), calendarPath, name, url) }
        reload(force = true)
        return error
    }

    fun editIcsLink(id: String, name: String? = null, refreshMinutes: Int? = null, address: String? = null) =
        changePreferences { withIcsFeedEdited(it, id, name, refreshMinutes, address) }

    /** Retire le lien du fichier ; ses notes restent dans le dossier. */
    fun removeIcsLink(id: String) {
        icsSync.forget(id)
        changePreferences { withIcsFeedRemoved(it, id) }
    }

    /** Relit le dossier ; ignoré s'il y en a une en cours ou si la dernière lecture date de moins de 400 ms. */
    fun reload(force: Boolean = false) {
        if (importing) return
        if (!hasTree()) {
            _screen.value = ScreenState.NeedsFolder
            return
        }
        // Jamais pendant une écriture : l'écriture relit le dossier elle-même quand elle finit.
        if (!force && writeGate.isBusy) return
        val now = SystemClock.elapsedRealtime()
        // Après une écriture, la lecture en cours (partie avant elle) est périmée : on la remplace.
        if (force) loading?.cancel() else if (loading?.isActive == true) return
        if (!force && lastReloadAt != 0L && now - lastReloadAt < MIN_RELOAD_GAP_MS) return
        lastReloadAt = now
        loading = viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { read() }
                // Les calendriers masqués sont ceux du fichier (le PC a pu en changer).
                _hidden.value = data.hiddenCalendarIds
                withContext(compute) {
                    chunkCache.clear()
                    calendarById = data.calendars.associateBy { it.id }
                    eventsForCompute = data.events
                    holidaysForCompute = data.holidays
                }
                _reloadError.value = null
                _screen.value = ScreenState.Ready(data)
                publish()
                pushToNativeServices(data)
                // Les liens dus se synchronisent sans attendre le réseau : les notes du disque sont déjà à l'écran.
                syncIcsDue()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = e.message ?: e.toString()
                if (_screen.value is ScreenState.Ready) _reloadError.value = message
                else _screen.value = ScreenState.Failed(message)
            }
        }
    }

    /**
     * Les rappels et le widget suivent chaque lecture réussie du dossier (au chargement, au retour dans l'app,
     * après chaque écriture), comme la WebView à chaque changement de ses évènements. Une lecture ratée n'y touche
     * pas : les derniers rappels et le dernier widget valent mieux que des listes vides.
     */
    private fun pushToNativeServices(data: WorkspaceData) {
        viewModelScope.launch(Dispatchers.Default) {
            try {
                val app = getApplication<Application>()
                val now = Instant.now()
                val events = upcomingOccurrences(data, now)
                writeReminders(app, data, events, now)
                writeWidget(app, data, events, now)
                withContext(Dispatchers.Main) { refreshWidgets(app) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                // Un rappel ou un widget qui n'a pas pu être posé ne vaut pas d'interrompre l'écran.
                android.util.Log.w("NeoNative", "rappels ou widget non écrits", e)
            }
        }
    }

    /** Ce qu'une notification, une ligne du widget ou son « + » demande d'ouvrir, gardé jusqu'à ce que le dossier soit lu. */
    private val _route = MutableStateFlow<NativeRoute?>(null)
    val route: StateFlow<NativeRoute?> = _route.asStateFlow()

    fun openRoute(route: NativeRoute) {
        _route.value = route
    }

    fun routeHandled() {
        _route.value = null
    }

    @Volatile
    private var eventsForCompute: List<StoredEvent> = emptyList()

    @Volatile
    private var holidaysForCompute: List<DisplayEvent> = emptyList()

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
        // Les jours fériés : déjà calculés à la lecture, il ne reste qu'à prendre ceux de la tranche.
        for (holiday in holidaysForCompute) if (holiday.end > start && holiday.start < end) out += holiday
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

    /**
     * Une seule écriture à la fois, puis le dossier est relu, qu'elle ait réussi ou non. Un geste qui
     * arrive pendant est IGNORÉ ([WRITE_IGNORED]), pas mis en file : il porte un instantané périmé
     * (double appui sur Supprimer, deux déplacements d'affilée du même jour).
     */
    private val writeGate = WriteGate()
    private val _writing = MutableStateFlow(false)

    /** Une écriture est en cours : les boutons Enregistrer, Supprimer, Dupliquer se désactivent. */
    val writing: StateFlow<Boolean> = _writing.asStateFlow()

    /** Rend le message de l'erreur, null quand l'écriture a réussi, [WRITE_IGNORED] quand une autre était en cours. */
    private suspend fun write(block: (EventWriter, SafWorkspaceStorage) -> Unit): String? {
        if (!writeGate.tryEnter()) return WRITE_IGNORED
        _writing.value = true
        try {
            val error = withContext(Dispatchers.IO) {
                try {
                    val storage = SafWorkspaceStorage(getApplication(), treeUri(write = true))
                    block(EventWriter(storage), storage)
                    null
                } catch (e: Exception) {
                    e.message ?: e.toString()
                }
            }
            reload(force = true)
            // Le prochain geste part de la note relue, pas de l'instantané d'avant l'écriture.
            loading?.join()
            return error
        } finally {
            writeGate.leave()
            _writing.value = false
        }
    }

    /** Le dossier tel qu'il est lu à l'instant (les écritures le relisent avant de rendre la main). */
    fun latestData(): WorkspaceData? = (_screen.value as? ScreenState.Ready)?.data

    /**
     * Une écriture de note : le message du refus (null si elle a réussi) et la note telle que le dossier la rend après
     * relecture, pour que le geste suivant parte d'elle et non de l'instantané d'avant.
     */
    class NoteWrite(val error: String?, val note: StoredEvent?)

    private suspend fun writeNote(block: (EventWriter, SafWorkspaceStorage) -> com.ahmed.neocalendar.core.workspace.WrittenEvent): NoteWrite {
        var written: com.ahmed.neocalendar.core.workspace.WrittenEvent? = null
        val error = write { writer, storage -> written = block(writer, storage) }
        val note = written?.let { w -> latestData()?.events?.firstOrNull { it.relativePath == w.relativePath } }
        return NoteWrite(error, note)
    }

    suspend fun createEvent(calendarPath: String, payload: JsonObject): NoteWrite =
        writeNote { writer, _ -> writer.create(calendarPath, payload) }

    suspend fun updateEvent(stored: StoredEvent, payload: JsonObject, targetCalendarPath: String): NoteWrite =
        writeNote { writer, _ -> writer.update(stored, payload, targetCalendarPath) }

    suspend fun detachOccurrence(
        stored: StoredEvent,
        payload: JsonObject,
        occurrenceDate: String,
        date: String,
        targetCalendarPath: String,
    ): NoteWrite = writeNote { writer, _ ->
        writer.detachOccurrence(stored, payload, occurrenceDate, date, targetCalendarPath, ::nowUtcIso)
    }

    suspend fun deleteEvent(stored: StoredEvent): String? = write { writer, _ -> writer.delete(stored) }

    suspend fun deleteOccurrence(stored: StoredEvent, date: String, following: Boolean): String? =
        write { writer, _ -> writer.deleteOccurrence(stored, date, following) }

    suspend fun duplicateEvent(stored: StoredEvent, calendarPath: String): String? =
        write { writer, _ -> writer.duplicate(stored, calendarPath) }

    /** Déplacer (`resize` faux) ou redimensionner un évènement horodaté ; un jour de série en sort, la série ne change que par `skipDates`. */
    suspend fun rescheduleEvent(stored: StoredEvent, displayId: String, start: Instant, end: Instant, resize: Boolean): String? =
        write { writer, _ -> writer.reschedule(stored, displayId, start, end, resize, zone, ::nowUtcIso) }

    /** Un évènement glissé vers ou depuis la bande « journée entière » : il change de drapeau, de date et d'heures. */
    suspend fun rescheduleToSlot(stored: StoredEvent, displayId: String, slot: com.ahmed.neocalendar.core.grid.DropSlot): String? =
        write { writer, _ -> writer.rescheduleToSlot(stored, displayId, slot, zone, ::nowUtcIso) }

    /** La case d'une tâche : faite ou à faire (pour une série, le jour affiché). */
    suspend fun setTaskDone(stored: StoredEvent, displayId: String, done: Boolean): String? =
        write { writer, _ -> writer.setTaskDone(stored, displayId, done, ::nowUtcIso) }

    /** Crée un calendrier : un dossier à la racine du dossier de notes. */
    suspend fun createCalendar(name: String): String? = write { _, storage -> createFolder(storage, name) }

    /**
     * « Ajouter un calendrier » (AddCalendarDialog) : le dossier, puis le premier lien ICS quand la feuille en a reçu un
     * (même abonnement que celui du panneau des liens, sous le nom du calendrier). Rend le message du refus, ou null.
     */
    suspend fun createCalendarWithLink(name: String, icsUrl: String?): String? {
        val error = createCalendar(name)
        if (error != null) return if (error == WRITE_IGNORED) "Une écriture est déjà en cours. Réessayez." else error
        return if (icsUrl == null) null else addIcsLink(name, name, icsUrl)
    }

    /**
     * Le « + » de la liste d'un calendrier (`addPanelEvent`) : une tâche sans date ni titre dans ce calendrier, ouverte aussitôt
     * dans la fiche (`createUnscheduledPanelEvent(true)`). Rend le message du refus, ou null.
     */
    suspend fun createUnscheduledTask(calendarPath: String): String? {
        var created: String? = null
        val payload = JsonObject(
            mapOf(
                "title" to JsonPrimitive(""),
                "type" to JsonPrimitive("someday"),
                "allDay" to JsonPrimitive(true),
                "completed" to JsonPrimitive(false),
            ),
        )
        val error = write { writer, _ ->
            val written = writer.create(calendarPath, payload)
            created = written.event.id?.takeIf { it.isNotBlank() } ?: "path:${written.relativePath}"
        }
        if (error == null) created?.let { openRoute(NativeRoute.Event(it)) }
        return error
    }

    /** Le calendrier des jours fériés : sa source, sa couleur et sa place s'écrivent dans les préférences, puis le dossier est relu. */
    suspend fun addHolidayCalendar(name: String?, color: String): String? {
        val error = writePreferences { withHolidayCalendar(it, name, color) }
        reload(force = true)
        return error
    }

    /** Renomme le dossier, puis fait suivre ses préférences ; rien n'est renommé si le fichier de préférences est illisible. */
    suspend fun renameCalendar(path: String, newName: String): String? =
        // Même verrou que les autres écritures de préférences : le renommage relit puis réécrit le fichier.
        prefsLock.withLock { write { _, storage -> renameCalendarAndPreferences(storage, path, newName) } }

    /** Supprime un calendrier, refusé s'il n'est pas vide. */
    suspend fun deleteCalendar(path: String): String? = write { _, storage -> deleteFolder(storage, path) }

    /** Retire un calendrier en lecture seule (jours fériés) : seule sa source quitte les préférences, aucun fichier n'est touché. */
    suspend fun removeHolidayCalendar(key: String): String? {
        val error = writePreferences { withHolidayRemoved(it, key) }
        reload(force = true)
        return error
    }

    /** Le dossier de notes vient d'être choisi (Réglages) : même permission et même clé que la WebView, puis relecture. */
    fun onTreePicked(result: android.content.Intent) {
        val uri = result.data ?: return
        val app = getApplication<Application>()
        val flags = result.flags and (android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            app.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (e: Exception) {
            _notices.tryEmit(e.message ?: e.toString())
            return
        }
        app.getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).edit().putString(TREE_KEY, uri.toString()).apply()
        // L'export de l'ancienne app (s'il y en a un) est réappliqué avant la première lecture.
        importing = true
        _screen.value = ScreenState.Loading
        viewModelScope.launch {
            try {
                importDeviceSettings(app, uri)
                _dayCount.value = clampDayCount(devicePrefs.getInt(KEY_DAY_COUNT, DEFAULT_DAY_COUNT))
                _allDayCollapsed.value = devicePrefs.getBoolean(KEY_ALLDAY_COLLAPSED, false)
                icsSync.reloadStates()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                android.util.Log.w("NeoNative", "import des réglages raté", e)
            } finally {
                importing = false
            }
            reload(force = true)
        }
    }

    @Volatile private var importing = false

    private fun hasTree(): Boolean =
        getApplication<Application>().getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty().isNotEmpty()

    // --- l'ancienne app ---------------------------------------------------------------------------

    private val _oldAppInstalled = MutableStateFlow(isOldAppInstalled(app))

    /** L'ancienne version (com.ahmed.neocalendar) est encore installée : bandeau et ligne des Réglages. */
    val oldAppInstalled: StateFlow<Boolean> = _oldAppInstalled.asStateFlow()

    /** Revérifié au retour au premier plan. */
    fun refreshOldApp() {
        _oldAppInstalled.value = isOldAppInstalled(getApplication())
    }

    /** Le nom du dossier de notes choisi, pour la ligne des Réglages. */
    fun treeName(): String {
        val raw = getApplication<Application>().getSharedPreferences(TREE_PREFS, Context.MODE_PRIVATE).getString(TREE_KEY, "").orEmpty()
        if (raw.isEmpty()) return "Aucun"
        return runCatching {
            android.provider.DocumentsContract.getTreeDocumentId(Uri.parse(raw)).substringAfterLast(':').substringAfterLast('/')
        }.getOrDefault(raw)
    }

    /** Un fichier choisi, ce que `copyAttachment` de l'ancienne en fait : copié dans le dossier des pièces jointes à côté de la note. */
    class CopiedAttachment(val fileName: String, val markdownPath: String)

    suspend fun copyAttachment(eventRelativePath: String, source: Uri): CopiedAttachment = withContext(Dispatchers.IO) {
        val context = getApplication<Application>()
        val storage = SafWorkspaceStorage(context, treeUri(write = true))
        val resolver = context.contentResolver
        val base = if ('/' in eventRelativePath) eventRelativePath.substringBeforeLast('/') else ""
        // Le point compte : un dossier sans point serait pris pour un calendrier (voir `attachmentFolderName`).
        val folder = attachmentFolderName(storage.list(base).map { it.name })
        val folderPath = if (base.isEmpty()) folder else "$base/$folder"
        if (storage.list(base).none { it.name == folder }) storage.createDirectory(base, folder)
        val asked = resolver.query(source, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
        val name = uniqueAttachmentName(storage.list(folderPath).map { it.name }, asked?.takeIf { it.isNotBlank() } ?: "attachment")
        val created = storage.createFile(folderPath, name, resolver.getType(source) ?: "application/octet-stream")
        (resolver.openInputStream(source) ?: throw java.io.IOException("Lecture impossible")).use { storage.writeStream(created, it) }
        CopiedAttachment(name, attachmentMarkdownPath(eventRelativePath, folder, name))
    }

    /** Pour ouvrir une pièce jointe : le dossier en lecture, sans rien écrire. */
    fun attachmentStorage(): SafWorkspaceStorage? = runCatching { SafWorkspaceStorage(getApplication(), treeUri(write = false)) }.getOrNull()

    /** Lit le dossier : mêmes contrôles que `MainActivity.tree()`, puis le noyau fait le reste. */
    private fun read(): WorkspaceData {
        val context = getApplication<Application>()
        val workspace = loadWorkspace(SafWorkspaceStorage(context, treeUri(write = false)))
        // La lecture tolérante du noyau : un fichier étrange ne plante pas, il retombe sur les valeurs lues une à une.
        val preferences = parseWorkspacePreferences(workspace.preferences)
        val holidaySources = holidaySourcesOf(preferences)
        val calendars = buildCalendarModels(workspace.calendars, preferences, AppLocale.current, holidaySources)
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
            // Un calendrier de jours fériés se désigne par sa clé `auto::<id>`, qui est aussi son identifiant ; un dossier, par `local::<chemin>`.
            hiddenCalendarIds = hiddenPaths.map { if (it.startsWith("auto::")) it else calendarIdFromPath(it) }.toSet(),
            defaultCalendarPath = (preferences["defaultCalendarPath"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            defaultEventsAsTasks = flag("defaultEventsAsTasks", false),
            mapsApp = (preferences["mapsApp"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "ask",
            mapsTravelMode = (preferences["mapsTravelMode"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "auto",
            reminderMinutes = (preferences["reminderMinutes"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() },
            calendarReminderMinutes = (preferences["calendarReminderMinutes"] as? JsonObject).orEmpty().mapValues { (_, list) ->
                (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content?.toLongOrNull() }
            },
            icsLinks = icsLinksOf(preferences["icsFeeds"]),
            icsDefaultMinutes = (preferences["icsDefaultRefreshMinutes"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 60,
            holidays = holidaySources.flatMap { holidayDisplayEvents(it, LocalDate.now().year, zone) },
            initialDesktop = ((preferences["initialView"] as? JsonObject)?.get("desktop") as? JsonPrimitive)?.content ?: "week",
            initialMobile = ((preferences["initialView"] as? JsonObject)?.get("mobile") as? JsonPrimitive)?.content ?: "3days",
            clickToCreateFromMonth = flag("clickToCreateEventFromMonthView", true),
            secondaryTimezones = (preferences["secondaryTimezones"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content },
            prayerMosques = (preferences["prayerMosques"] as? JsonObject).orEmpty().mapNotNull { (path, id) -> (id as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
            prayerColors = (preferences["prayerColors"] as? JsonObject).orEmpty().mapNotNull { (path, hex) -> (hex as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { path to it } }.toMap(),
            prayerJumua = (preferences["prayerJumua"] as? JsonObject).orEmpty().mapValues { (_, list) ->
                (list as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
            }.filterValues { it.isNotEmpty() },
        )
    }
}
