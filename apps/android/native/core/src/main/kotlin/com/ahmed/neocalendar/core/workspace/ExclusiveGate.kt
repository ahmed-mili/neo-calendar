package com.ahmed.neocalendar.core.workspace

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * La porte qui rend vrai « rien n'est écrit pendant la copie » : toute écriture dans le dossier de notes (note, réglages, pièce
 * jointe, fond d'écran, lien ICS) passe par [writing] ; un changement de stockage prend [beginSwitch], qui attend la fin des
 * écritures en cours et retient les suivantes jusqu'à [endSwitch]. Pas de verrou lié à un fil : un changement de stockage peut
 * se poursuivre sur un autre fil (coroutines). Une écriture imbriquée dans une écriture déjà admise passe toujours (sinon un
 * changement en attente et une écriture qui en appelle une autre se bloqueraient l'un l'autre).
 *
 * [afterWrite] est appelé à la fin de chaque écriture de premier niveau, réussie ou non (une partie a pu être écrite), hors du
 * verrou : la synchro y demande un scan immédiat. Son échec ne touche jamais l'écriture.
 */
class ExclusiveGate(private val afterWrite: () -> Unit = {}) {
    private val lock = ReentrantLock()
    private val changed = lock.newCondition()
    private var writers = 0
    private var switching = false
    private val depth = ThreadLocal.withInitial { 0 }

    val isSwitching: Boolean get() = lock.withLock { switching }

    fun <T> writing(block: () -> T): T {
        val nested = depth.get() > 0
        if (!nested) lock.withLock {
            while (switching) changed.awaitUninterruptibly()
            writers++
        }
        depth.set(depth.get() + 1)
        try {
            return block()
        } finally {
            depth.set(depth.get() - 1)
            if (!nested) {
                lock.withLock {
                    writers--
                    changed.signalAll()
                }
                runCatching(afterWrite)
            }
        }
    }

    /** Commence un changement de stockage : attend les écritures en cours. Faux si un autre changement est déjà en cours. */
    fun beginSwitch(): Boolean = lock.withLock {
        if (switching) return false
        switching = true
        while (writers > 0) changed.awaitUninterruptibly()
        true
    }

    fun endSwitch() = lock.withLock {
        switching = false
        changed.signalAll()
    }
}
