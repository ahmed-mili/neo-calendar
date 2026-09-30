package com.ahmed.neocalendar.core.workspace

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Un seul geste d'écriture à la fois : un second geste qui arrive pendant le premier est
 * IGNORÉ (double appui, relance), pas mis en file, puisqu'il porte un instantané périmé.
 */
class WriteGate {
    private val busy = AtomicBoolean(false)

    /** Vrai si l'appelant a la main ; il doit alors appeler [leave]. */
    fun tryEnter(): Boolean = busy.compareAndSet(false, true)

    fun leave() = busy.set(false)

    val isBusy: Boolean get() = busy.get()
}
