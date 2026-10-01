package com.ahmed.neocalendar.core.sync

/** Les réglages de la synchronisation intégrée, sur cet appareil seulement (jamais dans le dossier de notes). */
data class SyncSettings(
    val runMode: RunMode = RunMode.LikeFork,
    /** Démarrer aussi à l'allumage du téléphone (mode LikeFork). Désactivé par défaut, comme Syncthing-Fork. */
    val autoStart: Boolean = false,
    val conditions: RunConditions = RunConditions(),
    /** Le port d'écoute (TCP et QUIC), choisi à la première mise en route et gardé ; 0 = pas encore choisi. */
    val listenPort: Int = 0,
    /** Au moins un appareil est appairé : seulement alors le moteur tourne en dehors de la page Synchronisation. */
    val configured: Boolean = false,
    /** « Quitter » appuyé : le moteur reste arrêté jusqu'au prochain lancement de l'app. */
    val quit: Boolean = false,
)
