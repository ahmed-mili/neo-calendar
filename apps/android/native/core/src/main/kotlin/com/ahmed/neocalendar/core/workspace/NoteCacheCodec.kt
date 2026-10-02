package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32

/**
 * Le format de la copie des notes lues : magique, version, identité du dossier, nombre de fichiers, puis par fichier
 * chemin, `lastModified`, `size` et texte (UTF-8, longueur en tête), et pour finir un CRC32 sur tout ce qui précède.
 * `decode` ne lève jamais : tout défaut (troncature, octet changé, version ou dossier différents) rend null, et la copie
 * est alors reconstruite sans rien montrer à l'utilisateur.
 */
object NoteCacheCodec {
    const val VERSION = 1
    private const val MAGIC = 0x4E434E43 // « NCNC »
    private const val CRC_BYTES = 8
    private const val MAX_FILES = 1_000_000

    fun encode(identity: String, files: Map<String, CachedFile>, version: Int = VERSION): ByteArray {
        val body = ByteArrayOutputStream()
        DataOutputStream(body).use { out ->
            out.writeInt(MAGIC)
            out.writeInt(version)
            writeString(out, identity)
            out.writeInt(files.size)
            for ((path, f) in files) {
                writeString(out, path)
                out.writeLong(f.lastModified)
                out.writeLong(f.size)
                writeString(out, f.text)
            }
        }
        val bytes = body.toByteArray()
        val crc = CRC32().apply { update(bytes) }.value
        return bytes + ByteBuffer.allocate(CRC_BYTES).putLong(crc).array()
    }

    fun decode(raw: ByteArray, identity: String): Map<String, CachedFile>? {
        try {
            if (raw.size < CRC_BYTES + 8) return null
            val bodySize = raw.size - CRC_BYTES
            val expected = ByteBuffer.wrap(raw, bodySize, CRC_BYTES).long
            if (CRC32().apply { update(raw, 0, bodySize) }.value != expected) return null
            val input = DataInputStream(ByteArrayInputStream(raw, 0, bodySize))
            if (input.readInt() != MAGIC || input.readInt() != VERSION) return null
            if (readString(input) != identity) return null
            val count = input.readInt()
            if (count < 0 || count > MAX_FILES) return null
            val out = HashMap<String, CachedFile>(count * 2)
            repeat(count) {
                val path = readString(input) ?: return null
                val lastModified = input.readLong()
                val size = input.readLong()
                out[path] = CachedFile(lastModified, size, readString(input) ?: return null)
            }
            // Des octets en trop : ce n'est pas notre fichier.
            return if (input.available() == 0) out else null
        } catch (e: Exception) {
            return null
        }
    }

    private fun writeString(out: DataOutputStream, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        out.writeInt(bytes.size)
        out.write(bytes)
    }

    /** Le texte, ou null si la longueur annoncée dépasse ce qui reste (jamais d'allocation démesurée). */
    private fun readString(input: DataInputStream): String? {
        val length = input.readInt()
        if (length < 0 || length > input.available()) return null
        val bytes = ByteArray(length)
        input.readFully(bytes)
        return String(bytes, Charsets.UTF_8)
    }
}
