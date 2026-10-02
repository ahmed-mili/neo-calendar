package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Le fichier de la copie des notes (`filesDir/note-cache.bin`) : lecture tolérante, écriture atomique. */
class NoteCacheFile(private val file: File) {
    /** La copie de ce dossier, ou vide pour tout défaut (absente, abîmée, autre version, autre dossier) : jamais d'exception. */
    fun load(identity: String): Map<String, CachedFile> = try {
        if (file.isFile) NoteCacheCodec.decode(file.readBytes(), identity) ?: emptyMap() else emptyMap()
    } catch (e: Exception) {
        emptyMap()
    }

    /**
     * Temporaire du même dossier, `fsync`, puis renommage atomique : un arrêt en plein milieu laisse l'ancienne copie
     * entière. Lève `IOException` si l'écriture échoue (disque plein) ; l'appelant l'ignore et la journalise.
     */
    @Synchronized
    fun save(identity: String, files: Map<String, CachedFile>) {
        val bytes = NoteCacheCodec.encode(identity, files)
        val temporary = File(file.parentFile, file.name + ".tmp")
        try {
            FileOutputStream(temporary).use { out ->
                out.write(bytes)
                out.flush()
                out.fd.sync()
            }
            Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (e: Throwable) {
            // Le temporaire d'un échec précédent (ou ce répertoire d'essai) n'est effacé que s'il est un simple fichier.
            if (temporary.isFile) temporary.delete()
            throw e
        }
    }
}
