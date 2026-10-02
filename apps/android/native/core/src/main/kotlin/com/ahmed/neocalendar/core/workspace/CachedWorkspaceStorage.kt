package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/** Le contenu d'un fichier tel qu'il était à `lastModified` et `size` (le critère de Syncthing). */
data class CachedFile(val lastModified: Long, val size: Long, val text: String)

/**
 * Un `WorkspaceStorage` qui épargne les lectures inutiles. `list` va toujours au stockage réel (il donne la date et la taille
 * de chaque fichier) ; `readText` rend la copie quand la date ET la taille listées, toutes deux connues, sont celles de la
 * copie, sinon lit le stockage réel. Un fichier sans date ou sans taille connue est toujours relu (jamais gardé). Une
 * égalité stricte : une date plus ancienne, après un retour d'horloge ou un fichier remplacé, relit aussi.
 *
 * Les lectures réelles de `readTexts` se font en parallèle, `parallelism` au plus ; l'ordre et le résultat sont ceux d'une
 * lecture en série, et l'erreur levée est celle du premier fichier en échec dans l'ordre demandé.
 *
 * Une instance sert une seule passe : `list` puis `readText`/`readTexts`, puis `snapshot()` pour la copie suivante.
 */
class CachedWorkspaceStorage(
    private val delegate: WorkspaceStorage,
    private val initial: Map<String, CachedFile> = emptyMap(),
    private val parallelism: Int = 4,
) : WorkspaceStorage {
    private val listed = ConcurrentHashMap<String, WorkspaceStorage.Entry>()
    private val kept = ConcurrentHashMap<String, CachedFile>()

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val entries = delegate.list(relativeDir)
        for (e in entries) if (!e.isDirectory) listed[if (relativeDir.isEmpty()) e.name else "$relativeDir/${e.name}"] = e
        return entries
    }

    override fun readText(relativePath: String): String? {
        // Un fichier que le listage n'a pas montré (les réglages d'un dossier caché) : ni copie ni garde.
        val entry = listed[relativePath] ?: return delegate.readText(relativePath)
        val usable = entry.lastModified > 0L && entry.size >= 0L
        val known = initial[relativePath]
        if (usable && known != null && known.lastModified == entry.lastModified && known.size == entry.size) {
            kept[relativePath] = known
            return known.text
        }
        val text = delegate.readText(relativePath) ?: return null
        // La date et la taille sont celles du listage, prises AVANT la lecture : un fichier modifié entre les deux
        // ne s'y reconnaît pas au passage suivant et est relu.
        if (usable) kept[relativePath] = CachedFile(entry.lastModified, entry.size, text)
        return text
    }

    override fun readTexts(relativePaths: List<String>): List<String?> {
        if (parallelism <= 1 || relativePaths.size <= 1) return relativePaths.map { readText(it) }
        val pool = Executors.newFixedThreadPool(minOf(parallelism, relativePaths.size))
        try {
            val futures = relativePaths.map { path -> pool.submit(Callable { readText(path) }) }
            // `get` dans l'ordre demandé : le premier échec de la série est celui qui remonte.
            return futures.map {
                try {
                    it.get()
                } catch (e: ExecutionException) {
                    throw e.cause ?: IOException("Lecture impossible", e)
                }
            }
        } finally {
            pool.shutdownNow()
        }
    }

    /** Les fichiers lus pendant cette passe, avec la date et la taille du listage. Un fichier disparu n'y est plus. */
    fun snapshot(): Map<String, CachedFile> = HashMap(kept)

    /** Vrai quand la copie suivante diffère de celle reçue : une lecture réelle a eu lieu, ou un fichier a disparu. */
    val changed: Boolean get() = kept != initial
}
