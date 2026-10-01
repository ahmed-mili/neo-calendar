package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class StaleEnginesTest {
    private val home = "/data/user/0/com.ahmedmili.neocalendar/files/syncthing"
    private val lib = "/data/app/~~x/com.ahmedmili.neocalendar-y/lib/x86_64/libsyncthingnative.so"
    private val own = 10247

    private fun engine(pid: Int, uid: Int = own, homeDir: String = home) =
        ProcInfo(pid, uid, listOf(lib, "serve", "--home=$homeDir", "--no-browser", "--no-upgrade"))

    @Test fun `le moniteur et son enfant restants sont choisis`() {
        assertEquals(listOf(100, 101), staleEngines(listOf(engine(100), engine(101)), own, selfPid = 50, home = home))
    }

    @Test fun `un moteur d'un autre uid n'est jamais choisi`() {
        assertEquals(emptyList<Int>(), staleEngines(listOf(engine(100, uid = 10249)), own, 50, home))
    }

    @Test fun `un moteur sur un autre dossier d'etat n'est pas choisi`() {
        assertEquals(emptyList<Int>(), staleEngines(listOf(engine(100, homeDir = "/data/user/0/autre/files/syncthing")), own, 50, home))
        // Un préfixe de chemin n'est pas le même dossier.
        assertEquals(emptyList<Int>(), staleEngines(listOf(engine(100, homeDir = "$home-2")), own, 50, home))
    }

    @Test fun `un autre programme du meme uid n'est pas choisi, ni l'app elle-meme`() {
        val other = ProcInfo(200, own, listOf("com.ahmedmili.neocalendar"))
        val mentionsHome = ProcInfo(201, own, listOf("/system/bin/sh", "-c", "--home=$home"))
        val me = engine(50)
        assertEquals(emptyList<Int>(), staleEngines(listOf(other, mentionsHome, me), own, selfPid = 50, home = home))
    }

    @Test fun `une ligne de commande vide est ignoree`() {
        assertEquals(emptyList<Int>(), staleEngines(listOf(ProcInfo(300, own, emptyList())), own, 50, home))
    }
}
