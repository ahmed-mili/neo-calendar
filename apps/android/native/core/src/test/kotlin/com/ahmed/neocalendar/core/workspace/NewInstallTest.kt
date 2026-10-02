package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NewInstallTest {
    private val fresh = InstallFacts(
        storedMode = null,
        treeUri = null,
        persistedGrantCount = 0,
        oldAppInstalled = false,
        firstInstallTime = 1_000L,
        lastUpdateTime = 1_000L,
    )

    @Test fun `une vraie nouvelle installation cree le dossier prive`() {
        assertTrue(isGenuineNewInstall(fresh))
    }

    @Test fun `un mode ecrit, meme illisible, n'est pas une nouvelle installation`() {
        assertFalse(isGenuineNewInstall(fresh.copy(storedMode = "Integrated")))
        assertFalse(isGenuineNewInstall(fresh.copy(storedMode = "External")))
        assertFalse(isGenuineNewInstall(fresh.copy(storedMode = "n'importe quoi")))
    }

    @Test fun `un dossier SAF memorise n'est pas une nouvelle installation`() {
        assertFalse(isGenuineNewInstall(fresh.copy(treeUri = "content://x/tree/y")))
    }

    @Test fun `une permission de dossier encore accordee, preferences perdues, n'est pas une nouvelle installation`() {
        assertFalse(isGenuineNewInstall(fresh.copy(persistedGrantCount = 1)))
    }

    @Test fun `l'ancienne app installee n'est pas une nouvelle installation`() {
        assertFalse(isGenuineNewInstall(fresh.copy(oldAppInstalled = true)))
    }

    @Test fun `une app deja mise a jour n'est pas une nouvelle installation`() {
        assertFalse(isGenuineNewInstall(fresh.copy(lastUpdateTime = 2_000_000L)))
    }

    @Test fun `un dossier vide en chaine vide compte comme absent`() {
        assertTrue(isGenuineNewInstall(fresh.copy(treeUri = "")))
    }

    @Test fun `changer de dossier est refuse en mode integre seulement`() {
        assertFalse(mayPickExternalTree(StorageMode.Integrated))
        assertTrue(mayPickExternalTree(StorageMode.External))
        assertTrue(mayPickExternalTree(null))
    }

    @Test fun `quelques secondes d'ecart entre installation et mise a jour restent une nouvelle installation`() {
        assertTrue(isGenuineNewInstall(fresh.copy(lastUpdateTime = 1_000L + 3_000L)))
        assertFalse(isGenuineNewInstall(fresh.copy(lastUpdateTime = 1_000L + 60_000L)))
        assertFalse(isGenuineNewInstall(fresh.copy(lastUpdateTime = 1_000L - 60_000L)))
    }
}
