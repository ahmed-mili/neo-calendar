package com.ahmed.neocalendar.core.workspace

/** Un dossier de notes, lu par chemins relatifs à sa racine ("" = racine). Lecture seule. */
interface WorkspaceStorage {
    /** Enfants directs, triés comme le Java (nom en minuscules, Locale.ROOT). */
    fun list(relativeDir: String): List<Entry>

    /** Texte UTF-8 d'un fichier, ou null s'il n'existe pas. */
    fun readText(relativePath: String): String?

    /** `lastModified` en ms depuis 1970 quand le stockage le sait (0 sinon). */
    data class Entry(val name: String, val isDirectory: Boolean, val lastModified: Long = 0L)
}

/**
 * Le même dossier, avec l'écriture. Les chemins sont relatifs à la racine
 * ("" = racine) ; un chemin rendu est celui du fichier tel qu'il existe
 * ensuite, à passer aux appels suivants.
 */
interface WritableWorkspaceStorage : WorkspaceStorage {
    /** Remplace tout le contenu d'un fichier existant (UTF-8). */
    fun writeText(relativePath: String, text: String)

    /** Crée un fichier vide dans un dossier qui existe ; le nom doit être libre. */
    fun createFile(relativeDir: String, name: String, mimeType: String): String

    /** Crée un sous-dossier ; le nom doit être libre. */
    fun createDirectory(relativeDir: String, name: String): String

    /** Change le nom d'un fichier ou d'un dossier, dans le même dossier (un renommage ne déplace pas). */
    fun rename(relativePath: String, newName: String): String

    /** Supprime un fichier ou un dossier. */
    fun delete(relativePath: String)
}

/**
 * Un stockage qui sait aussi lire et écrire des octets : pièces jointes, fonds d'écran, copie de bascule.
 * Les deux stockages réels (SAF et vrai chemin) l'implémentent.
 */
interface BinaryWorkspaceStorage : WritableWorkspaceStorage {
    /** Le contenu d'un fichier, ou null s'il n'existe pas. L'appelant ferme le flux. */
    fun openInput(relativePath: String): java.io.InputStream?

    /** Remplace le contenu d'un fichier déjà créé par celui du flux. */
    fun writeStream(relativePath: String, input: java.io.InputStream)
}
