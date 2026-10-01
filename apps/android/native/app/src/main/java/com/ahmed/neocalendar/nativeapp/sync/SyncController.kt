package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.FolderState
import com.ahmed.neocalendar.core.sync.RunDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.StatusLine
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncSettings
import com.ahmed.neocalendar.core.sync.bindsTcpAndUdp
import com.ahmed.neocalendar.core.sync.decideRun
import com.ahmed.neocalendar.core.sync.pickFreePort
import com.ahmed.neocalendar.core.sync.summarize
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Le chef d'orchestre de la synchronisation intégrée : décide, à chaque changement, si le moteur doit tourner, et le lance
 * ou l'arrête. Une seule instance par processus (`SyncController.get(context)`).
 *
 * Le moteur tourne quand : le stockage est privé (mode `Integrated`), les conditions de fonctionnement sont remplies, et
 *  - la page Synchronisation est ouverte (appairage), ou
 *  - au moins un appareil est appairé et que l'utilisateur n'a pas appuyé sur « Quitter », en mode « Comme Syncthing-Fork »
 *    (service au premier plan, jusqu'à « Quitter ») ou « Seulement quand l'app est ouverte » (app visible).
 *
 * RIEN de ce code ne s'exécute avant que la grille soit affichée : `get` n'est appelé qu'ensuite (NativeActivity).
 */
class SyncController private constructor(context: Context) {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()

    val settings = SyncSettingsStore(app)
    val engine = SyncEngine(app, scope)
    private val monitor = RunConditionMonitor(app) { reconcile() }

    private val _decision = MutableStateFlow<RunDecision>(RunDecision.Run)

    /** Les conditions de fonctionnement disent-elles « tourne » ou « pause (pourquoi) » ? */
    val decision: StateFlow<RunDecision> = _decision.asStateFlow()

    private val _status = MutableStateFlow<StatusLine>(StatusLine.NotConfigured)

    /** La ligne d'état (page Synchronisation, notification). */
    val status: StateFlow<StatusLine> = _status.asStateFlow()

    @Volatile private var appVisible = false
    @Volatile private var graceUntil = 0L
    private var graceJob: Job? = null
    @Volatile private var pageOpen = false

    @Volatile var lastFolderState: FolderState? = null
        private set
    @Volatile var anyDeviceConnected: Boolean = false
        private set

    init {
        engine.beforeLaunch = { ensureListenPort() }
        engine.listenPort = { settings.value.listenPort }
        engine.onReady = { api -> SyncSetup(api, WorkspaceLocation.privateRoot(app).absolutePath).applyOptions(settings.value.listenPort) }
        monitor.start()
        scope.launch { settings.settings.collect { reconcile() } }
        scope.launch { engine.state.collect { publishStatus() } }
        reconcile()
    }

    /** Le port d'écoute reste celui d'avant tant qu'il est libre ; sinon un nouveau port libre est choisi et gardé. */
    private fun ensureListenPort() {
        val current = settings.value.listenPort
        if (current == 0 || !bindsTcpAndUdp(current)) settings.update { it.copy(listenPort = pickFreePort()) }
    }

    /** L'app est lancée (grille affichée) : « Quitter » n'a plus cours, le moteur peut démarrer. */
    fun onAppStarted() {
        appVisible = true
        if (settings.value.quit) settings.update { it.copy(quit = false) }
        reconcile()
    }

    fun onAppVisible() {
        graceJob?.cancel()
        graceUntil = 0
        appVisible = true
        reconcile()
    }

    /**
     * L'app passe en arrière-plan. En mode « Seulement quand l'app est ouverte », le moteur attend (60 s au plus) que les
     * modifications locales soient parties avant de s'arrêter.
     */
    fun onAppHidden() {
        appVisible = false
        if (settings.value.runMode == RunMode.OnlyWhenOpen && engine.state.value is EngineState.Running) {
            graceUntil = SystemClock.elapsedRealtime() + GRACE_MS
            graceJob?.cancel()
            graceJob = scope.launch {
                waitUntilSent()
                graceUntil = 0
                reconcile()
            }
        }
        reconcile()
    }

    /** Scan immédiat, puis attend que le dossier soit au repos et que chaque appareil connecté ait tout reçu (deux constats de suite). */
    private suspend fun waitUntilSent() {
        val api = engine.api ?: return
        val deadline = SystemClock.elapsedRealtime() + GRACE_MS
        var good = 0
        try {
            val folder = api.folders().firstOrNull() ?: return
            api.scan(folder.id)
            delay(3_000)
            while (SystemClock.elapsedRealtime() < deadline) {
                val idle = api.folderState(folder.id).let { it.state == "idle" && it.needFiles == 0 }
                val connected = api.connections()
                val sent = folder.deviceIds.filter { connected[it] == true }.all { api.completion(folder.id, it) >= 100.0 }
                good = if (idle && sent) good + 1 else 0
                if (good >= 2) return
                delay(2_000)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Le moteur ne répond plus : rien à attendre.
        }
    }

    /** La page Synchronisation est ouverte : le moteur tourne (appairage) même sans appareil. */
    fun setPageOpen(open: Boolean) { pageOpen = open; reconcile() }

    /** « Quitter » (mode Comme Syncthing-Fork, sans démarrage automatique) : moteur et service s'arrêtent jusqu'au prochain lancement de l'app. */
    fun quit() = settings.update { it.copy(quit = true) }

    /** « Réessayer » après l'abandon des relances. */
    fun retry() {
        engine.start()
    }

    fun reconcile() {
        scope.launch { mutex.withLock { reconcileLocked() } }
    }

    private suspend fun reconcileLocked() {
        val s = settings.value
        val integrated = WorkspaceLocation.mode(app) == StorageMode.Integrated
        val decision = decideRun(s.conditions, monitor.snapshot())
        _decision.value = decision
        val running = decision is RunDecision.Run
        val open = appVisible || SystemClock.elapsedRealtime() < graceUntil
        val background = s.configured && !s.quit && (s.runMode == RunMode.LikeFork || open)
        val wanted = integrated && running && (pageOpen || background)
        val state = engine.state.value
        if (wanted && state is EngineState.Stopped) engine.start()
        // `engine.isActive` : une marche tout juste lancée a encore l'état Stopped, il ne faut pas la laisser passer.
        if (!wanted && (state !is EngineState.Stopped || engine.isActive)) engine.stop()
        val wantService = integrated && s.configured && !s.quit && s.runMode == RunMode.LikeFork
        if (wantService) SyncService.start(app) else SyncService.stop(app)
        publishStatus()
    }

    internal fun publishStatus() {
        val s = settings.value
        _status.value = summarize(s.configured, engine.state.value, _decision.value, lastFolderState, anyDeviceConnected)
    }

    companion object {
        private const val GRACE_MS = 60_000L

        @Volatile private var instance: SyncController? = null

        fun get(context: Context): SyncController =
            instance ?: synchronized(this) { instance ?: SyncController(context).also { instance = it } }

        /** Sans le créer : les appelants qui n'ont rien à faire quand la synchro n'a jamais été utilisée (arrêt, visibilité). */
        fun peek(): SyncController? = instance
    }
}
