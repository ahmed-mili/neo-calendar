package com.ahmed.neocalendar.core.workspace

/** Un dossier de notes, lu par chemins relatifs à sa racine ("" = racine). Lecture seule. */
interface WorkspaceStorage {
    /** Enfants directs, triés comme le Java (nom en minuscules, Locale.ROOT). */
    fun list(relativeDir: String): List<Entry>

    /** Texte UTF-8 d'un fichier, ou null s'il n'existe pas. */
    fun readText(relativePath: String): String?

    data class Entry(val name: String, val isDirectory: Boolean)
}
