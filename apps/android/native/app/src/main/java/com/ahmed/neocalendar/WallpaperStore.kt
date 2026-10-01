package com.ahmed.neocalendar

import android.content.Context
import android.util.Log
import com.ahmed.neocalendar.core.workspace.BinaryWorkspaceStorage
import com.ahmed.neocalendar.nativeapp.StorageGate
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

/**
 * Les fonds d'écran, dans `.neo-calendar/wallpapers/` du dossier de notes plutôt que dans l'APK (dix mégaoctets
 * de photos représentaient 72 % de chaque mise à jour). Ce dossier appartient à l'utilisateur : il survit à la
 * désinstallation (dossier externe) et voyage avec la synchro. Fonctionne sur les deux stockages (privé ou SAF).
 *
 * Un fond est téléchargé quand il est CHOISI, jamais en lot. Son empreinte est vérifiée avant qu'il ne soit
 * publié sous son vrai nom : un octet de travers et rien n'est écrit.
 */
class WallpaperStore(private val context: Context) {
    private companion object {
        const val TAG = "NeoCalendarWallpaper"
        const val FOLDER = ".neo-calendar"
        const val SUBFOLDER = "wallpapers"
        const val DIR = "$FOLDER/$SUBFOLDER"
        const val MIME = "image/jpeg"
        const val MAX_BYTES = 40L * 1024L * 1024L
    }

    private fun readable(): BinaryWorkspaceStorage? = try {
        WorkspaceLocation.open(context, write = false)
    } catch (e: Exception) {
        Log.w(TAG, "Dossier de notes inutilisable", e)
        null
    }

    /** Le flux d'un fond déjà téléchargé, ou null. */
    fun open(name: String): InputStream? = try {
        if (name.isEmpty() || name.contains('/') || name.contains('\\') || name == "..") null
        else readable()?.openInput("$DIR/$name")
    } catch (e: Exception) {
        Log.w(TAG, "Ouverture de $name impossible", e)
        null
    }

    /** Les noms déjà présents, pour que le sélecteur sache quoi marquer. */
    fun installed(): List<String> = try {
        readable()?.list(DIR)?.filter { !it.isDirectory }?.map { it.name }.orEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Listage impossible", e)
        emptyList()
    }

    /** Les fonds déjà présents avec leur date de modification (ms) : {nom, date, nom, date...}. Sert à reprendre le dernier téléchargé. */
    fun installedWithDates(): List<Any> = try {
        readable()?.list(DIR)?.filter { !it.isDirectory }?.flatMap { listOf<Any>(it.name, it.lastModified) }.orEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Listage impossible", e)
        emptyList()
    }

    /** Télécharge UN fond et l'écrit dans le dossier. Lève [IOException] dont le message dit quoi : no-folder, name, checksum, create, http-NNN, too-large. */
    @Throws(IOException::class)
    fun download(name: String, url: String, sha256: String?) {
        if (name.isEmpty() || name.contains('/') || name.contains('\\') || name == "..") throw IOException("name")
        // Dossier inutilisable : dit avant le téléchargement ; le stockage est rouvert dans la porte, après lui.
        try {
            WorkspaceLocation.open(context, write = true)
        } catch (e: Exception) {
            throw IOException("no-folder")
        }
        val body = fetch(url)
        val actual = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
        if (!sha256.isNullOrEmpty() && !actual.equals(sha256, ignoreCase = true)) throw IOException("checksum")
        StorageGate.writing { publish(name, body) }
    }

    /** Écrit le fond dans le stockage courant ; appelé dans la porte d'écriture (jamais pendant un changement de stockage). */
    private fun publish(name: String, body: ByteArray) {
        val storage = try {
            WorkspaceLocation.open(context, write = true)
        } catch (e: Exception) {
            throw IOException("no-folder")
        }
        if (storage.list("").none { it.name == FOLDER }) storage.createDirectory("", FOLDER)
        if (storage.list(FOLDER).none { it.name == SUBFOLDER }) storage.createDirectory(FOLDER, SUBFOLDER)
        // Un fichier du même nom est remplacé : re-télécharger doit réparer, pas empiler des « image (1).jpg ».
        if (storage.list(DIR).any { it.name == name }) runCatching { storage.delete("$DIR/$name") }
        // Si le fournisseur a refusé la suppression, on écrit par-dessus.
        val target = if (storage.list(DIR).any { it.name == name }) {
            "$DIR/$name"
        } else {
            try {
                storage.createFile(DIR, name, MIME)
            } catch (e: IOException) {
                throw IOException("create")
            }
        }
        storage.writeStream(target, ByteArrayInputStream(body))
    }

    private fun fetch(url: String): ByteArray {
        val connection = URL(url).openConnection() as HttpsURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 45_000
        connection.instanceFollowRedirects = true
        try {
            val status = connection.responseCode
            if (status != HttpURLConnection.HTTP_OK) throw IOException("http-$status")
            connection.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(32 * 1024)
                var total = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count == -1) break
                    total += count
                    if (total > MAX_BYTES) throw IOException("too-large")
                    out.write(buffer, 0, count)
                }
                return out.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }
}
