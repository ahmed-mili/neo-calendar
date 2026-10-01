package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Le stockage privé contient déjà des données : rien n'est écrasé, ni mélangé. */
class PrivateStorageInUse : IOException(
    "Le stockage privé contient déjà des données (notes d'un passage précédent, réglages ou pièces jointes). Videz-le d'abord (Réglages, Synchronisation, « Vider le stockage privé ») pour éviter de les mélanger.",
)

/**
 * Le dossier privé contient-il autre chose qu'un dossier neuf (marqueur vide et `.stignore`) ? Une note, un réglage, une
 * pièce jointe, n'importe quel fichier le rend occupé : seul un dossier neuf peut être remplacé sans geste de l'utilisateur.
 */
fun privateStorageInUse(root: File): Boolean {
    if (!root.exists()) return false
    if (!root.isDirectory) return true
    if (workspaceHasNotes(FileWorkspaceStorage(root))) return true
    // Le marqueur du moteur (`.stfolder`) et `.stignore` ne sont pas des données de l'utilisateur.
    return root.walkTopDown().onEnter { !(it.parentFile == root && it.name == ".stfolder") }
        .any { it.isFile && !(it.parentFile == root && it.name == ".stignore") }
}

/**
 * Le moteur exige le marqueur `.stfolder` à la racine du dossier de notes : une copie fraîche (bascule après « Vider ») ne
 * l'emporte pas. Le recrée s'il manque ; sans effet quand le dossier de notes n'existe pas (rien n'est créé de force).
 */
fun ensureFolderMarker(root: File) {
    if (!root.isDirectory) return
    val marker = File(root, ".stfolder")
    if (!marker.exists() && !marker.mkdir()) throw IOException("Le marqueur .stfolder ne peut pas être créé dans ${root.name}.")
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
        syncDirectory(finalRoot.parentFile)
        return report
    } catch (e: Throwable) {
        if (staging.exists() && !staging.deleteRecursively()) e.addSuppressed(IOException("Le dossier temporaire ${staging.name} n'a pas pu être supprimé."))
        throw e
    }
}

/** Rend le renommage durable : `fsync` du dossier parent. Au mieux (certains systèmes refusent d'ouvrir un dossier) : la copie est déjà complète. */
private fun syncDirectory(dir: File) {
    try {
        java.nio.channels.FileChannel.open(dir.toPath(), java.nio.file.StandardOpenOption.READ).use { it.force(true) }
    } catch (_: Exception) {
    }
}
