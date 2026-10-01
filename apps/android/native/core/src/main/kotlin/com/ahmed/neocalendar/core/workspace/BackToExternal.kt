package com.ahmed.neocalendar.core.workspace

import java.io.ByteArrayInputStream

private const val MARKER_DIR_NAME = ".neo-calendar"
private const val MARKER_FILE_NAME = ".neo-calendar.json"
private const val PENDING_SUFFIX = ".copie-en-cours"

/** Les entrées de premier niveau d'un stockage, moins celles qu'on cache ; le reste passe tel quel (la source n'est jamais écrite). */
private class WithoutTopLevel(private val inner: BinaryWorkspaceStorage, private val hidden: Set<String>) : BinaryWorkspaceStorage by inner {
    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val all = inner.list(relativeDir)
        return if (relativeDir.isEmpty()) all.filter { it.name !in hidden } else all
    }
}

/** Un sous-dossier vu comme une racine. */
private class Scoped(private val inner: BinaryWorkspaceStorage, private val prefix: String) : BinaryWorkspaceStorage {
    private fun p(rel: String) = if (rel.isEmpty()) prefix else "$prefix/$rel"
    private fun back(path: String) = path.removePrefix("$prefix/")
    override fun list(relativeDir: String) = inner.list(p(relativeDir))
    override fun readText(relativePath: String) = inner.readText(p(relativePath))
    override fun writeText(relativePath: String, text: String) = inner.writeText(p(relativePath), text)
    override fun createFile(relativeDir: String, name: String, mimeType: String) = back(inner.createFile(p(relativeDir), name, mimeType))
    override fun createDirectory(relativeDir: String, name: String) = back(inner.createDirectory(p(relativeDir), name))
    override fun rename(relativePath: String, newName: String) = back(inner.rename(p(relativePath), newName))
    override fun delete(relativePath: String) = inner.delete(p(relativePath))
    override fun openInput(relativePath: String) = inner.openInput(p(relativePath))
    override fun writeStream(relativePath: String, input: java.io.InputStream) = inner.writeStream(p(relativePath), input)
}

private fun hasFiles(storage: WorkspaceStorage, dir: String = ""): Boolean =
    storage.list(dir).any { !it.isDirectory || hasFiles(storage, if (dir.isEmpty()) it.name else "$dir/${it.name}") }

/**
 * « Revenir à un dossier externe » : copie vérifiée du stockage privé dans `destination` (dossier vide), SANS le marqueur de
 * dossier Neo Calendar (`.neo-calendar/` et `.neo-calendar.json`) ; le marqueur n'est posé qu'ensuite, sous un nom provisoire
 * puis renommé : une copie interrompue n'est donc jamais acceptée par « Ouvrir un dossier existant ». En cas d'échec, tout ce
 * que cette copie a créé est supprimé. La source n'est jamais modifiée.
 */
fun copyBackToExternal(source: BinaryWorkspaceStorage, destination: BinaryWorkspaceStorage): CopyReport {
    if (destination.list("").isNotEmpty()) {
        val marked = try { isNeoCalendarFolder(destination) } catch (_: Exception) { false }
        throw CopyFailure(
            "",
            if (marked) "Le dossier de destination n'est pas vide : c'est déjà un dossier Neo Calendar (utilisez « Ouvrir un dossier existant » pour l'ouvrir)."
            else "Le dossier de destination n'est pas vide. C'est probablement une copie partielle interrompue d'un essai précédent : supprimez son contenu puis recommencez.",
        )
    }
    val markers = setOf(MARKER_DIR_NAME, MARKER_FILE_NAME)
    // Ce que la première passe crée à la racine : c'est tout ce qu'il faudra retirer si la seconde échoue.
    val topLevel = source.list("").filter { it.name !in markers && !isSyncArtifact(it.name) }.map { it.name }
    val report = copyWorkspaceVerified(WithoutTopLevel(source, markers), destination)
    val pending = ArrayList<String>()
    try {
        for (entry in source.list("").filter { it.name in markers }) {
            if (entry.isDirectory && entry.name == MARKER_DIR_NAME) {
                if (hasFiles(source, MARKER_DIR_NAME)) {
                    val temp = MARKER_DIR_NAME + PENDING_SUFFIX
                    destination.createDirectory("", temp)
                    pending += temp
                    copyWorkspaceVerified(Scoped(source, MARKER_DIR_NAME), Scoped(destination, temp))
                    pending -= temp
                    destination.rename(temp, MARKER_DIR_NAME)
                    pending += MARKER_DIR_NAME
                } else {
                    destination.createDirectory("", MARKER_DIR_NAME)
                    pending += MARKER_DIR_NAME
                }
            } else if (!entry.isDirectory && entry.name == MARKER_FILE_NAME) {
                val temp = MARKER_FILE_NAME + PENDING_SUFFIX
                val bytes = source.openInput(MARKER_FILE_NAME)?.use { it.readBytes() } ?: throw CopyFailure(MARKER_FILE_NAME, "lecture impossible")
                destination.createFile("", temp, "application/json")
                pending += temp
                destination.writeStream(temp, ByteArrayInputStream(bytes))
                val back = destination.openInput(temp)?.use { it.readBytes() }
                if (back == null || !back.contentEquals(bytes)) throw CopyFailure(MARKER_FILE_NAME, "contenu différent dans la copie")
                pending -= temp
                destination.rename(temp, MARKER_FILE_NAME)
                pending += MARKER_FILE_NAME
            }
        }
        return report
    } catch (e: Exception) {
        val stuck = ArrayList<String>()
        for (name in pending + topLevel) {
            try { destination.delete(name) } catch (_: Exception) { stuck += name }
        }
        if (stuck.isNotEmpty() && e is CopyFailure) {
            throw CopyFailure(e.path, e.reason + " ; nettoyage incomplet de la destination, à supprimer à la main : " + stuck.joinToString(", "))
        }
        if (e is CopyFailure) throw e
        throw CopyFailure(MARKER_DIR_NAME, "${e.javaClass.simpleName}: ${e.message}")
    }
}
