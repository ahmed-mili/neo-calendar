package com.ahmed.neocalendar.nativeapp

/**
 * Les extras des intentions qui rouvrent l'app (notification, widget, reprise de mise à jour). Les valeurs sont
 * celles des versions précédentes : un rappel déjà programmé les porte encore et doit ouvrir la bonne fiche.
 */
object NativeExtras {
    /** L'évènement qu'une notification ou une ligne du widget veut ouvrir. */
    const val EVENT_ID = "neoCalendarEventId"

    /** Posé par l'action « Réessayer » de la notification d'échec de mise à jour. */
    const val UPDATE_RETRY = "neoCalendarUpdateRetry"
}
