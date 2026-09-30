package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.ahmed.neocalendar.core.workspace.WorkspaceStorage
import java.io.IOException
import java.util.Locale

/** Lecture seule du dossier de notes par SAF ; mêmes règles que MainActivity.list() / findChild() / readText(). */
class SafWorkspaceStorage(private val context: Context, treeUri: Uri) : WorkspaceStorage {
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

    private fun findPath(relative: String): Uri? {
        var current = root
        for (part in relative.replace('\\', '/').split("/")) {
            if (part.isEmpty() || part == ".") continue
            if (part == "..") throw IllegalArgumentException("Chemin invalide")
            current = children(current).firstOrNull { it.name == part }?.uri ?: return null
        }
        return current
    }

    // Une instance sert une seule lecture : chaque dossier n'est interrogé qu'une fois (sinon chaque fichier relit tout le chemin).
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
