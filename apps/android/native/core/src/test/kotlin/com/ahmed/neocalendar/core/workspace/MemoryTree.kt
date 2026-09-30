package com.ahmed.neocalendar.core.workspace

import java.util.Locale

/**
 * Un dossier en mémoire qui se comporte comme le stockage SAF : un nom libre
 * pour créer ou renommer (le SAF en inventerait un autre, le Java a déjà vérifié
 * avant), un fichier à la fois par nom.
 */
internal class MemoryTree : WritableWorkspaceStorage {
    val files = LinkedHashMap<String, String>()
    val dirs = linkedSetOf<String>()
    var failWritesTo: String? = null
    val log = mutableListOf<String>()

    fun file(path: String, text: String = "") = apply {
        files[path] = text
        var parent = path.substringBeforeLast('/', "")
        while (parent.isNotEmpty()) {
            dirs += parent
            parent = parent.substringBeforeLast('/', "")
        }
    }

    fun dir(path: String) = apply { dirs += path }

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val prefix = if (relativeDir.isEmpty()) "" else "$relativeDir/"
        val out = LinkedHashMap<String, Boolean>()
        for (d in dirs) if (d.startsWith(prefix) && !d.substring(prefix.length).contains('/') && d.length > prefix.length) out[d.substring(prefix.length)] = true
        for (f in files.keys) if (f.startsWith(prefix) && !f.substring(prefix.length).contains('/')) out[f.substring(prefix.length)] = false
        return out.map { WorkspaceStorage.Entry(it.key, it.value) }.sortedBy { it.name.lowercase(Locale.ROOT) }
    }

    override fun readText(relativePath: String): String? = files[relativePath]

    override fun writeText(relativePath: String, text: String) {
        log += "write $relativePath"
        if (relativePath == failWritesTo) throw java.io.IOException("Ecriture impossible")
        check(relativePath in files) { "écriture dans un fichier absent : $relativePath" }
        files[relativePath] = text
    }

    override fun createFile(relativeDir: String, name: String, mimeType: String): String {
        log += "create $relativeDir/$name"
        val path = if (relativeDir.isEmpty()) name else "$relativeDir/$name"
        check(path !in files && path !in dirs) { "le nom est déjà pris : $path" }
        check(relativeDir.isEmpty() || relativeDir in dirs) { "dossier absent : $relativeDir" }
        files[path] = ""
        return path
    }

    override fun createDirectory(relativeDir: String, name: String): String {
        val path = if (relativeDir.isEmpty()) name else "$relativeDir/$name"
        check(path !in files && path !in dirs) { "le nom est déjà pris : $path" }
        dirs += path
        return path
    }

    override fun rename(relativePath: String, newName: String): String {
        log += "rename $relativePath -> $newName"
        val parent = relativePath.substringBeforeLast('/', "")
        val target = if (parent.isEmpty()) newName else "$parent/$newName"
        check(target !in files && target !in dirs) { "le nom est déjà pris : $target" }
        files.remove(relativePath)?.let { files[target] = it } ?: run {
            check(relativePath in dirs)
            dirs.remove(relativePath)
            dirs += target
        }
        return target
    }

    override fun delete(relativePath: String) {
        log += "delete $relativePath"
        if (files.remove(relativePath) == null) dirs.remove(relativePath)
    }
}

