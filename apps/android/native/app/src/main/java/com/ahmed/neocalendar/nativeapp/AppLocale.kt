package com.ahmed.neocalendar.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ahmed.neocalendar.core.format.CoreLanguage
import java.util.Locale

/**
 * La langue de l'application, `neo-calendar.language` de l'ancienne : `fr` par défaut, quelle que soit celle du système,
 * ou `en`. C'est un état Compose : les textes se retraduisent aussitôt le choix fait (voir `ui/I18n.kt`).
 */
object AppLanguage {
    var code by mutableStateOf("fr")
        private set

    val isEnglish get() = code == "en"

    /** Une valeur inconnue est le français. Rend `true` si la langue a changé. */
    fun set(value: String?): Boolean {
        val next = if (value == "en") "en" else "fr"
        val changed = next != code
        code = next
        CoreLanguage.english = next == "en"
        return changed
    }
}

/** La langue des dates et des libellés : le français par défaut, quelle que soit celle du système. */
object AppLocale {
    val current: Locale get() = if (AppLanguage.isEnglish) Locale.ENGLISH else Locale.FRENCH
}
