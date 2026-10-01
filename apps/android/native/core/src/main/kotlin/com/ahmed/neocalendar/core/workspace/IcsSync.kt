package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.ics.EmptySnapshotException
import com.ahmed.neocalendar.core.ics.IcsFeed
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.IcsSyncPlan
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.icsSyncWindow
import com.ahmed.neocalendar.core.ics.parseIcsSnapshot
import com.ahmed.neocalendar.core.ics.planIcsNoteSync
import com.ahmed.neocalendar.core.ics.preferredIcalDirectoryName
import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.StoredEvent
import com.ahmed.neocalendar.core.notes.managedMetadataFromMarkdown
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive

/*
 * Un cycle de synchro d'un lien ICS, une fois le flux téléchargé : syncIcsFeeds
 * (icsCalendarIntegration.ts) avec ensure_desktop_ics_folder, write_desktop_event_file
 * et delete_desktop_event_file branchés sur le stockage. Le téléchargement reste à
 * l'appelant (réseau, hors fil principal).
 *
 * Un cycle est tout ou rien du point de vue de l'état : au moindre échec (flux invalide,
 * instantané vide d'un lien qui avait des évènements, écriture refusée) l'état garde sa
 * dernière réussite et note l'erreur ; les notes déjà là ne sont jamais retirées pour autant.
 */

/** Ce qu'un cycle réussi a fait : le nouvel état, le dossier du lien s'il vient d'être créé, les notes touchées. */
data class IcsApplied(val state: IcsSyncState, val provisionedDirectory: String?, val written: Int, val deleted: Int)

private val ISO_MILLIS: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

private fun child(dir: String, name: String) = if (dir.isEmpty()) name else "$dir/$name"

/**
 * Le dossier propre d'un lien, créé au besoin sous celui de son calendrier (Java `ensureIcsFolder`) ;
 * rendu tel quel s'il existe. Le chemin rendu est celui que le planificateur écrit dans `calendarPath`.
 */
fun ensureIcsFolder(storage: WritableWorkspaceStorage, calendarPath: String, name: String): String {
    val valid = validName(name, false)
    val parent = if (calendarPath.isEmpty()) "" else findPath(storage, calendarPath)
        ?: throw IllegalStateException("Calendrier introuvable : $calendarPath")
    storage.list(parent).firstOrNull { it.name == valid }?.let {
        if (!it.isDirectory) throw IllegalStateException("« $valid » existe déjà et n'est pas un dossier.")
        return child(parent, valid)
    }
    return storage.createDirectory(parent, valid)
}

/**
 * Les notes du dossier telles que le planificateur doit les voir : le calendrier d'une note rangée
 * dans un sous-dossier est ce sous-dossier. La lecture du dossier les rattache au dossier de tête
 * (« Etudes »), et le planificateur ne verrait alors aucun nom pris dans le dossier du lien : il
 * redonnerait à une nouvelle séance le nom d'une note déjà là, qui serait écrasée.
 */
private fun readRecords(storage: WorkspaceStorage): List<StoredEvent> {
    // Les copies de conflit de nos propres notes doivent rester visibles : `deleteDuplicateIcsNotes` les supprime.
    val workspace = loadWorkspace(storage, keepConflictCopies = true)
    val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
    return workspace.eventFiles.mapNotNull {
        parseStoredEvent(EventFile(it.relativePath, it.calendarPath, it.fileName, it.contents), known)
    }.map { it.copy(calendarPath = it.relativePath.substringBeforeLast('/', "")) }
}

/**
 * Supprime la note seulement si elle est TOUJOURS gérée par ce lien (marqueurs `neoManagedBy` et
 * `neoIcsFeedId` lus dans le fichier tel qu'il est maintenant) : une note rendue personnelle entre-temps,
 * ou rattachée à un autre lien, n'est jamais supprimée. Rend vrai si elle l'a été.
 */
fun deleteIcsNoteIfOwned(storage: WritableWorkspaceStorage, relativePath: String, feedId: String): Boolean {
    val path = findPath(storage, relativePath) ?: return false
    val contents = storage.readText(path) ?: return false
    val owner = managedMetadataFromMarkdown(contents)?.get("neoIcsFeedId")?.jsonPrimitive?.content
    if (owner != feedId) return false
    storage.delete(path)
    return true
}

