package com.ahmed.neocalendar.core.description

/*
 * Ce que le trombone écrit, comme l'ancienne : `copyAttachment` (MainActivity.java) range le fichier dans
 * `.attachments` (ou `attachments` s'il existe déjà) à côté de la note sous un nom rendu unique ;
 * `markdownLinkForAttachment` (desktopEventFormat.ts) en fait le lien, une image en `![nom](chemin)` ;
 * `appendMarkdownToEventBody` l'ajoute au corps sans le doubler.
 */

private val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif")

/** `encodeURIComponent`, plus `! ' ( ) *` en `%XX` : tout sauf `A-Z a-z 0-9 - _ . ~` est encodé en UTF-8. */
fun strictEncodeUriComponent(value: String): String {
    val out = StringBuilder()
    for (byte in value.toByteArray(Charsets.UTF_8)) {
        val c = byte.toInt() and 0xFF
        val plain = c < 128 && (c.toChar().isLetterOrDigit() || c.toChar() in "-_.~")
        if (plain) out.append(c.toChar()) else out.append('%').append("%02X".format(c))
    }
    return out.toString()
}

/** Le Markdown d'une pièce jointe : le chemin encodé segment par segment, une image avec son `!`. */
fun markdownLinkForAttachment(fileName: String, markdownPath: String): String {
    val path = markdownPath.replace('\\', '/').split("/").joinToString("/") { strictEncodeUriComponent(it) }
    val extension = fileName.substringAfterLast('.', "").lowercase()
    return if (extension in IMAGE_EXTENSIONS) "![$fileName]($path)" else "[$fileName]($path)"
}

/** Le dossier des pièces jointes : `.attachments` d'abord (le point compte, sinon il serait pris pour un calendrier), puis `attachments`. */
fun attachmentFolderName(existingNames: Collection<String>): String =
    if (".attachments" in existingNames) ".attachments" else if ("attachments" in existingNames) "attachments" else ".attachments"

/** `uniqueName` : le nom tel quel s'il est libre, sinon `nom (1).ext`, `nom (2).ext`... */
fun uniqueAttachmentName(existingNames: Collection<String>, name: String): String {
    if (name !in existingNames) return name
    val dot = name.lastIndexOf('.')
    val stem = if (dot > 0) name.substring(0, dot) else name
    val extension = if (dot > 0) name.substring(dot) else ""
    var i = 1
    while (true) {
        val candidate = "$stem ($i)$extension"
        if (candidate !in existingNames) return candidate
        i++
    }
}

/** Le chemin que la note porte : depuis le dossier de données, comme le téléphone l'écrit. */
fun attachmentMarkdownPath(eventRelativePath: String, folderName: String, fileName: String): String {
    val base = if ('/' in eventRelativePath) eventRelativePath.substringBeforeLast('/') else ""
    return (if (base.isEmpty()) "" else "$base/") + "$folderName/$fileName"
}

/** La description avec ce Markdown ajouté en dernière ligne, sauf s'il y est déjà (`appendMarkdownToEventBody`). */
fun appendMarkdownToDescription(description: String, markdown: String): String {
    val value = markdown.trim()
    if (value.isEmpty()) return description
    val body = description.trimStart('\n').trimEnd()
    if (body.split(Regex("\r?\n")).any { it.trim() == value }) return description
    return if (body.isEmpty()) value else "$body\n$value"
}
