package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Le nom du dossier de notes visible, à la racine du stockage partagé (`/storage/emulated/0/Neo Calendar`). */
const val VISIBLE_FOLDER_NAME = "Neo Calendar"

/** Fragments d'autorités de fournisseurs de documents EN LIGNE (Drive, OneDrive, Dropbox, etc.) : un dossier choisi chez l'un d'eux est déjà synchronisé. */
private val ONLINE_PROVIDERS = listOf(
    "google.android.apps.docs", "skydrive", "onedrive", "dropbox", "com.box.", "nextcloud", "owncloud", "mega", "pcloud", "synology", "icloud",
)

fun isOnlineProvider(authority: String?): Boolean {
    val a = authority?.lowercase(Locale.ROOT) ?: return false
    return ONLINE_PROVIDERS.any { a.contains(it) }
}

/**
 * Le dossier choisi par l'utilisateur est-il déjà synchronisé par autre chose ? Un `.stfolder` à sa racine (un autre Syncthing
 * le partage) ou un fournisseur en ligne. Dans ce cas l'app n'y touche pas : l'utilisateur a son propre système.
 */
fun isSyncedElsewhere(hasStfolder: Boolean, providerAuthority: String?): Boolean = hasStfolder || isOnlineProvider(providerAuthority)

/** Ce que la fusion a fait, fichier par fichier : de quoi rendre compte à l'utilisateur. */
class MergeReport(
    /** Fichiers qui n'existaient pas dans la destination : copiés. */
    val copied: Int,
    /** Fichiers déjà présents, au contenu identique : rien à faire. */
    val identical: Int,
    /** Fichiers présents et différents, la version de la destination plus récente (ou égale) : elle reste en place, la version de la source est gardée à côté en copie de conflit. */
    val keptNewer: Int,
    /** Fichiers présents et différents, la version de la source plus récente : elle prend la place, l'ancienne version de la destination est gardée à côté en copie de conflit. */
    val replacedOlder: Int,
    val bytes: Long,
) {
    val conflicts: Int get() = keptNewer + replacedOlder
    override fun toString() = "$copied copiés, $identical identiques, $keptNewer gardés (destination plus récente), $replacedOlder remplacés (source plus récente), $conflicts copies de conflit"
}

class MergeFailure(val path: String, val reason: String) : IOException(if (path.isEmpty()) reason else "$path : $reason")

private class Item(val path: String, val isDirectory: Boolean, val lastModified: Long)

private class Print(val size: Long, val sha: String)

/** Ce qui n'est jamais copié : les artefacts du moteur, sauf les copies de conflit (des versions de notes de l'utilisateur). */
private fun skipped(name: String) = isSyncArtifact(name) && !isConflictCopy(name)

/**
 * Fusionne tout `source` dans le dossier `destRoot` (créé s'il manque), sans JAMAIS rien perdre ni toucher à la source :
 *  - un fichier absent de la destination est copié (date de modification conservée) ;
 *  - un fichier identique (SHA-256) est laissé ;
 *  - un fichier différent n'est jamais écrasé : la version la plus récente garde le nom, l'autre est conservée à côté sous
 *    `nom.sync-conflict-AAAAMMJJ-HHMMSS-NEOFUS.ext` (le nom que Syncthing et l'app reconnaissent comme conflit).
 * Chaque copie passe par un temporaire `.neo-tmp-*` (ignoré par le moteur) puis un renommage. Puis vérification : chaque fichier
 * de la source est relu (il n'a pas changé pendant la copie) et retrouvé avec le même contenu à son nom ou en copie de conflit.
 * Une [MergeFailure] nomme le fichier en cause ; ce qui est déjà posé reste (rien n'est perdu, une nouvelle tentative le reprend).
 */
