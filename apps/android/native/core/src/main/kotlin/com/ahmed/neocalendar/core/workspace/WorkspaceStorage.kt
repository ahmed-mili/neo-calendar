package com.ahmed.neocalendar.core.workspace

/** Un dossier de notes, lu par chemins relatifs à sa racine ("" = racine). Lecture seule. */
interface WorkspaceStorage {
    /** Enfants directs, triés comme le Java (nom en minuscules, Locale.ROOT). */
    fun list(relativeDir: String): List<Entry>

    /** Texte UTF-8 d'un fichier, ou null s'il n'existe pas. */
    fun readText(relativePath: String): String?

    /**
     * Les textes de plusieurs fichiers : même longueur et même ordre que `relativePaths`, null pour un absent.
     * Par défaut en série ; un stockage peut les lire en parallèle sans changer l'ordre ni le résultat.
     */
    fun readTexts(relativePaths: List<String>): List<String?> = relativePaths.map { readText(it) }

    /**
     * `lastModified` en ms depuis 1970 quand le stockage le sait (0 sinon) ; `size` en octets quand il le sait
     * (-1 sinon, et pour un dossier).
     */
    data class Entry(val name: String, val isDirectory: Boolean, val lastModified: Long = 0L, val size: Long = -1L)
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

    /**
     * Crée un fichier avec son contenu ; le nom doit être libre. Par défaut en deux temps (création puis
     * écriture, le fichier vide est retiré si l'écriture échoue) ; un stockage sur vrai chemin l'écrit
     * d'un bloc (temporaire puis renommage atomique).
     */
    fun createFileWithText(relativeDir: String, name: String, mimeType: String, text: String): String {
        val created = createFile(relativeDir, name, mimeType)
        try {
            writeText(created, text)
        } catch (e: Exception) {
            runCatching { delete(created) }
            throw e
        }
        return created
    }

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
