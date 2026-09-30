package com.ahmed.neocalendar.nativeapp

import java.util.Locale

/**
 * La langue de l'application : le français par défaut, quelle que soit celle du
 * système. Tout texte de date ou de libellé passe par ici ; le jour où l'app
 * aura un réglage de langue (inventaire §3), c'est ce seul point qui change.
 */
object AppLocale {
    val current: Locale = Locale.FRENCH
}
