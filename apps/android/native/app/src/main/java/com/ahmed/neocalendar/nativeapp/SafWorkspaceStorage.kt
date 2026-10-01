package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.ahmed.neocalendar.core.workspace.WorkspaceStorage
import com.ahmed.neocalendar.core.workspace.WritableWorkspaceStorage
import java.io.IOException
import java.util.Locale

/**
 * Le dossier de notes par SAF ; mêmes règles que MainActivity.list() / findChild() /
 * readText() / writeText() / createDocument() / renameDocument() / deleteDocument().
 * Une instance sert une seule opération : chaque dossier n'est interrogé qu'une
 * fois, et toute écriture oublie ce qui avait été listé.
 */
class SafWorkspaceStorage(private val context: Context, treeUri: Uri) : WritableWorkspaceStorage {
    private val root: Uri =
        DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))

    private class Doc(val uri: Uri, val name: String, val isDirectory: Boolean)

    override fun list(relativeDir: String): List<WorkspaceStorage.Entry> {
        val dir = findPath(relativeDir) ?: return emptyList()
        return children(dir).map { WorkspaceStorage.Entry(it.name, it.isDirectory) }
    }

    override fun readText(relativePath: String): String? {
        val uri = findPath(relativePath) ?: return null
        context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) throw IOException("Lecture impossible")
            return String(input.readBytes(), Charsets.UTF_8)
        }
    }

    /** L'URI du fichier, pour l'ouvrir dans une autre application ; null s'il n'existe pas. */
    fun uriOf(relativePath: String): Uri? = findPath(relativePath)

    override fun writeText(relativePath: String, text: String) {
        val uri = findPath(relativePath) ?: throw IOException("Écriture impossible: $relativePath")
        // « wt » : le fichier est tronqué avant l'écriture, un texte plus court ne laisse pas de reste.
        context.contentResolver.openOutputStream(uri, "wt").use { out ->
            if (out == null) throw IOException("Écriture impossible")
            out.write(text.toByteArray(Charsets.UTF_8))
        }
    }

    /** Écrit le contenu d'un flux dans un fichier déjà créé (une pièce jointe : des octets, pas du texte). */
    fun writeStream(relativePath: String, input: java.io.InputStream) {
        val uri = findPath(relativePath) ?: throw IOException("Écriture impossible: $relativePath")
        context.contentResolver.openOutputStream(uri, "wt").use { out ->
            if (out == null) throw IOException("Écriture impossible")
            input.copyTo(out)
        }
    }

    override fun createFile(relativeDir: String, name: String, mimeType: String): String {
        val parent = findPath(relativeDir) ?: throw IOException("Dossier introuvable : $relativeDir")
        DocumentsContract.createDocument(context.contentResolver, parent, mimeType, name)
            ?: throw IOException("Création impossible : $name")
        listings.clear()
        return child(relativeDir, name)
    }

    override fun createDirectory(relativeDir: String, name: String): String {
        val parent = findPath(relativeDir) ?: throw IOException("Dossier introuvable : $relativeDir")
        DocumentsContract.createDocument(context.contentResolver, parent, DocumentsContract.Document.MIME_TYPE_DIR, name)
            ?: throw IOException("Création du dossier impossible : $name")
        listings.clear()
        return child(relativeDir, name)
    }

    override fun rename(relativePath: String, newName: String): String {
        val uri = findPath(relativePath) ?: throw IOException("Renommage impossible : $relativePath")
        DocumentsContract.renameDocument(context.contentResolver, uri, newName) ?: throw IOException("Renommage impossible")
        listings.clear()
        return child(relativePath.substringBeforeLast('/', ""), newName)
    }

    override fun delete(relativePath: String) {
        val uri = findPath(relativePath) ?: return
        DocumentsContract.deleteDocument(context.contentResolver, uri)
        listings.clear()
    }

    private fun child(dir: String, name: String) = if (dir.isEmpty()) name else "$dir/$name"

    private fun findPath(relative: String): Uri? {
        var current = root
        for (part in relative.replace('\\', '/').split("/")) {
            if (part.isEmpty() || part == ".") continue
            if (part == "..") throw IllegalArgumentException("Chemin invalide")
            current = children(current).firstOrNull { it.name == part }?.uri ?: return null
        }
        return current
    }

    private val listings = HashMap<Uri, List<Doc>>()

    private fun children(parent: Uri): List<Doc> = listings.getOrPut(parent) { query(parent) }

    private fun query(parent: Uri): List<Doc> {
        val out = ArrayList<Doc>()
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(parent, DocumentsContract.getDocumentId(parent))
        val columns = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        context.contentResolver.query(uri, columns, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                out += Doc(
                    DocumentsContract.buildDocumentUriUsingTree(parent, c.getString(0)),
                    c.getString(1),
                    c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR,
                )
            }
        }
        return out.sortedBy { it.name.lowercase(Locale.ROOT) }
    }
}
