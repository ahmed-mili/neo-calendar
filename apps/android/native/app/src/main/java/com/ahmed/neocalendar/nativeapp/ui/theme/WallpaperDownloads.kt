package com.ahmed.neocalendar.nativeapp.ui.theme

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.ahmed.neocalendar.WallpaperStore
import java.io.File
import org.json.JSONObject

/**
 * Les fonds d'écran du dossier de données (`WallpaperStore.java`, déjà dans l'APK) vus du natif : ce qui est téléchargé,
 * le téléchargement d'UN fond (empreinte SHA-256 vérifiée par le Java), les vignettes et le manifeste livrés dans l'APK
 * (`assets/themes/neo-wallpapers/`). Même source que `wallpaperDownload.ts` : le dépôt public.
 */
object WallpaperDownloads {
    private const val SOURCE = "https://raw.githubusercontent.com/ahmed-mili/neo-calendar/main/apps/windows/public/themes/neo-wallpapers/"
    private val thumbs = HashMap<String, ImageBitmap?>()
    private var manifest: Map<String, String>? = null

    /** Les noms de fichier déjà présents dans `.neo-calendar/wallpapers/` (à appeler hors du fil principal). */
    fun installed(context: Context): Set<String> =
        try { WallpaperStore(context).installed().toSet() } catch (_: Exception) { emptySet() }

    private fun shaOf(context: Context, file: String): String {
        val map = manifest ?: try {
            val text = context.assets.open("themes/neo-wallpapers/wallpapers.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
            val list = JSONObject(text).getJSONArray("wallpapers")
            (0 until list.length()).associate { list.getJSONObject(it).let { e -> e.getString("file") to e.optString("sha256") } }
        } catch (_: Exception) { emptyMap() }.also { manifest = it }
        return map[file].orEmpty()
    }

    /** Télécharge un fond et l'écrit dans le dossier ; rend `null` s'il est là, sinon le code d'échec (réseau, empreinte, dossier). À appeler hors du fil principal. */
    fun download(context: Context, file: String): String? = try {
        WallpaperStore(context).download(file, SOURCE + file, shaOf(context, file))
        null
    } catch (e: Exception) {
        e.message ?: "failed"
    }

    /** `x-portrait.jpg` -> `x.jpg` : la version paysage du même fond (le dépôt livre les deux), ou null. */
    fun landscapeOf(file: String): String? = if (file.endsWith("-portrait.jpg")) file.removeSuffix("-portrait.jpg") + ".jpg" else null

    private fun landscapeDir(context: Context) = File(context.filesDir, "wallpapers-landscape")

    /** La version paysage déjà téléchargée, ou null (disque seulement : jamais de réseau sur le chemin du premier écran). */
    fun landscapeLocal(context: Context, portraitFile: String): File? =
        landscapeOf(portraitFile)?.let { File(landscapeDir(context), it) }?.takeIf { it.isFile }

    /**
     * Télécharge la version paysage d'un fond, pour une tablette tournée. Gardée dans le stockage privé de l'app, jamais
     * dans le dossier de notes : elle ne sert qu'à cet appareil et n'a pas à voyager vers le téléphone et le PC. Empreinte
     * vérifiée comme pour les portraits. Hors du fil principal ; null si rien n'a pu être téléchargé.
     */
    @Synchronized
    fun landscape(context: Context, portraitFile: String): File? {
        landscapeLocal(context, portraitFile)?.let { return it }
        val name = landscapeOf(portraitFile) ?: return null
        return try {
            val body = WallpaperStore(context).fetchVerified(SOURCE + name, shaOf(context, name))
            val dir = landscapeDir(context).apply { mkdirs() }
            val tmp = File(dir, "$name.tmp")
            tmp.writeBytes(body)
            val target = File(dir, name)
            if (tmp.renameTo(target)) target else { tmp.delete(); null }
        } catch (_: Exception) {
            null
        }
    }

    /** La vignette livrée dans l'APK (`thumbs/<fichier>`), décodée une fois. */
    fun thumb(context: Context, file: String): ImageBitmap? = synchronized(thumbs) {
        thumbs.getOrPut(file) {
            try { context.assets.open("themes/neo-wallpapers/thumbs/$file").use { BitmapFactory.decodeStream(it) }?.asImageBitmap() } catch (_: Exception) { null }
        }
    }
}
