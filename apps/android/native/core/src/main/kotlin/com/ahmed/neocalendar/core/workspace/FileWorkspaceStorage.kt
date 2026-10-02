package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.util.Locale
import java.util.UUID

/**
 * Le dossier de notes sur un vrai chemin (stockage privé de l'app). Toute écriture est atomique :
 * un fichier temporaire `.neo-tmp-*` du même dossier (que `.stignore` fait ignorer à Syncthing),
 * `fsync`, puis renommage sur la cible. Syncthing ne voit jamais une note à moitié écrite, et un
 * arrêt en plein milieu laisse l'ancien contenu intact.
 */
class FileWorkspaceStorage(private val root: File) : BinaryWorkspaceStorage {
    private fun resolve(relative: String): File {
        var file = root
        for (part in relative.replace('\\', '/').split('/')) {
            if (part.isEmpty() || part == ".") continue
            if (part == "..") throw IllegalArgumentException("Chemin invalide")
            file = File(file, part)
        }
        return file
    }

    /** Un chemin qui se résout sur la racine elle-même (vide, `.`) : jamais supprimé ni renommé. */
    private fun resolveBelowRoot(relative: String): File {
        val file = resolve(relative)
        if (file == root) throw IllegalArgumentException("Chemin invalide : la racine")
        return file
    }

    /** Un nom, pas un chemin : ni vide, ni `.`, ni `..`, ni séparateur. */
    private fun requireSimpleName(name: String) {
        if (name.isEmpty() || name == "." || name == ".." || name.contains('/') || name.contains('\\'))
            throw IllegalArgumentException("Nom invalide : $name")
    }

    private fun child(dir: String, name: String) = if (dir.isEmpty()) name else "$dir/$name"

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> =
        (resolve(relativeDir).listFiles() ?: emptyArray())
            .map { WorkspaceStorage.Entry(it.name, it.isDirectory, it.lastModified()) }
            .sortedBy { it.name.lowercase(Locale.ROOT) }

    override fun readText(relativePath: String): String? {
        val file = resolve(relativePath)
        return if (file.isFile) String(file.readBytes(), Charsets.UTF_8) else null
    }

    override fun openInput(relativePath: String): InputStream? {
        val file = resolve(relativePath)
        return if (file.isFile) file.inputStream() else null
    }

    override fun writeText(relativePath: String, text: String) {
        val file = resolve(relativePath)
        if (!file.isFile) throw IOException("Écriture impossible: $relativePath")
        atomicWrite(file) { it.write(text.toByteArray(Charsets.UTF_8)) }
    }

    override fun writeStream(relativePath: String, input: InputStream) {
        val file = resolve(relativePath)
        if (!file.isFile) throw IOException("Écriture impossible: $relativePath")
        atomicWrite(file) { input.copyTo(it) }
    }

    override fun createFile(relativeDir: String, name: String, mimeType: String): String {
        requireSimpleName(name)
        val dir = resolve(relativeDir)
        if (!dir.isDirectory) throw IOException("Dossier introuvable : $relativeDir")
        try {
            Files.createFile(File(dir, name).toPath())
        } catch (e: java.nio.file.FileAlreadyExistsException) {
            throw IOException("Le nom est déjà pris : $name", e)
        }
        return child(relativeDir, name)
    }

    override fun createFileWithText(relativeDir: String, name: String, mimeType: String, text: String): String {
        requireSimpleName(name)
        val dir = resolve(relativeDir)
        if (!dir.isDirectory) throw IOException("Dossier introuvable : $relativeDir")
        val target = File(dir, name)
        if (target.exists()) throw IOException("Le nom est déjà pris : $name")
        atomicWrite(target) { it.write(text.toByteArray(Charsets.UTF_8)) }
        return child(relativeDir, name)
    }

    override fun createDirectory(relativeDir: String, name: String): String {
        requireSimpleName(name)
        val dir = resolve(relativeDir)
        if (!dir.isDirectory) throw IOException("Dossier introuvable : $relativeDir")
        if (!File(dir, name).mkdir()) throw IOException("Création du dossier impossible : $name")
        return child(relativeDir, name)
    }

    override fun rename(relativePath: String, newName: String): String {
        requireSimpleName(newName)
        val source = resolveBelowRoot(relativePath)
        if (!source.exists()) throw IOException("Renommage impossible : $relativePath")
        val target = File(source.parentFile, newName)
        if (target.exists()) throw IOException("Le nom est déjà pris : $newName")
        Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
        return child(relativePath.substringBeforeLast('/', ""), newName)
    }

    override fun delete(relativePath: String) {
        val file = resolveBelowRoot(relativePath)
        if (!file.exists()) return
        if (!file.deleteRecursively()) throw IOException("Suppression impossible : $relativePath")
    }

    private fun atomicWrite(target: File, write: (OutputStream) -> Unit) {
        val temporary = File(target.parentFile, ".neo-tmp-" + UUID.randomUUID())
        try {
            FileOutputStream(temporary).use { out ->
                write(out)
                out.flush()
                out.fd.sync()
            }
            Files.move(
                temporary.toPath(), target.toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
            )
        } catch (e: Throwable) {
            temporary.delete()
            throw e
        }
        // Le renommage lui-même doit survivre à une coupure : fsync du dossier, quand le système le permet.
        runCatching { FileChannel.open(target.parentFile.toPath(), StandardOpenOption.READ).use { it.force(true) } }
    }
}
