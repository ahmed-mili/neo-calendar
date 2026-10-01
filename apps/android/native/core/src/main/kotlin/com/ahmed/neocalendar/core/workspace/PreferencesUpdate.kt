package com.ahmed.neocalendar.core.workspace

import com.ahmed.neocalendar.core.preferences.parseWorkspacePreferences
import com.ahmed.neocalendar.core.preferences.preferencesFileText
import com.ahmed.neocalendar.core.preferences.sharedPreferencesToWrite
import com.ahmed.neocalendar.core.preferences.withCalendarRenamed
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Change une préférence du fichier partagé sans jamais écraser ce que Syncthing y a mis entre-temps.
 *
 * Le fichier est relu ICI, juste avant l'écriture (jamais l'instantané de l'écran) ; `change` reçoit
 * les préférences lues et rend les nouvelles. Seules les clés que `change` a modifiées sont reportées
 * sur le contenu du fichier : les autres clés, y compris celles que cette version ne connaît pas,
 * restent telles qu'elles sont. Puis seule la partie partagée est écrite, au format du téléphone
 * figé au corpus (`preferencesFileText`).
 *
 * Un fichier illisible (corrompu) lève [UnreadablePreferencesException] et RIEN n'est écrit : les
 * valeurs par défaut ne remplacent jamais une configuration qu'on n'a pas pu lire. Un fichier absent
 * est un premier lancement (présent mais vide, c'est une erreur comme un fichier illisible) : les valeurs par défaut portent alors la modification.
 * Rend les préférences écrites, ou les lues si `change` n'a rien modifié (rien n'est alors écrit).
 */
fun updatePreferences(storage: WritableWorkspaceStorage, change: (JsonObject) -> JsonObject): JsonObject {
    val raw = readPreferencesForWrite(storage)
    val current = parseWorkspacePreferences(raw ?: JsonObject(emptyMap()))
    val next = change(current)
    val changed = next.filter { (key, value) -> current[key] != value }
    if (changed.isEmpty()) return current
    val base: Map<String, JsonElement> = if (raw == null) next else raw
    val written = JsonObject(LinkedHashMap(base).apply { putAll(changed) })
    savePreferences(storage, preferencesFileText(sharedPreferencesToWrite(written)))
    return next
}

/**
 * Renomme un calendrier (un dossier) puis fait suivre ses préférences. Le fichier de préférences est
 * relu AVANT de toucher au dossier : s'il est illisible, rien n'est renommé (un dossier renommé dont
 * les préférences n'auraient pas suivi perdrait sa couleur, son rang et son rappel).
 */
fun renameCalendar(storage: WritableWorkspaceStorage, relativePath: String, newName: String): String {
    validName(newName, false)
    requireRenamable(relativePath)
    readPreferencesForWrite(storage)
    val renamed = renameFolder(storage, relativePath, newName)
    try {
        updatePreferences(storage) { withCalendarRenamed(it, relativePath, renamed) }
    } catch (e: Exception) {
        throw IllegalStateException("Dossier renommé en « $renamed », mais ses préférences n'ont pas suivi : ${e.message}", e)
    }
    return renamed
}
