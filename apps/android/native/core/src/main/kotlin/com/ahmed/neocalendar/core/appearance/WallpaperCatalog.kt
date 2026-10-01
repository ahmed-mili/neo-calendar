package com.ahmed.neocalendar.core.appearance

/*
 * Le catalogue de `apps/windows/src/themes/wallpapers.ts` pour la cible `android` : les vingt photos en portrait, plus
 * « Par défaut du thème » et « Aucun ». Chaque photo se télécharge dans `.neo-calendar/wallpapers/` quand elle est choisie.
 */

const val THEME_DEFAULT_WALLPAPER = "theme-default"
const val NO_WALLPAPER = "none"

/** `DEFAULT_ANDROID_WALLPAPER_ID`. */
const val DEFAULT_ANDROID_WALLPAPER_ID = "starlit-snow-peak-portrait"

/** Une photo du catalogue : son identifiant est aussi son nom de fichier (`<id>.jpg`). */
data class Wallpaper(val id: String, val label: String, val author: String, val page: String, val category: String) {
    val file: String get() = "$id.jpg"
}

val WALLPAPER_PHOTOS: List<Wallpaper> = listOf(
    Wallpaper("violet-forest-bloom-portrait", "Sous-bois en fleurs", "Uran Wang", "https://unsplash.com/photos/la-lumiere-du-soleil-traverse-les-arbres-jusqua-un-champ-de-fleurs-violettes-TVORvlpH2ZY", "forest"),
    Wallpaper("cloudlaced-ranges-portrait", "Crêtes et nuages", "Nicolas Prieto", "https://unsplash.com/photos/chaines-de-montagnes-couvertes-de-nuages-sMJaf08ugD0", "mountains"),
    Wallpaper("panorama-valley-portrait", "Vallée panoramique", "Daniel Seßler", "https://unsplash.com/photos/une-vue-panoramique-dune-vallee-avec-des-montagnes-en-arriere-plan-yVkwJVCAnXs", "mountains"),
    Wallpaper("milky-way-trail-portrait", "Sentier sous la Voie lactée", "Sebastian Knoll", "https://unsplash.com/photos/voie-lactee-sarquant-au-dessus-dun-sentier-rocheux-IPCh5x1whiQ", "night"),
    Wallpaper("sunlit-canyon-portrait", "Canyon au soleil", "NIR HIMI", "https://unsplash.com/photos/canyon-desertique-baigne-de-soleil-avec-des-formations-rocheuses-et-une-vegetation-clairsemee-Rv2yB04plX8", "desert"),
    Wallpaper("whale-tail-cliffs-portrait", "Baleine sous les falaises", "Marek Piwnicki", "https://unsplash.com/photos/queue-de-baleine-emergeant-de-leau-sombre-pres-des-falaises-rocheuses-tv8swoH1aOY", "ocean"),
    Wallpaper("white-forest-flowers-portrait", "Anémones des bois", "Kasia Gajek", "https://unsplash.com/photos/fleurs-blanches-dans-la-foret-pendant-la-journee-Dpf1iwtX2Yo", "forest"),
    Wallpaper("golden-gate-night-portrait", "Golden Gate la nuit", "Justin Wolff", "https://unsplash.com/photos/le-golden-gate-bridge-est-illumine-la-nuit-Macs-aqy6Ek", "city"),
    Wallpaper("island-sunset-portrait", "Île au couchant", "Daniel Seßler", "https://unsplash.com/photos/un-magnifique-coucher-de-soleil-sur-une-petite-ile-au-milieu-de-locean-xHxfXRbTG1Y", "ocean"),
    Wallpaper("tropical-palm-coast-portrait", "Côte tropicale", "Marcreation", "https://unsplash.com/photos/cote-tropicale-diles-avec-des-palmiers-et-une-eau-turquoise-claire-fV_qtB_sTV8", "ocean"),
    Wallpaper("starlit-snow-peak-portrait", "Sommet sous les étoiles", "Benjamin Voros", "https://unsplash.com/photos/montagne-enneigee-sous-les-etoiles-phIFdC6lA4E", "night"),
    Wallpaper("steep-blue-ridges-portrait", "Crêtes escarpées", "Marek Piwnicki", "https://unsplash.com/photos/montagnes-escarpees-sous-un-ciel-bleu-avec-des-nuages-blancs-I3HjjiGRnko", "mountains"),
    Wallpaper("golden-snow-range-portrait", "Chaîne dorée", "Marek Piwnicki", "https://unsplash.com/photos/majestueuses-montagnes-enneigees-baignees-dun-soleil-dore-VksMwErxR9c", "mountains"),
    Wallpaper("gapstow-autumn-portrait", "Pont de Gapstow", "Juan Di Nella", "https://unsplash.com/photos/pont-de-gapstow-a-lautomne-a-new-york-ne1X1c9M0Hg", "autumn"),
    Wallpaper("coastal-hills-dusk-portrait", "Collines au crépuscule", "Antonin Fontaine", "https://unsplash.com/photos/collines-et-ocean-au-coucher-du-soleil-avec-une-lumiere-chaude-YiRaXIR5Etk", "ocean"),
    Wallpaper("autumn-forest-path-portrait", "Chemin d'automne", "Daniel Seßler", "https://unsplash.com/photos/chemin-de-terre-a-travers-la-foret-dautomne-_3DI_vx2ygg", "autumn"),
    Wallpaper("turquoise-shallows-portrait", "Hauts-fonds turquoise", "Rod Long", "https://unsplash.com/photos/vue-aerienne-dune-cote-sablonneuse-avec-une-eau-turquoise-peu-profonde-iqBc91jdqoQ", "ocean"),
    Wallpaper("monument-valley-stars-portrait", "Monument Valley étoilée", "Joseph Corl", "https://unsplash.com/photos/voie-lactee-au-dessus-des-buttes-de-la-vallee-du-monument-BMhglVdk3lA", "night"),
    Wallpaper("cloudveil-fjord-portrait", "Fjord sous les nuages", "Marek Piwnicki", "https://unsplash.com/photos/fjord-entoure-de-montagnes-spectaculaires-couvertes-de-nuages-jMPwiaqRXzI", "mountains"),
    Wallpaper("golden-summit-portrait", "Sommet doré", "Marek Piwnicki", "https://unsplash.com/photos/un-sommet-enneige-baigne-dun-soleil-dore-E909Oe4N3pM", "mountains"),
)

/** Les catégories dans l'ordre de `WALLPAPER_CATEGORIES`, avec leur libellé. */
val WALLPAPER_CATEGORIES: List<Pair<String, String>> = listOf(
    "mountains" to "Montagnes",
    "forest" to "Forêt",
    "ocean" to "Océan",
    "desert" to "Désert",
    "night" to "Nuit",
    "city" to "Ville",
    "autumn" to "Automne",
)

/** `isWallpaperId` pour la cible Android : le catalogue portrait, le fond du thème et « Aucun ». Le paysage reste connu (le fichier partagé peut en porter un). */
fun isKnownWallpaperId(id: String): Boolean =
    id == THEME_DEFAULT_WALLPAPER || id == NO_WALLPAPER ||
        WALLPAPER_PHOTOS.any { it.id == id || it.id.removeSuffix("-portrait") == id }
