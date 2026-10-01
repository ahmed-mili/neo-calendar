package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.DatagramSocket
import java.net.ServerSocket
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FreePortTest {
    @Test fun `un port rendu est utilisable en TCP et en UDP`() {
        val port = pickFreePort()
        assertTrue(port in 1024..65535)
        ServerSocket(port).use { DatagramSocket(port).use { } }
    }

    @Test fun `un port deja pris en TCP est vu comme occupe`() {
        ServerSocket(0).use { held -> assertFalse(bindsTcpAndUdp(held.localPort)) }
    }

    @Test fun `un port deja pris en UDP est vu comme occupe`() {
        DatagramSocket(0).use { held -> assertFalse(bindsTcpAndUdp(held.localPort)) }
    }

    @Test fun `les ports occupes ou hors plage sont sautes`() {
        val offered = ArrayDeque(listOf(80, 40000, 40001, 40002))
        val busy = setOf(40000, 40001)
        assertEquals(40002, pickFreePort(isFree = { it !in busy }, candidate = { offered.removeFirst() }))
    }

    @Test fun `sans port libre apres les essais, une erreur claire`() {
        try { pickFreePort(isFree = { false }, candidate = { 40000 }, tries = 3); fail() } catch (e: IOException) {
            assertTrue(e.message!!.contains("Aucun port libre"))
        }
    }
}
