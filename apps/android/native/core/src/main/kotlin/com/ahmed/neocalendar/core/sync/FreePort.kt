package com.ahmed.neocalendar.core.sync

import java.io.IOException
import java.net.DatagramSocket
import java.net.ServerSocket

/** Le port est libre en TCP ET en UDP (Syncthing écoute en TCP et en QUIC sur le même numéro). */
fun bindsTcpAndUdp(port: Int): Boolean = try {
    ServerSocket(port).use { }
    DatagramSocket(port).use { }
    true
} catch (_: IOException) {
    false
}

private fun ephemeralPort(): Int = ServerSocket(0).use { it.localPort }

/**
 * Un port d'écoute libre pour le moteur. Syncthing-Fork peut tenir 22000 sur le même téléphone : on
 * demande un port éphémère au système et on vérifie qu'il est libre en TCP et en UDP.
 * `isFree` et `candidate` sont là pour les tests.
 */
fun pickFreePort(
    isFree: (Int) -> Boolean = ::bindsTcpAndUdp,
    candidate: () -> Int = ::ephemeralPort,
    tries: Int = 50,
): Int {
    repeat(tries) {
        val port = candidate()
        if (port in 1024..65535 && isFree(port)) return port
    }
    throw IOException("Aucun port libre trouvé pour la synchronisation.")
}
