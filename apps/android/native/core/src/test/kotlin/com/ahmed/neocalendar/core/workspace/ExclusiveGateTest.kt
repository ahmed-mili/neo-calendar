package com.ahmed.neocalendar.core.workspace

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExclusiveGateTest {
    private fun thread(block: () -> Unit) = Thread(block).also { it.isDaemon = true; it.start() }

    @Test fun `une ecriture attend la fin d'un changement de stockage`() {
        val gate = ExclusiveGate()
        assertTrue(gate.beginSwitch())
        val entered = CountDownLatch(1)
        thread { gate.writing { entered.countDown() } }
        assertFalse("l'écriture ne doit pas passer pendant le changement", entered.await(300, TimeUnit.MILLISECONDS))
        gate.endSwitch()
        assertTrue(entered.await(2, TimeUnit.SECONDS))
    }

    @Test fun `un changement de stockage attend les ecritures en cours`() {
        val gate = ExclusiveGate()
        val inside = CountDownLatch(1)
        val release = CountDownLatch(1)
        thread { gate.writing { inside.countDown(); release.await() } }
        assertTrue(inside.await(2, TimeUnit.SECONDS))
        val began = AtomicBoolean(false)
        val switcher = thread { gate.beginSwitch(); began.set(true) }
        Thread.sleep(300)
        assertFalse("le changement ne doit pas commencer pendant une écriture", began.get())
        release.countDown()
        switcher.join(2000)
        assertTrue(began.get())
    }

    @Test fun `une ecriture imbriquee ne bloque pas un changement en attente`() {
        val gate = ExclusiveGate()
        val outerIn = CountDownLatch(1)
        val switchPending = CountDownLatch(1)
        val done = CountDownLatch(1)
        thread {
            gate.writing {
                outerIn.countDown()
                switchPending.await()
                Thread.sleep(200)
                gate.writing { }
            }
            done.countDown()
        }
        assertTrue(outerIn.await(2, TimeUnit.SECONDS))
        val switcher = thread { switchPending.countDown(); gate.beginSwitch() }
        assertTrue("pas d'interblocage", done.await(3, TimeUnit.SECONDS))
        switcher.join(2000)
        assertTrue(gate.isSwitching)
    }

    @Test fun `un second changement est refuse tant que le premier dure`() {
        val gate = ExclusiveGate()
        assertTrue(gate.beginSwitch())
        assertFalse(gate.beginSwitch())
        gate.endSwitch()
        assertTrue(gate.beginSwitch())
    }
}
