package com.ahmed.neocalendar.core.workspace

import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Un stockage en mémoire qui compte ses appels et mesure la simultanéité des lectures. Les chemins sont
 * ceux du stockage ("Cal/a.md") ; les dossiers se déduisent des chemins.
 */
internal class CountingStorage(private val readDelayMs: Long = 0L) : WorkspaceStorage {
    class Stamped(var text: String, var lastModified: Long, var size: Long)

    val files = java.util.TreeMap<String, Stamped>()
    /** Chemins listés mais dont la lecture rend null (fichier disparu ou illisible). */
    val unreadable = mutableSetOf<String>()
    val reads = ConcurrentHashMap<String, AtomicInteger>()
    val listCalls = AtomicInteger()
    private val running = AtomicInteger()
    val peak = AtomicInteger()

    fun put(path: String, text: String, lastModified: Long = 1000L, size: Long = text.toByteArray(Charsets.UTF_8).size.toLong()) = apply {
        files[path] = Stamped(text, lastModified, size)
    }

    /** Lectures de notes (`.md`) seulement : les réglages lus au passage ne comptent pas. */
    fun noteReads(): Int = reads.filterKeys { it.endsWith(".md") }.values.sumOf { it.get() }

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        listCalls.incrementAndGet()
        val prefix = if (relativeDir.isEmpty()) "" else "$relativeDir/"
        val out = LinkedHashMap<String, WorkspaceStorage.Entry>()
        for ((path, stamped) in files) {
            if (!path.startsWith(prefix)) continue
            val rest = path.substring(prefix.length)
            if (rest.contains('/')) {
                val dir = rest.substringBefore('/')
                out.getOrPut(dir) { WorkspaceStorage.Entry(dir, true) }
            } else {
                out[rest] = WorkspaceStorage.Entry(rest, false, stamped.lastModified, stamped.size)
            }
        }
        return out.values.sortedBy { it.name.lowercase(Locale.ROOT) }
    }

    override fun readText(relativePath: String): String? {
        reads.getOrPut(relativePath) { AtomicInteger() }.incrementAndGet()
        val now = running.incrementAndGet()
        peak.accumulateAndGet(now) { a, b -> maxOf(a, b) }
        try {
            if (readDelayMs > 0) Thread.sleep(readDelayMs)
            if (relativePath in unreadable) return null
            return files[relativePath]?.text
        } finally {
            running.decrementAndGet()
        }
    }
}
