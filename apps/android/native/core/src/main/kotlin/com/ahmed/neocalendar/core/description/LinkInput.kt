package com.ahmed.neocalendar.core.description

import java.net.URI

/*
 * Ports de src/ui/calendar/linkInput.ts (`urlMarkdown`, `labelFor`, `sameTarget`) et de la validation de
 * `DescriptionAddLinkDialog.tsx` : ce que la boîte « Ajouter un lien » écrit dans la description.
 */

/** Les schémas qui exécutent au lieu d'adresser. */
private val DANGEROUS_SCHEMES = listOf("javascript", "data", "vbscript", "blob")

private val SCHEME = Regex("^([a-zA-Z][a-zA-Z0-9+.-]*):")

private fun schemeOf(value: String): String? = SCHEME.find(value.trim())?.groupValues?.get(1)?.lowercase()

/** Déjà écrit `[nom](adresse)` : pris tel quel. */
fun isInlineMarkdownLink(value: String): Boolean {
    val labelStart = if (value.startsWith("!")) (if (value.startsWith("![")) 2 else -1) else if (value.startsWith("[")) 1 else -1
    if (labelStart < 0 || !value.endsWith(")")) return false
    val destinationStart = value.indexOf("](", labelStart)
    return destinationStart >= labelStart && destinationStart + 2 < value.length - 1
}

private val WITH_SCHEME = Regex("[a-zA-Z][a-zA-Z0-9+.-]*://\\S+|(?:mailto|tel):\\S+", RegexOption.IGNORE_CASE)
private val BARE_HOST = Regex("(?:^|\\s)((?:[\\w-]+\\.)+[a-zA-Z]{2,}(?:/\\S*)?)")
private val TRAILING = Regex("[.,;:!?\"'»]+$")

/** Le premier lien de ce qui a été collé, sans la ponctuation finale, ou null. */
fun findUrl(value: String): String? {
    val text = value.trim()
    if (text.isEmpty()) return null
    val candidate = WITH_SCHEME.find(text)?.value ?: BARE_HOST.find(text)?.groupValues?.get(1) ?: return null
    var trimmed = candidate.replace(TRAILING, "")
    while (trimmed.endsWith(")") && trimmed.count { it == '(' } < trimmed.count { it == ')' }) trimmed = trimmed.dropLast(1)
    return trimmed.ifEmpty { null }
}

/** Ce que l'oeil lit dans une ligne : l'adresse sans schéma ni « www. » ni barre finale. */
fun labelFor(target: String): String {
    val scheme = schemeOf(target)
    if (scheme == "mailto" || scheme == "tel") return target.substring(scheme.length + 1).ifEmpty { target }
    if (scheme != null && scheme != "http" && scheme != "https") return target
    return try {
        val uri = URI(target)
        val host = uri.host ?: return target
        val port = if (uri.port >= 0) ":${uri.port}" else ""
        val shown = (host.lowercase().removePrefix("www.") + port + (uri.rawPath ?: "") +
            (uri.rawQuery?.let { "?$it" } ?: "") + (uri.rawFragment?.let { "#$it" } ?: "")).trimEnd('/')
        shown.ifEmpty { target }
    } catch (_: Exception) {
        target
    }
}

/** Le Markdown à écrire pour ce qui a été saisi, ou null s'il n'y a pas de lien. */
fun urlMarkdown(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return null
    if (isInlineMarkdownLink(trimmed)) return trimmed
    val found = findUrl(trimmed) ?: return null
    val scheme = schemeOf(found)
    if (scheme != null && scheme in DANGEROUS_SCHEMES) return null
    val target = if (scheme == null) "https://$found" else found
    return "[${labelFor(target)}]($target)"
}

private fun normaliseTarget(value: String): String {
    val trimmed = value.trim()
    return try {
        val uri = URI(trimmed)
        val host = uri.host ?: return trimmed.trimEnd('/')
        val port = if (uri.port >= 0) ":${uri.port}" else ""
        "${uri.scheme.lowercase()}://${host.lowercase()}$port${(uri.rawPath ?: "").trimEnd('/')}${uri.rawQuery?.let { "?$it" } ?: ""}"
    } catch (_: Exception) {
        trimmed.trimEnd('/')
    }
}

/** Deux adresses qui désignent le même endroit (schéma et hôte sans casse, barre finale sans effet). */
fun sameTarget(a: String, b: String): Boolean = normaliseTarget(a) == normaliseTarget(b)

private fun markdownTarget(markdown: String): String? =
    Regex("\\]\\((.*)\\)\\s*$").find(markdown.trim())?.groupValues?.get(1)?.trim()?.ifEmpty { null }

private fun escapeMarkdownLabel(value: String) = value.replace("\\", "\\\\").replace("]", "\\]")

/** Le résultat de la validation de la boîte : le Markdown à insérer, ou le message à dire. */
sealed interface AddLinkResult {
    data class Insert(val markdown: String) : AddLinkResult
    data class Refused(val message: String) : AddLinkResult
}

/** Ce que « Confirmer » fait de la saisie (`DescriptionAddLinkDialog.confirm`) ; `existing` : les adresses déjà dans la description. */
fun addLinkMarkdown(label: String, target: String, existing: List<String>): AddLinkResult {
    val normalized = urlMarkdown(target)
    val destination = normalized?.let { markdownTarget(it) } ?: return AddLinkResult.Refused("Ça ne ressemble pas à un lien")
    if (existing.any { sameTarget(it, destination) }) return AddLinkResult.Refused("Ce lien est déjà là")
    val visible = label.trim().ifEmpty { labelFor(destination) }
    return AddLinkResult.Insert("[${escapeMarkdownLabel(visible)}]($destination)")
}
