package com.ahmed.neocalendar.core.notes

import com.ahmed.neocalendar.core.jsNumber
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de serializeEventMarkdown et de ses aides (desktopEventFormat.ts) :
 * réécrit seulement l'en-tête que possède l'évènement, garde les clés inconnues
 * et le corps de la note tels quels.
 */

/** L'évènement ne passe pas la validation : rien n'est écrit. */
class InvalidEventException : IllegalArgumentException("The event is invalid and cannot be written.")

/** `KEYS_DROPPED_WHEN_ABSENT` de src/types/schema.ts : TYPE_DISCRIMINANT_KEYS,
 *  puis `subtasks` et `description`. */
private val KEYS_DROPPED_WHEN_ABSENT = setOf(
    "date", "endDate", "completed", "due", "daysOfWeek", "startRecur", "endRecur",
    "rrule", "startDate", "skipDates", "completedDates",
    "subtasks", "description",
)

/** JSON.stringify d'une chaîne : mêmes échappements, hexadécimal en minuscules,
 *  substituts isolés échappés (JSON bien formé), le reste écrit tel quel. */
internal fun jsonQuote(value: String): String {
    val out = StringBuilder("\"")
    var index = 0
    while (index < value.length) {
        val c = value[index]
        when {
            c == '"' -> out.append("\\\"")
            c == '\\' -> out.append("\\\\")
            c == '\b' -> out.append("\\b")
            c == '\u000C' -> out.append("\\f")
            c == '\n' -> out.append("\\n")
            c == '\r' -> out.append("\\r")
            c == '\t' -> out.append("\\t")
            c < ' ' -> out.append("\\u%04x".format(c.code))
            c.isHighSurrogate() && index + 1 < value.length && value[index + 1].isLowSurrogate() -> {
                out.append(c).append(value[index + 1])
                index++
            }
            c.isSurrogate() -> out.append("\\u%04x".format(c.code))
            else -> out.append(c)
        }
        index++
    }
    return out.append('"').toString()
}

private fun yamlAtom(value: JsonElement): String = when {
    value is JsonNull -> "null"
    value is JsonArray -> value.joinToString(",", "[", "]") { yamlAtom(it) }
    value is JsonPrimitive && value.isString -> jsonQuote(value.content)
    value is JsonPrimitive -> value.content.toLongOrNull()?.toString()
        ?: value.content.toDoubleOrNull()?.let { jsNumber(it) }
        ?: value.content
    else -> value.toString()
}

private fun yamlLine(key: String, value: JsonElement): String = "$key: ${yamlAtom(value)}"

private fun lineKey(line: String): String? {
    val colon = line.indexOf(':')
    if (colon <= 0) return null
    return line.substring(0, colon).jsTrim().ifEmpty { null }
}

fun serializeEventMarkdown(event: NeoEvent, previousContents: String = ""): String {
    val source = event.toRecord()
    val existing = extractFrontmatter(previousContents)

    if (existing == null) {
        val lines = source.map { (key, value) -> yamlLine(key, value) }
        val body = if (previousContents.isNotEmpty()) "\n$previousContents" else ""
        return "---\n${lines.joinToString("\n")}\n---\n$body"
    }

    val output = mutableListOf<String>()
    val handled = mutableSetOf<String>()

    for (line in existing.lines) {
        val key = lineKey(line)
        if (key == null) {
            if (line.jsTrim().isNotEmpty()) output.add(line)
            continue
        }
        val value = source[key]
        if (value == null) {
            if ((event.allDay && (key == "startTime" || key == "endTime")) || key in KEYS_DROPPED_WHEN_ABSENT) continue
            // Une clé que le modèle ne possède pas reste octet pour octet.
            output.add(line)
            continue
        }
        handled.add(key)
        output.add(yamlLine(key, value))
    }

    for ((key, value) in source) {
        if (key !in handled) output.add(yamlLine(key, value))
    }

    return "---\n${output.joinToString("\n")}\n---\n${existing.body}"
}

/** Valide d'abord : un objet qui n'est pas un évènement valide ne s'écrit pas. */
fun serializeEventMarkdown(raw: JsonObject, previousContents: String = ""): String =
    serializeEventMarkdown(validateEvent(raw) ?: throw InvalidEventException(), previousContents)
