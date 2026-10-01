package com.ahmed.neocalendar.core.sync

import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Le journal du moteur (sa sortie standard) : deux fichiers, `engine.log` et `engine.log.1`, qui ne
 * dépassent jamais `maxBytes` à eux deux (1 Mo). Quand le fichier courant atteint la moitié, il devient
 * `engine.log.1` (l'ancien `.1` disparaît). Les méthodes publiques sont synchronisées : le fil qui lit la sortie du
 * processus et celui qui note les erreurs de l'app écrivent sans se marcher dessus.
 */
class RotatingLog(private val dir: File, private val maxBytes: Long = 1_048_576) {
    private val current = File(dir, "engine.log")
    private val previous = File(dir, "engine.log.1")
    private var out: OutputStream? = null
    private var size = 0L

    private fun open() {
        dir.mkdirs()
        size = if (current.exists()) current.length() else 0L
        out = FileOutputStream(current, true)
    }

    @Synchronized
    fun write(bytes: ByteArray, length: Int = bytes.size) {
        if (out == null) open()
        // Un seul morceau plus gros que la moitié du plafond : on n'en garde que la fin.
        val half = (maxBytes / 2).toInt()
        val keep = minOf(length, half)
        if (size + keep > half) rotate()
        out!!.write(bytes, length - keep, keep)
        out!!.flush()
        size += keep
    }

    private fun rotate() {
        out?.close()
        out = null
        previous.delete()
        current.renameTo(previous)
        open()
    }

    @Synchronized
    fun close() {
        out?.close()
        out = null
    }

    /** Tout le journal, le plus ancien d'abord (pour l'afficher ou le partager). */
    @Synchronized
    fun readAll(): String {
        val old = if (previous.exists()) previous.readText(Charsets.UTF_8) else ""
        val now = if (current.exists()) current.readText(Charsets.UTF_8) else ""
        return old + now
    }
}
