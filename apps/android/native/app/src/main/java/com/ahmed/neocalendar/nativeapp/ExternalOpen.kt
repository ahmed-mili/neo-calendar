package com.ahmed.neocalendar.nativeapp

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import com.ahmed.neocalendar.core.description.attachmentPathFor
import com.ahmed.neocalendar.core.location.LocationDestination
import com.ahmed.neocalendar.core.location.geoUrlFor
import com.ahmed.neocalendar.core.location.mapsAppsFor
import com.ahmed.neocalendar.core.location.mapsUrlFor
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Une application de cartes que le téléphone a : `id` est celui du menu (google...), absent pour une application `geo:` quelconque. */
data class InstalledMap(val id: String?, val packageName: String, val label: String)

private val KNOWN_PACKAGES = listOf(
    "google" to "com.google.android.apps.maps",
    "citymapper" to "com.citymapper.app.release",
    "moovit" to "com.tranzmate",
    "waze" to "com.waze",
)

private val KNOWN_LABELS = mapOf("google" to "Google Maps", "citymapper" to "Citymapper", "moovit" to "Moovit", "waze" to "Waze")

/** Ce qui s'ouvre hors de l'app : cartes, liens web, pièces jointes du dossier. */
object ExternalOpen {
    /**
     * Les cartes installées : les quatre qu'on sait viser (leur `id` est celui du menu), puis celles qu'Android dit
     * capables d'ouvrir un point `geo:` et dont on ignore l'adresse d'itinéraire (Bonjour RATP et les suivantes se
     * signalent elles-mêmes ; on ne leur promet qu'une épingle).
     */
    fun installedMaps(context: Context): List<InstalledMap> = try {
        val packages = context.packageManager
        val seen = HashSet<String>()
        val found = ArrayList<InstalledMap>()
        for ((id, pkg) in KNOWN_PACKAGES) {
            if (packages.getLaunchIntentForPackage(pkg) == null) continue
            seen.add(pkg)
            found.add(InstalledMap(id, pkg, KNOWN_LABELS.getValue(id)))
        }
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=0,0"))
        for (info in packages.queryIntentActivities(probe, 0)) {
            val pkg = info.activityInfo?.packageName ?: continue
            if (pkg == context.packageName || !seen.add(pkg)) continue
            val label = info.loadLabel(packages)?.toString().orEmpty()
            if (label.isEmpty()) continue
            found.add(InstalledMap(null, pkg, label))
        }
        found
    } catch (_: Exception) {
        emptyList()
    }

    /**
     * Les choix du menu « Ouvrir dans les cartes » pour cette destination : les
     * applications qu'on sait viser et qui sont là, puis celles qui ne savent
     * que recevoir un point (`geo:`), si la destination en a un.
     */
    fun mapChoices(destination: LocationDestination, installed: List<InstalledMap>): List<InstalledMap> {
        val ids = installed.mapNotNull { it.id }
        val known = mapsAppsFor(destination, native = true, installed = ids).mapNotNull { id -> installed.firstOrNull { it.id == id } }
        val others = if (geoUrlFor(destination) != null) installed.filter { it.id == null } else emptyList()
        return known + others
    }

    fun openMap(context: Context, destination: LocationDestination, choice: InstalledMap?, travelMode: String) {
        val url = when {
            destination is LocationDestination.Link -> destination.value
            choice == null -> mapsUrlFor(destination, "google", travelMode, native = false)
            choice.id != null -> mapsUrlFor(destination, choice.id, travelMode, native = true)
            else -> geoUrlFor(destination)
        } ?: return toast(context, "Cette application ne sait pas ouvrir ce lieu.")
        view(context, Uri.parse(url), packageName = choice?.packageName)
    }

    /** Un lien web, une adresse de courriel ou de téléphone. */
    fun openLink(context: Context, target: String) = view(context, Uri.parse(target))

    fun isWebTarget(target: String): Boolean {
        val scheme = target.substringBefore(':', "").lowercase(Locale.ROOT)
        return scheme in setOf("http", "https", "mailto", "tel", "sms", "geo")
    }

    /** Une pièce jointe : son chemin depuis le dossier de notes (`attachmentPathFor`), ouverte par l'application qui sait la lire. */
    suspend fun openAttachment(context: Context, storage: SafWorkspaceStorage?, eventRelativePath: String, target: String) {
        val written = runCatching { Uri.decode(target) }.getOrDefault(target)
        val path = attachmentPathFor(eventRelativePath, written)
        // Retrouver le fichier interroge le dossier : hors du fil principal.
        val uri = withContext(Dispatchers.IO) { runCatching { storage?.uriOf(path) }.getOrNull() }
            ?: return toast(context, "Fichier introuvable : $path")
        val extension = MimeTypeMap.getFileExtensionFromUrl(path.replace(" ", "_")).lowercase(Locale.ROOT)
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "*/*"
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        launch(context, intent)
    }

    private fun view(context: Context, uri: Uri, packageName: String? = null) {
        val intent = Intent(Intent.ACTION_VIEW, uri)
        if (packageName != null) intent.setPackage(packageName)
        launch(context, intent)
    }

    private fun launch(context: Context, intent: Intent) {
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            toast(context, "Aucune application pour ouvrir ceci.")
        } catch (e: SecurityException) {
            toast(context, "Ouverture refusée : ${e.message}")
        }
    }

    private fun toast(@Suppress("UNUSED_PARAMETER") context: Context, message: String) = com.ahmed.neocalendar.nativeapp.ui.Notices.show(message)
}
