package com.ahmed.neocalendar.nativeapp

import android.content.Context
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.dueIcsLinks
import com.ahmed.neocalendar.core.ics.icsStatesFromJson
import com.ahmed.neocalendar.core.ics.icsStatesToJson
import com.ahmed.neocalendar.core.preferences.withIcsFeedDirectory
import com.ahmed.neocalendar.core.workspace.applyIcsDownload
import com.ahmed.neocalendar.core.workspace.describeIcsFailure
import com.ahmed.neocalendar.core.workspace.failedIcsState
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

private const val DEVICE_PREFS = "neo_native"
private const val STATES_KEY = "icsRuntimeState"
private const val MAX_BYTES = 20 * 1024 * 1024
private const val MAX_REDIRECTS = 5

/** Ce que le dialogue des liens montre : l'état de chaque lien, et ceux qui se synchronisent à l'instant. */
data class IcsUi(val states: Map<String, IcsSyncState> = emptyMap(), val syncing: Set<String> = emptySet())

/**
 * Le téléchargement d'un flux (Java `fetch` : délais de 15 s et de 20 s). Les redirections sont suivies
 * à la main, y compris d'http vers https que `HttpURLConnection` ne suit pas seul (le PC passe par
 * `curl --location`). Une réponse autre que 2xx est une erreur, pas un texte à lire.
 */
internal fun downloadIcs(address: String): String {
    var url = URL(address.trim())
    repeat(MAX_REDIRECTS + 1) {
        val connection = url.openConnection() as HttpURLConnection
        connection.connectTimeout = 15000
        connection.readTimeout = 20000
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("User-Agent", "NeoCalendar/1.0")
        try {
            val code = connection.responseCode
            if (code in 300..399 && code != 304) {
                val location = connection.getHeaderField("Location") ?: throw IOException("Redirection sans destination (HTTP $code).")
                url = URL(url, location)
                if (url.protocol != "http" && url.protocol != "https") throw IOException("Redirection vers une adresse non prise en charge.")
                return@repeat
            }
            if (code !in 200..299) throw IOException("Le serveur a répondu HTTP $code.")
            return connection.inputStream.use { readCapped(it) }
        } catch (e: UnknownHostException) {
            throw IOException("Adresse introuvable : vérifiez l'adresse du lien et la connexion.", e)
        } catch (e: SocketTimeoutException) {
            throw IOException("Le serveur ne répond pas (délai dépassé).", e)
        } finally {
            connection.disconnect()
        }
    }
    throw IOException("Trop de redirections.")
}

private fun readCapped(input: InputStream): String {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        out.write(buffer, 0, read)
        if (out.size() > MAX_BYTES) throw IOException("Le fichier du lien est trop gros.")
    }
    return String(out.toByteArray(), Charsets.UTF_8)
}

/**
 * La synchro des liens ICS. Deux flux se téléchargent en parallèle au plus ; l'application au dossier
 * (relecture, plan du noyau, écritures) se fait un lien à la fois, sur les notes lues à cet instant.
 * Rien ne tourne sur le fil principal. Un échec garde les notes et note l'erreur sur le lien.
 */
class IcsSync(
    context: Context,
    private val scope: CoroutineScope,
    /** Le dossier de notes, avec l'autorisation d'écrire (lève si elle est révoquée). */
    private val storage: () -> SafWorkspaceStorage,
    /** L'écriture sûre des préférences ; rend le message d'erreur, ou null. */
    private val updatePreferences: suspend ((JsonObject) -> JsonObject) -> String?,
    /** Des notes ont changé sur le disque : l'écran relit le dossier. */
    private val onNotesChanged: () -> Unit,
) {
    private val prefs = context.getSharedPreferences(DEVICE_PREFS, Context.MODE_PRIVATE)
    private val _ui = MutableStateFlow(IcsUi(icsStatesFromJson(prefs.getString(STATES_KEY, null))))
    val ui: StateFlow<IcsUi> = _ui.asStateFlow()

    /** Les liens en cours : touché depuis le fil principal seulement. */
    private val inFlight = HashSet<String>()
    private val downloads = Semaphore(2)
    private val applyLock = Mutex()

    /** Lance les liens dus (ou exactement les forcés) ; un lien déjà en cours n'est pas relancé. */
    fun sync(links: List<IcsLink>, defaultMinutes: Int, forced: Set<String>? = null) {
        val now = Instant.now()
        val due = dueIcsLinks(links, _ui.value.states, now, defaultMinutes, forced).filter { it.id !in inFlight }
        if (due.isEmpty()) return
        val ids = due.map { it.id }.toSet()
        inFlight += ids
        _ui.update { it.copy(syncing = it.syncing + ids) }
        scope.launch {
            val changed = try {
                due.map { link -> async { run(link, now) } }.awaitAll().any { it }
            } finally {
                inFlight -= ids
                _ui.update { it.copy(syncing = it.syncing - ids) }
            }
            if (changed) onNotesChanged()
        }
    }

    /** Un lien retiré n'a plus d'état à garder. */
    fun forget(id: String) = setStates(_ui.value.states - id)

    /** Rend vrai si des notes ont changé. */
    private suspend fun run(link: IcsLink, now: Instant): Boolean {
        val previous = _ui.value.states[link.id] ?: IcsSyncState(null, null, 0, emptyMap())
        var changed = false
        val next = try {
            val text = downloads.withPermit { withContext(Dispatchers.IO) { downloadIcs(link.url) } }
            val applied = applyLock.withLock { withContext(Dispatchers.IO) { applyIcsDownload(storage(), link, text, previous, now) } }
            changed = applied.written > 0 || applied.deleted > 0 || applied.provisionedDirectory != null
            // Le dossier du lien est noté dans le fichier partagé : le PC écrit au même endroit.
            applied.provisionedDirectory?.let { directory -> updatePreferences { withIcsFeedDirectory(it, link.id, directory) } }
            applied.state
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failedIcsState(previous, now, describeIcsFailure(e))
        }
        setStates(_ui.value.states + (link.id to next))
        return changed
    }

    private fun setStates(states: Map<String, IcsSyncState>) {
        _ui.update { it.copy(states = states) }
        prefs.edit().putString(STATES_KEY, icsStatesToJson(states).toString()).apply()
    }
}
