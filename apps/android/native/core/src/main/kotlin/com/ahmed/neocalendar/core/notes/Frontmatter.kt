package com.ahmed.neocalendar.core.notes

import java.util.Locale
import kotlin.math.abs
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Port de l'en-tête YAML maison de desktopEventFormat.ts (extractFrontmatter,
 * parseFrontmatter et leurs aides). Pas de bibliothèque YAML : le TypeScript
 * n'en a pas, et le corpus de conformité fige SA grammaire, pas celle du YAML.
 */

/** Les blancs de String.prototype.trim de JavaScript. Kotlin en retient un
 *  autre jeu (il compte U+001C à U+001F, pas U+FEFF) : une note lue ici doit
 *  se découper comme sur le bureau. */
private fun isJsSpace(c: Char): Boolean = when (c) {
    '\t', '\n', '\u000B', '\u000C', '\r', ' ', ' ', ' ',
    ' ', ' ', ' ', ' ', '　', '﻿' -> true
    else -> c in ' '..' '
}

internal fun String.jsTrim(): String = trim(::isJsSpace)

/** JS `slice(1, -1)` se cale sur la chaîne ; `substring` de Kotlin lève. */
private fun String.sliceInner(): String = if (length < 2) "" else substring(1, length - 1)

/** JSON.parse d'une chaîne entre guillemets, ou null quand JSON.parse lèverait. */
private fun parseJsonString(value: String): String? = try {
    val parsed = Json.parseToJsonElement(value)
    if (parsed is JsonPrimitive && parsed.isString) parsed.content else null
} catch (_: Exception) {
    null
}

private fun unquote(value: String): String {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        if (value.startsWith('"')) {
            return parseJsonString(value) ?: value.sliceInner()
        }
        return value.sliceInner().replace("''", "'")
    }
    return value
}

private fun splitYamlArray(value: String): List<String> {
    val result = mutableListOf<String>()
    val current = StringBuilder()
    var quote: Char? = null
    var escaped = false

    for (character in value) {
        if (escaped) {
            current.append(character)
            escaped = false
            continue
        }
        if (character == '\\' && quote == '"') {
            current.append(character)
            escaped = true
            continue
        }
        if ((character == '"' || character == '\'') && quote == null) {
            quote = character
            current.append(character)
            continue
        }
        if (character == quote) {
            quote = null
            current.append(character)
            continue
        }
        if (character == ',' && quote == null) {
            result.add(current.toString().jsTrim())
            current.clear()
            continue
        }
        current.append(character)
    }
    if (current.toString().jsTrim().isNotEmpty()) result.add(current.toString().jsTrim())
    return result
}

internal fun parseTextScalar(raw: String): String {
    val withoutSeparator = if (raw.startsWith(" ")) raw.substring(1) else raw

    if (withoutSeparator.startsWith('"') && withoutSeparator.endsWith('"')) {
        return parseJsonString(withoutSeparator) ?: withoutSeparator
    }

    if (withoutSeparator.startsWith('\'') && withoutSeparator.endsWith('\'')) {
        return withoutSeparator.sliceInner().replace("''", "'")
    }

    return withoutSeparator
}

private val NUMBER = Regex("""-?\d+(?:\.\d+)?""")

/** `Number(...)` de JS ne distingue pas 2 de 2.0 et l'écrit `2` : un nombre
 *  entier sort donc en Long, le JSON produit ici restant celui du TypeScript. */
internal fun numberOf(text: String): JsonPrimitive = numberOf(text.toDouble())

internal fun numberOf(number: Double): JsonPrimitive {
    return if (number == Math.rint(number) && abs(number) < 9.007199254740992E15) {
        JsonPrimitive(number.toLong())
    } else {
        JsonPrimitive(number)
    }
}

internal fun parseYamlValue(raw: String): JsonElement {
    val trimmed = raw.jsTrim()
    if (trimmed == "null" || trimmed == "~") return JsonNull
    if (trimmed == "true") return JsonPrimitive(true)
    if (trimmed == "false") return JsonPrimitive(false)
    if (NUMBER.matches(trimmed)) return numberOf(trimmed)
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        val inner = trimmed.sliceInner().jsTrim()
        return if (inner.isNotEmpty()) JsonArray(splitYamlArray(inner).map { parseYamlValue(it) }) else JsonArray(emptyList())
    }
    return JsonPrimitive(unquote(trimmed))
}

data class FrontmatterDocument(val lines: List<String>, val body: String)

fun extractFrontmatter(contents: String): FrontmatterDocument? {
    val normalized = contents.replace("\r\n", "\n")
    if (!normalized.startsWith("---\n")) return null

    val lines = normalized.split("\n")
    var closing = -1
    for (index in 1 until lines.size) {
        if (lines[index].jsTrim() == "---") {
            closing = index
            break
        }
    }
    if (closing == -1) return null

    return FrontmatterDocument(
        lines = lines.subList(1, closing),
        body = lines.drop(closing + 1).joinToString("\n"),
    )
}

fun parseFrontmatter(contents: String): JsonObject? {
    val document = extractFrontmatter(contents) ?: return null

    val result = LinkedHashMap<String, JsonElement>()
    for (rawLine in document.lines) {
        val line = rawLine.jsTrim()
        if (line.isEmpty() || line.startsWith("#")) continue
        val colon = rawLine.indexOf(':')
        if (colon <= 0) continue
        val key = rawLine.substring(0, colon).jsTrim()
        if (key.isEmpty()) continue

        val rawValue = rawLine.substring(colon + 1)
        result[key] = if (key.lowercase(Locale.US) == "description") {
            JsonPrimitive(parseTextScalar(rawValue))
        } else {
            parseYamlValue(rawValue)
        }
    }
    return JsonObject(result)
}
