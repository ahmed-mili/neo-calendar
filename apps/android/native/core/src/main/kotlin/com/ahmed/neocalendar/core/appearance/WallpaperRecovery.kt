package com.ahmed.neocalendar.core.appearance

/** Un fond téléchargé dans `.neo-calendar/wallpapers/` : son nom de fichier et sa date de dernière modification (ms). */
data class WallpaperFile(val name: String, val modifiedMs: Long)

/**
 * Le fond à reprendre quand aucun choix n'est mémorisé : le fichier image le plus récemment modifié du dossier des fonds
 * (le dernier téléchargé est celui qu'on a choisi). `null` s'il y a un choix mémorisé (jamais écrasé) ou aucune image.
 * L'identifiant est le nom du fichier sans son extension, comme la couche de fond le relit (`<id>.jpg`).
 */
fun recoveredWallpaperId(rememberedId: String?, files: List<WallpaperFile>): String? {
    if (!rememberedId.isNullOrEmpty()) return null
    val newest = files
        .filter { it.name.substringAfterLast('.', "").lowercase() in IMAGE_EXTENSIONS && it.name.substringBeforeLast('.').isNotEmpty() }
        .maxWithOrNull(compareBy<WallpaperFile> { it.modifiedMs }.thenBy { it.name })
        ?: return null
    return newest.name.substringBeforeLast('.')
}

private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp")
