package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Le stockage privé contient déjà des notes : rien n'est écrasé, ni mélangé. */
class PrivateStorageInUse : IOException(
    "Le stockage privé contient déjà des notes (d'un passage précédent). Videz-le d'abord (Réglages, Synchronisation, « Vider le stockage privé ») pour éviter de les mélanger.",
)

/**
 * Le dossier privé contient-il autre chose qu'un dossier neuf (marqueur vide et `.stignore`) ? Une note, un réglage, une
 * pièce jointe, n'importe quel fichier le rend occupé : seul un dossier neuf peut être remplacé sans geste de l'utilisateur.
 */
fun privateStorageInUse(root: File): Boolean {
    if (!root.exists()) return false
    if (!root.isDirectory) return true
    if (workspaceHasNotes(FileWorkspaceStorage(root))) return true
    return root.walkTopDown().any { it.isFile && !(it.parentFile == root && it.name == ".stignore") }
}

/**
 * Copie `source` dans un dossier TEMPORAIRE voisin de `finalRoot`, vérifie la copie ([copyWorkspaceVerified]), ajoute marqueur
 * et `.stignore`, puis le renomme d'un coup (renommage atomique) en `finalRoot`. La source n'est jamais modifiée. Un stockage
 * privé occupé est refusé ([PrivateStorageInUse]) avant toute écriture. En cas d'échec le temporaire est supprimé en entier et
 * `finalRoot` n'a pas bougé : une [CopyFailure] nomme le fichier en cause.
 */
fun copyToPrivateAtomically(source: BinaryWorkspaceStorage, finalRoot: File): CopyReport {
    if (privateStorageInUse(finalRoot)) throw PrivateStorageInUse()
    val staging = File(finalRoot.parentFile, finalRoot.name + ".copie-en-cours")
    // Un temporaire d'une coupure précédente est à nous : on l'écarte pour ne pas le mêler à la copie.
    if (staging.exists() && !staging.deleteRecursively()) throw IOException("Le dossier temporaire ${staging.name} d'un essai précédent ne peut pas être supprimé.")
    try {
        if (!staging.mkdirs()) throw IOException("Le dossier temporaire ${staging.name} ne peut pas être créé.")
        val destination = FileWorkspaceStorage(staging)
        val report = copyWorkspaceVerified(source, destination)
        initNewWorkspace(destination)
        // Revérifié juste avant de retirer l'ancien dossier : seul un dossier neuf (sans aucun fichier de l'utilisateur) part.
        if (privateStorageInUse(finalRoot)) throw PrivateStorageInUse()
        if (finalRoot.exists() && !finalRoot.deleteRecursively()) throw IOException("Le dossier privé vide ne peut pas être remplacé.")
        Files.move(staging.toPath(), finalRoot.toPath(), StandardCopyOption.ATOMIC_MOVE)
        return report
    } catch (e: Throwable) {
        if (staging.exists() && !staging.deleteRecursively()) e.addSuppressed(IOException("Le dossier temporaire ${staging.name} n'a pas pu être supprimé."))
        throw e
    }
}
