package com.ahmed.neocalendar.core.sync

/**
 * Le moteur doit-il tourner ? Un changement de stockage l'empêche toujours ; sinon il faut le stockage intégré et des
 * conditions de fonctionnement remplies, puis l'une des raisons : page Synchronisation ouverte ET app visible, appairage
 * en cours (le scanner de QR code est une autre activité : l'app y est masquée), ou fonctionnement en arrière-plan.
 */
fun engineWanted(
    storageSwitching: Boolean,
    integrated: Boolean,
    conditionsRun: Boolean,
    pageOpen: Boolean,
    appVisible: Boolean,
    pairingHeld: Boolean,
    background: Boolean,
): Boolean = !storageSwitching && integrated && conditionsRun && ((pageOpen && appVisible) || pairingHeld || background)
