package com.ahmed.neocalendar.core.workspace

import java.security.MessageDigest

/**
 * Ce que le stockage privé a en plus du dossier externe actuel. `totalFiles` : les fichiers de notes du privé (sans corbeille,
 * copies de conflit ni artefacts de synchro) ; `onlyInPrivate` : ceux qui n'existent pas dans le dossier externe, ou y existent
 * avec un autre contenu (la version du téléphone serait perdue) ; `trashFiles` : fichiers de la corbeille `.stversions` ;
 * `conflictCopies` : copies de conflit.
 */
class PrivateComparison(
    val totalFiles: Int,
    val onlyInPrivate: List<String>,
    val onlyInPrivateNotes: Int,
    val trashFiles: Int,
    val conflictCopies: Int,
)

/** Comparaison en lecture seule, même relecture que la copie vérifiée (SHA-256). À appeler hors du fil principal. */
fun comparePrivateWithExternal(private: BinaryWorkspaceStorage, external: BinaryWorkspaceStorage): PrivateComparison {
    var total = 0
    var trash = 0
    var conflicts = 0
    val only = ArrayList<String>()

    fun countTrash(dir: String) {
        for (e in private.list(dir)) {
            val path = if (dir.isEmpty()) e.name else "$dir/${e.name}"
            if (e.isDirectory) countTrash(path) else trash++
        }
    }

    fun sha(storage: BinaryWorkspaceStorage, path: String): String? {
        val input = storage.openInput(path) ?: return null
        val digest = MessageDigest.getInstance("SHA-256")
        input.use {
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = it.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { b -> "%02x".format(b) }
    }

    fun walk(dir: String) {
        for (e in private.list(dir)) {
            val path = if (dir.isEmpty()) e.name else "$dir/${e.name}"
            when {
                e.name == ".stversions" && e.isDirectory -> countTrash(path)
                isConflictCopy(e.name) -> if (e.isDirectory) Unit else conflicts++
                isSyncArtifact(e.name) -> Unit
                e.isDirectory -> walk(path)
                else -> {
                    total++
                    val mine = sha(private, path)
                    if (mine == null || mine != sha(external, path)) only += path
                }
            }
        }
    }
    walk("")
    return PrivateComparison(total, only, only.count { it.lowercase(java.util.Locale.ROOT).endsWith(".md") }, trash, conflicts)
}

private fun plural(n: Int, one: String, many: String) = if (n == 1) "$n $one" else "$n $many"

/** Le texte du dialogue « Vider le stockage privé » ; `null` : le dossier externe n'a pas pu être lu, rien n'est prouvé. */
fun clearPrivateMessage(c: PrivateComparison?): String {
    if (c == null) {
        return "Le dossier externe n'a pas pu être lu : impossible de vérifier que les notes du stockage privé y existent aussi. " +
            "Si elles n'existent que dans le stockage privé, elles seront définitivement supprimées de ce téléphone."
    }
    val extra = buildString {
        if (c.trashFiles > 0) append("\nLa corbeille .stversions du stockage privé (${plural(c.trashFiles, "fichier", "fichiers")}) est supprimée avec lui.")
        if (c.conflictCopies > 0) append("\n${plural(c.conflictCopies, "copie de conflit", "copies de conflit")} du stockage privé ${if (c.conflictCopies == 1) "est supprimée" else "sont supprimées"} avec lui.")
    }
    if (c.onlyInPrivate.isEmpty()) {
        val all = if (c.totalFiles == 1) "Le fichier du stockage privé existe aussi" else "Les ${c.totalFiles} fichiers du stockage privé existent aussi"
        return "$all, identique${if (c.totalFiles == 1) "" else "s"}, dans le dossier externe actuel : le vider se fait sans perte." + extra
    }
    val n = c.onlyInPrivate.size
    val names = c.onlyInPrivate.take(5).joinToString(", ")
    val more = if (n > 5) " et ${n - 5} autres" else ""
    val subject = if (c.onlyInPrivateNotes == n) {
        if (n == 1) "1 note n'existe que dans le stockage privé et sera définitivement supprimée"
        else "$n notes n'existent que dans le stockage privé et seront définitivement supprimées"
    } else {
        if (n == 1) "1 fichier n'existe que dans le stockage privé et sera définitivement supprimé"
        else "$n fichiers n'existent que dans le stockage privé et seront définitivement supprimés"
    }
    val rest = c.totalFiles - n
    val tail = when {
        rest <= 0 -> ""
        rest == 1 -> " Le seul autre fichier du stockage privé existe aussi, identique, dans le dossier externe."
        else -> " Les $rest autres fichiers du stockage privé existent aussi, identiques, dans le dossier externe."
    }
    return "$subject : $names$more. Le stockage privé contient ${plural(c.totalFiles, "fichier", "fichiers")} au total.$tail" + extra
}

/**
 * Le texte de confirmation de « Ouvrir un dossier existant » : le stockage privé n'est jamais touché, mais ses notes absentes
 * du dossier choisi (ou qui y diffèrent) ne seront plus visibles. `null` : le dossier choisi n'a pas pu être comparé.
 */
fun openExistingMessage(c: PrivateComparison?): String {
    val ending = "La synchronisation intégrée sera arrêtée ; le stockage privé est conservé et pourra être vidé plus tard."
    if (c == null) {
        return "Le dossier choisi n'a pas pu être comparé au stockage privé : si des notes du stockage privé n'y existent pas, " +
            "elles ne seront plus visibles. Elles restent dans le stockage privé. $ending"
    }
    if (c.onlyInPrivate.isEmpty()) return "Les notes seront lues dans ce dossier, qui contient déjà tout le stockage privé. $ending"
    val n = c.onlyInPrivate.size
    val names = c.onlyInPrivate.take(5).joinToString(", ")
    val more = if (n > 5) " et ${n - 5} autres" else ""
    val subject = if (c.onlyInPrivateNotes == n) {
        if (n == 1) "1 note du stockage privé n'existe pas ou diffère dans ce dossier"
        else "$n notes du stockage privé n'existent pas ou diffèrent dans ce dossier"
    } else {
        if (n == 1) "1 fichier du stockage privé n'existe pas ou diffère dans ce dossier"
        else "$n fichiers du stockage privé n'existent pas ou diffèrent dans ce dossier"
    }
    return "$subject : $names$more. ${if (n == 1) "Elle ne sera plus visible" else "Elles ne seront plus visibles"} dans Neo Calendar " +
        "(elles restent dans le stockage privé). $ending"
}
