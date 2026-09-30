package com.ahmed.neocalendar.core.preferences

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Écriture de `.neo-calendar.json`, figée sur ce que fait aujourd'hui l'app
 * Android (WebView + MainActivity.java), pour que le Kotlin natif réécrive le
 * fichier octet pour octet comme elle et que Syncthing ne voie aucun conflit.
 *
 * La chaîne relevée :
 *  1. TypeScript (DesktopCalendar.tsx) envoie à `save_desktop_preferences`
 *     `sharedWorkspacePreferences(value)` : tout sauf viewType, dayCount,
 *     sidebarVisible et allDayCollapsed (réglages d'appareil, gardés à part).
 *  2. bridge.ts passe l'objet par `JSON.stringify` : les clés entières d'un
 *     objet JS (un calendrier nommé « 2024 ») viennent avant les autres, en
 *     ordre croissant ; les autres gardent l'ordre d'insertion.
 *  3. MainActivity.savePreferences relit ce texte en `new JSONObject(args)`
 *     (org.json d'Android : LinkedHashMap, donc l'ordre du texte), l'écrit par
 *     `toString(2)` puis ajoute "\n". JSONStringer : 2 espaces, `": "`,
 *     `{}` et `[]` pour un conteneur vide, `"` `\` `/` précédés d'une barre
 *     inverse, `\t \b \n \r \f`, autres contrôles <= 0x1F en `\u00xx` minuscule,
 *     le reste (accents, emoji, U+2028, U+007F) tel quel, UTF-8 sans BOM.
 * Le PC (Rust, serde_json::to_string_pretty) écrit autrement : voir le rapport
 * de la tâche 13 ; ce fichier ne reproduit QUE le téléphone.
 */

/** Ce que la WebView envoie à la commande : la moitié partagée des préférences. */
fun sharedPreferencesToWrite(preferences: JsonObject): JsonObject = sharedWorkspacePreferences(preferences)

/** Le texte exact que `MainActivity.savePreferences` écrit pour cet objet. */
fun preferencesFileText(preferences: JsonObject): String =
    StringBuilder().also { writeValue(it, preferences, 0) }.append('\n').toString()

private val ARRAY_INDEX = Regex("0|[1-9][0-9]*")

/** L'ordre de `Object.keys` en JS : les indices de tableau (entiers canoniques
 *  < 2^32 - 1) d'abord, croissants, puis les autres dans l'ordre d'insertion. */
private fun jsKeyOrder(keys: Collection<String>): List<String> {
    val isIndex = { key: String -> ARRAY_INDEX.matches(key) && key.length <= 10 && key.toLong() < 4294967295L }
    return keys.filter(isIndex).sortedBy { it.toLong() } + keys.filterNot(isIndex)
}

private fun writeValue(out: StringBuilder, value: JsonElement, depth: Int) {
    when {
        value is JsonNull -> out.append("null")
        value is JsonObject -> {
            if (value.isEmpty()) {
                out.append("{}")
                return
            }
            out.append("{\n")
            jsKeyOrder(value.keys).forEachIndexed { index, key ->
                if (index > 0) out.append(",\n")
                out.append("  ".repeat(depth + 1))
                writeString(out, key)
                out.append(": ")
                writeValue(out, value.getValue(key), depth + 1)
            }
            out.append('\n').append("  ".repeat(depth)).append('}')
        }
        value is JsonArray -> {
            if (value.isEmpty()) {
                out.append("[]")
                return
            }
            out.append("[\n")
            value.forEachIndexed { index, item ->
                if (index > 0) out.append(",\n")
                out.append("  ".repeat(depth + 1))
                writeValue(out, item, depth + 1)
            }
            out.append('\n').append("  ".repeat(depth)).append(']')
        }
        value is JsonPrimitive && value.isString -> writeString(out, value.content)
        value is JsonPrimitive && (value.content == "true" || value.content == "false") -> out.append(value.content)
        else -> out.append(numberToString((value as JsonPrimitive).content))
    }
}

/** `JSONObject.numberToString` : un nombre égal à son `long` s'écrit en entier,
 *  sinon `Double.toString`. Aucune préférence lue n'est décimale. */
private fun numberToString(content: String): String {
    val number = content.toDouble()
    val whole = number.toLong()
    return if (number == whole.toDouble()) whole.toString() else number.toString()
}

/** `JSONStringer.string` : `"` `\` `/` échappés, contrôles en `\u00xx` minuscule. */
private fun writeString(out: StringBuilder, text: String) {
    out.append('"')
    for (c in text) {
        when {
            c == '"' || c == '\\' || c == '/' -> out.append('\\').append(c)
            c == '\t' -> out.append("\\t")
            c == '\b' -> out.append("\\b")
            c == '\n' -> out.append("\\n")
            c == '\r' -> out.append("\\r")
            c == '\u000C' -> out.append("\\f")
            c.code <= 0x1F -> out.append("\\u").append(c.code.toString(16).padStart(4, '0'))
            else -> out.append(c)
        }
    }
    out.append('"')
}
