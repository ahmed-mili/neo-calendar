package com.ahmed.neocalendar.core.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IgnoredFilesTest {
    @Test fun `les artefacts de Syncthing et de l'app sont reconnus`() {
        for (name in listOf(
            ".stfolder", ".stversions", ".stignore", ".syncthing.rdv.md.tmp", ".neo-tmp-1b2c",
            "rdv.sync-conflict-20260101-120000-ABCDEFG.md", "x.sync-conflict-20260101-120000-ABCDEFG",
        )) assertTrue(name, isSyncArtifact(name))
    }

    @Test fun `une note ordinaire n'est pas un artefact`() {
        for (name in listOf("rdv.md", ".neo-calendar", ".neo-calendar.json", "syncthing.md", "conflict.md", "a.tmp")) {
            assertFalse(name, isSyncArtifact(name))
        }
    }

    @Test fun `le chargement ignore les copies de conflit et les temporaires dans les deux niveaux`() {
        val tree = MemoryTree()
            .file("Travail/rdv.md", "ok")
            .file("Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md", "double")
            .file("Travail/.neo-tmp-9f.md", "a moitie ecrit")
            .file("Travail/sous/n.sync-conflict-20260102-010101-QWERTYU.md", "double")
            .file("Travail/sous/n.md", "ok")
            .file(".stignore", ".neo-tmp-*")
        val loaded = loadWorkspace(tree)
        assertEquals(listOf("Travail/rdv.md", "Travail/sous/n.md"), loaded.eventFiles.map { it.relativePath })
    }

    @Test fun `les notes a la racine (calendrier par defaut) filtrent aussi les conflits`() {
        val tree = MemoryTree().file("a.md", "1").file("a.sync-conflict-20260101-120000-ABCDEFG.md", "2")
        assertEquals(listOf("a.md"), loadWorkspace(tree).eventFiles.map { it.relativePath })
    }

    @Test fun `le nettoyage des liens ICS peut garder les copies de conflit, mais jamais les autres artefacts`() {
        val tree = MemoryTree()
            .file("Etudes/cours.md", "1")
            .file("Etudes/cours.sync-conflict-20260101-120000-ABCDEFG.md", "2")
            .file("Etudes/.neo-tmp-9f.md", "3")
        assertEquals(
            listOf("Etudes/cours.md", "Etudes/cours.sync-conflict-20260101-120000-ABCDEFG.md"),
            loadWorkspace(tree, keepConflictCopies = true).eventFiles.map { it.relativePath },
        )
    }

    @Test fun `les conflits sont comptes partout sauf dans les versions`() {
        val tree = MemoryTree()
            .file("Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md")
            .file(".neo-calendar/.neo-calendar.sync-conflict-20260101-120000-ABCDEFG.json")
            .file(".stversions/Travail/vieux.sync-conflict-20260101-120000-ABCDEFG.md")
            .file("Travail/ok.md")
        assertEquals(
            listOf(".neo-calendar/.neo-calendar.sync-conflict-20260101-120000-ABCDEFG.json", "Travail/rdv.sync-conflict-20260101-120000-ABCDEFG.md"),
            conflictFiles(tree).sorted(),
        )
    }
}
