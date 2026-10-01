package com.ahmed.neocalendar.core.workspace

private const val CONFLICT_MARK = ".sync-conflict-"

/**
 * Ce que Syncthing (ou l'app, pour ses écritures atomiques) pose dans le dossier de notes et qui
 * n'est jamais une note ni un réglage : marqueur de dossier, versions, fichier d'exclusions,
 * temporaires de réception, temporaires d'écriture, copies de conflit.
 * Même règle que Syncthing pour les conflits : le nom contient `.sync-conflict-`.
 */
fun isSyncArtifact(name: String): Boolean =
    name == ".stfolder" || name == ".stversions" || name == ".stignore" ||
        (name.startsWith(".syncthing.") && name.endsWith(".tmp")) ||
        name.startsWith(".neo-tmp-") ||
        isConflictCopy(name)

/** Une copie de conflit de Syncthing (`note.sync-conflict-20260101-120000-ABCDEFG.md`). */
fun isConflictCopy(name: String): Boolean = name.contains(CONFLICT_MARK)

/** Les fichiers de conflit présents (chemins relatifs), partout dans le dossier sauf `.stversions` et `.stfolder`. */
fun conflictFiles(storage: WorkspaceStorage): List<String> {
    val found = ArrayList<String>()
    fun walk(dir: String) {
        for (entry in storage.list(dir)) {
            if (entry.name == ".stversions" || entry.name == ".stfolder") continue
            val path = if (dir.isEmpty()) entry.name else "$dir/${entry.name}"
            if (entry.isDirectory) walk(path)
            else if (isConflictCopy(entry.name)) found += path
        }
    }
    walk("")
    return found
}