/** La clé d'occurrence d'une note de CE lien (uid, ou uid::recurrenceId), lue dans ses marqueurs. */
private fun occurrenceKeyOfNote(contents: String, feedId: String): String? {
    val metadata = managedMetadataFromMarkdown(contents) ?: return null
    if (metadata["neoIcsFeedId"]?.jsonPrimitive?.content != feedId) return null
    val uid = metadata["neoIcsUid"]?.jsonPrimitive?.content ?: return null
    val recurrenceId = metadata["neoIcsRecurrenceId"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
    return if (recurrenceId == null) uid else "$uid::$recurrenceId"
}

/**
 * Plusieurs notes du dossier pour la même occurrence de ce lien (copie de conflit Syncthing
 * `*.sync-conflict-*.md`, doublon) : le planificateur n'en retient qu'une, les autres ne seraient jamais ni
 * mises à jour ni supprimées. On garde celle qu'il réécrit, ou à défaut celle qu'il a retenue (la dernière lue),
 * et on supprime les autres par le chemin gardé. Une note que le plan touche n'est jamais supprimée ici.
 */
private fun deleteDuplicateIcsNotes(storage: WritableWorkspaceStorage, feedId: String, records: List<StoredEvent>, plan: IcsSyncPlan): Int {
    val touched = plan.writes.mapNotNull { it.previousRelativePath }.toSet() + plan.deletes.map { it.relativePath }
    val retainedByWrite = plan.writes.mapNotNull { it.previousRelativePath }.toSet()
    var deleted = 0
    val groups = records.mapNotNull { r -> occurrenceKeyOfNote(r.contents, feedId)?.let { it to r } }.groupBy({ it.first }, { it.second })
    for ((_, group) in groups) {
        if (group.size < 2) continue
        val kept = group.firstOrNull { it.relativePath in retainedByWrite } ?: group.last()
        for (record in group) {
            if (record === kept || record.relativePath in touched) continue
            if (deleteIcsNoteIfOwned(storage, record.relativePath, feedId)) deleted += 1
        }
    }
    return deleted
}

/**
 * Applique un flux téléchargé : le dossier du lien (créé une fois), l'instantané, le plan du noyau,
 * les écritures puis les suppressions. Les enregistrements existants sont relus ICI, juste avant.
 */
fun applyIcsDownload(
    storage: WritableWorkspaceStorage,
    link: IcsLink,
    text: String,
    previous: IcsSyncState,
    now: Instant,
): IcsApplied {
    val (from, to) = icsSyncWindow(now)
    // Lu et planifié avant toute écriture : un flux illisible ne laisse rien derrière lui.
    val snapshot = parseIcsSnapshot(text, from, to)

    var provisioned: String? = null
    var directory = link.directory
    if (directory == null) {
        directory = ensureIcsFolder(storage, link.calendarPath, preferredIcalDirectoryName(link.name))
        provisioned = directory
    }

    val records = readRecords(storage)
    val plan = planIcsNoteSync(IcsFeed(link.id, link.calendarPath, directory), snapshot, records, previous, now)

    for (write in plan.writes) {
        val previousPath = write.previousRelativePath.orEmpty()
        var fileName = write.fileName
        if (previousPath.isEmpty()) {
            // Sans note précédente, la cible n'est jamais réécrite : un fichier de ce nom que le planificateur
            // n'a pas vu (illisible pour lui) est peut-être une note d'Ahmed. Seule une note gérée est réécrite en place.
            val dir = if (write.calendarPath.isEmpty()) "" else findPath(storage, write.calendarPath)
                ?: throw IllegalStateException("Calendrier introuvable : ${write.calendarPath}")
            fileName = uniqueName(storage, dir, validName(fileName, true))
        }
        writeEvent(storage, write.calendarPath, fileName, previousPath, write.contents)
    }
    var deleted = 0
    for (record in plan.deletes) if (deleteIcsNoteIfOwned(storage, record.relativePath, link.id)) deleted += 1
    deleted += deleteDuplicateIcsNotes(storage, link.id, records, plan)

    return IcsApplied(plan.nextState, provisioned, plan.writes.size, deleted)
}

/** L'état d'un cycle raté : la dernière réussite et le décompte restent, l'essai et l'erreur sont notés. */
fun failedIcsState(previous: IcsSyncState, now: Instant, error: String): IcsSyncState =
    previous.copy(lastAttemptAt = ISO_MILLIS.format(now), lastError = error)

/** Le message montré sur le lien : celui du réseau ou du stockage, et une phrase claire pour l'instantané vide. */
fun describeIcsFailure(error: Throwable): String = when (error) {
    is EmptySnapshotException -> "Le lien ne renvoie plus aucun événement alors qu'il en avait : les notes sont conservées."
    else -> error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
}
