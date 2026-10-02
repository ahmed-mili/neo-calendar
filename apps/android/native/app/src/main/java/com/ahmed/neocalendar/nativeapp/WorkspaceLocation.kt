package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.FileWorkspaceStorage
import com.ahmed.neocalendar.core.workspace.InstallFacts
import com.ahmed.neocalendar.core.workspace.NoteCacheFile
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.core.workspace.isGenuineNewInstall
import com.ahmed.neocalendar.core.workspace.initNewWorkspace
import com.ahmed.neocalendar.core.workspace.resolveStorageMode
import java.io.File

/**
 * Le dossier de notes courant. Une installation d'avant ce mode (un dossier SAF déjà choisi, pas de mode
 * écrit) est `External` : rien n'est copié, déplacé ni demandé à la mise à jour (`resolveStorageMode`).
 */
object WorkspaceLocation {
    private const val PREFS = "neo_android"
    private const val KEY_TREE = "tree_uri"
    private const val KEY_MODE = "storage_mode"

    fun privateRoot(context: Context): File = File(context.filesDir, "Neo Calendar")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** `null` : rien de choisi, c'est une nouvelle installation. Ne touche pas au disque (appelable sur le fil principal). */
    fun mode(context: Context): StorageMode? {
        val p = prefs(context)
        return resolveStorageMode(p.getString(KEY_MODE, null), p.getString(KEY_TREE, null))
    }

    fun setMode(context: Context, mode: StorageMode) {
        prefs(context).edit().putString(KEY_MODE, mode.name).commit()
    }

    fun isNewInstall(context: Context): Boolean = mode(context) == null

    /**
     * Première ouverture d'une nouvelle installation : le dossier privé `Neo Calendar`, son marqueur et son
     * `.stignore`, puis le mode. Le mode est écrit EN DERNIER : une coupure au milieu recommence proprement.
     * Hors du fil principal. Sans effet quand un mode est déjà écrit (appelable à chaque lecture).
     */
    @Synchronized
    fun prepareNewInstall(context: Context) {
        // Les faits ne sont réunis que dans la branche « aucun mode » : rien de plus pour une installation saine.
        if (!isNewInstall(context) || !isGenuineNewInstall(installFacts(context))) return
        val root = privateRoot(context)
        root.mkdirs()
        initNewWorkspace(FileWorkspaceStorage(root))
        setMode(context, StorageMode.Integrated)
    }

    private fun installFacts(context: Context): InstallFacts {
        val p = prefs(context)
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return InstallFacts(
            storedMode = p.getString(KEY_MODE, null),
            treeUri = p.getString(KEY_TREE, null),
            persistedGrantCount = context.contentResolver.persistedUriPermissions.size,
            oldAppInstalled = isOldAppInstalled(context),
            firstInstallTime = info.firstInstallTime,
            lastUpdateTime = info.lastUpdateTime,
        )
    }

    /** Le dossier SAF choisi, avec les contrôles habituels (permission durable) ; `write` exige aussi l'autorisation d'écrire. */
    fun externalTreeUri(context: Context, write: Boolean): Uri {
        val raw = prefs(context).getString(KEY_TREE, "").orEmpty()
        if (raw.isEmpty()) throw Exception("Sélectionnez d'abord un dossier de notes.")
        val uri = Uri.parse(raw)
        val grants = context.contentResolver.persistedUriPermissions.filter { it.uri == uri }
        if (grants.none { it.isReadPermission }) throw Exception("L'autorisation du dossier a été révoquée. Sélectionnez-le à nouveau.")
        if (write && grants.none { it.isWritePermission }) {
            throw Exception("L'autorisation d'écrire dans le dossier a été révoquée. Sélectionnez-le à nouveau.")
        }
        return uri
    }

    /** Le dossier choisi ET le mode `External`, en une seule édition atomique. Hors du fil principal (`commit`). */
    fun chooseExternalTree(context: Context, uri: Uri) {
        prefs(context).edit().putString(KEY_TREE, uri.toString()).putString(KEY_MODE, StorageMode.External.name).commit()
    }

    /** Le stockage du dossier de notes, selon le mode. Lève une exception au message lisible si le dossier n'est pas utilisable. */
    fun open(context: Context, write: Boolean): BinaryWorkspaceStorage = when (mode(context)) {
        StorageMode.Integrated -> FileWorkspaceStorage(privateRoot(context))
        StorageMode.External -> SafWorkspaceStorage(context, externalTreeUri(context, write))
        null -> throw Exception("Sélectionnez d'abord un dossier de notes.")
    }

    /** Le nom du dossier pour les Réglages. */
    fun displayName(context: Context): String = when (mode(context)) {
        StorageMode.Integrated -> "Stockage privé de l'application"
        StorageMode.External -> {
            val raw = prefs(context).getString(KEY_TREE, "").orEmpty()
            runCatching {
                android.provider.DocumentsContract.getTreeDocumentId(Uri.parse(raw)).substringAfterLast(':').substringAfterLast('/')
            }.getOrDefault(raw)
        }
        null -> "Aucun"
    }

    /**
     * Ce que la copie des notes sait du dossier : change dès qu'on change de dossier SAF ou de mode de stockage, de sorte
     * qu'une copie ne sert jamais pour un autre dossier. Chaîne vide : rien n'est choisi (aucune copie).
     */
    fun cacheIdentity(context: Context): String = when (mode(context)) {
        StorageMode.Integrated -> "private:" + privateRoot(context).absolutePath
        StorageMode.External -> "saf:" + prefs(context).getString(KEY_TREE, "").orEmpty()
        null -> ""
    }

    @Volatile private var noteCacheFile: NoteCacheFile? = null

    /** L'unique `NoteCacheFile` de l'application (son verrou et son temporaire sont partagés : jamais deux instances pour un fichier). */
    fun noteCache(context: Context): NoteCacheFile = noteCacheFile ?: synchronized(this) {
        noteCacheFile ?: NoteCacheFile(File(context.applicationContext.filesDir, "note-cache.bin")).also { noteCacheFile = it }
    }

    /** Une pièce jointe à ouvrir dans une autre appli : un URI SAF, ou un URI de FileProvider pour le stockage privé. Null si elle n'existe pas. */
    fun attachmentUri(context: Context, relativePath: String): Uri? = when (mode(context)) {
        StorageMode.Integrated -> {
            val file = File(privateRoot(context), relativePath)
            val inside = file.canonicalPath.startsWith(privateRoot(context).canonicalPath + File.separator)
            if (inside && file.isFile) FileProvider.getUriForFile(context, "${context.packageName}.updates", file) else null
        }
        StorageMode.External -> (open(context, write = false) as SafWorkspaceStorage).uriOf(relativePath)
        null -> null
    }
}
