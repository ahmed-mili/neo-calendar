package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StorageModeTest {
    private val tree = "content://com.android.externalstorage.documents/tree/primary%3ANotes"

    @Test fun `une nouvelle installation n'a aucun mode`() {
        assertNull(resolveStorageMode(null, null))
        assertNull(resolveStorageMode(null, ""))
    }

    @Test fun `une installation d'avant, avec son dossier SAF, reste en dossier externe sans rien demander`() {
        assertEquals(StorageMode.External, resolveStorageMode(null, tree))
    }

    @Test fun `le mode ecrit l'emporte, dossier SAF memorise ou non`() {
        assertEquals(StorageMode.Integrated, resolveStorageMode("Integrated", tree))
        assertEquals(StorageMode.Integrated, resolveStorageMode("Integrated", null))
        assertEquals(StorageMode.External, resolveStorageMode("External", null))
    }

    @Test fun `un mode illisible retombe sur la regle du dossier SAF`() {
        assertEquals(StorageMode.External, resolveStorageMode("n'importe quoi", tree))
        assertNull(resolveStorageMode("n'importe quoi", null))
    }
}
