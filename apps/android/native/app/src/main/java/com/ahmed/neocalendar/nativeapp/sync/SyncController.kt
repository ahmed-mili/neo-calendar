package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import com.ahmed.neocalendar.core.sync.ENGINE_EVENT_TYPES
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.FolderState
import com.ahmed.neocalendar.core.sync.RunDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.StatusLine
import com.ahmed.neocalendar.core.sync.SyncthingApi
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncSettings
import com.ahmed.neocalendar.core.sync.bindsTcpAndUdp
import com.ahmed.neocalendar.core.sync.decideRun
import com.ahmed.neocalendar.core.sync.isRemoteChange
import com.ahmed.neocalendar.core.sync.pickFreePort
import com.ahmed.neocalendar.core.sync.summarize
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.isActive
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

    /** Un fichier est arrivé d'un autre appareil : regroupé sur 1 s avant de relire le dossier (une rafale de fichiers = une relecture). */
    private val remoteChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private var eventJob: Job? = null
    @Volatile private var lastFolderId: String? = null

    init {
        engine.beforeLaunch = { ensureListenPort() }
        engine.listenPort = { settings.value.listenPort }
        engine.onReady = { api -> SyncSetup(api, WorkspaceLocation.privateRoot(app).absolutePath).applyOptions(settings.value.listenPort) }
        monitor.start()
        scope.launch { settings.settings.collect { reconcile() } }
        scope.launch {
            engine.state.collect { state ->
                if (state is EngineState.Running) startEventLoop() else stopEventLoop()
                publishStatus()
            }
        }
        @OptIn(FlowPreview::class)
        scope.launch {
            // Hors du fil principal ; les relectures se suivent, jamais deux à la fois.
            remoteChanges.debounce(1_000).collect {
                try {
                    RemoteRefresh.run(app)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Une relecture ratée ne doit pas arrêter l'écoute des suivantes.
                }
            }
        }
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

    private fun stopEventLoop() {
        eventJob?.cancel()
        eventJob = null
        lastFolderState = null
        anyDeviceConnected = false
    }

    private fun startEventLoop() {
        eventJob?.cancel()
        val api = engine.api ?: return
        eventJob = scope.launch(Dispatchers.IO) {
            var since = 0
            try {
                // On part de l'évènement le plus récent : l'historique d'avant ce lancement est déjà dans le dossier.
                since = api.events(0, 0, ENGINE_EVENT_TYPES, limit = 1).lastOrNull()?.id ?: 0
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Le moteur n'est pas prêt : la boucle réessaie plus bas.
            }
            refreshFromEngine(api)
            while (isActive && engine.api === api) {
                try {
                    val events = api.events(since, 30, ENGINE_EVENT_TYPES)
                    val folderId = lastFolderId
                    for (event in events) {
                        since = maxOf(since, event.id)
                        if (isRemoteChange(event, folderId)) remoteChanges.tryEmit(Unit)
                    }
                    refreshFromEngine(api)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Flux coupé (moteur qui redémarre, erreur de lecture) : on reprend, à intervalle espacé.
                    if (engine.api !== api) break
                    delay(2_000)
                }
            }
        }
    }

    /** Lit l'état du moteur (dossier, connexions, appareils) pour la ligne d'état, la notification et le drapeau « appairé ». */
    private fun refreshFromEngine(api: SyncthingApi) {
        try {
            val me = api.myId()
            val devices = api.devices().filter { it.id != me }
            val folder = api.folders().firstOrNull()
            lastFolderId = folder?.id
            lastFolderState = folder?.let { api.folderState(it.id) }
            anyDeviceConnected = api.connections().filterKeys { it != me }.any { it.value }
            if (devices.isNotEmpty() != settings.value.configured) settings.update { it.copy(configured = devices.isNotEmpty()) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Une lecture ratée garde l'état précédent.
        }
        publishStatus()
    }

    /** Relit l'état maintenant (la page Synchronisation après un geste de l'utilisateur). */
    fun refreshNow() {
        val api = engine.api ?: return
        scope.launch(Dispatchers.IO) { refreshFromEngine(api) }
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
