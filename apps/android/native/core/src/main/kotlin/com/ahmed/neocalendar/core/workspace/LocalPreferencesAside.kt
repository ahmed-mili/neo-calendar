package com.ahmed.neocalendar.core.workspace

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

private const val LOCAL_PREFERENCES = ".neo-calendar/.neo-calendar.json"

/** Le dossier de notes a-t-il son propre fichier de réglages partagés (couleurs, calendriers masqués, liens ICS) ? */
fun hasLocalPreferences(root: File): Boolean = File(root, LOCAL_PREFERENCES).isFile

/**
 * Adoption d'un dossier proposé par un autre appareil : deux fichiers de réglages créés chacun de leur côté produiraient un
 * conflit (ou l'un écraserait l'autre). Le fichier local est déplacé dans `asideDir` (hors du dossier synchronisé) sous un nom
 * horodaté, jamais supprimé : l'autre appareil fait foi, et l'utilisateur peut retrouver le sien. Rend le fichier déplacé,
 * ou null quand il n'y en avait pas. Le marqueur `.neo-calendar/` reste en place.
 */
fun setAsideLocalPreferences(root: File, asideDir: File, stamp: String): File? {
    val source = File(root, LOCAL_PREFERENCES)
    if (!source.isFile) return null
    if (!asideDir.isDirectory && !asideDir.mkdirs()) throw java.io.IOException("Le dossier ${asideDir.name} ne peut pas être créé.")
    var target = File(asideDir, "neo-calendar-$stamp.json")
    var i = 1
    while (target.exists()) target = File(asideDir, "neo-calendar-$stamp (${i++}).json")
    Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
    return target
}
