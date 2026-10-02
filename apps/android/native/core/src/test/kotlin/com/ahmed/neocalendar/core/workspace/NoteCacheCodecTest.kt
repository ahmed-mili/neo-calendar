package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NoteCacheCodecTest {
    private val files = mapOf(
        "Cal/é note.md" to CachedFile(1_700_000_000_123L, 42L, "---\ntitle: « Réunion » 😀\n---\n\ncorps\r\nsuite"),
        "Cal/vide.md" to CachedFile(5L, 0L, ""),
    )

    @Test fun `aller-retour - accents, emoji, retours a la ligne, texte vide`() {
        val raw = NoteCacheCodec.encode("saf:content://x", files)
        assertEquals(files, NoteCacheCodec.decode(raw, "saf:content://x"))
    }

    @Test fun `une copie sans fichier fait l'aller-retour`() {
        val raw = NoteCacheCodec.encode("private:/a", emptyMap())
        assertEquals(emptyMap<String, CachedFile>(), NoteCacheCodec.decode(raw, "private:/a"))
    }

    @Test fun `un autre dossier - copie ignoree`() {
        val raw = NoteCacheCodec.encode("saf:content://x", files)
        assertNull(NoteCacheCodec.decode(raw, "saf:content://autre"))
        assertNull(NoteCacheCodec.decode(raw, "private:/x"))
        assertNull(NoteCacheCodec.decode(raw, ""))
    }

    @Test fun `une version inconnue est ignoree`() {
        val raw = NoteCacheCodec.encode("id", files, version = NoteCacheCodec.VERSION + 1)
        assertNull(NoteCacheCodec.decode(raw, "id"))
        assertNotNull(NoteCacheCodec.decode(NoteCacheCodec.encode("id", files), "id"))
    }

    @Test fun `toute troncature est ignoree sans exception`() {
        val raw = NoteCacheCodec.encode("id", files)
        for (n in raw.indices) assertNull("tronquée à $n", NoteCacheCodec.decode(raw.copyOf(n), "id"))
    }

    @Test fun `un seul octet change, n'importe lequel, est ignore`() {
        val raw = NoteCacheCodec.encode("id", files)
        for (i in raw.indices) {
            val bad = raw.copyOf()
            bad[i] = (bad[i].toInt() xor 0x01).toByte()
            assertNull("octet $i", NoteCacheCodec.decode(bad, "id"))
        }
    }

    @Test fun `des octets en trop sont ignores`() {
        val raw = NoteCacheCodec.encode("id", files)
        assertNull(NoteCacheCodec.decode(raw + byteArrayOf(0), "id"))
    }

    @Test fun `vide et dechets sont ignores`() {
        assertNull(NoteCacheCodec.decode(ByteArray(0), "id"))
        assertNull(NoteCacheCodec.decode(ByteArray(64) { it.toByte() }, "id"))
        assertNull(NoteCacheCodec.decode("pas une copie".toByteArray(), "id"))
    }
}
