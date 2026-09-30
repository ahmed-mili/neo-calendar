package com.ahmed.neocalendar.core.notes

/*
 * Port de sanitizeForFilename, baseNameForEvent et filenameForEvent
 * (apps/windows/src/platform/desktopEventFormat.ts).
 */

private val FORBIDDEN = Regex("[\\\\/:*?\"<>|]")

/** Le \s de JavaScript : Java's \s ne couvre que l'ASCII, alors que JS compte
 *  aussi l'espace insécable, U+2000-U+200A, U+3000, U+FEFF, etc. (mais pas
 *  U+0085, qui reste dans le nom). */
private val JS_SPACES = Regex("[\\t\\n\\u000B\\u000C\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+")

/** `\z` et non `$` : en Java, `$` s'arrête aussi devant un saut de ligne final
 *  (dont U+0085), alors que le `$` de JavaScript ne vaut que en fin de texte. */
private val TRAILING_DOTS_AND_SPACES = Regex("[. ]+\\z")

internal fun sanitizeForFilename(name: String): String {
    val cleaned = name
        .replace(FORBIDDEN, "-")
        .replace(JS_SPACES, " ")
        .trim(' ')
        .replace(TRAILING_DOTS_AND_SPACES, "")
    return cleaned.ifEmpty { "Untitled" }
}

private fun baseNameForEvent(event: NeoEvent): String = when (event) {
    is NeoEvent.Single -> "${event.date} ${event.title}"
    is NeoEvent.Recurring -> "(Every ${event.daysOfWeek.joinToString(",")}) ${event.title}"
    // Une règle que le port ne sait pas lire retombe sur "Recurring", comme le
    // catch de la version TypeScript pour une règle mal formée.
    is NeoEvent.Rrule -> "(${rruleToText(event.rrule) ?: "Recurring"}) ${event.title}"
    is NeoEvent.Someday -> "(Someday) ${event.title}"
}

fun filenameForEvent(event: NeoEvent): String = "${sanitizeForFilename(baseNameForEvent(event))}.md"
