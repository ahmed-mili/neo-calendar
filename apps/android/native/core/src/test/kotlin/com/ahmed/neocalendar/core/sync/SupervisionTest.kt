package com.ahmed.neocalendar.core.sync

import com.ahmed.neocalendar.core.sync.RestartPolicy.Decision
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SupervisionTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun `les relances doublent de 2 s a 16 s puis on abandonne au cinquieme echec`() {
        val p = RestartPolicy()
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(500))
        assertEquals(Decision.RetryIn(4_000, 2), p.onExit(500))
        assertEquals(Decision.RetryIn(8_000, 3), p.onExit(500))
        assertEquals(Decision.RetryIn(16_000, 4), p.onExit(500))
        assertEquals(Decision.GiveUp, p.onExit(500))
    }

    @Test fun `le delai est plafonne a 5 minutes`() {
        val p = RestartPolicy(maxFailures = 50)
        var last = 0L
        repeat(20) { last = (p.onExit(100) as Decision.RetryIn).delayMs }
        assertEquals(300_000, last)
    }

    @Test fun `une execution stable d'une minute remet le compteur a zero`() {
        val p = RestartPolicy()
        p.onExit(100); p.onExit(100); p.onExit(100)
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(61_000))
    }

    @Test fun `reset apres une action de l'utilisateur`() {
        val p = RestartPolicy()
        repeat(4) { p.onExit(100) }
        p.reset()
        assertEquals(Decision.RetryIn(2_000, 1), p.onExit(100))
    }

    @Test fun `le journal garde tout ce qui est ecrit tant qu'il est petit`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write("une\n".toByteArray()); log.write("deux\n".toByteArray())
        assertEquals("une\ndeux\n", log.readAll())
    }

    @Test fun `le journal ne depasse jamais sa taille et garde le plus recent`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        repeat(100) { log.write("ligne %03d ........\n".format(it).toByteArray()) }
        log.close()
        val total = File(tmp.root, "engine.log").length() + File(tmp.root, "engine.log.1").length()
        assertTrue("total $total", total <= 1000)
        assertTrue(log.readAll().endsWith("ligne 099 ........\n"))
        assertTrue(!log.readAll().contains("ligne 000"))
    }

    @Test fun `un morceau plus gros que la moitie du plafond est tronque a sa fin`() {
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write(ByteArray(3000) { 'a'.code.toByte() } + "FIN".toByteArray())
        assertTrue(File(tmp.root, "engine.log").length() <= 500)
        assertTrue(log.readAll().endsWith("FIN"))
    }

    @Test fun `un journal existant est repris et non ecrase`() {
        File(tmp.root, "engine.log").writeText("avant\n")
        val log = RotatingLog(tmp.root, maxBytes = 1000)
        log.write("apres\n".toByteArray())
        assertEquals("avant\napres\n", log.readAll())
    }
}
