package com.ahmed.neocalendar.core.workspace

import java.io.IOException
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest

/** Ce que la copie a rapporté : nombre de fichiers et octets copiés. */
class CopyReport(val files: Int, val bytes: Long)

/** Une copie qui n'a pas pu être garantie ; `path` est le fichier en cause ("" pour la copie entière). */
class CopyFailure(val path: String, reason: String) : IOException(if (path.isEmpty()) reason else "$path : $reason")

private class Node(val path: String, val isDirectory: Boolean)

private class Fingerprint(val size: Long, val sha256: String)

/**
 * Copie tout le dossier `source` dans `destination` (qui doit être vide), sans les artefacts de
 * synchro ([isSyncArtifact]), puis vérifie : même liste, mêmes tailles, même SHA-256, source relue
 * une seconde fois (un fichier que Syncthing aurait modifié pendant la copie fait échouer la copie,
 * jamais une copie bancale). La source n'est JAMAIS modifiée. En cas d'échec, ce que la copie a
 * elle-même créé dans `destination` est supprimé (rien d'autre) et une [CopyFailure] nomme le fichier en cause.
 */
fun copyWorkspaceVerified(source: BinaryWorkspaceStorage, destination: BinaryWorkspaceStorage): CopyReport {
    if (destination.list("").isNotEmpty()) throw CopyFailure("", "Le dossier de destination n'est pas vide.")
    // Les entrées de premier niveau créées par cette copie : seules celles-là sont retirées en cas d'échec.
    val created = ArrayList<String>()
    try {
        return copyThenVerify(source, destination, created)
    } catch (e: Throwable) {
        for (name in created) runCatching { destination.delete(name) }
        throw e
    }
}

private fun copyThenVerify(
    source: BinaryWorkspaceStorage,
    destination: BinaryWorkspaceStorage,
    created: MutableList<String>,
): CopyReport {
    val nodes = try { inventory(source) } catch (e: IOException) { throw CopyFailure("", "lecture de la source impossible (${e.message})") }
    val destinationOf = HashMap<String, String>()
    val copied = HashMap<String, Fingerprint>()
    var bytes = 0L
    for (node in nodes) {
        val parent = node.path.substringBeforeLast('/', "")
        val name = node.path.substringAfterLast('/')
        val destParent = if (parent.isEmpty()) "" else destinationOf.getValue(parent)
        val target = try {
            if (node.isDirectory) destination.createDirectory(destParent, name)
            else destination.createFile(destParent, name, "application/octet-stream")
        } catch (e: IOException) {
            throw CopyFailure(node.path, "création impossible dans la copie (${e.message})")
        } catch (e: IllegalArgumentException) {
            throw CopyFailure(node.path, "nom refusé par la copie (${e.message})")
        }
        destinationOf[node.path] = target
        if (parent.isEmpty()) created += target
        if (node.isDirectory) continue
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        val input = source.openInput(node.path) ?: throw CopyFailure(node.path, "lecture impossible")
        try {
            DigestInputStream(input, digest).use { stream ->
                destination.writeStream(target, object : InputStream() {
                    override fun read(): Int = stream.read().also { if (it >= 0) size++ }
                    override fun read(b: ByteArray, off: Int, len: Int): Int =
                        stream.read(b, off, len).also { if (it > 0) size += it }
                })
            }
        } catch (e: IOException) {
            throw CopyFailure(node.path, "copie impossible (${e.message})")
        }
        copied[node.path] = Fingerprint(size, hex(digest.digest()))
        bytes += size
    }
    verify(source, destination, nodes, destinationOf, copied)
    return CopyReport(copied.size, bytes)
}

private fun verify(
    source: BinaryWorkspaceStorage,
    destination: BinaryWorkspaceStorage,
    nodes: List<Node>,
    destinationOf: Map<String, String>,
    copied: Map<String, Fingerprint>,
) {
    val expected = nodes.map { it.path to it.isDirectory }.toSet()
    val againSource = inventory(source).map { it.path to it.isDirectory }.toSet()
    (expected - againSource).firstOrNull()?.let { throw CopyFailure(it.first, "a disparu de la source pendant la copie") }
    (againSource - expected).firstOrNull()?.let { throw CopyFailure(it.first, "est apparu dans la source pendant la copie") }
    val inDestination = inventory(destination, filterArtifacts = false).map { it.path to it.isDirectory }.toSet()
    val mapped = nodes.map { destinationOf.getValue(it.path) to it.isDirectory }.toSet()
    (mapped - inDestination).firstOrNull()?.let { throw CopyFailure(it.first, "absent de la copie") }
    (inDestination - mapped).firstOrNull()?.let { throw CopyFailure(it.first, "inattendu dans la copie") }
    for (node in nodes) {
        if (node.isDirectory) continue
        val wanted = copied.getValue(node.path)
        val again = fingerprint(source, node.path) ?: throw CopyFailure(node.path, "a disparu de la source pendant la copie")
        if (again.size != wanted.size || again.sha256 != wanted.sha256) throw CopyFailure(node.path, "a changé dans la source pendant la copie")
        val copy = fingerprint(destination, destinationOf.getValue(node.path)) ?: throw CopyFailure(node.path, "absent de la copie")
        if (copy.size != wanted.size) throw CopyFailure(node.path, "taille différente (${wanted.size} octets à la source, ${copy.size} dans la copie)")
        if (copy.sha256 != wanted.sha256) throw CopyFailure(node.path, "contenu différent")
    }
}

private fun fingerprint(storage: BinaryWorkspaceStorage, path: String): Fingerprint? {
    val input = try { storage.openInput(path) } catch (e: IOException) { throw CopyFailure(path, "lecture impossible (${e.message})") }
        ?: return null
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    try {
        input.use {
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = it.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
                size += n
            }
        }
    } catch (e: IOException) {
        throw CopyFailure(path, "lecture impossible (${e.message})")
    }
    return Fingerprint(size, hex(digest.digest()))
}

/** Tous les dossiers et fichiers, un dossier toujours avant son contenu, sans les artefacts de synchro. */
private fun inventory(storage: WorkspaceStorage, filterArtifacts: Boolean = true): List<Node> {
    val out = ArrayList<Node>()
    fun walk(dir: String) {
        for (entry in storage.list(dir)) {
            if (filterArtifacts && isSyncArtifact(entry.name)) continue
            val path = if (dir.isEmpty()) entry.name else "$dir/${entry.name}"
            out += Node(path, entry.isDirectory)
            if (entry.isDirectory) walk(path)
        }
    }
    walk("")
    return out
}

private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
