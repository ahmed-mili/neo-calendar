package com.ahmed.neocalendar.core.sync

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
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

    /**
     * Ne lève jamais : un journal qui ne peut pas écrire (disque plein, dossier disparu) perd la ligne, mais celui qui
     * vide la sortie du processus doit continuer, sinon le moteur se bloque sur son tuyau. La prochaine écriture réessaie.
     */
    @Synchronized
    fun write(bytes: ByteArray, length: Int = bytes.size) {
        try {
            writeUnsafe(bytes, length)
        } catch (_: IOException) {
            runCatching { out?.close() }
            out = null
        }
    }

    private fun writeUnsafe(bytes: ByteArray, length: Int) {
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
        runCatching { out?.close() }
        out = null
    }

    /** Tout le journal, le plus ancien d'abord (pour l'afficher ou le partager). */
    @Synchronized
    fun readAll(): String {
        val old = if (previous.isFile) previous.readText(Charsets.UTF_8) else ""
        val now = if (current.isFile) current.readText(Charsets.UTF_8) else ""
        return old + now
    }
}
