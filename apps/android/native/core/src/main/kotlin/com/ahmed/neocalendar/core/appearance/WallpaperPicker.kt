package com.ahmed.neocalendar.core.appearance

/*
 * Les décisions du sélecteur de fonds d'écran (`wallpaperBatch.ts`, `ThemeWallpaperPicker.tsx`), sans rien d'Android :
 * ce qu'il reste à télécharger, ce que dit le bouton « Tout télécharger », la liste filtrée par catégorie.
 */

/** Où en est le téléchargement de tout ce qui manque : combien sont passés, combien au total, combien ont échoué. */
data class BatchProgress(val done: Int, val total: Int, val failed: Int)

/** Les fonds dont le fichier n'est pas encore là ; un même fichier n'est demandé qu'une fois. */
fun missingWallpapers(wallpapers: List<Wallpaper>, installed: Set<String>): List<Wallpaper> {
    val wanted = HashSet<String>()
    return wallpapers.filter { w -> w.file !in installed && wanted.add(w.file) }
}

/** `batchNote` : ce que dit la ligne en tête de liste (en français, comme l'ancienne). */
fun batchNote(progress: BatchProgress?, missing: Int): String? {
    if (progress != null && progress.done < progress.total) return "Téléchargement… ${progress.done}/${progress.total}"
    if (progress != null && progress.failed > 0) {
        return if (progress.failed == 1) "1 fond n'a pas pu être téléchargé — appuyez pour réessayer"
        else "${progress.failed} fonds n'ont pas pu être téléchargés — appuyez pour réessayer"
    }
    return if (missing > 0) "Tout télécharger ($missing)" else null
}

/** La liste d'une catégorie ; « all » les montre toutes. Le fond du thème et « Aucun » restent sous tout filtre, ils n'ont pas de catégorie. */
fun wallpapersInCategory(category: String): List<Wallpaper> =
    if (category == "all") WALLPAPER_PHOTOS else WALLPAPER_PHOTOS.filter { it.category == category }

/** Les catégories que le catalogue représente (toutes les sept, aujourd'hui). */
fun availableCategories(): List<Pair<String, String>> =
    WALLPAPER_CATEGORIES.filter { (key, _) -> WALLPAPER_PHOTOS.any { it.category == key } }

/** La ligne de crédit sous le nom (`creditByline`) : « Photo de Uran Wang ». */
fun wallpaperCredit(wallpaper: Wallpaper): String = "Photo de ${wallpaper.author}"

/** Le fond qui s'affiche vraiment : le choix s'il est une photo, sinon rien (le fond du thème et « Aucun » n'ont pas de fichier). */
fun wallpaperFileOf(id: String): String? =
    if (id == THEME_DEFAULT_WALLPAPER || id == NO_WALLPAPER) null else "$id.jpg"