fun mergeIntoDirectory(source: BinaryWorkspaceStorage, destRoot: File): MergeReport {
    if (destRoot.exists() && !destRoot.isDirectory) throw MergeFailure("", "${destRoot.name} existe et n'est pas un dossier.")
    if (!destRoot.isDirectory && !destRoot.mkdirs()) throw MergeFailure("", "le dossier ${destRoot.name} ne peut pas être créé.")
    val items = inventory(source)
    var copied = 0
    var identical = 0
    var keptNewer = 0
    var replacedOlder = 0
    var bytes = 0L
    val sourcePrints = HashMap<String, Print>()
    val holder = HashMap<String, File>()
    for (item in items) {
        val target = File(destRoot, item.path)
        if (item.isDirectory) {
            if (target.exists() && !target.isDirectory) throw MergeFailure(item.path, "un fichier occupe la place de ce dossier dans la destination")
            if (!target.isDirectory && !target.mkdirs()) throw MergeFailure(item.path, "création du dossier impossible")
            continue
        }
        if (target.isDirectory) throw MergeFailure(item.path, "un dossier occupe la place de ce fichier dans la destination")
        target.parentFile?.let { if (!it.isDirectory && !it.mkdirs()) throw MergeFailure(item.path, "création du dossier impossible") }
        val temporary = File(target.parentFile, ".neo-tmp-" + UUID.randomUUID())
        try {
            val print = copyTo(source, item.path, temporary)
            sourcePrints[item.path] = print
            bytes += print.size
            if (item.lastModified > 0) temporary.setLastModified(item.lastModified)
            if (!target.exists()) {
                moveInto(temporary, target)
                holder[item.path] = target
                copied++
            } else if (fingerprint(target).sha == print.sha) {
                identical++
                holder[item.path] = target
            } else if (item.lastModified > target.lastModified()) {
                // La source est plus récente : elle prend le nom, l'ancienne version de la destination est gardée (renommage, rien n'est réécrit).
                val old = conflictFile(target, target.lastModified())
                Files.move(target.toPath(), old.toPath(), StandardCopyOption.ATOMIC_MOVE)
                moveInto(temporary, target)
                holder[item.path] = target
                replacedOlder++
            } else {
                // Déjà gardée par un passage précédent (nouvelle tentative) : pas de doublon.
                val prefix = target.name.substringBeforeLast('.', target.name) + ".sync-conflict-"
                val already = target.parentFile.listFiles()?.firstOrNull { it.isFile && it.name.startsWith(prefix) && fingerprint(it).sha == print.sha }
                val kept = already ?: conflictFile(target, item.lastModified).also { moveInto(temporary, it) }
                holder[item.path] = kept
                keptNewer++
            }
        } catch (e: MergeFailure) {
            throw e
        } catch (e: Exception) {
            throw MergeFailure(item.path, "copie impossible (${e.javaClass.simpleName}: ${e.message})")
        } finally {
            temporary.delete()
        }
    }
    // Vérification : la source n'a pas bougé, et chaque fichier est dans la destination avec son contenu.
    val again = inventory(source)
    val wanted = items.map { it.path to it.isDirectory }.toSet()
    (wanted - again.map { it.path to it.isDirectory }.toSet()).firstOrNull()?.let { throw MergeFailure(it.first, "a disparu de la source pendant la copie") }
    (again.map { it.path to it.isDirectory }.toSet() - wanted).firstOrNull()?.let { throw MergeFailure(it.first, "est apparu dans la source pendant la copie") }
    for ((path, print) in sourcePrints) {
        val now = try { fingerprintOf(source, path) } catch (e: Exception) { throw MergeFailure(path, "relecture de la source impossible (${e.message})") }
        if (now.sha != print.sha) throw MergeFailure(path, "a changé dans la source pendant la copie")
        val placed = holder.getValue(path)
        if (!placed.isFile) throw MergeFailure(path, "absent de la destination")
        val check = fingerprint(placed)
        if (check.size != print.size) throw MergeFailure(path, "taille différente (${print.size} octets à la source, ${check.size} dans la destination)")
        if (check.sha != print.sha) throw MergeFailure(path, "contenu différent dans la destination")
    }
    return MergeReport(copied, identical, keptNewer, replacedOlder, bytes)
}

private fun moveInto(temporary: File, target: File) {
    Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
}

/** `note.md` -> `note.sync-conflict-20260102-030405-NEOFUS.md`, nom libre garanti. */
private fun conflictFile(target: File, loserTime: Long): File {
    val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(loserTime))
    val dot = target.name.lastIndexOf('.')
    val base = if (dot > 0) target.name.substring(0, dot) else target.name
    val ext = if (dot > 0) target.name.substring(dot) else ""
    var n = 0
    while (true) {
        val suffix = if (n == 0) "NEOFUS" else "NEOFU$n"
        val candidate = File(target.parentFile, "$base.sync-conflict-$stamp-$suffix$ext")
        if (!candidate.exists()) return candidate
        n++
    }
}

private fun copyTo(source: BinaryWorkspaceStorage, path: String, temporary: File): Print {
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    val input = source.openInput(path) ?: throw MergeFailure(path, "lecture impossible")
    input.use { stream ->
        java.io.FileOutputStream(temporary).use { out ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = stream.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
                out.write(buffer, 0, n)
                size += n
            }
            out.flush()
            out.fd.sync()
        }
    }
    return Print(size, hex(digest.digest()))
}

private fun fingerprint(file: File): Print {
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    file.inputStream().use { stream ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = stream.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
            size += n
        }
    }
    return Print(size, hex(digest.digest()))
}

private fun fingerprintOf(source: BinaryWorkspaceStorage, path: String): Print {
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    val input = source.openInput(path) ?: throw MergeFailure(path, "a disparu de la source pendant la copie")
    input.use { stream ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = stream.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
            size += n
        }
    }
    return Print(size, hex(digest.digest()))
}

private fun inventory(storage: WorkspaceStorage): List<Item> {
    val out = ArrayList<Item>()
    fun walk(dir: String) {
        for (entry in storage.list(dir)) {
            if (skipped(entry.name)) continue
            val path = if (dir.isEmpty()) entry.name else "$dir/${entry.name}"
            out += Item(path, entry.isDirectory, entry.lastModified)
            if (entry.isDirectory) walk(path)
        }
    }
    walk("")
    return out
}

/** Le dossier visible a-t-il ses deux fichiers pour le moteur : `.stfolder` (marqueur) et `.stignore` ? Crée ce qui manque, sans rien écraser. */
fun prepareVisibleFolderForEngine(root: File) {
    if (!root.isDirectory && !root.mkdirs()) throw IOException("Le dossier ${root.name} ne peut pas être créé.")
    val stignore = File(root, ".stignore")
    if (!stignore.exists()) stignore.writeText(STIGNORE_TEXT)
    if (!File(root, ".neo-calendar").exists() && !File(root, ".neo-calendar.json").exists()) File(root, ".neo-calendar").mkdir()
    ensureFolderMarker(root)
}

private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
