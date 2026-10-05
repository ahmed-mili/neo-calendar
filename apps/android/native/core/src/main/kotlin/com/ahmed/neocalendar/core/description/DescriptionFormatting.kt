package com.ahmed.neocalendar.core.description

/*
 * Port de src/ui/calendar/descriptionFormatting.ts (`applyDescriptionFormat`) : la mise en forme de la
 * barre au-dessus du clavier écrit du Markdown dans le texte, jamais autre chose. Les positions sont des
 * indices UTF-16, comme dans le TypeScript.
 */

enum class DescriptionFormatCommand(val key: String) {
    Bold("bold"), Italic("italic"), Underline("underline"), OrderedList("ordered-list"), BulletList("bullet-list"), Checklist("checklist"), Clear("clear");

    companion object {
        fun of(key: String) = entries.first { it.key == key }
    }
}

data class DescriptionFormatResult(val text: String, val selectionStart: Int, val selectionEnd: Int)

private val INLINE_MARKS = mapOf(
    DescriptionFormatCommand.Bold to ("**" to "**"),
    DescriptionFormatCommand.Italic to ("*" to "*"),
    DescriptionFormatCommand.Underline to ("<u>" to "</u>"),
)

private val LINE_PREFIX = Regex("""^(\s*)(?:(?:- \[[ xX]\] )|(?:[-*+] )|(?:\d+[.)] ))?(.*)$""")
private val UNDERLINE_TAGS = Regex("""<u>([\s\S]*?)</u>""")
private val BOLD_MARKS = Regex("""\*\*([\s\S]*?)\*\*""")
private val ITALIC_STARS = Regex("""\*([^*\n]+)\*""")
private val ITALIC_MARKS = Regex("""_([^_\n]+)_""")

private fun clearInlineFormatting(text: String): String {
    var next = text
    var previous = ""
    while (next != previous) {
        previous = next
        next = next.replace(UNDERLINE_TAGS, "$1").replace(BOLD_MARKS, "$1").replace(ITALIC_STARS, "$1").replace(ITALIC_MARKS, "$1")
    }
    return next
}

fun applyDescriptionFormat(text: String, selectionStart: Int, selectionEnd: Int, command: DescriptionFormatCommand): DescriptionFormatResult {
    val start = selectionStart.coerceIn(0, text.length)
    val end = selectionEnd.coerceIn(start, text.length)

    INLINE_MARKS[command]?.let { (before, after) ->
        return DescriptionFormatResult(
            text.substring(0, start) + before + text.substring(start, end) + after + text.substring(end),
            start + before.length,
            end + before.length,
        )
    }

    // La plage des lignes touchées par la sélection.
    val from = text.lastIndexOf('\n', maxOf(0, start - 1)) + 1
    val lastSelected = if (end > start && text[end - 1] == '\n') end - 1 else end
    val nextBreak = text.indexOf('\n', lastSelected)
    val to = if (nextBreak == -1) text.length else nextBreak

    val formatted = text.substring(from, to).split("\n").mapIndexed { index, line ->
        val match = LINE_PREFIX.matchEntire(line)
        val indent = match?.groupValues?.get(1) ?: ""
        val content = match?.groupValues?.get(2) ?: line
        if (command == DescriptionFormatCommand.Clear) {
            indent + clearInlineFormatting(content)
        } else {
            val prefix = when (command) {
                DescriptionFormatCommand.OrderedList -> "${index + 1}. "
                DescriptionFormatCommand.Checklist -> "- [ ] "
                else -> "- "
            }
            indent + prefix + content
        }
    }.joinToString("\n")

    return DescriptionFormatResult(text.substring(0, from) + formatted + text.substring(to), from, from + formatted.length)
}
