package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import com.ahmed.neocalendar.core.sync.ENGINE_EVENT_TYPES
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.FolderState
import com.ahmed.neocalendar.core.sync.RunDecision
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.sync.StatusLine
import com.ahmed.neocalendar.core.sync.FolderLostException
import com.ahmed.neocalendar.core.sync.PendingFolder
import com.ahmed.neocalendar.core.sync.ProposalDecision
import com.ahmed.neocalendar.core.sync.SyncthingApi
import com.ahmed.neocalendar.core.sync.decideProposal
import com.ahmed.neocalendar.core.sync.shouldAutoApply
import com.ahmed.neocalendar.core.sync.SyncSetup
import com.ahmed.neocalendar.core.sync.SyncSettings
import com.ahmed.neocalendar.core.sync.bindsTcpAndUdp
import com.ahmed.neocalendar.core.sync.decideRun
import com.ahmed.neocalendar.core.sync.engineWanted
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

    private val _progress = MutableStateFlow(SyncProgress())

    /** L'avancement et le nombre d'appareils connectés, pour la notification. */
    val progress: StateFlow<SyncProgress> = _progress.asStateFlow()

    @Volatile private var appVisible = false
    @Volatile private var graceUntil = 0L
    private var graceJob: Job? = null
    @Volatile private var pageOpen = false
    @Volatile private var pairingHeld = false
    private var pairingHoldJob: Job? = null

    @Volatile var lastFolderState: FolderState? = null
        private set
    @Volatile var anyDeviceConnected: Boolean = false

    /** Une adoption a retiré l'ancien dossier sans pouvoir poser le nouveau : « Réessayer » dans la page. */
    @Volatile var folderLost: PendingFolder? = null

    /** Le message de la dernière application ratée d'une proposition de dossier (visible dans la page). */
    @Volatile var adoptError: String? = null

    private val adoptLock = Any()
    private val triedProposals = mutableSetOf<String>()

    /** Un appareil propose un dossier que le téléphone n'a pas encore accepté. */
    @Volatile var folderOffered: Boolean = false
        private set

    /**
     * Un fichier est arrivé d'un autre appareil : regroupé sur [REMOTE_SETTLE_MS] avant de relire le dossier (une rafale de fichiers
     * = une relecture ; la relecture ne réanalyse que les notes changées, grâce à la copie des notes lues).
     */
    private val remoteChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    /**
     * L'état du moteur est à relire (ligne d'état, notification). Hors de la boucle d'écoute : cette relecture (une dizaine de
     * requêtes, dont la complétion du dossier) prend 1 à 2 s sur un téléphone, et faite DANS la boucle elle retenait d'autant le
     * `ItemFinished` du fichier reçu, donc son affichage.
     */
    private val refreshRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** L'app vient d'écrire dans le dossier de notes : un scan pendant qu'un autre tourne se réduit à un scan de plus. */
    private val localChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private var eventJob: Job? = null
    @Volatile private var lastFolderId: String? = null

    init {
        engine.beforeLaunch = { ensureListenPort() }
        engine.listenPort = { settings.value.listenPort }
        engine.onReady = { api ->
            val setup = SyncSetup(api, WorkspaceLocation.integratedRoot(app).absolutePath)
            setup.applyOptions(settings.value.listenPort)
            setup.applyFolderTiming()
            // Notes recopiées après « Vider » : le dossier déjà déclaré repart d'un index vide, et c'est Syncthing qui réécrit
            // .stfolder. Jamais de marqueur recréé à l'aveugle ici : sur un index ancien, il propagerait des suppressions au PC.
            if (settings.value.resetFolderIndex) {
                setup.resetFolderIndex()
                settings.update { it.copy(resetFolderIndex = false) }
            }
        }
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
            remoteChanges.debounce(REMOTE_SETTLE_MS).collect {
                try {
                    RemoteRefresh.run(app)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Une relecture ratée ne doit pas arrêter l'écoute des suivantes.
                }
            }
        }
        scope.launch(Dispatchers.IO) {
            localChanges.collect {
                val api = engine.api ?: return@collect
                try {
                    api.folders().firstOrNull()?.let { api.scan(it.id) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Moteur arrêté ou qui redémarre : son surveillant de fichiers verra la modification (1 s).
                }
            }
        }
        reconcile()
    }

    /** L'app vient d'écrire dans le dossier de notes : le moteur scanne tout de suite, sans attendre son surveillant de fichiers. */
    fun localChanged() {
        localChanges.tryEmit(Unit)
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

    /** La page Synchronisation est ouverte ET visible : le moteur tourne (appairage) même sans appareil ; app en arrière-plan, la page ne le retient plus. */
    fun setPageOpen(open: Boolean) { pageOpen = open; reconcile() }

    /**
     * Maintien pour appairage : le scanner de QR code est une autre activité plein écran, l'app y est masquée et le moteur
     * s'arrêterait avant la fin de l'appairage. Pris avant le scan, relâché après la tentative ; relâché tout seul au bout de
     * [PAIRING_HOLD_MAX_MS] si le retour ne vient jamais.
     */
    fun holdForPairing(on: Boolean) {
        synchronized(this) {
            pairingHoldJob?.cancel()
            pairingHoldJob = null
            pairingHeld = on
            if (on) pairingHoldJob = scope.launch {
                delay(PAIRING_HOLD_MAX_MS)
                pairingHeld = false
                reconcile()
            }
        }
        reconcile()
    }

    /** « Quitter » (mode Comme Syncthing-Fork, sans démarrage automatique) : moteur et service s'arrêtent jusqu'au prochain lancement de l'app. */
    fun quit() = settings.update { it.copy(quit = true) }

    /**
     * Un changement de stockage commence : le moteur est arrêté (attente de sa sortie réelle) et ne repart pas avant
     * [releaseStorageSwitch]. Pris sous le verrou du chef d'orchestre : une décision en cours a fini, les suivantes voient le drapeau.
     */
    internal suspend fun holdForStorageSwitch() {
        storageSwitching = true
        mutex.withLock { engine.stop() }
    }

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
        val decision = decideRun(s.conditions, monitor.snapshot(), pairing = pairingHeld || (pageOpen && appVisible))
        _decision.value = decision
        val running = decision is RunDecision.Run
        val open = appVisible || SystemClock.elapsedRealtime() < graceUntil
        val background = s.configured && !s.quit && (s.runMode == RunMode.LikeFork || open)
        // Un changement de stockage est en cours : le moteur reste arrêté, quoi que disent les conditions.
        val wanted = engineWanted(storageSwitching, integrated, running, pageOpen, appVisible, pairingHeld, background)
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
        folderOffered = false
        synchronized(adoptLock) { triedProposals.clear() }
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
            val refresher = launch { refreshRequests.collect { refreshFromEngine(api) } }
            try {
                while (isActive && engine.api === api) {
                    try {
                        val events = api.events(since, 30, ENGINE_EVENT_TYPES)
                        val folderId = lastFolderId
                        for (event in events) {
                            since = maxOf(since, event.id)
                            if (isRemoteChange(event, folderId)) remoteChanges.tryEmit(Unit)
                        }
                        // La boucle repart aussitôt écouter : un fichier reçu pendant la relecture de l'état est vu sans attendre.
                        refreshRequests.tryEmit(Unit)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // Flux coupé (moteur qui redémarre, erreur de lecture) : on reprend, à intervalle espacé.
                        if (engine.api !== api) break
                        delay(2_000)
                    }
                }
            } finally {
                refresher.cancel()
            }
        }
    }

    /** Lit l'état du moteur (dossier, connexions, appareils) pour la ligne d'état, la notification et le drapeau « appairé ». */
    private fun refreshFromEngine(api: SyncthingApi) {
        try {
            val me = api.myId()
            val devices = api.devices().filter { it.id != me }
            autoApplyProposals(api, me, devices)
            val folder = api.folders().firstOrNull()
            if (folder != null) folderLost = null
            lastFolderId = folder?.id
            lastFolderState = folder?.let { api.folderState(it.id) }
            val connected = api.connections().filterKeys { it != me }.count { it.value }
            anyDeviceConnected = connected > 0
            folderOffered = folder == null && devices.any { api.pendingFolders(it.id).isNotEmpty() }
            val percent = folder?.let { runCatching { api.localCompletion(it.id).toInt().coerceIn(0, 100) }.getOrNull() } ?: _progress.value.percent
            _progress.value = SyncProgress(percent, connected)
            if (devices.isNotEmpty() != settings.value.configured) settings.update { it.copy(configured = devices.isNotEmpty()) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Une lecture ratée garde l'état précédent.
        }
        publishStatus()
    }

    /**
     * Un dossier proposé par un appareil déjà accepté est appliqué sans question (un seul dossier, toujours « Neo Calendar ») ;
     * seul un refus reste à l'écran. Une tentative par proposition et par lancement du moteur : une erreur ne boucle pas.
     */
    private fun autoApplyProposals(api: SyncthingApi, me: String, devices: List<com.ahmed.neocalendar.core.sync.ConfiguredDevice>) {
        if (storageSwitching) return
        val local = api.folders().firstOrNull()
        for (device in devices) for (proposal in api.pendingFolders(device.id)) {
            if (proposal == folderLost) continue
            val key = "${proposal.offeredBy}/${proposal.id}"
            val apply = synchronized(adoptLock) {
                shouldAutoApply(decideProposal(local, me, proposal.offeredBy, proposal.id), key in triedProposals).also { if (it) triedProposals += key }
            }
            if (apply) { adoptProposal(proposal); return }
        }
    }

    /**
     * Adopte le dossier proposé (une application à la fois). Rend le message d'erreur, ou null. Les notes locales ne sont ni vidées
     * ni déplacées : le moteur fusionne, un même chemin différent devient un fichier de conflit. Seul le fichier de réglages partagés
     * local est mis de côté quand le dossier du PC en apporte un.
     */
    fun adoptProposal(proposal: PendingFolder): String? = synchronized(adoptLock) {
        val api = engine.api ?: return@synchronized "Le moteur de synchronisation démarre : réessayez dans un instant."
        var message: String? = null
        try {
            val setup = SyncSetup(api, WorkspaceLocation.integratedRoot(app).absolutePath)
            val planned = setup.decide(proposal)
            if (planned == ProposalDecision.Adopt || planned is ProposalDecision.Replace) setAsidePreferences()
            val decision = setup.adopt(proposal)
            if (decision is ProposalDecision.Refuse) message = decision.reason else folderLost = null
        } catch (e: FolderLostException) {
            folderLost = proposal
            engine.note("Adoption : ${e.message}")
            message = e.message
        } catch (e: Exception) {
            message = e.message ?: e.toString()
        }
        adoptError = message
        message
    }

    /** Le fichier de réglages local est mis de côté (stockage privé, hors du dossier synchronisé, nom horodaté) : le PC fait foi. */
    private fun setAsidePreferences() {
        val root = WorkspaceLocation.integratedRoot(app)
        val aside = java.io.File(root.parentFile, "reglages-mis-de-cote")
        val stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
        val moved = com.ahmed.neocalendar.nativeapp.StorageGate.writing { com.ahmed.neocalendar.core.workspace.setAsideLocalPreferences(root, aside, stamp) }
        if (moved != null) engine.note("Adoption : réglages locaux mis de côté dans ${moved.name}")
    }

    /** Relit l'état maintenant (la page Synchronisation après un geste de l'utilisateur). */
    fun refreshNow() {
        val api = engine.api ?: return
        scope.launch(Dispatchers.IO) { refreshFromEngine(api) }
    }

    internal fun publishStatus() {
        val s = settings.value
        _status.value = summarize(s.configured, engine.state.value, _decision.value, lastFolderState, anyDeviceConnected, folderOffered)
    }

    companion object {
        private const val GRACE_MS = 60_000L
        private const val REMOTE_SETTLE_MS = 100L
        private const val PAIRING_HOLD_MAX_MS = 180_000L

        /** Vrai pendant un changement de stockage (même sans contrôleur créé : un contrôleur né pendant ce temps ne lance rien). */
        @Volatile internal var storageSwitching = false

        @Volatile private var instance: SyncController? = null

        fun get(context: Context): SyncController =
            instance ?: synchronized(this) { instance ?: SyncController(context).also { instance = it } }

        /** Sans le créer : les appelants qui n'ont rien à faire quand la synchro n'a jamais été utilisée (arrêt, visibilité). */
        fun peek(): SyncController? = instance
    }
}

/** Où en est la synchronisation : pourcentage reçu et appareils connectés. */
data class SyncProgress(val percent: Int = 100, val connected: Int = 0)
