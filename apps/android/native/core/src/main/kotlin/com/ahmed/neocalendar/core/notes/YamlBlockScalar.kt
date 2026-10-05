package com.ahmed.neocalendar.core.notes

/*
 * Port exact de src/calendars/yamlBlockScalar.ts : les blocs littéraux YAML
 * (`|`, `>`) de l'en-tête d'une note, écrits comme Obsidian les écrit. Le
 * TypeScript fait foi ; conformance/notes tient les deux au même texte.
 */

/** Ce qui peut suivre `clé:` pour que la valeur soit un bloc : un indicateur
 *  (chiffre d'indentation et/ou signe de chomping, dans un ordre ou l'autre) et
 *  un commentaire. Le `.` du JavaScript s'arrête aux mêmes fins de ligne. */
private val BLOCK_HEADER =
    Regex("""[ \t]*([|>])([1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#[^\n\r\u0085  ]*)?""")

internal enum class BlockChomp { STRIP, CLIP, KEEP }

internal data class BlockHeader(val style: Char, val indent: Int, val chomp: BlockChomp)

/** L'en-tête d'un bloc, d'après le texte qui suit les deux-points de la clé. */
internal fun parseBlockHeader(rawValue: String): BlockHeader? {
    val match = BLOCK_HEADER.matchEntire(rawValue) ?: return null
    val flags = match.groupValues[2]
    val digit = flags.firstOrNull { it in '1'..'9' }
    return BlockHeader(
        style = match.groupValues[1][0],
        indent = digit?.digitToInt() ?: 0,
        chomp = when {
            flags.contains('-') -> BlockChomp.STRIP
            flags.contains('+') -> BlockChomp.KEEP
            else -> BlockChomp.CLIP
        },
    )
}

private fun leadingBlanks(line: String): Int = line.indexOfFirst { it != ' ' && it != '\t' }.let { if (it < 0) line.length else it }

private fun leadingSpaces(line: String): Int = line.indexOfFirst { it != ' ' }.let { if (it < 0) line.length else it }

private fun isBlank(line: String): Boolean = line.jsTrim().isEmpty()

/** L'indentation de la ligne de la clé, que les lignes d'un bloc dépassent. */
internal fun keyIndentOf(line: String): Int = leadingBlanks(line)

/** L'indice juste après la suite du bloc dont la clé est `lines[keyIndex]` :
 *  les lignes plus indentées que la clé et les lignes vides qui les séparent.
 *  Les vides d'après la dernière n'en font partie que si le bloc les garde. */
internal fun blockGroupEnd(lines: List<String>, keyIndex: Int, keep: Boolean): Int {
    val keyIndent = leadingBlanks(lines[keyIndex])
    var cursor = keyIndex + 1
    var last = keyIndex
    while (cursor < lines.size) {
        val line = lines[cursor]
        if (isBlank(line)) {
            cursor += 1
        } else if (leadingBlanks(line) > keyIndent) {
            last = cursor
            cursor += 1
        } else {
            break
        }
    }
    return if (keep) cursor else last + 1
}

/** La chaîne qu'un bloc représente. */
internal fun decodeBlockScalar(header: BlockHeader, keyIndent: Int, content: List<String>): String {
    var indent = keyIndent + header.indent
    if (header.indent == 0) {
        val first = content.firstOrNull { !isBlank(it) }
        indent = if (first == null) 0 else leadingSpaces(first)
    }
    val stripped = content.map { it.substring(minOf(indent, leadingSpaces(it))) }
    var end = stripped.size
    while (end > 0 && stripped[end - 1].isEmpty()) end -= 1
    val text = stripped.subList(0, end)
    val trailing = stripped.size - end

    val value = StringBuilder()
    if (header.style == '|') {
        value.append(text.joinToString("\n"))
    } else {
        var previous: String? = null
        var blanks = 0
        for (line in text) {
            if (line.isEmpty()) {
                blanks += 1
                continue
            }
            if (previous == null) {
                value.append("\n".repeat(blanks))
            } else {
                val more = line[0] == ' ' || line[0] == '\t' || previous[0] == ' ' || previous[0] == '\t'
                if (blanks == 0) {
                    value.append(if (more) "\n" else " ")
                } else {
                    value.append("\n".repeat(blanks + if (more) 1 else 0))
                }
            }
            value.append(line)
            previous = line
            blanks = 0
        }
    }

    return when (header.chomp) {
        BlockChomp.STRIP -> value.toString()
        BlockChomp.CLIP -> if (text.isNotEmpty()) "$value\n" else ""
        BlockChomp.KEEP ->
            if (text.isNotEmpty()) "$value\n${"\n".repeat(trailing)}" else "\n".repeat(trailing)
    }
}

/** Contrôle, séparateurs de ligne Unicode, marque d'ordre des octets, substituts
 *  isolés : ce qu'un bloc ne porte pas sûrement (la tabulation et `\n` passent). */
private fun hasUnsafeCharacter(value: String): Boolean {
    var index = 0
    while (index < value.length) {
        val code = value[index].code
        if ((code < 0x20 && code != 0x09 && code != 0x0a) ||
            (code in 0x7f..0x9f) || code == 0x2028 || code == 0x2029 || code == 0xfeff
        ) {
            return true
        }
        if (code in 0xd800..0xdbff) {
            val next = if (index + 1 < value.length) value[index + 1].code else -1
            if (next !in 0xdc00..0xdfff) return true
            index += 1
        } else if (code in 0xdc00..0xdfff) {
            return true
        }
        index += 1
    }
    return false
}

/** Un texte de plusieurs lignes comme Obsidian l'écrit : l'en-tête, puis les
 *  lignes indentées de deux espaces. Null quand le texte s'écrit mieux entre
 *  guillemets (l'appelant garde alors JSON.stringify). */
internal fun blockScalarLines(value: String): List<String>? {
    if (!value.contains('\n') || hasUnsafeCharacter(value)) return null

    val body = value.trimEnd('\n')
    val trailing = value.length - body.length
    if (body.isEmpty()) return null

    val lines = body.split("\n")
    if (isBlank(lines.last())) return null
    if (lines.any { it.jsTrim() == "---" }) return null

    val first = lines.firstOrNull { !isBlank(it) } ?: ""
    val indicator = if (first.startsWith(" ")) "2" else ""
    val chomp = when (trailing) {
        0 -> "-"
        1 -> ""
        else -> "+"
    }

    val out = mutableListOf("|$indicator$chomp")
    lines.forEachIndexed { index, line ->
        out.add(if (line.isEmpty()) (if (index == 0) "  " else "") else "  $line")
    }
    for (extra in 1 until trailing) out.add("")
    return out
}
