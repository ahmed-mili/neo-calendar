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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val stopLock = Mutex()

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

    /** Vrai dès que `start()` a lancé la marche et tant qu'elle n'a pas fini, même avant que l'état quitte `Stopped`. */
    val isActive: Boolean get() = synchronized(lock) { job?.isActive == true }

    /** Le processus de la marche en cours. Posé et remis à null par cette marche seule (jamais par `stop()`). */
    @Volatile private var process: Process? = null

    @Volatile private var stopRequested = false

    /** Vrai pendant `stop()` : un `start()` à ce moment est refusé plutôt que de se faire écraser. */
    @Volatile private var stopping = false

    /** Le journal du moteur, le plus ancien d'abord. */
    fun logText(): String = log.readAll()

    /** Note une ligne dans le journal (erreur de configuration, relance). Ne lève jamais (le journal est tolérant). */
    fun note(line: String) = log.write("[Neo Calendar] $line\n".toByteArray(Charsets.UTF_8))

    /**
     * Lance le moteur s'il ne tourne pas ; remet à zéro le compteur d'échecs (geste de l'utilisateur ou ouverture de l'app).
     * Rend faux quand rien n'est lancé : le moteur tourne déjà, ou un arrêt est en cours.
     */
    fun start(): Boolean = synchronized(lock) {
        if (stopping || job?.isActive == true) return@synchronized false
        stopRequested = false
        policy.reset()
        job = scope.launch(Dispatchers.IO) { supervise() }
        true
    }

    /**
     * Arrêt propre (`/rest/system/shutdown`, 10 s au total), puis destruction du processus, puis attente de sa sortie
     * réelle. Les champs de la marche (`api`, `process`) sont remis à zéro par la marche elle-même, jamais ici.
     */
    suspend fun stop() = stopLock.withLock {
        val running = synchronized(lock) {
            stopping = true
            stopRequested = true
            job
        }
        try {
            withContext(Dispatchers.IO) {
                val engineApi = api
                val p = process
                if (engineApi != null) {
                    try {
                        engineApi.shutdown(3_000)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Le moteur ne répond plus : on passe à la destruction.
                    }
                } else {
                    p?.destroy()
                }
                if (p != null) terminate(p, graceMs = 10_000)
            }
            // La marche détruit son processus et remet ses champs à zéro dans son `finally` ; on attend qu'elle ait fini.
            running?.cancelAndJoin()
        } finally {
            synchronized(lock) {
                _state.value = EngineState.Stopped
                stopping = false
            }
        }
    }

    /** Attend la sortie du processus ; au bout de `graceMs` il est détruit de force, et on attend alors sa sortie réelle. */
    private fun terminate(p: Process, graceMs: Long) {
        if (p.waitFor(graceMs, TimeUnit.MILLISECONDS)) return
        p.destroyForcibly()
        p.waitFor()
    }

    private suspend fun supervise() {
        val binary = File(context.applicationInfo.nativeLibraryDir, "libsyncthingnative.so")
        if (!binary.canExecute()) {
            _state.value = EngineState.Missing
            return
        }
        // Erreur définitive : un chemin trop long le restera à chaque relance (limite de 108 octets de `sun_path`).
        if (socket.absolutePath.toByteArray().size > 100) {
            val message = "Chemin du socket trop long (${socket.absolutePath.length} caractères)"
            note(message)
            _state.value = EngineState.Failed(message)
            return
        }
        while (scope.isActive && !stopRequested) {
            _state.value = EngineState.Starting
            val run = try {
                runOnce(binary)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "lancement impossible", e)
                RunResult("Lancement impossible : ${e.message}", answered = false, ranMs = 0)
            }
            if (stopRequested) return
            when (val decision = policy.onExit(run.ranMs, run.answered)) {
                is RestartPolicy.Decision.RetryIn -> {
                    note("${run.message} ; nouvel essai dans ${decision.delayMs / 1000} s (échec ${decision.attempt})")
                    _state.value = EngineState.Backoff(decision.attempt, decision.delayMs, run.message)
                    delay(decision.delayMs)
                }
                RestartPolicy.Decision.GiveUp -> {
                    note("${run.message} ; plus de relance automatique")
                    _state.value = EngineState.Failed(run.message)
                    return
                }
            }
        }
    }

    /** Fin d'une marche : `answered` dit si le moteur a répondu, `ranMs` combien de temps depuis qu'il répondait. */
    private class RunResult(val message: String, val answered: Boolean, val ranMs: Long)

    /** Un lancement, de bout en bout. Le processus est détruit quoi qu'il arrive après `builder.start()`, annulation comprise. */
    private suspend fun runOnce(binary: File): RunResult {
        beforeLaunch?.invoke()
        home.mkdirs()
        lockDown(home)
        File(home, "tmp").mkdirs()
        // Un socket resté d'un lancement tué net ferait croire au moteur que l'adresse est prise.
        socket.delete()
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
        var reader: Thread? = null
        var answeredAt = -1L
        try {
            reader = Thread({
                val buffer = ByteArray(8192)
                try {
                    p.inputStream.use { input ->
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            log.write(buffer, n) // ne lève jamais : on continue toujours de vider le tuyau
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
                answeredAt = SystemClock.elapsedRealtime()
                api = engineApi
                try {
                    onReady?.invoke(engineApi)
                } catch (e: CancellationException) {
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
            val code = runInterruptible(Dispatchers.IO) { p.waitFor() }
            val ranMs = if (answeredAt >= 0) SystemClock.elapsedRealtime() - answeredAt else 0L
            // Libellé fixe : le détail (identifiants d'appareils, adresses, chemins) reste dans le journal.
            return RunResult("Le moteur s'est arrêté (code $code). Détails dans le journal.", answered = answeredAt >= 0, ranMs = ranMs)
        } finally {
            // Annulation comprise : pas de processus orphelin. NonCancellable pour que l'attente ne soit pas coupée.
            withContext(NonCancellable + Dispatchers.IO) {
                if (p.isAlive) {
                    p.destroy()
                    terminate(p, graceMs = 10_000)
                }
                api = null
                process = null
                reader?.join(2_000)
            }
        }
    }

    /** Dossier d'état en 700 : ni lisible ni traversable par une autre app. */
    private fun lockDown(dir: File) {
        Os.chmod(dir.absolutePath, 0x1C0) // 0700, en une seule opération (pas de moment où le dossier est plus ouvert)
    }
}
