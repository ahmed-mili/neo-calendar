package com.ahmed.neocalendar.core.workspace

/** Où vivent les notes. Les deux modes sont exclusifs : jamais les deux à la fois sur une même copie. */
enum class StorageMode {
    /** Stockage privé de l'app (`filesDir/Neo Calendar`), synchronisé par le moteur embarqué. */
    Integrated,

    /** Dossier choisi par l'utilisateur (SAF), synchronisé par un autre outil. Le moteur ne démarre jamais. */
    External,
}

/**
 * Le mode courant d'après ce que l'app a mémorisé : le mode écrit s'il est reconnu ; sinon, un dossier SAF déjà choisi
 * (une installation d'avant ce mode) est `External` : rien n'est copié, déplacé ni demandé à la mise à jour ; sinon `null`,
 * c'est une nouvelle installation.
 */
fun resolveStorageMode(storedMode: String?, treeUri: String?): StorageMode? =
    StorageMode.entries.firstOrNull { it.name == storedMode }
        ?: if (!treeUri.isNullOrEmpty()) StorageMode.External else null
