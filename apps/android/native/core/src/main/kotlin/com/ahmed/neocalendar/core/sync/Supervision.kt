package com.ahmed.neocalendar.core.sync

/** Où en est le processus Syncthing. */
sealed interface EngineState {
    /** Pas lancé (ou arrêté proprement). */
    data object Stopped : EngineState

    /** Le binaire n'est pas dans l'APK (compilation locale sans `jniLibs`). */
    data object Missing : EngineState

    data object Starting : EngineState
    data object Running : EngineState

    /** S'est arrêté de lui-même : une relance est programmée. */
    data class Backoff(val attempt: Int, val retryInMs: Long, val error: String) : EngineState

    /** Trop d'échecs de suite : plus de relance automatique jusqu'à une action de l'utilisateur. */
    data class Failed(val error: String) : EngineState
}

/**
 * Quand relancer le moteur qui s'est arrêté seul : 2 s, 4 s, 8 s… plafonné à 5 min, et après
 * `maxFailures` échecs de suite (5) plus de relance. Une exécution d'au moins `stableAfterMs` (1 min)
 * remet le compteur à zéro. Un arrêt demandé par l'app n'est pas un échec : il ne passe pas ici.
 */
class RestartPolicy(
    private val maxFailures: Int = 5,
    private val baseMs: Long = 2_000,
    private val capMs: Long = 300_000,
    private val stableAfterMs: Long = 60_000,
) {
    sealed interface Decision {
        data class RetryIn(val delayMs: Long, val attempt: Int) : Decision
        data object GiveUp : Decision
    }

    private var failures = 0

    fun onExit(ranMs: Long): Decision {
        if (ranMs >= stableAfterMs) failures = 0
        failures++
        if (failures >= maxFailures) return Decision.GiveUp
        // Le décalage est borné : au-delà de 40 doublements le plafond est de toute façon atteint.
        val delay = minOf(capMs, baseMs shl minOf(failures - 1, 40))
        return Decision.RetryIn(delay, failures)
    }

    /** Action de l'utilisateur (« Réessayer », mise en route manuelle) : on repart de zéro. */
    fun reset() { failures = 0 }
}
