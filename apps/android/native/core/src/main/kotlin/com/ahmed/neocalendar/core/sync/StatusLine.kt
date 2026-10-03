package com.ahmed.neocalendar.core.sync

/** La ligne d'état de la page Synchronisation (une seule, la plus importante). */
sealed interface StatusLine {
    data object NotConfigured : StatusLine
    data object Starting : StatusLine
    data object UpToDate : StatusLine
    data class Syncing(val files: Int) : StatusLine
    data class Paused(val reason: PauseReason) : StatusLine
    data object Offline : StatusLine
    data class Error(val message: String) : StatusLine

    fun text(): String = when (this) {
        NotConfigured -> "Aucun appareil : appairez le PC pour synchroniser"
        Starting -> "Démarrage…"
        UpToDate -> "À jour"
        is Syncing -> if (files == 1) "Synchronisation en cours (1 fichier)" else "Synchronisation en cours ($files fichiers)"
        is Paused -> "En pause : ${reason.label}"
        Offline -> "Hors ligne : aucun appareil connecté"
        is Error -> "Erreur : $message"
    }
}

/**
 * Priorité : erreur du moteur, pause (condition non remplie), pas d'appareil, démarrage, erreur du dossier,
 * synchro en cours, hors ligne (aucun appareil connecté), à jour.
 */
fun summarize(
    hasDevices: Boolean,
    engine: EngineState,
    decision: RunDecision,
    folder: FolderState?,
    anyDeviceConnected: Boolean,
): StatusLine = when {
    engine is EngineState.Missing -> StatusLine.Error("moteur de synchronisation absent de cette version")
    engine is EngineState.Failed -> StatusLine.Error(engine.error)
    engine is EngineState.Backoff -> StatusLine.Error("${engine.error} (nouvel essai dans ${engine.retryInMs / 1000} s)")
    decision is RunDecision.Pause -> StatusLine.Paused(decision.reason)
    !hasDevices -> StatusLine.NotConfigured
    engine !is EngineState.Running || folder == null -> StatusLine.Starting
    folder.error.isNotEmpty() -> StatusLine.Error(folder.error)
    folder.needFiles > 0 || folder.state == "syncing" || folder.state == "scanning" -> StatusLine.Syncing(folder.needFiles)
    !anyDeviceConnected -> StatusLine.Offline
    else -> StatusLine.UpToDate
}
