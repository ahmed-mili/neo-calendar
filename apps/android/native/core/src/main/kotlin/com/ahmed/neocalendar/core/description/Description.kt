package com.ahmed.neocalendar.core.description

/*
 * Ports de descriptionChecklist.ts (readChecklist, toggleLine), de
 * descriptionInlineLinks.ts (readInlineLinks) et d'attachmentPathFor
 * (pastedAttachment.ts) : la description lue comme Obsidian la lit. Le texte
 * reste la vérité ; rien ici n'en garde de copie.
 */

sealed interface ChecklistLine {
    data class Text(val text: String) : ChecklistLine
    data class Bullet(val text: String, val indent: String) : ChecklistLine
    data class Task(val done: Boolean, val title: String, val indent: String) : ChecklistLine
}

/** `- [ ] `, `* [x] `, `+ [/] ` ; l'espace après la case est facultatif, la puce ne l'est pas. */
private val TASK_LINE = Regex("""^(\s*)([-*+]) \[(.)\] ?(.*)$""")
private val BULLET_LINE = Regex("""^(\s*)([-*+]) (.*)$""")

/** Les marques d'autres extensions pour « commencé » ne sont pas « fait ». */
private val DONE_MARKS = setOf('x', 'X')

fun readChecklist(description: String): List<ChecklistLine> = description.split("\n").map { line ->
    val task = TASK_LINE.matchEntire(line)
    if (task != null) {
        ChecklistLine.Task(task.groupValues[3][0] in DONE_MARKS, task.groupValues[4], task.groupValues[1])
    } else {
        val bullet = BULLET_LINE.matchEntire(line)
        if (bullet != null) ChecklistLine.Bullet(bullet.groupValues[3], bullet.groupValues[1])
        else ChecklistLine.Text(line)
    }
}

/** La description avec une seule case cochée ou décochée ; la ligne se désigne par son numéro. */
fun toggleLine(description: String, index: Int): String {
    val lines = description.split("\n").toMutableList()
    val line = lines.getOrNull(index) ?: return description
    val match = TASK_LINE.matchEntire(line) ?: return description
    val (_, indent, bullet, mark, title) = match.groupValues
    val next = if (mark[0] in DONE_MARKS) " " else "x"
    lines[index] = "$indent$bullet [$next] $title"
    return lines.joinToString("\n")
}

/**
 * La description qu'un évènement aux étapes de l'ancienne liste doit porter
 * maintenant : les étapes y sont écrites en lignes `- [ ] titre`. Une étape
 * sans titre est laissée de côté.
 */
fun withStepsAppended(description: String, steps: List<Pair<String, Boolean>>): String {
    val lines = steps.filter { it.first.isNotBlank() }.map { "- [${if (it.second) "x" else " "}] ${it.first}" }
    if (lines.isEmpty()) return if (description.isNotBlank()) description else ""
    val written = description.trim()
    val steps = lines.joinToString("\n")
    return if (written.isNotEmpty()) "$written\n$steps" else steps
}

/** Un lien écrit dans le texte, et où il commence et finit dedans. */
data class InlineLink(val start: Int, val end: Int, val label: String, val target: String)

private fun unescapeLabel(value: String) = value.replace(Regex("""\\([\\\]])"""), "$1")

/** Tous les liens `[nom](adresse)` du texte, dans l'ordre ; un lien ne franchit pas une fin de ligne. */
fun readInlineLinks(source: String): List<InlineLink> {
    val links = mutableListOf<InlineLink>()
    var index = 0
    while (index < source.length) {
        val image = source[index] == '!' && source.getOrNull(index + 1) == '['
        val labelStart = when {
            image -> index + 2
            source[index] == '[' -> index + 1
            else -> -1
        }
        if (labelStart < 0) {
            index += 1
            continue
        }

        var labelEnd = labelStart
        var escaped = false
        while (labelEnd < source.length) {
            val c = source[labelEnd]
            if (c == '\n') break
            if (escaped) escaped = false
            else if (c == '\\') escaped = true
            else if (c == ']') break
            labelEnd += 1
        }
        if (labelEnd >= source.length || source[labelEnd] != ']' || source.getOrNull(labelEnd + 1) != '(') {
            index = labelStart
            continue
        }

        val targetStart = labelEnd + 2
        var cursor = targetStart
        var depth = 1
        escaped = false
        while (cursor < source.length && depth > 0) {
            val c = source[cursor]
            if (c == '\n') break
            if (escaped) escaped = false
            else if (c == '\\') escaped = true
            else if (c == '(') depth += 1
            else if (c == ')') {
                depth -= 1
                if (depth == 0) break
            }
            cursor += 1
        }
        if (depth != 0 || cursor >= source.length) {
            index = targetStart
            continue
        }

        val target = source.substring(targetStart, cursor).trim()
        if (target.isEmpty()) {
            index = cursor + 1
            continue
        }
        links += InlineLink(if (image) index else labelStart - 1, cursor + 1, unescapeLabel(source.substring(labelStart, labelEnd)), target)
        index = cursor + 1
    }
    return links
}

/**
 * Où une pièce jointe se trouve, comptée depuis le dossier de données : le
 * bureau écrit le lien relatif au dossier de l'évènement, le téléphone le
 * chemin entier ; un lien qui commence déjà par ce dossier n'est pas doublé.
 */
fun attachmentPathFor(eventRelativePath: String, target: String): String {
    val event = eventRelativePath.replace('\\', '/')
    val link = target.replace('\\', '/')
    val cut = event.lastIndexOf('/')
    if (cut < 0) return link
    val folder = event.substring(0, cut)
    return if (link.startsWith("$folder/")) link else "$folder/$link"
}
