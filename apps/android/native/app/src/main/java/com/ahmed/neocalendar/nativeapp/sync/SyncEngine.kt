package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.SystemClock
import android.system.Os
import android.util.Log
import com.ahmed.neocalendar.core.sync.EngineState
import com.ahmed.neocalendar.core.sync.RestartPolicy
import com.ahmed.neocalendar.core.sync.RotatingLog
import com.ahmed.neocalendar.core.sync.SyncthingApi
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext

private const val TAG = "NeoSyncEngine"

/**
 * Le processus Syncthing et son superviseur. Seul ce code relance le moteur (`STNORESTART=1` coupe le moniteur
 * interne de Syncthing) : 2 s, 4 s, 8 s… plafonné à 5 min, plus de relance après 5 échecs de suite.
 *
 * Tout ce que le moteur écrit vit dans `filesDir/syncthing/` (clé, certificat, `config.xml`, index, socket) ; ce
 * dossier est en 700. L'interface REST n'écoute que sur `gui.sock` dans ce dossier : aucune autre app ne peut la joindre.
 * La clé d'API est tirée au hasard à chaque lancement et ne quitte pas la mémoire de l'app.
 * Le binaire se lance depuis `nativeLibraryDir` uniquement (le SELinux d'Android 10+ refuse un exécutable copié ailleurs).
 */
class SyncEngine(private val context: Context, private val scope: CoroutineScope) {
    private val home = File(context.filesDir, "syncthing")
    private val socket = File(home, "gui.sock")
    private val log = RotatingLog(File(home, "logs"))
    private val policy = RestartPolicy()
    private val lock = Any()

    private val _state = MutableStateFlow<EngineState>(EngineState.Stopped)
    val state: StateFlow<EngineState> = _state.asStateFlow()

    /** L'API du moteur tant qu'il répond, sinon null. */
    @Volatile var api: SyncthingApi? = null
        private set

    /** Appelé (hors fil principal) quand le moteur répond, avant que l'état passe à Running : l'appelant le configure. */
    @Volatile var onReady: (suspend (SyncthingApi) -> Unit)? = null

    /** Appelé avant chaque lancement du processus (premier ou relance) : l'appelant vérifie, par exemple, que le port d'écoute est libre. */
    @Volatile var beforeLaunch: (() -> Unit)? = null

    private var job: Job? = null

    @Volatile private var process: Process? = null

    @Volatile private var stopRequested = false

    /** Le journal du moteur, le plus ancien d'abord. */
    fun logText(): String = log.readAll()

    /** Note une ligne dans le journal (erreur de configuration, relance). */
    fun note(line: String) = log.write("[Neo Calendar] $line\n".toByteArray(Charsets.UTF_8))

    /** Lance le moteur s'il ne tourne pas ; remet à zéro le compteur d'échecs (geste de l'utilisateur ou ouverture de l'app). */
    fun start() = synchronized(lock) {
        if (job?.isActive == true) return@synchronized
        stopRequested = false
        policy.reset()
        job = scope.launch(Dispatchers.IO) { supervise() }
    }

    /** Arrêt propre (`/rest/system/shutdown`), puis destruction du processus au bout de 10 s. */
    suspend fun stop() {
        val running = synchronized(lock) {
            stopRequested = true
            job
        }
        withContext(Dispatchers.IO) {
            val engineApi = api
            val p = process
            if (engineApi != null) runCatching { engineApi.shutdown() } else p?.destroy()
            if (p != null && !p.waitFor(10, TimeUnit.SECONDS)) p.destroyForcibly()
        }
        running?.cancelAndJoin()
        api = null
        process = null
        _state.value = EngineState.Stopped
    }

    private suspend fun supervise() {
        val binary = File(context.applicationInfo.nativeLibraryDir, "libsyncthingnative.so")
        if (!binary.canExecute()) {
            _state.value = EngineState.Missing
            return
        }
        while (scope.isActive && !stopRequested) {
            _state.value = EngineState.Starting
            val startedAt = SystemClock.elapsedRealtime()
            val message = try {
                runOnce(binary)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "lancement impossible", e)
                "Lancement impossible : ${e.message}"
            }
            if (stopRequested) return
            when (val decision = policy.onExit(SystemClock.elapsedRealtime() - startedAt)) {
                is RestartPolicy.Decision.RetryIn -> {
                    note("$message ; nouvel essai dans ${decision.delayMs / 1000} s (échec ${decision.attempt})")
                    _state.value = EngineState.Backoff(decision.attempt, decision.delayMs, message)
                    delay(decision.delayMs)
                }
                RestartPolicy.Decision.GiveUp -> {
                    note("$message ; plus de relance automatique")
                    _state.value = EngineState.Failed(message)
                    return
                }
            }
        }
    }

    /** Un lancement, de bout en bout. Rend le message de sa fin. */
    private suspend fun runOnce(binary: File): String {
        beforeLaunch?.invoke()
        home.mkdirs()
        lockDown(home)
        File(home, "tmp").mkdirs()
        // Un socket resté d'un lancement tué net ferait croire au moteur que l'adresse est prise.
        socket.delete()
        if (socket.absolutePath.toByteArray().size > 100) throw IllegalStateException("chemin du socket trop long (${socket.absolutePath.length} caractères)")
        val key = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val builder = ProcessBuilder(binary.absolutePath, "serve", "--home=${home.absolutePath}", "--no-browser", "--no-upgrade")
        builder.environment().apply {
            put("STGUIADDRESS", "unix://${socket.absolutePath}")
            put("STGUIAPIKEY", key)
            put("STNORESTART", "1")
            put("STNOUPGRADE", "1")
            put("HOME", home.absolutePath)
            put("TMPDIR", File(home, "tmp").absolutePath)
        }
        builder.redirectErrorStream(true)
        val p = builder.start()
        process = p
        val reader = Thread({
            val buffer = ByteArray(8192)
            try {
                p.inputStream.use { input ->
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        log.write(buffer, n)
                    }
                }
            } catch (_: Exception) {
                // Le processus est mort : plus rien à lire.
            }
        }, "syncthing-log").apply { isDaemon = true; start() }

        val engineApi = SyncthingApi(OkHttpTransport(socket.absolutePath, key))
        val deadline = SystemClock.elapsedRealtime() + 60_000
        var healthy = false
        while (p.isAlive && SystemClock.elapsedRealtime() < deadline) {
            if (withContext(Dispatchers.IO) { engineApi.isHealthy() }) { healthy = true; break }
            delay(300)
        }
        if (healthy) {
            api = engineApi
            try {
                onReady?.invoke(engineApi)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                // Le moteur tourne mais n'a pas été configuré : on le dit dans le journal, la page montrera l'erreur.
                note("Configuration impossible : ${e.message}")
            }
            if (p.isAlive) _state.value = EngineState.Running
        } else if (p.isAlive) {
            note("Le moteur ne répond pas après 60 s : arrêt")
            p.destroyForcibly()
        }
        val code = try {
            runInterruptible(Dispatchers.IO) { p.waitFor() }
        } finally {
            api = null
            process = null
            if (p.isAlive) p.destroyForcibly()
            reader.join(2_000)
        }
        val last = log.readAll().trimEnd().lines().lastOrNull().orEmpty().take(200)
        return "Le moteur s'est arrêté (code $code)" + if (last.isNotEmpty()) " : $last" else ""
    }

    /** Dossier d'état en 700 : ni lisible ni traversable par une autre app. */
    private fun lockDown(dir: File) {
        Os.chmod(dir.absolutePath, 0x1C0) // 0700, en une seule opération (pas de moment où le dossier est plus ouvert)
    }
}
