package com.ahmed.neocalendar.core.i18n

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class FrenchToEnglishTest {
    private val small = FrenchToEnglish(
        "# commentaire\nParamètres\tSettings\nAujourd'hui\tToday\n{n} événements\t{n} events\n1 événement\t1 event\nRappel : {}\tReminder: {}\n",
    )

    @Test fun `une entree exacte`() {
        assertEquals("Settings", small.translate("Paramètres"))
        assertEquals("Today", small.translate("Aujourd'hui"))
    }

    @Test fun `un modele garde ce qu'il capture`() {
        assertEquals("3 events", small.translate("3 événements"))
        assertEquals("1 event", small.translate("1 événement"))
        assertEquals("Reminder: Today", small.translate("Rappel : Aujourd'hui"))
    }

    @Test fun `les deux orthographes d'evenement se valent`() {
        assertEquals("3 events", small.translate("3 évènements"))
        assertEquals("1 event", small.translate("1 évènement"))
    }

    @Test fun `un texte inconnu reste tel quel`() {
        assertEquals("Réunion équipe", small.translate("Réunion équipe"))
        assertEquals("", small.translate(""))
    }

    @Test fun `le vrai dictionnaire donne les textes des Reglages`() {
        val tsv = File("../app/src/main/res/raw/i18n_fr_en.tsv").takeIf { it.exists() }?.readText() ?: error("res/raw/i18n_fr_en.tsv introuvable")
        val dictionary = FrenchToEnglish(tsv)
        assertEquals("Colour mode", dictionary.translate("Mode de couleur"))
        assertEquals("Theme", dictionary.translate("Thème"))
        assertEquals("Language", dictionary.translate("Langue"))
        assertEquals("Reset this theme", dictionary.translate("Réinitialiser ce thème"))
        assertEquals("Translucent sidebar", dictionary.translate("Barre latérale translucide"))
        assertEquals("Wallpaper brightness", dictionary.translate("Luminosité du fond"))
        assertEquals("Check for updates", dictionary.translate("Rechercher les mises à jour"))
    }
}
